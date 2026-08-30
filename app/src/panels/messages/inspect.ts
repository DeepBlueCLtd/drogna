/**
 * The inspector's pure half (feature 114, FR-68): a received payload read against the
 * master its topic declares.
 *
 * The old inspector printed `JSON.stringify(payload, null, 2)` with the refusal above
 * it as a sentence. Both halves of that were weak. A blob of JSON makes a reader do the
 * work of knowing which fields the master required and what each means; and a refusal
 * printed above the document leaves them scanning for the field it is about — which is
 * the one thing the refusal already knows.
 *
 * So: walk the payload against the master, and for each field state the name the master
 * gives it (`title` where declared, the key otherwise), what the master says it is, and
 * the unit **where the master declares one**. Then attach each fault to the field its
 * instance path names.
 *
 * What this is careful not to do is invent. A field the master does not describe is
 * shown as present and undescribed rather than dropped; a master that describes a field
 * the payload does not carry is shown as absent rather than as a blank. Both are facts
 * about the crossing and the display is entitled to neither guess.
 */
import { schemaDocuments } from '../../generated/schema-documents.js';


/** A JSON-Schema node, as far as this module reads one. */
export interface SchemaNode {
  readonly $ref?: string;
  readonly $defs?: Readonly<Record<string, SchemaNode>>;
  readonly title?: string;
  readonly description?: string;
  readonly type?: string | readonly string[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly unit?: string;
  readonly units?: string;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly items?: SchemaNode;
}

export interface InspectedField {
  /** The instance path, as Ajv writes one: '/context/datastream_id'. */
  readonly path: string;
  /** The final segment, for indenting a nested field under its parent. */
  readonly key: string;
  readonly depth: number;
  /** The name the master gives the field, or the key where it gives none. */
  readonly label: string;
  /** What the master says this is: a type, an enumeration, a constant. */
  readonly declared: string;
  /** The unit the master declares for this field, where it declares one. */
  readonly unit?: string;
  /** The value in the payload, rendered; undefined when the payload has no such field. */
  readonly value?: string;
  /** True when the master requires this field and the payload does not carry it. */
  readonly absent: boolean;
  /** True when the payload carries this field and the master describes no such field. */
  readonly undescribed: boolean;
  /** The refusals whose instance path is exactly this field. */
  readonly faults: readonly string[];
}

/** How deep a nested object is walked before it is shown as a value rather than opened. */
const MAX_DEPTH = 3;

/**
 * The fields of one payload, read against one master. Order is the master's declared
 * order first — that is the order the document was designed to be read in — then
 * anything the payload carries that the master does not describe.
 */
export function inspectFields(
  schema: SchemaNode | undefined,
  payload: unknown,
  faults: readonly { readonly path: string; readonly message: string }[],
): readonly InspectedField[] {
  const rows: InspectedField[] = [];
  const { node, root } = resolve(schema, schema);
  walk(node, payload, '', 0, faults, rows, root);
  return rows;
}

/**
 * A shape, and the document its internal references are resolved against. The pair
 * travels together because a `$ref` to another master brings that master's `$defs` with
 * it: resolving the next hop against the document we started in would silently find
 * nothing, or — worse — find a same-named definition that means something else.
 */
interface Resolved {
  readonly node: SchemaNode | undefined;
  readonly root: SchemaNode | undefined;
}

/**
 * Follow a `$ref` to the shape it names. The masters use two forms and both are
 * followed: `#/$defs/location`, which stays inside the document, and
 * `manifest.schema.json`, which names another master — the committed set is embedded
 * whole (`schema-documents.ts`), so a cross-document reference is resolvable here
 * without a fetch. A reference that resolves to nothing is left unresolved rather than
 * guessed at, and the field then reads as one the master does not describe, which is
 * true: this module could not read the description.
 *
 * The hop count is bounded because a master that referred to itself in a cycle would
 * otherwise hang the panel, and a panel that hangs on a bad master is a worse failure
 * than one that says it could not read it.
 */
function resolve(node: SchemaNode | undefined, root: SchemaNode | undefined): Resolved {
  let current = node;
  let against = root;
  for (let hop = 0; hop < 8 && current?.$ref; hop++) {
    const reference = current.$ref;
    if (reference.startsWith('#/$defs/')) {
      current = against?.$defs?.[reference.slice('#/$defs/'.length)];
      continue;
    }
    const stem = /^([a-z0-9.-]+)\.schema\.json$/.exec(reference)?.[1];
    const other = stem ? (schemaDocuments[stem] as SchemaNode | undefined) : undefined;
    if (!other) return { node: undefined, root: against };
    current = other;
    against = other;
  }
  return { node: current, root: against };
}

function walk(
  schema: SchemaNode | undefined,
  value: unknown,
  path: string,
  depth: number,
  faults: readonly { readonly path: string; readonly message: string }[],
  into: InspectedField[],
  root: SchemaNode | undefined,
): void {
  const properties = schema?.properties;
  const carried = isRecord(value) ? value : undefined;
  const described = properties ? Object.keys(properties) : [];
  const extra = carried ? Object.keys(carried).filter((key) => !described.includes(key)) : [];

  for (const key of [...described, ...extra]) {
    const { node, root: childRoot } = resolve(properties?.[key], root);
    const childPath = `${path}/${key}`;
    const present = carried !== undefined && key in carried;
    const child = present ? carried[key] : undefined;
    const opens =
      node?.properties !== undefined && isRecord(child) && depth + 1 < MAX_DEPTH && present;
    into.push({
      path: childPath,
      key,
      depth,
      label: node?.title ?? key,
      declared: declaredAs(node),
      unit: unitFor(node, schema, carried, key),
      value: opens ? undefined : present ? render(child) : undefined,
      absent: !present && (schema?.required?.includes(key) ?? false),
      undescribed: node === undefined,
      faults: faults.filter((fault) => fault.path === childPath).map((fault) => fault.message),
    });
    if (opens) walk(node, child, childPath, depth + 1, faults, into, childRoot);
  }
}

/** What the master says a field is, in the master's own words where it has any. */
function declaredAs(node: SchemaNode | undefined): string {
  if (!node) return 'not described by this master';
  if (node.const !== undefined) return `constant ${JSON.stringify(node.const)}`;
  if (node.enum) return `one of ${node.enum.map((entry) => JSON.stringify(entry)).join(', ')}`;
  const type = node.type;
  if (Array.isArray(type)) return type.join(' or ');
  return typeof type === 'string' ? type : 'any shape';
}

/**
 * The unit for a field, where the master declares one — and only where it does.
 *
 * Two places count as the master declaring it. The node may carry `unit`/`units`
 * itself, as the manifest's variables do. Or the master may *pair* a value with a unit
 * in the same object, which is what `heartbeat.schema.json` does for a reported figure:
 * `{ key, value, unit }`. The second is read from the payload because that is where the
 * pairing puts it, and it is admitted only because the master declared the pairing —
 * a sibling the master does not describe is not a unit, it is a coincidence of naming.
 */
function unitFor(
  node: SchemaNode | undefined,
  parent: SchemaNode | undefined,
  carried: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const declared = node?.unit ?? node?.units;
  if (typeof declared === 'string') return declared;
  if (key !== 'value' && key !== 'result') return undefined;
  const pairedKey = parent?.properties?.unit ? 'unit' : parent?.properties?.units ? 'units' : undefined;
  if (!pairedKey || !carried) return undefined;
  const paired = carried[pairedKey];
  return typeof paired === 'string' ? paired : undefined;
}

function render(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Faults about the document as a whole rather than about any one of its fields. */
export function documentFaults(
  faults: readonly { readonly path: string; readonly message: string }[],
  fields: readonly InspectedField[],
): readonly string[] {
  const claimed = new Set(fields.flatMap((field) => (field.faults.length > 0 ? [field.path] : [])));
  return faults.filter((fault) => !claimed.has(fault.path)).map((fault) => fault.message);
}
