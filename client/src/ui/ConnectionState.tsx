/**
 * Whether the page can hear anything, and whether it has.
 *
 * Three states, because "not connected" and "connected and hearing nothing" mean
 * different things and a display that conflated them would let a broken transport pass
 * for a quiet system. The third state is the ordinary one on the first day: connected,
 * and nothing to hear.
 */
import type { ConnectionState as Connection } from "../liveness/types";

const WORDS: Readonly<Record<Connection, string>> = {
  "not-connected": "Not connected to the broker. Nothing on this page is current.",
  "connected-silent": "Connected to the broker, hearing nothing. That is a real answer, not a fault.",
  receiving: "Connected, and receiving control traffic.",
};

const MARKS: Readonly<Record<Connection, string>> = {
  "not-connected": "○",
  "connected-silent": "◍",
  receiving: "●",
};

export interface ConnectionStateProps {
  readonly connection: Connection;
  readonly discarded: number;
  readonly lastDiscardReason: string | null;
  readonly configuration: string | null;
}

export function ConnectionState({
  connection,
  discarded,
  lastDiscardReason,
  configuration,
}: ConnectionStateProps): JSX.Element {
  return (
    <section className="panel" data-testid="connection-state" data-connection={connection}>
      <h2>Transport</h2>
      <p className={`state ${connection}`}>
        <span aria-hidden="true">{MARKS[connection]} </span>
        {WORDS[connection]}
      </p>
      {configuration === null ? null : (
        <p className="failure" data-testid="configuration-failure">
          {configuration} The layout below is unaffected: it is a drawing, and it never depended on
          a network call.
        </p>
      )}
      <p data-testid="discard-count">
        <span className="figure">{discarded}</span> message
        {discarded === 1 ? "" : "s"} discarded for failing the contract. A discarded message lights
        nothing.
      </p>
      {lastDiscardReason === null ? null : (
        <p className="detail" data-testid="last-discard-reason">
          Most recent refusal: {lastDiscardReason}
        </p>
      )}
    </section>
  );
}
