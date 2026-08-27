/**
 * The contract, shown beside the instance.
 *
 * SRD §2.2 calls the data dictionary made executable one of the things drogna actually
 * built, and FR-019 asks the display to show it rather than assert it. A payload beside
 * the schema that governs it is the whole of that: a reader can see the rule and the
 * message it was applied to at once, and can tell that the check happened rather than
 * being told it did.
 *
 * The schema shown is the master itself — the same document `contracts/schemas.ts`
 * compiled the validator from — rather than a description of it written here. A second
 * description would be a second declaration of the contract, and a second declaration is
 * what drifts (Constitution III).
 */
import { schemaFor, schemaNameFor } from "./validation";

export interface SchemaPanelProps {
  readonly topic: string;
}

/** How much of a master to print. A schema is long and the panel is beside a payload. */
const PRINTED_CHARACTERS = 4000;

export function SchemaPanel({ topic }: SchemaPanelProps): JSX.Element {
  const name = schemaNameFor(topic);
  const schema = schemaFor(topic);
  if (schema === null) {
    return (
      <section className="schema-panel" data-testid="schema-panel" data-governed="false">
        <h3>The governing schema</h3>
        <p>
          No master in this build governs <code>{topic}</code>, so there is no contract to
          show beside the payload and none was applied to it.
        </p>
      </section>
    );
  }
  const printed = JSON.stringify(schema, null, 2);
  const truncated = printed.length > PRINTED_CHARACTERS;
  return (
    <section className="schema-panel" data-testid="schema-panel" data-governed="true">
      <h3>The governing schema</h3>
      <p data-testid="schema-name">
        <code>{topic}</code> validates against <strong>{name}</strong>, the master under{" "}
        <code>contracts</code> that this build compiled its validator from.
      </p>
      <pre data-testid="schema-document">{truncated ? `${printed.slice(0, PRINTED_CHARACTERS)}\n…` : printed}</pre>
      {truncated ? (
        <p className="schema-truncated">
          Shown to the first {PRINTED_CHARACTERS} characters. The whole master is the file
          this was read from, not a summary of it.
        </p>
      ) : null}
    </section>
  );
}
