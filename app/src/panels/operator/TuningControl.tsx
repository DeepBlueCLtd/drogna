/**
 * Tuning, at the node that holds the setting (SRD-v2 FR-64, FR-66).
 *
 * The Operator tab's rule is that consequence should be visible where the cause was
 * applied, so a setting is changed in the drawer of the component that scores against
 * it: lower the monitor's drift threshold here and the streak beside it fills against
 * the new one, because the monitor is reporting both.
 *
 * **Three numbers, and only one of them is a fact about the run.** What the slider
 * holds is what a reader is *asking for*, and it is drawn as an ask. What the surface
 * declares is the bound outside which the ask is refused, and it arrives from the
 * controls statement rather than from a table here (Constitution IV). What the
 * component reports in its heartbeat is the value **in force**, and that is the only
 * one this component presents as true — a control plane that echoed the ask back as
 * the setting would be a second source for one fact, free to disagree with the
 * component about what the component is doing (Constitution VII).
 *
 * So there is a send button rather than a slider that posts as it moves. Dragging
 * publishes nothing; releasing publishes nothing; the ask becomes a command when a
 * reader says so, and the reported value moves when the component says so.
 */
import { useState } from 'react';
import type { ConfigShell, Heartbeat, OperatorControlsTunable } from '../../generated/types.js';

export function TuningControl({
  config,
  tunables,
  heartbeat,
  onRefusal,
}: {
  config: ConfigShell;
  /** The declared tunables for this component, from the surface's own statement. */
  tunables: readonly OperatorControlsTunable[];
  /** This component's last heartbeat: where the value in force is reported. */
  heartbeat: Heartbeat | undefined;
  onRefusal: (refusal: string | undefined) => void;
}) {
  if (tunables.length === 0) return null;
  return (
    <div className="flow-tuning" data-testid="tuning-control">
      <h4>tune what it scores against</h4>
      {tunables.map((tunable) => (
        <Tuner
          key={tunable.id}
          config={config}
          tunable={tunable}
          inForce={heartbeat?.figures?.find((figure) => figure.key === tunable.figure)?.value}
          onRefusal={onRefusal}
        />
      ))}
      <p className="panel-footnote">
        A tuning is published to the component, not applied here, and it does not survive a
        restart: a restarted component is rebuilt from its configuration document and comes back
        reporting the configured value.
      </p>
    </div>
  );
}

function Tuner({
  config,
  tunable,
  inForce,
  onRefusal,
}: {
  config: ConfigShell;
  tunable: OperatorControlsTunable;
  inForce: number | undefined;
  onRefusal: (refusal: string | undefined) => void;
}) {
  // The ask starts at the value in force where the component has reported one, so a
  // reader adjusts from where the run is rather than from a number chosen here.
  const [asked, setAsked] = useState(String(inForce ?? tunable.minimum));
  const [said, setSaid] = useState<string | undefined>();

  const send = async () => {
    const response = await fetch(config.endpoints.operator_tuning, {
      method: 'POST',
      body: JSON.stringify({
        target: tunable.target,
        setting: tunable.setting,
        value: Number(asked),
      }),
    });
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
    <div className="flow-tuner" data-tunable={tunable.id}>
      <label>
        <span className="flow-tuner-label">
          {tunable.label}
          {tunable.unit ? <i>{tunable.unit}</i> : null}
        </span>
        <input
          type="range"
          min={tunable.minimum}
          max={tunable.maximum}
          step={tunable.step}
          value={asked}
          onChange={(event) => setAsked(event.target.value)}
          aria-label={`${tunable.label} asked for, ${tunable.minimum} to ${tunable.maximum}`}
        />
        <input
          className="flow-tuner-entry"
          value={asked}
          onChange={(event) => setAsked(event.target.value)}
          inputMode="decimal"
          aria-label={`${tunable.label} asked for`}
        />
      </label>
      <button onClick={() => void send()} data-tuning-send={tunable.id}>
        set
      </button>
      <p className="flow-tuner-state">
        {/* The one number here that is a fact about the run, marked as reported. */}
        <span data-tuning-in-force={tunable.id}>
          {inForce === undefined
            ? 'nothing reported yet'
            : `in force: ${inForce}${tunable.unit ? ` ${tunable.unit}` : ''}`}
        </span>
        <i>
          reported by {tunable.target}; the surface refuses anything outside {tunable.minimum} to{' '}
          {tunable.maximum}
        </i>
      </p>
      <p className="flow-tuner-detail">{tunable.description}</p>
      {said ? (
        <p className="flow-demand-said" data-tuning-said={tunable.id}>
          {said}
        </p>
      ) : null}
    </div>
  );
}
