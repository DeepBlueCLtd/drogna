/**
 * The platform demand (SRD-v2 FR-53, FR-59, FR-66): a course, a speed and a depth,
 * posted across the seam to the operator surface, which publishes them.
 *
 * The shell does not publish. Its broker role carries an empty publish list, and a
 * front-end that reached the demand topic directly would have stopped being one — so
 * this is a genuine seam POST, and what the platform does with it comes back on the
 * state topic like everything else a component says about itself.
 *
 * The control says what it did, not what happened. "Published" is the truth available
 * here; whether the platform can reach the demand is the platform's answer, and the
 * face beside this one shows it arriving.
 *
 * **Where the bounds come from.** The sliders run between zero and the platform's own
 * declared limits, as the platform reported them on its state topic — not between
 * numbers typed here. Before any state has arrived there are no bounds to draw, so the
 * fields fall back to plain entry and say why: a slider with an invented maximum is a
 * display claiming to know a limit it has not been told (Constitution VII).
 *
 * **Two ways to demand, and the difference is the lesson.** The three sliders send one
 * demand naming all three quantities. Each preset sends a demand naming only what it
 * changes — and the platform leaves a standing demand alone for anything a demand does
 * not name, so "all stop" turns nothing and "reverse course" keeps the speed it was
 * making. That behaviour is the platform's, and this is where a reader can see it.
 */
import { useState } from 'react';
import type { ConfigShell, PlatformState } from '../../generated/types.js';

/** What one demand names. An absent field leaves the standing demand alone. */
interface Demand {
  course_degrees?: number;
  speed_m_per_s?: number;
  depth_m?: number;
}

export function DemandControl({
  config,
  state,
  onRefusal,
}: {
  config: ConfigShell;
  /** The platform's own last report: the source of the limits drawn below. */
  state: PlatformState | undefined;
  onRefusal: (refusal: string | undefined) => void;
}) {
  const [course, setCourse] = useState('090');
  const [speed, setSpeed] = useState('3.0');
  const [depth, setDepth] = useState('120');
  const [said, setSaid] = useState<string | undefined>();
  const limits = state?.limits;

  const send = async (demand: Demand) => {
    const response = await fetch(config.endpoints.platform_demand, {
      method: 'POST',
      body: JSON.stringify(demand),
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

  const sendTyped = () => {
    const demand: Demand = {};
    if (course.trim() !== '') demand.course_degrees = Number(course);
    if (speed.trim() !== '') demand.speed_m_per_s = Number(speed);
    if (depth.trim() !== '') demand.depth_m = Number(depth);
    void send(demand);
  };

  /**
   * The presets, each derived from what the platform reported rather than from a table
   * here: reversing a course it has not reported is not a preset, it is a guess. With
   * nothing reported there are no presets, and the panel says so.
   */
  const presets: { id: string; label: string; demand: Demand }[] = state
    ? [
        {
          id: 'reverse',
          label: 'reverse course',
          demand: { course_degrees: (state.current.course_degrees + 180) % 360 },
        },
        { id: 'all-stop', label: 'all stop', demand: { speed_m_per_s: 0 } },
        {
          id: 'full-ahead',
          label: 'full ahead',
          demand: { speed_m_per_s: state.limits.maximum_speed_m_per_s },
        },
        { id: 'surface', label: 'surface', demand: { depth_m: 0 } },
      ]
    : [];

  return (
    <div className="flow-demand" data-testid="demand-control">
      <h4>issue a demand</h4>
      <div className="flow-demand-fields">
        <Field
          label="course"
          unit="°T"
          value={course}
          onChange={setCourse}
          minimum={0}
          maximum={359}
          step={1}
          current={state?.current.course_degrees}
        />
        <Field
          label="speed"
          unit="m/s"
          value={speed}
          onChange={setSpeed}
          minimum={0}
          maximum={limits?.maximum_speed_m_per_s}
          step={0.1}
          current={state?.current.speed_m_per_s}
        />
        <Field
          label="depth"
          unit="m"
          value={depth}
          onChange={setDepth}
          minimum={0}
          maximum={limits?.maximum_depth_m}
          step={5}
          current={state?.current.depth_m}
        />
        <button onClick={sendTyped} data-testid="demand-send">
          send
        </button>
      </div>
      {presets.length > 0 ? (
        <div className="flow-demand-presets" data-testid="demand-presets">
          {presets.map((preset) => (
            <button
              key={preset.id}
              data-demand-preset={preset.id}
              onClick={() => void send(preset.demand)}
              title={`demands ${Object.keys(preset.demand).join(', ')} and nothing else`}
            >
              {preset.label}
            </button>
          ))}
          <span className="panel-footnote">
            each preset demands only what it names, worked out from what the platform last
            reported; anything it does not name is left standing
          </span>
        </div>
      ) : (
        <p className="panel-footnote">
          no state has arrived from the platform yet, so there are no limits to bound these
          fields with and no current course to work a preset from
        </p>
      )}
      {said ? (
        <p className="flow-demand-said" data-testid="demand-said">
          {said}
        </p>
      ) : (
        <p className="panel-footnote">
          The demand is published, not applied. What the platform does with it arrives on its state
          topic, and a limit it cannot reach is stated there.
        </p>
      )}
    </div>
  );
}

/**
 * One quantity: a slider where the platform has reported a bound to draw one against,
 * and a number beside it that always takes typed entry. The slider is the control a
 * pointer wants and the number is the one a keyboard and a screen reader want, and
 * they are the same value — not two states that can drift apart.
 */
function Field({
  label,
  unit,
  value,
  onChange,
  minimum,
  maximum,
  step,
  current,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  minimum: number;
  maximum: number | undefined;
  step: number;
  current: number | undefined;
}) {
  return (
    <label data-demand-field={label}>
      <span className="flow-demand-label">
        {label} <i>{unit}</i>
      </span>
      {maximum === undefined ? null : (
        <input
          type="range"
          min={minimum}
          max={maximum}
          step={step}
          value={value === '' ? minimum : Number(value)}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} demanded, ${minimum} to ${maximum} ${unit}`}
        />
      )}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        aria-label={`${label} demanded, ${unit}`}
      />
      {current === undefined ? null : (
        <span className="flow-demand-current">now {current.toFixed(1)}</span>
      )}
    </label>
  );
}
