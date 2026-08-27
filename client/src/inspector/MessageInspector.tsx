/**
 * The message that just passed, in full.
 *
 * FR-004 asks for four things about the most recent message on a boundary: its topic, its
 * whole payload, the simulation time it carried and the name of the schema it validates
 * against. All four are here, and the third is worth a sentence: the simulation time
 * shown is the one the message carried. It is not the page's idea of now, and no value
 * from the render path reaches this panel — the inspector takes a received message and
 * nothing else (ADR-0007's third rule).
 *
 * A boundary nothing has crossed says so. It does not show the last message from some
 * other boundary, and it does not show an empty panel that reads like a message with no
 * content.
 */
import { BOUNDARIES_BY_ID } from "../legibility/classification";
import { CONCERN_WORDS, concernsFor } from "../legibility/classification";
import { routeFor } from "../loop/transitRouting";
import type { Received } from "../data/buffers";

import { SchemaPanel } from "./SchemaPanel";
import { inspect, VALIDATION_WORDS } from "./validation";

export interface MessageInspectorProps {
  /** The boundary the viewer selected. */
  readonly boundary: string;
  /** The most recent message that crossed it, or null if none has. */
  readonly message: Received | null;
}

function BespokeNote({ componentId }: { componentId: string }): JSX.Element | null {
  const concerns = concernsFor(componentId);
  if (concerns.length === 0) {
    return null;
  }
  return (
    <p className="bespoke-note" data-testid={`bespoke-note-${componentId}`}>
      {componentId} is bespoke because of {concerns.map((concern) => CONCERN_WORDS[concern]).join("; ")}.
    </p>
  );
}

export function MessageInspector({ boundary, message }: MessageInspectorProps): JSX.Element {
  const classification = BOUNDARIES_BY_ID.get(boundary);
  return (
    <section className="inspector" data-testid="message-inspector" data-boundary={boundary}>
      <h2>The message that just passed</h2>
      {classification === undefined ? null : (
        <p className="boundary-classification" data-testid="boundary-classification" data-kind={classification.kind}>
          {classification.from} → {classification.to}, carrying {classification.label}. Classified{" "}
          <strong>{classification.kind === "bespoke" ? "bespoke core" : "well-chosen plumbing"}</strong>:{" "}
          {classification.because}.
        </p>
      )}
      {message === null ? (
        <p data-testid="inspector-empty">
          No message has crossed this boundary since the page loaded, so there is nothing to
          show. This is the absence of traffic, not the absence of a display.
        </p>
      ) : (
        <MessageDetail message={message} />
      )}
      {classification === undefined ? null : <BespokeNote componentId={classification.from} />}
    </section>
  );
}

function MessageDetail({ message }: { message: Received }): JSX.Element {
  const seen = inspect(message.topic, message.payload);
  const words = VALIDATION_WORDS[seen.validation];
  const route = routeFor(message.topic);
  return (
    <>
      <dl className="message-facts">
        <dt>Topic</dt>
        <dd data-testid="inspected-topic">{seen.topic}</dd>
        <dt>Simulation time carried</dt>
        <dd data-testid="inspected-sim-time">
          {seen.simTime ?? "the message carried none"}
          {seen.tick === null ? "" : ` (tick ${seen.tick})`}
        </dd>
        <dt>Schema</dt>
        <dd data-testid="inspected-schema-name">{seen.schemaName ?? "none in this build governs this topic"}</dd>
        <dt>Published by</dt>
        <dd data-testid="inspected-publisher">
          {route === null ? "unrouted" : `${route.publisher}, read by ${route.consumers.join(", ")}`}
        </dd>
      </dl>
      <p className="validation-state" data-testid="inspected-validation" data-validation={seen.validation}>
        <span aria-hidden="true">{words.glyph}</span> {words.label}
        {seen.detail === null ? "" : `: ${seen.detail}`}
      </p>
      <pre data-testid="inspected-payload">{seen.payload ?? seen.raw}</pre>
      <SchemaPanel topic={seen.topic} />
    </>
  );
}
