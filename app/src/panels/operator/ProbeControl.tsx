/**
 * The probes and the deferrals, drawn at the node they belong to (feature 121).
 *
 * The reasoning about what a probe *is* — and why the serving components get one where
 * the acting components get a prompt — is in `probes.ts` beside the declarations. What
 * this file adds is two presentation rules.
 *
 * **A refusal is drawn as an outcome, not as an error.** Two of these probes exist in
 * order to be refused. Raising those on the panel's refusal line — which is for a
 * command the surface would not carry out — would teach a reader that they had done
 * something wrong, when what they have done is watch the boundary work. So a probe's
 * answer stays with its own row, marked refused or not, and the refusal line is left
 * alone.
 *
 * **A node with nothing to press says so, and offers the way on.** The deferral is
 * rendered as a sentence and a button that opens the node which answers for this one,
 * because "there is nothing here" is only half an answer and the half a reader cannot
 * act on.
 */
import { useState } from 'react';
import { deferralFor, probesFor, type ProbeContext, type ProbeResult } from './probes.js';
import { Actions, type Action } from './Actions.js';

export function ProbeControl({
  id,
  context,
  onOpen,
}: {
  /** The component whose drawer this is. */
  id: string;
  context: ProbeContext;
  /** Opens another node: what a deferral offers instead of a button of its own. */
  onOpen: (id: string) => void;
}) {
  const probes = probesFor(id, context);
  const deferral = deferralFor(id);
  const [said, setSaid] = useState<Record<string, ProbeResult>>({});

  if (deferral) {
    return (
      <div className="flow-actions" data-testid="deferral" data-deferred-to={deferral.answeredBy}>
        <h4>nothing to ask here</h4>
        <p className="flow-tuner-detail">{deferral.why}</p>
        <div className="flow-action-row">
          <button
            className="flow-action"
            data-deferral-open={deferral.answeredBy}
            onClick={() => onOpen(deferral.answeredBy)}
          >
            open {deferral.answeredBy}
          </button>
        </div>
      </div>
    );
  }

  if (probes.length === 0) return null;

  const actions: Action[] = probes.map((probe) => ({
    id: probe.id,
    label: probe.label(context),
    description: probe.description,
    said: said[probe.id] ? { text: said[probe.id].said, refused: said[probe.id].refused } : undefined,
    attributes: { 'data-probe-run': probe.id, 'data-testid': probe.id },
    run: () =>
      probe.run(context).then((result) => setSaid((previous) => ({ ...previous, [probe.id]: result }))),
  }));

  return <Actions heading={headingFor(id)} actions={actions} testId="probe-control" />;
}

/**
 * What the group of probes at this node is *for*, in the node's own terms. The clock's
 * are commands and the rest are requests, and a heading that called both "probes" would
 * be naming the mechanism rather than the thing (FR-012's rule about labels, applied to
 * a heading).
 */
function headingFor(id: string): string {
  return id === 'clock' ? 'drive the clock' : 'ask it to answer';
}
