/**
 * Validation of seam crossings against the committed masters (FR-03).
 *
 * One Ajv instance holds every master from contracts/ (via the generated embedding,
 * so the browser build needs no filesystem). Used by tests always, by the ingestion
 * seams as their refusal authority, and by the Messages panel's refusal counter (E4).
 */
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { schemaDocuments } from '../generated/schema-documents.js';

export interface ValidationVerdict {
  readonly ok: boolean;
  /** Human-readable refusals, each naming the thing refused. Empty when ok. */
  readonly refusals: readonly string[];
  /**
   * The same refusals, with the instance path kept apart from the sentence (feature
   * 114, FR-68). The Messages inspector marks a refusal *on the field that caused it*,
   * and re-parsing the path back out of the sentence above would make the sentence's
   * punctuation load-bearing. `path` is Ajv's instance path — '' for the document
   * itself, '/context/datastream_id' for a field.
   */
  readonly faults: readonly { readonly path: string; readonly message: string }[];
}

export interface SeamValidator {
  /**
   * Keys are master stems ('clock', 'config.run', …), optionally addressing a
   * $defs entry as 'edr-collections#collections' for masters that are libraries
   * of shapes rather than one root shape.
   */
  validate(schemaKey: string, payload: unknown): ValidationVerdict;
  has(schemaKey: string): boolean;
}

export function createSeamValidator(): SeamValidator {
  // `validateSchema` is left ON, having been measured off and found to buy nothing.
  // Turning it off does cut this constructor from about 270 ms to 55 ms at Chromium's 4x
  // throttle — but the saving does not survive to the total: compilation grows by roughly
  // as much again, and `buildBackend` came out the same within noise over three runs each
  // way (spikes/load-time §7). So the runtime meta-check stays, because it costs nothing
  // net and refusing a bad master here is a property worth keeping.
  //
  // What did come out of that measurement is scripts/gates/check-schema-masters.ts, which
  // makes the same decision in CI — and compiles each master too, which this never does
  // until something asks for one. That gate is an addition, not a replacement.
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const document of Object.values(schemaDocuments)) {
    ajv.addSchema(document);
  }
  const compiled = new Map<string, ValidateFunction>();
  const idFor = (key: string) => {
    const [stem, def] = key.split('#');
    // harness:allow-literal-path a JSON-Schema $id namespace, never fetched — the masters' identity, not a location
    return `https://schemas.harness.invalid/${stem}.schema.json${def ? `#/$defs/${def}` : ''}`;
  };

  return {
    has(schemaKey) {
      return schemaKey.split('#')[0] in schemaDocuments;
    },
    validate(schemaKey, payload) {
      let validator = compiled.get(schemaKey);
      if (!validator) {
        const found = ajv.getSchema(idFor(schemaKey));
        if (!found) {
          const missing = `no master named '${schemaKey}' under contracts/schemas`;
          return { ok: false, refusals: [missing], faults: [{ path: '', message: missing }] };
        }
        validator = found;
        compiled.set(schemaKey, validator);
      }
      const ok = validator(payload) as boolean;
      if (ok) return { ok: true, refusals: [], faults: [] };
      const faults = (validator.errors ?? []).map((error) => ({
        path: error.instancePath || '',
        message: error.message ?? 'refused',
      }));
      const refusals = faults.map((fault) => `${schemaKey}${fault.path}: ${fault.message}`);
      return { ok: false, refusals, faults };
    },
  };
}
