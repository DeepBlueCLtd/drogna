/**
 * 5 — Where a number came from (interactive, 7 steps).
 *
 * Not a standard, and the only explainer in the course that depicts drogna's own
 * maths. It follows *What a holding is* because that one introduced the archive, the
 * now-cast and the published run as different things; this one shows a measurement
 * moving between them, and what is left of it a week later.
 *
 * Self-contained illustration, like every explainer: the numbers below are authored
 * here to make an argument legible, not sampled from a run (FR-004). Where it claims
 * something about drogna it links to the live view rather than depicting it (FR-005).
 */
import { INK, MarkDefs, PokeRegion, categoryStyle, range } from '../marks.js';
import { Readout } from '../layout.js';
import type { Explainer } from '../model.js';

const fields = categoryStyle('fields');
const archive = categoryStyle('archive');
const points = categoryStyle('points');

/** The four shares, in the order the analyst stores and the panel draws them. */
const SHARES = [
  { id: 'archive', label: 'archive', short: 'archive', style: archive },
  // The legend gets the short form: four entries across 320 units leaves no room for
  // 'departure forecast', and a legend whose labels collide is a legend nobody reads.
  { id: 'departure', label: 'departure forecast', short: 'departure', style: archive },
  { id: 'measurement', label: 'measurement', short: 'measurement', style: points },
  { id: 'model', label: 'model', short: 'model', style: fields },
] as const;

/**
 * One cell's shares at seven moments, as a proportion. Authored to show the shape of
 * the argument: all prior knowledge at the quay, measurement taking most of it when
 * the platform passes, and the model reclaiming it as the forecast ages with nothing
 * new measured there.
 */
const TIMELINE = [
  { at: 'at the quay', shares: [1, 0, 0, 0] },
  { at: 'sailing', shares: [0, 1, 0, 0] },
  { at: 'first forecast', shares: [0, 0.82, 0, 0.18] },
  { at: 'the boat passes', shares: [0, 0.04, 0.95, 0.01] },
  { at: 'a day later', shares: [0, 0.03, 0.72, 0.25] },
  { at: 'three days', shares: [0, 0.02, 0.41, 0.57] },
  { at: 'a week', shares: [0, 0.01, 0.14, 0.85] },
];

const BAR_WIDTH = 232;

function StackedBar({
  shares,
  y,
  height,
  x: origin = 60,
  span = BAR_WIDTH,
}: {
  shares: readonly number[];
  y: number;
  height: number;
  x?: number;
  span?: number;
}) {
  let offset = 0;
  return (
    <g>
      {shares.map((share, index) => {
        const width = share * span;
        const x = origin + offset;
        offset += width;
        if (width <= 0) return null;
        const style = SHARES[index].style;
        return (
          <rect
            key={SHARES[index].id}
            x={x}
            y={y}
            width={width}
            height={height}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            strokeDasharray={style.strokeDasharray}
          />
        );
      })}
    </g>
  );
}

export const analysis: Explainer = {
  id: 'analysis',
  title: 'Where a number came from',
  form: 'interactive',
  idea: 'A forecast cell is a weighted sum of what was known and what was measured, and the weights are the gain itself — so the field can say, cell by cell, how much of it the platform is responsible for.',
  steps: [
    {
      title: 'The question',
      prose: [
        'A field says the water here is 12.4 degrees. Where did that number come from?',
        'Some of it is what was known before anyone sailed. Some is what an instrument measured on the way past. Some is what the model added in between.',
        'Most systems cannot answer this. This one can, and the reason is arithmetic rather than record-keeping.',
      ],
      figure: {
        minWidth: 340,
        label: 'A single grid cell carrying a value, with the question of its origin',
        caption: 'One cell, one number, three possible origins.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            {range(4).map((row) =>
              range(6).map((column) => (
                <rect
                  key={`${row}-${column}`}
                  x={40 + column * 40}
                  y={20 + row * 26}
                  width={40}
                  height={26}
                  fill="none"
                  stroke={INK.quiet}
                />
              )),
            )}
            <rect x={120} y={72} width={40} height={26} fill={fields.fill} stroke={fields.stroke} strokeWidth={2} />
            <text x={140} y={89} fontSize="10" textAnchor="middle" fill={INK.strong}>
              12.4
            </text>
            <path d="M140 110 V128" fill="none" stroke={INK.line} />
            <text x={140} y={142} fontSize="10" textAnchor="middle" fill={INK.quiet}>
              …from where?
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'A forecast is a guess with an error bar',
      prose: [
        'Before any measurement arrives, the field is whatever the model propagated forward. Call that the background.',
        'It comes with a stated uncertainty, and that uncertainty is not the same everywhere: water the platform swept yesterday is known better than water nobody has visited.',
      ],
      figure: {
        minWidth: 340,
        label: 'A background field with an uncertainty that varies across it',
        caption: 'The background, and how well it is known.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <text x={12} y={22} fontSize="10" fill={INK.quiet}>
              background uncertainty
            </text>
            {range(8).map((column) => {
              const height = 20 + [46, 40, 28, 14, 18, 34, 44, 48][column];
              return (
                <rect
                  key={column}
                  x={20 + column * 36}
                  y={120 - height}
                  width={28}
                  height={height}
                  fill={fields.fill}
                  stroke={fields.stroke}
                  strokeWidth={fields.strokeWidth}
                />
              );
            })}
            <path d="M20 128 H308" fill="none" stroke={INK.line} />
            <text x={128} y={142} fontSize="9" fill={INK.quiet}>
              recently swept — known better
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The instrument disagrees',
      prose: [
        'An instrument reports 12.9 where the background expected 12.4. The difference is the innovation: half a degree of news.',
        'It is not automatically right. The instrument has a declared error too — a stated fraction of a degree — and so does the background.',
      ],
      note: 'Neither error is a number chosen to make the picture work. Both are declared where they belong: the instrument states its noise, the forecast publishes its spread.',
      figure: {
        minWidth: 340,
        label: 'Background value and measured value, with the difference marked as the innovation',
        caption: 'The innovation: what was measured, less what was expected.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <path d="M40 118 H300" fill="none" stroke={INK.line} />
            <rect x={96} y={54} width={4} height={64} fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x={98} y={44} fontSize="10" textAnchor="middle" fill={INK.strong}>
              12.4
            </text>
            <text x={98} y={134} fontSize="9" textAnchor="middle" fill={INK.quiet}>
              background
            </text>
            <rect x={216} y={54} width={4} height={64} fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x={218} y={44} fontSize="10" textAnchor="middle" fill={INK.strong}>
              12.9
            </text>
            <text x={218} y={134} fontSize="9" textAnchor="middle" fill={INK.quiet}>
              measured
            </text>
            <path d="M104 76 H210 M204 70 L210 76 L204 82" fill="none" stroke={INK.line} />
            <text x={157} y={68} fontSize="9.5" textAnchor="middle" fill={INK.quiet}>
              innovation
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The weight is the ratio of the two doubts',
      prose: [
        'The analysis moves the cell toward the measurement by a weight, and the weight is not a preference. It is how uncertain the background was, against how uncertain the two are together.',
        'A confident instrument against a vague forecast: the measurement nearly wins outright. A precise forecast against a noisy instrument: it barely moves.',
      ],
      play: 'Drag the balance between a vague forecast and a noisy instrument.',
      figure: {
        minWidth: 340,
        label: 'The gain as a balance between background uncertainty and instrument uncertainty',
        caption: 'The weight, from the two declared errors.',
        draw: ({ poke, onPoke }) => {
          const options = [
            { id: 'vague', label: 'vague forecast, good instrument', weight: 0.97 },
            { id: 'even', label: 'evenly matched', weight: 0.5 },
            { id: 'sharp', label: 'sharp forecast, noisy instrument', weight: 0.08 },
          ];
          const chosen = options.find((option) => option.id === poke) ?? options[0];
          return (
            <>
              <svg viewBox="0 0 320 150" width="100%">
                <MarkDefs />
                {options.map((option, index) => (
                  <PokeRegion
                    key={option.id}
                    x={12}
                    y={14 + index * 26}
                    width={296}
                    height={22}
                    label={option.label}
                    active={chosen.id === option.id}
                    onPoke={() => onPoke(option.id)}
                  >
                    <text x={20} y={29 + index * 26} fontSize="10" fill={INK.strong}>
                      {option.label}
                    </text>
                  </PokeRegion>
                ))}
                <path d="M20 118 H300" fill="none" stroke={INK.line} />
                <text x={20} y={134} fontSize="9" fill={INK.quiet}>
                  background
                </text>
                <text x={300} y={134} fontSize="9" textAnchor="end" fill={INK.quiet}>
                  measurement
                </text>
                <circle
                  cx={20 + chosen.weight * 280}
                  cy={118}
                  r={7}
                  fill={points.fill}
                  stroke={points.stroke}
                  strokeWidth={points.strokeWidth}
                />
              </svg>
              <Readout>
                {`Weight on the measurement: ${(chosen.weight * 100).toFixed(0)}%. The rest stays with the background — and that split is exactly what the next step records.`}
              </Readout>
            </>
          );
        },
      },
    },
    {
      title: 'Which makes the shares exact',
      prose: [
        'Because the analysed value is the background and the measurements added in fixed proportions, and those proportions sum to one, the cell can carry them.',
        'This is not an annotation kept alongside the number. It is the same arithmetic that produced the number, written down.',
      ],
      note: 'It is why the method matters. A scheme that simply nudged the field toward nearby readings would draw the same picture — but the picture would be an illustration, not the sum.',
      figure: {
        minWidth: 340,
        label: 'The analysed value as a weighted sum of background and measurement, the weights summing to one',
        caption: 'The value and its shares are the same arithmetic.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <rect x={20} y={30} width={120} height={34} fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x={80} y={52} fontSize="10" textAnchor="middle" fill={INK.strong}>
              background
            </text>
            <text x={152} y={52} fontSize="12" textAnchor="middle" fill={INK.line}>
              +
            </text>
            <rect x={164} y={30} width={120} height={34} fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x={224} y={52} fontSize="10" textAnchor="middle" fill={INK.strong}>
              measurement
            </text>
            <path d="M152 72 V92" fill="none" stroke={INK.line} />
            <StackedBar shares={[0, 0.35, 0.65, 0]} y={96} height={30} />
            <text x={30} y={116} fontSize="9" textAnchor="end" fill={INK.quiet}>
              cell
            </text>
            <text x={20} y={142} fontSize="9" fill={INK.quiet}>
              the shares sum to one, because the weights do
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'And a measurement ages',
      prose: [
        'Each forecast step carries the cell forward and adds error of its own. That added error came from the model, not from any instrument.',
        'So the measurement’s share is diluted every time the field is propagated. A week on, with nothing new measured there, the cell is mostly model again — and says so.',
        'Follow one cell from the quay to a week out.',
      ],
      play: 'Step through the timeline and watch the shares change.',
      figure: {
        minWidth: 360,
        label: 'One cell’s four provenance shares at seven moments, from departure to a week later',
        caption: 'One cell, from the quay to a week out.',
        draw: ({ poke, onPoke }) => {
          const index = Math.min(Math.max(Number(poke ?? '0') || 0, 0), TIMELINE.length - 1);
          const moment = TIMELINE[index];
          return (
            <>
              <svg viewBox="0 0 320 200" width="100%">
                <MarkDefs />
                {TIMELINE.map((entry, row) => (
                  <PokeRegion
                    key={entry.at}
                    x={4}
                    y={10 + row * 24}
                    width={312}
                    height={22}
                    label={`${entry.at}: ${SHARES.map((share, i) => `${share.label} ${(entry.shares[i] * 100).toFixed(0)}%`).join(', ')}`}
                    active={row === index}
                    onPoke={() => onPoke(String(row))}
                  >
                    <text x={8} y={25 + row * 24} fontSize="8.5" fill={row === index ? INK.strong : INK.quiet}>
                      {entry.at}
                    </text>
                    {/* The bars begin clear of the widest moment's label: at x=60 they
                        ran under 'the boat passes', which the clipped-label check
                        cannot see because nothing left the frame. */}
                    <StackedBar shares={entry.shares} y={12 + row * 24} height={18} x={76} span={228} />
                  </PokeRegion>
                ))}
                <g>
                  {SHARES.map((share, i) => (
                    <g key={share.id}>
                      <rect
                        x={10 + i * 78}
                        y={182}
                        width={10}
                        height={10}
                        fill={share.style.fill}
                        stroke={share.style.stroke}
                        strokeWidth={share.style.strokeWidth}
                        strokeDasharray={share.style.strokeDasharray}
                      />
                      <text x={24 + i * 78} y={191} fontSize="8" fill={INK.quiet}>
                        {share.short}
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
              <Readout>
                {`${moment.at}: ${SHARES.filter((_, i) => moment.shares[i] > 0.005)
                  .map((share, position, kept) => {
                    const original = SHARES.indexOf(share);
                    return `${(moment.shares[original] * 100).toFixed(0)}% ${share.label}${position === kept.length - 1 ? '' : ','}`;
                  })
                  .join(' ')}.`}
              </Readout>
            </>
          );
        },
      },
    },
    {
      title: 'Two admissions',
      prose: [
        'The departure bar is a convention, not a discovery. Everything it holds came from the archive — a forecast moves information without creating any — and it is kept separate because “how much of this did we know before we sailed” is a question worth answering, not because the two are different in kind.',
        'And a share can go negative. Where a cell is far less certain than the water measured beside it, the analysis extrapolates past the reading rather than averaging toward it, and the prior shares go below zero to pay for it. That is the method being correct, not a fault, and the panel draws it rather than rounding it away.',
      ],
      liveView: { view: 'map', label: 'the provenance tint on the Map' },
      figure: {
        minWidth: 340,
        label: 'A share bar overshooting one hundred per cent, with the prior share drawn below the axis',
        caption: 'An overshoot, drawn rather than clamped.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <path d="M56 16 V108" fill="none" stroke={INK.line} />
            <path d="M252 16 V108" fill="none" stroke={INK.quiet} strokeDasharray="3 3" />
            <text x={56} y={12} fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              0%
            </text>
            <text x={252} y={12} fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              100%
            </text>
            <text x={60} y={30} fontSize="9" fill={INK.quiet}>
              the usual case
            </text>
            <StackedBar shares={[0, 0.35, 0.65, 0]} y={34} height={22} x={56} span={196} />
            <text x={60} y={76} fontSize="9" fill={INK.quiet}>
              where the analysis extrapolates
            </text>
            <rect x={32} y={80} width={24} height={22} fill={archive.fill} stroke={archive.stroke} strokeWidth={archive.strokeWidth} />
            <rect
              x={56}
              y={80}
              width={196 * 1.12}
              height={22}
              fill={points.fill}
              stroke={points.stroke}
              strokeWidth={points.strokeWidth}
            />
            <text x={12} y={124} fontSize="8.5" fill={INK.quiet}>
              measurement past 100%, and the prior share below zero to pay for it
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'The question “why does the field say this here” is answered from the field itself rather than from whoever remembers which cruise went where.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'The shares are published as an ordinary gridded holding, so anything that can read a field can read the provenance of one.',
    },
    'what you do not have to build': {
      kind: 'omitted',
      reason: 'Nothing here is standard. The analysis and its shares are this harness’s own arrangement, and the course says so rather than implying a specification exists behind them.',
    },
  },
};
