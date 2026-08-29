/**
 * The platform demand (SRD-v2 FR-53, FR-59): a course, a speed and a depth, posted
 * across the seam to the operator surface, which publishes them.
 *
 * The shell does not publish. Its broker role carries an empty publish list, and a
 * front-end that reached the demand topic directly would have stopped being one — so
 * this is a genuine seam POST, and what the platform does with it comes back on the
 * state topic like everything else a component says about itself.
 *
 * The control says what it did, not what happened. "Published" is the truth available
 * here; whether the platform can reach the demand is the platform's answer, and the
 * face beside this one shows it arriving.
 */
import { useState } from 'react';
import type { ConfigShell } from '../../generated/types.js';

export function DemandControl({
  config,
  onRefusal,
}: {
  config: ConfigShell;
  onRefusal: (refusal: string | undefined) => void;
}) {
  const [course, setCourse] = useState('090');
  const [speed, setSpeed] = useState('3.0');
  const [depth, setDepth] = useState('120');
  const [said, setSaid] = useState<string | undefined>();

  const send = async () => {
    const body: Record<string, number> = {};
    if (course.trim() !== '') body.course_degrees = Number(course);
    if (speed.trim() !== '') body.speed_m_per_s = Number(speed);
    if (depth.trim() !== '') body.depth_m = Number(depth);
    const response = await fetch(config.endpoints.platform_demand, {
      method: 'POST',
      body: JSON.stringify(body),
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
    <div className="flow-demand" data-testid="demand-control">
      <h4>issue a demand</h4>
      <div className="flow-demand-fields">
        <label>
          course
          <input value={course} onChange={(event) => setCourse(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          speed
          <input value={speed} onChange={(event) => setSpeed(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          depth
          <input value={depth} onChange={(event) => setDepth(event.target.value)} inputMode="decimal" />
        </label>
        <button onClick={() => void send()} data-testid="demand-send">
          send
        </button>
      </div>
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
