/**
 * 4 — What a holding is (interactive, 6 steps).
 *
 * Not a standard: this is drogna's own arrangement, which is why the course frame
 * says "the standards, and what it takes to use them honestly" rather than "the
 * standards". Where it claims something about drogna it links to the live view
 * rather than depicting it (FR-005).
 */
import { INK, MarkDefs, PokeRegion, categoryStyle, range } from '../marks.js';
import { Readout } from '../layout.js';
import type { Explainer } from '../model.js';

const fields = categoryStyle('fields');
const archive = categoryStyle('archive');
const points = categoryStyle('points');

const RUNS = [
  { id: 'r1', label: 'run 07:00', reason: 'scheduled' },
  { id: 'r2', label: 'run 11:00', reason: 'divergence-triggered' },
  { id: 'r3', label: 'run 15:00', reason: 'scheduled' },
  { id: 'r4', label: 'run 19:00', reason: 'divergence-triggered' },
];

export const holdings: Explainer = {
  id: 'holdings',
  title: 'What a holding is',
  form: 'interactive',
  idea: 'A field is not one thing. A collection spans a coarse archive, a current now-cast, and every forecast run the loop has published — each queryable the same way.',
  steps: [
    {
      title: 'A collection is not a file',
      prose: [
        'Ask for sea water temperature and there are three possible answers: the long coarse record, the current best picture, or one of the forecasts.',
        'All three sit under one collection name and answer the same queries.',
      ],
      figure: {
        minWidth: 340,
        label: 'One collection name spanning three kinds of holding',
        caption: 'One collection name over three kinds of holding.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <rect x="80" y="12" width="160" height="26" fill="none" stroke={INK.strong} />
            <text x="160" y="29" fontSize="10.5" textAnchor="middle" fill={INK.strong}>
              sea water temperature
            </text>
            {[
              { x: 12, label: 'archive', style: archive },
              { x: 112, label: 'now-cast', style: fields },
              { x: 212, label: 'instances', style: fields },
            ].map((holding) => (
              <g key={holding.label}>
                <line x1={160} y1={38} x2={holding.x + 48} y2={70} stroke={INK.line} />
                <rect
                  x={holding.x}
                  y={70}
                  width={96}
                  height={70}
                  fill={holding.style.fill}
                  stroke={holding.style.stroke}
                  strokeWidth={holding.style.strokeWidth}
                  strokeDasharray={holding.style.strokeDasharray}
                />
                <text x={holding.x + 48} y={110} fontSize="10" textAnchor="middle" fill={INK.strong}>
                  {holding.label}
                </text>
              </g>
            ))}
            <text x="12" y="160" fontSize="9" fill={INK.quiet}>
              Three kinds of holding. One name, one query language.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The archive: what you knew before anyone sailed',
      prose: [
        'Two decades of monthly means: too coarse to navigate by, too old for today, and complete everywhere.',
        'This is the grey behind the casts in explainer 2, and why a gap in the observations is not a gap in what you hold.',
      ],
      figure: {
        minWidth: 340,
        label: 'Two decades of monthly archive cells, coarse and complete',
        caption: 'Twenty years of monthly means, always present.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {range(4).map((row) =>
              range(10).map((column) => (
                <rect
                  key={`${row}-${column}`}
                  x={12 + column * 30}
                  y={20 + row * 30}
                  width={30}
                  height={30}
                  fill={archive.fill}
                  stroke={archive.stroke}
                  strokeWidth={archive.strokeWidth}
                  strokeDasharray={archive.strokeDasharray}
                />
              )),
            )}
            <text x="12" y="156" fontSize="9.5" fill={INK.line}>
              240 monthly means · coarse grid · complete everywhere · dated
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The now-cast: one, and current',
      prose: [
        'A single field, replaced on a cadence, so there is never a second one to choose between.',
        'It carries a manifest recording what it was derived from, like every other holding.',
      ],
      figure: {
        minWidth: 340,
        label: 'A single now-cast replaced on a cadence rather than accumulated',
        caption: 'Replaced on a cadence rather than accumulated.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {range(3).map((generation) => (
              <g key={generation} opacity={generation === 2 ? 1 : 0.3}>
                <rect
                  x={20 + generation * 14}
                  y={30 + generation * 10}
                  width={150}
                  height={90}
                  fill={generation === 2 ? fields.fill : 'none'}
                  stroke={fields.stroke}
                  strokeWidth={fields.strokeWidth}
                />
              </g>
            ))}
            <text x="122" y="80" fontSize="10" textAnchor="middle" fill={INK.strong}>
              current
            </text>
            <path d="M200 74 H250 M244 68 L250 74 L244 80" fill="none" stroke={INK.line} />
            <text x="256" y="70" fontSize="9.5" fill={INK.line}>
              replaced,
            </text>
            <text x="256" y="84" fontSize="9.5" fill={INK.line}>
              not added to
            </text>
          </svg>
          <Readout>Exactly one now-cast exists, so no client has to choose between two.</Readout>
          </>
        ),
      },
    },
    {
      title: 'Instances: every run you ever published',
      prose: [
        'The loop adds rather than overwrites, so you can ask what the forecast said last Tuesday and what it was made from.',
        'Each run carries the manifest that reconstructs it byte for byte, which is what makes a past decision auditable.',
      ],
      note: 'This is the beat: provenance you can replay, not provenance you assert.',
      play: 'Pick a run to see the manifest it carries.',
      liveView: { view: 'holdings', label: 'See the holdings this run actually published' },
      figure: {
        minWidth: 360,
        label: 'Forecast runs accumulating, each carrying its own manifest',
        caption: 'Runs accumulate. The mark on each is its manifest.',
        draw: ({ poke, onPoke }) => {
          const chosen = RUNS.find((run) => run.id === poke);
          return (
            <>
              <svg viewBox="0 0 320 170" width="100%">
              <MarkDefs />
              {RUNS.map((run, index) => (
                <PokeRegion
                  key={run.id}
                  x={12 + index * 76}
                  y={26}
                  width={68}
                  height={78}
                  label={run.label}
                  active={poke === run.id}
                  onPoke={() => onPoke(poke === run.id ? undefined : run.id)}
                >
                  <rect
                    x={20 + index * 76}
                    y={34}
                    width={52}
                    height={62}
                    fill={fields.fill}
                    stroke={fields.stroke}
                    strokeWidth={fields.strokeWidth}
                  />
                  <circle cx={66 + index * 76} cy={40} r="5" fill={points.stroke} />
                  <text x={46 + index * 76} y={118} fontSize="9" textAnchor="middle" fill={INK.line}>
                    {run.label}
                  </text>
                </PokeRegion>
              ))}
              </svg>
              <Readout>
                {chosen
                  ? `${chosen.label}: ${chosen.reason}. Its manifest carries the seeds, the inputs and the code revision, and replaying it reproduces the run byte for byte.`
                  : 'Each run keeps its own manifest. Nothing is overwritten. Pick one.'}
              </Readout>
              </>
          );
        },
      },
    },
    {
      title: 'And it says truthfully what it holds',
      prose: [
        'Every collection publishes its extent: the years, the box, the depths.',
        'An over-claiming document is not a documentation defect. It is a client planning through water nobody modelled.',
        'Here the claim is verified against the store by test.',
      ],
      figure: {
        minWidth: 340,
        label: 'A discovery document stating extents truthfully, checked against the store',
        caption: 'Declared extent, checked against the store.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <rect x="12" y="18" width="140" height="120" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="20" y="36" fontSize="10" fill={fields.stroke}>
              declared extent
            </text>
            {['2006 – 2026', '14°W – 8°W', '44°N – 48°N', '0 – 1000 m'].map((line, index) => (
              <text key={line} x="20" y={58 + index * 18} fontSize="9.5" fill={INK.line}>
                {line}
              </text>
            ))}
            <path d="M156 78 H192 M186 72 L192 78 L186 84" fill="none" stroke={INK.line} />
            <text x="160" y="70" fontSize="8.5" fill={INK.quiet}>
              checked
            </text>
            <rect x="196" y="18" width="112" height="120" fill="none" stroke={INK.strong} />
            <text x="204" y="36" fontSize="10" fill={INK.strong}>
              the store
            </text>
            <text x="204" y="58" fontSize="9.5" fill={INK.line}>
              what is actually
            </text>
            <text x="204" y="74" fontSize="9.5" fill={INK.line}>
              held, read back
            </text>
            <text x="204" y="96" fontSize="9.5" fill={INK.line}>
              by a test
            </text>
          </svg>
          <Readout>A document that over-claims sends a client through unmodelled water.</Readout>
          </>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'Questions about past runs are answered by replay rather than by whoever remembers the configuration.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'A client that reads the now-cast reads twenty years of archive with no additional code.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'The extent and discovery vocabulary. The remaining work is stating it accurately.',
    },
  },
};
