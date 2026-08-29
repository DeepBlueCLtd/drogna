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
          return { ok: false, refusals: [`no master named '${schemaKey}' under contracts/schemas`] };
        }
        validator = found;
        compiled.set(schemaKey, validator);
      }
      const ok = validator(payload) as boolean;
      if (ok) return { ok: true, refusals: [] };
      const refusals = (validator.errors ?? []).map(
        (error) => `${schemaKey}${error.instancePath || ''}: ${error.message ?? 'refused'}`,
      );
      return { ok: false, refusals };
    },
  };
}
