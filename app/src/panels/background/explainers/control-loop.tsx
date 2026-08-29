/**
 * 10 — The control loop (interactive, 7 steps).
 *
 * drogna's own arrangement rather than a standard, and the Consequences panel says
 * so by omitting the interoperability axis with its reason (FR-008).
 */
import { INK, MarkDefs, PokeRegion, categoryStyle, range } from '../marks.js';
import type { Explainer } from '../model.js';

const points = categoryStyle('points');
const fields = categoryStyle('fields');

const STATIONS = ['sense', 'decide', 'act', 'publish'];

function Loop({ lit, caption }: { lit: number; caption: string }) {
  return (
    <svg viewBox="0 0 320 150" width="100%">
      <MarkDefs />
      {STATIONS.map((station, index) => {
        const isLit = index === lit;
        return (
          <g key={station}>
            <rect
              x={12 + index * 78}
              y={40}
              width={64}
              height={44}
              fill={isLit ? fields.fill : 'none'}
              stroke={isLit ? fields.stroke : INK.quiet}
              strokeWidth={isLit ? fields.strokeWidth : 1}
              strokeDasharray={isLit ? undefined : '4 3'}
            />
            <text
              x={44 + index * 78}
              y={67}
              fontSize="9.5"
              textAnchor="middle"
              fill={isLit ? INK.strong : INK.quiet}
            >
              {station}
            </text>
            {index < 3 ? (
              <path
                d={`M${76 + index * 78} 62 H${86 + index * 78}`}
                fill="none"
                stroke={INK.quiet}
              />
            ) : null}
          </g>
        );
      })}
      <path d="M298 84 V108 H44 V84" fill="none" stroke={INK.quiet} strokeDasharray="3 3" />
      <text x="12" y="132" fontSize="9" fill={INK.quiet}>
        {caption}
      </text>
    </svg>
  );
}

export const controlLoop: Explainer = {
  id: 'control-loop',
  title: 'The control loop',
  form: 'interactive',
  idea: 'The loop is observable. Every transition is a message you can watch, which is why the seams are where they are.',
  steps: [
    {
      title: 'Four stations, none of them lit',
      prose: [
        'Sense, decide, act, publish. Nothing is running, so nothing is lit.',
        'Under the same rule the System tab obeys: a box brightens because a message arrived, not because a flag says it should.',
      ],
      liveView: { view: 'system', label: 'See which components this run has actually heard from' },
      figure: {
        minWidth: 340,
        label: 'Four stations of the loop, all dark and nothing moving',
        caption: 'Four stations, unlit until a message arrives.',
        draw: () => <Loop lit={-1} caption="Nothing has arrived, so nothing is lit." />,
      },
    },
    {
      title: 'Sense: score the difference',
      prose: [
        'Observations are compared against the forecast that predicted them, and the residual is the gap.',
        'Instruments produce spikes, so the monitor watches for a sustained pattern rather than a single reading.',
      ],
      figure: {
        minWidth: 340,
        label: 'The sense station lit, scoring residuals between observations and the current forecast',
        caption: 'Residual: measured minus predicted, scored continuously.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <Loop lit={0} caption="A sustained score is published as a divergence. A single spike is not." />
            <line x1="12" y1="150" x2="308" y2="150" stroke={INK.quiet} />
            {range(12).map((index) => (
              <line
                key={index}
                x1={20 + index * 24}
                y1={150}
                x2={20 + index * 24}
                y2={150 - (index === 5 ? 4 : Math.min(index * 2, 16))}
                stroke={index >= 8 ? points.stroke : INK.quiet}
                strokeWidth={points.strokeWidth}
              />
            ))}
            <text x="196" y="166" fontSize="8.5" fill={points.stroke}>
              sustained, not a spike
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Decide: and often, decline',
      prose: [
        'Divergence crossing a threshold is a request, not a command. The scheduler applies a minimum interval and a cadence floor, and frequently declines.',
        'The refusal is published on the same topic as an acceptance, naming the rule and the margin.',
      ],
      note: 'Most scheduler outcomes are refusals. They are published too, which is what makes the quiet legible.',
      figure: {
        minWidth: 340,
        label: 'The decide station lit, refusing a run because the minimum interval has not elapsed',
        caption: 'A refusal names the rule and the margin.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <Loop lit={1} caption="Acceptance and refusal travel on the same topic." />
            <rect x="12" y="130" width="296" height="32" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
            <text x="20" y="150" fontSize="9" fill={INK.warn} fontFamily="monospace">
              declined: minimum interval 900s, elapsed 412s, margin 488s
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Act: run it, several times',
      prose: [
        'A handful of forecasts from slightly different starting points. Where they agree, confidence is higher; where they diverge, lower.',
        'The spread is what the uncertainty field is computed from.',
      ],
      figure: {
        minWidth: 340,
        label: 'The act station lit, running a small ensemble whose spread becomes the uncertainty field',
        caption: 'A small ensemble; the spread becomes the uncertainty field.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <Loop lit={2} caption="Members agree near the start and part later." />
            <path d="M20 146 C 90 142, 150 130, 300 122" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <path d="M20 146 C 90 144, 150 140, 300 140" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <path d="M20 146 C 90 148, 150 152, 300 158" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="234" y="118" fontSize="8.5" fill={fields.stroke}>
              spread
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Publish: all at once, or not at all',
      prose: [
        'The run is staged, its bytes checked against the recorded digest, and only then does the current pointer move.',
        'A mismatch is refused by name with the pointer untouched, so no reader observes a partial field.',
      ],
      play: 'Push the residual up and watch the loop re-plan rather than replay.',
      figure: {
        minWidth: 360,
        label: 'The publish station lit, swapping the current pointer atomically after a digest check',
        caption: 'Staged, digest-checked, then revealed by moving one pointer.',
        draw: ({ poke, onPoke }) => {
          const perturbed = poke === 'perturbed';
          return (
            <svg viewBox="0 0 320 190" width="100%">
              <MarkDefs />
              <Loop lit={3} caption="The pointer moves last, or not at all." />
              <PokeRegion
                x={12}
                y={128}
                width={140}
                height={24}
                label="perturb the residual"
                active={perturbed}
                onPoke={() => onPoke(perturbed ? undefined : 'perturbed')}
              >
                <text x={82} y={144} fontSize="9" textAnchor="middle" fill={INK.strong}>
                  {perturbed ? 'residual raised' : 'perturb the residual'}
                </text>
              </PokeRegion>
              <text x="12" y="170" fontSize="9" fill={perturbed ? points.stroke : INK.quiet}>
                {perturbed
                  ? 'The next cycle starts from the new observations: a fresh plan, not the previous one replayed.'
                  : 'Staged bytes, digest checked, pointer moved. A mismatch is refused by name.'}
              </text>
              <text x="12" y="184" fontSize="9" fill={INK.quiet}>
                {perturbed ? 'The stations run again in order; none of them is skipped.' : ''}
              </text>
            </svg>
          );
        },
      },
    },
    {
      title: 'Was it better than doing nothing?',
      prose: [
        'The reference is persistence: assume tomorrow resembles today, then check whether the model beat that. Usually it does.',
        'When it does not, the display names the run rather than averaging it into the others.',
      ],
      note: 'Constitution IX: ground truth is scored, never assumed.',
      liveView: { view: 'operator', label: 'Read this run’s own skill figure against persistence' },
      figure: {
        minWidth: 340,
        label: 'Forecast error compared against a persistence reference, with one run that failed to beat it',
        caption: 'Model error against a persistence reference, including one run that lost.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <line x1="34" y1="20" x2="34" y2="130" stroke={INK.quiet} />
            <line x1="34" y1="130" x2="308" y2="130" stroke={INK.quiet} />
            <text x="12" y="24" fontSize="8" fill={INK.quiet}>
              error
            </text>
            {[62, 58, 70, 54, 96, 60].map((height, index) => (
              <g key={index}>
                <rect
                  x={48 + index * 42}
                  y={130 - height}
                  width={18}
                  height={height}
                  fill={height > 80 ? 'none' : fields.fill}
                  stroke={height > 80 ? INK.warn : fields.stroke}
                  strokeWidth={fields.strokeWidth}
                  strokeDasharray={height > 80 ? '4 3' : undefined}
                />
              </g>
            ))}
            <line x1="34" y1="48" x2="308" y2="48" stroke={points.stroke} strokeWidth={points.strokeWidth} strokeDasharray="6 3" />
            <text x="196" y="44" fontSize="8.5" fill={points.stroke}>
              persistence reference
            </text>
            <text x="12" y="152" fontSize="9" fill={INK.warn}>
              Run 5 did not beat persistence. It is named, not averaged away.
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'Every transition is a message on a topic, so the loop can be observed later without a debugger or a rebuild.',
      qualitative: true,
    },
    interoperability: {
      kind: 'omitted',
      reason: 'Nothing to claim. This arrangement is drogna’s own, not a standard. It is here to show where the standards sit, not to be adopted.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'A justification for autonomous action: the planner recommends and a person decides.',
    },
  },
};
