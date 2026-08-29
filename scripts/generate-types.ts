/**
 * Generate TypeScript from the contracts masters (Constitution III).
 *
 * Reads every contracts/schemas/*.schema.json and emits, under app/src/generated/:
 *   - types.ts             one exported type per master and per $defs entry
 *   - schema-documents.ts  the masters embedded verbatim, for runtime validation
 *
 * The generator is deliberately bespoke and deliberately narrow: it supports exactly
 * the JSON Schema subset the masters use ($ref within and across files, allOf/oneOf/
 * anyOf, enum, const, type unions, objects, arrays) and THROWS on anything else, so a
 * master using a keyword this file cannot type fails the generation rather than
 * silently producing a looser type. V1 made the same choice for the same reason
 * (ADR-0022): the generator is part of the type chain and must be auditable in one
 * sitting.
 *
 * Output is deterministic for a given input tree: files are processed in sorted
 * order, $defs in document order. The drift gate regenerates and diffs.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemasDir = join(repoRoot, 'contracts', 'schemas');

type SchemaNode = Record<string, unknown>;

const files = readdirSync(schemasDir)
  .filter((f) => f.endsWith('.schema.json'))
  .sort();

const documents = new Map<string, SchemaNode>();
for (const file of files) {
  documents.set(file, JSON.parse(readFileSync(join(schemasDir, file), 'utf8')) as SchemaNode);
}

function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

/** foo-bar.schema.json -> FooBar; ('foo.schema.json','some_def') -> FooSomeDef */
function typeName(file: string, def?: string): string {
  const stem = file.replace(/\.schema\.json$/, '');
  return pascal(stem) + (def ? pascal(def) : '');
}

function resolveRef(ref: string, currentFile: string): { file: string; def?: string } {
  if (ref.startsWith('#/$defs/')) return { file: currentFile, def: ref.slice('#/$defs/'.length) };
  const relative = ref.replace(/^https:\/\/schemas\.harness\.invalid\//, '');
  const match = /^([a-z0-9_.-]+\.schema\.json)(#\/\$defs\/(.+))?$/.exec(relative);
  if (!match) throw new Error(`unsupported $ref '${ref}' in ${currentFile}`);
  if (!documents.has(match[1])) throw new Error(`$ref '${ref}' in ${currentFile} names a missing master`);
  return { file: match[1], def: match[3] };
}

const TYPE_KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'enum', 'const',
  'properties', 'required', 'additionalProperties', 'items', 'allOf', 'oneOf', 'anyOf',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems',
  'minLength', 'maxLength', 'pattern', 'format', 'uniqueItems', 'default', 'examples',
  'deprecated', 'x-non-reproducible',
]);

function literal(value: unknown): string {
  return JSON.stringify(value);
}

function tsType(node: SchemaNode, currentFile: string, indent: string): string {
  for (const key of Object.keys(node)) {
    if (!TYPE_KEYWORDS.has(key)) {
      throw new Error(`keyword '${key}' in ${currentFile} is outside the supported subset; extend the generator knowingly`);
    }
  }
  if (typeof node.$ref === 'string') {
    const target = resolveRef(node.$ref, currentFile);
    return typeName(target.file, target.def);
  }
  if (Array.isArray(node.allOf)) {
    return (node.allOf as SchemaNode[]).map((n) => `(${tsType(n, currentFile, indent)})`).join(' & ');
  }
  if (Array.isArray(node.oneOf) || Array.isArray(node.anyOf)) {
    const parts = (node.oneOf ?? node.anyOf) as SchemaNode[];
    const union = parts.map((n) => `(${tsType(n, currentFile, indent)})`).join(' | ');
    // A schema carrying base properties AND variants (e.g. manifest's feature) is
    // the intersection of the base shape with the variant union.
    if (node.properties !== undefined || node.type !== undefined) {
      const base: SchemaNode = { ...node };
      delete base.oneOf;
      delete base.anyOf;
      return `(${tsType(base, currentFile, indent)}) & (${union})`;
    }
    return union;
  }
  if (Array.isArray(node.enum)) return (node.enum as unknown[]).map(literal).join(' | ');
  if ('const' in node) return literal(node.const);

  const types = Array.isArray(node.type) ? (node.type as string[]) : node.type ? [node.type as string] : [];
  if (types.length > 1) {
    return types.map((t) => tsType({ ...node, type: t }, currentFile, indent)).join(' | ');
  }
  const type = types[0] ?? (node.properties ? 'object' : undefined);
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array': {
      const items = node.items as SchemaNode | undefined;
      return items ? `${wrap(tsType(items, currentFile, indent))}[]` : 'unknown[]';
    }
    case 'object': {
      const properties = (node.properties ?? {}) as Record<string, SchemaNode>;
      const required = new Set((node.required ?? []) as string[]);
      const lines: string[] = ['{'];
      for (const [key, child] of Object.entries(properties)) {
        const optional = required.has(key) ? '' : '?';
        lines.push(`${indent}  ${JSON.stringify(key)}${optional}: ${tsType(child, currentFile, indent + '  ')};`);
      }
      if (node.additionalProperties !== false && Object.keys(properties).length === 0) {
        lines.push(`${indent}  [key: string]: unknown;`);
      }
      lines.push(`${indent}}`);
      return lines.join('\n');
    }
    default:
      throw new Error(`untypeable node in ${currentFile}: ${JSON.stringify(node).slice(0, 120)}`);
  }
}

/** Parenthesise union/intersection element types so `A | B[]` cannot mislead. */
function wrap(type: string): string {
  return /[|&]/.test(type) && !type.startsWith('{') ? `(${type})` : type;
}

const banner = `// GENERATED — DO NOT EDIT.
// Source of truth: contracts/schemas/*.schema.json (Constitution III).
// Regenerate with: pnpm generate. CI fails on drift.
`;

let typesOut = banner + '\n';
for (const [file, doc] of documents) {
  const title = typeof doc.title === 'string' ? doc.title : file;
  const hasRootShape =
    'type' in doc || 'properties' in doc || 'enum' in doc || 'const' in doc ||
    '$ref' in doc || 'allOf' in doc || 'oneOf' in doc || 'anyOf' in doc;
  if (hasRootShape) {
    typesOut += `/** ${title} — from ${file} */\n`;
    typesOut += `export type ${typeName(file)} = ${tsType(doc, file, '')};\n\n`;
  }
  const defs = (doc.$defs ?? {}) as Record<string, SchemaNode>;
  for (const [defName, defNode] of Object.entries(defs)) {
    typesOut += `/** ${file} #/$defs/${defName} */\n`;
    typesOut += `export type ${typeName(file, defName)} = ${tsType(defNode, file, '')};\n\n`;
  }
}

let documentsOut = banner + '\n';
documentsOut += 'export const schemaDocuments: Record<string, Record<string, unknown>> = {\n';
for (const [file, doc] of documents) {
  const key = file.replace(/\.schema\.json$/, '');
  documentsOut += `  ${JSON.stringify(key)}: ${JSON.stringify(doc, null, 2).replace(/\n/g, '\n  ')},\n`;
}
documentsOut += '};\n';

// The derived topology artefact (contracts/topology.json, scripts/derive-topology.ts)
// travels into the app the same way the masters do: embedded, typed, drift-gated.
const topologyJson = readFileSync(join(repoRoot, 'contracts', 'topology.json'), 'utf8').trimEnd();
const topologyOut =
  banner +
  `\nimport type { Topology } from './types.js';\n\nexport const topology: Topology = ${topologyJson.replace(/\n/g, '\n')};\n`;

const outDir = process.env.DROGNA_GENERATED_OUT ?? join(repoRoot, 'app', 'src', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'types.ts'), typesOut);
writeFileSync(join(outDir, 'schema-documents.ts'), documentsOut);
writeFileSync(join(outDir, 'topology.ts'), topologyOut);
process.stdout.write(`generated ${documents.size} masters into ${outDir}\n`);
