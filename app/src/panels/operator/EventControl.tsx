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
 *
 * Since feature 121 the prompts are drawn by `Actions`, with every other thing a reader
 * can do to a component, at the top of the drawer rather than under the instrument. The
 * reasoning for that shape is in `Actions.tsx`; what stays here is the seam call and
 * what the surface said about it.
 */
import { useState } from 'react';
import type { ConfigShell, OperatorControlsEvent } from '../../generated/types.js';
import { Actions, type Action } from './Actions.js';

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
  const [said, setSaid] = useState<Record<string, { text: string; refused: boolean }>>({});
  if (events.length === 0) return null;

  const prompt = async (event: OperatorControlsEvent) => {
    const response = await fetch(`${config.endpoints.operator_event}/${event.id}`, { method: 'POST' });
    const answer = (await response.json()) as { refused?: string; note?: string };
    if (!response.ok) {
      const refusal = answer.refused ?? `refused with status ${response.status}`;
      setSaid((previous) => ({ ...previous, [event.id]: { text: refusal, refused: true } }));
      onRefusal(refusal);
      return;
    }
    setSaid((previous) => ({
      ...previous,
      [event.id]: { text: answer.note ?? 'published', refused: false },
    }));
    onRefusal(undefined);
  };

  const actions: Action[] = events.map((event) => ({
    id: event.id,
    label: event.label,
    description: event.description,
    said: said[event.id],
    attributes: { 'data-event-send': event.id, 'data-event': event.id },
    run: () => prompt(event),
  }));

  return <Actions heading="ask it to act now" actions={actions} testId="event-control" />;
}
