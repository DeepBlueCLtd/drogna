/**
 * Prompted events, at the node that decides (SRD-v2 FR-65, FR-66).
 *
 * A button here does not make the thing happen. It posts a prompt to the operator
 * surface, which publishes it addressed to the component; that component then does
 * what it would have done had its own schedule brought the moment round — including
 * declining. The scheduler declines a prompt inside its minimum interval exactly as it
 * declines a divergence, and the decline arrives on the telemetry topic where the
 * drawer beside this control draws it.
 *
 * That is why the label reads "request" and not "run": a control that reads as a
 * guarantee is a display promising on a component's behalf, and the one thing this tab
 * is for is showing what the components actually decide.
 */
import { useState } from 'react';
import type { ConfigShell, OperatorControlsEvent } from '../../generated/types.js';

export function EventControl({
  config,
  events,
  onRefusal,
}: {
  config: ConfigShell;
  /** The declared events for this component, from the surface's own statement. */
  events: readonly OperatorControlsEvent[];
  onRefusal: (refusal: string | undefined) => void;
}) {
  const [said, setSaid] = useState<string | undefined>();
  if (events.length === 0) return null;

  const prompt = async (event: OperatorControlsEvent) => {
    const response = await fetch(`${config.endpoints.operator_event}/${event.id}`, { method: 'POST' });
    const answer = (await response.json()) as { refused?: string; note?: string };
    if (!response.ok) {
      const refusal = answer.refused ?? `refused with status ${response.status}`;
      setSaid(refusal);
      onRefusal(refusal);
      return;
    }
    setSaid(answer.note ?? 'published');
    onRefusal(undefined);
  };

  return (
    <div className="flow-events" data-testid="event-control">
      <h4>ask it to act now</h4>
      {events.map((event) => (
        <div className="flow-event" key={event.id} data-event={event.id}>
          <button onClick={() => void prompt(event)} data-event-send={event.id}>
            {event.label}
          </button>
          <p className="flow-tuner-detail">{event.description}</p>
        </div>
      ))}
      {said ? (
        <p className="flow-demand-said" data-testid="event-said">
          {said}
        </p>
      ) : null}
    </div>
  );
}
