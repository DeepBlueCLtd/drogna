/**
 * 9 — Reads and writes are separate (interactive, 6 steps).
 *
 * Placed after MQTT so both paths are on the table before the separation is named.
 * Not a standard: drogna's own arrangement, which is why the frame widened to admit
 * it. Its Consequences panel records a **cost**, because one exists (FR-008).
 */
import { INK, MarkDefs, PokeRegion, categoryStyle, range } from '../marks.js';
import { Readout } from '../layout.js';
import type { Explainer } from '../model.js';

const points = categoryStyle('points');
const fields = categoryStyle('fields');

const LOADS = [
  { id: 'quiet', label: 'both quiet', write: 1, read: 1 },
  { id: 'burst', label: 'a burst of casts arriving', write: 5, read: 1 },
  { id: 'heavy', label: 'a twenty-year trajectory query', write: 1, read: 5 },
  { id: 'both', label: 'both at once', write: 5, read: 5 },
];

export const cqrs: Explainer = {
  id: 'cqrs',
  title: 'Reads and writes are separate',
  form: 'interactive',
  idea: 'Observations arrive by one path and leave by another. The query components cannot write; the ingestion seam does not serve.',
  steps: [
    {
      title: 'Two paths, one store',
      prose: [
        'Observations arrive over the broker and are written by the ingestion seam. They leave over HTTP, through the query components.',
        'The two paths share the store and nothing else.',
      ],
      figure: {
        minWidth: 340,
        label: 'Observations entering a store by one path and leaving by another',
        caption: 'One store, two paths. Nothing crosses between them.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <rect x="122" y="60" width="76" height="52" fill="none" stroke={INK.strong} />
            <text x="160" y="90" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              the store
            </text>
            <rect x="12" y="24" width="82" height="30" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="53" y="43" fontSize="8.5" textAnchor="middle" fill={INK.strong}>
              sensors
            </text>
            <path d="M94 42 H140 V56" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="98" y="34" fontSize="8" fill={points.stroke}>
              write path
            </text>
            <rect x="226" y="118" width="82" height="30" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="267" y="137" fontSize="8.5" textAnchor="middle" fill={INK.strong}>
              clients
            </text>
            <path d="M180 116 V132 H222" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="186" y="150" fontSize="8" fill={fields.stroke}>
              read path
            </text>
            <text x="12" y="164" fontSize="9" fill={INK.quiet}>
              They meet at the store and nowhere else.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The write path has one writer',
      prose: [
        'Sensors publish; the ingestion seam validates against the message schema and writes.',
        'It is the store’s only writer, so the invariants are enforced in one place rather than in every component that might insert a row.',
      ],
      figure: {
        minWidth: 340,
        label: 'The write path: sensors publish, one ingestion seam validates and writes',
        caption: 'One seam, one writer. Every write passes the same validation.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            {range(3).map((sensor) => (
              <g key={sensor}>
                <rect x="12" y={16 + sensor * 40} width="64" height="28" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <line x1="76" y1={30 + sensor * 40} x2="128" y2="70" stroke={INK.line} />
              </g>
            ))}
            <rect x="128" y="46" width="80" height="48" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="168" y="66" fontSize="9" textAnchor="middle" fill={INK.strong}>
              ingestion
            </text>
            <text x="168" y="80" fontSize="9" textAnchor="middle" fill={INK.strong}>
              seam
            </text>
            <path d="M208 70 H244" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <rect x="244" y="50" width="64" height="40" fill="none" stroke={INK.strong} />
            <text x="276" y="74" fontSize="9" textAnchor="middle" fill={INK.strong}>
              store
            </text>
          </svg>
          <Readout>Nothing else has a route in, so nothing else can hold a different idea of valid.</Readout>
          </>
        ),
      },
    },
    {
      title: 'The read path cannot write',
      prose: [
        'The query components hold no write capability at all.',
        'That is a property of the topology rather than a rule someone enforces, so a defect in query code cannot corrupt stored data.',
      ],
      figure: {
        minWidth: 340,
        label: 'The read path, with no write capability at all',
        caption: 'The read side has no write capability, so a query defect cannot corrupt the store.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <rect x="12" y="50" width="64" height="40" fill="none" stroke={INK.strong} />
            <text x="44" y="74" fontSize="9" textAnchor="middle" fill={INK.strong}>
              store
            </text>
            <path d="M76 70 H124" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="82" y="62" fontSize="8" fill={fields.stroke}>
              read
            </text>
            <rect x="124" y="46" width="84" height="48" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="166" y="74" fontSize="9" textAnchor="middle" fill={INK.strong}>
              query
            </text>
            <path d="M124 106 H76" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
            <line x1="92" y1="98" x2="108" y2="114" stroke={INK.warn} strokeWidth="1.6" />
            <line x1="108" y1="98" x2="92" y2="114" stroke={INK.warn} strokeWidth="1.6" />
            <text x="128" y="112" fontSize="8.5" fill={INK.warn}>
              no write capability exists here
            </text>
            <text x="12" y="138" fontSize="9" fill={INK.quiet}>
              Not forbidden by policy. Absent from the topology.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The two loads never contend',
      prose: [
        'A trajectory query spanning twenty years of archive is expensive. A burst of casts arriving at once is expensive in a different way.',
        'Because they run on separate paths, neither one slows the other, and each can be tuned, cached or scaled without regard to the other’s behaviour.',
      ],
      note: 'Argued from the topology, not measured. Nothing in this page has produced a curve to back it, and drawing one would be inventing a figure.',
      play: 'Raise either load and watch the other stay where it was.',
      figure: {
        minWidth: 360,
        label: 'An ingestion burst and a heavy query occurring together without affecting each other',
        caption: 'Separate paths, separate load. Drawn from the topology, not measured.',
        draw: ({ poke, onPoke }) => {
          const load = LOADS.find((entry) => entry.id === poke) ?? LOADS[0];
          return (
            <svg viewBox="0 0 320 190" width="100%">
              <MarkDefs />
              <text x="12" y="20" fontSize="9" fill={points.stroke}>
                write path
              </text>
              <rect x="12" y="26" width={40 + load.write * 44} height="26" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
              <text x="12" y="76" fontSize="9" fill={fields.stroke}>
                read path
              </text>
              <rect x="12" y="82" width={40 + load.read * 44} height="26" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
              {LOADS.map((entry, index) => (
                <PokeRegion
                  key={entry.id}
                  x={12 + (index % 2) * 152}
                  y={124 + Math.floor(index / 2) * 26}
                  width={144}
                  height={22}
                  label={entry.label}
                  active={load.id === entry.id}
                  onPoke={() => onPoke(entry.id)}
                >
                  <text x={84 + (index % 2) * 152} y={139 + Math.floor(index / 2) * 26} fontSize="8.5" textAnchor="middle" fill={INK.strong}>
                    {entry.label}
                  </text>
                </PokeRegion>
              ))}
              <text x="12" y="186" fontSize="9" fill={INK.quiet}>
                Each bar moves only for its own load.
              </text>
            </svg>
          );
        },
      },
    },
    {
      title: 'Acceptance is decided once, at the seam',
      prose: [
        'A reading is stored or it is refused, counted and kept outside the store with its payload and the reason.',
        'There is no third state, so there is no quality column on the observation — and no reader has to remember to filter on one.',
      ],
      liveView: { view: 'messages', label: 'See the refusal count this run is actually holding' },
      figure: {
        minWidth: 340,
        label: 'A reading either accepted into the store or refused and counted outside it, with no quality column',
        caption: 'Acceptance is binary and decided once, at the write.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 160" width="100%">
            <MarkDefs />
            <rect x="12" y="58" width="70" height="34" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="47" y="80" fontSize="9" textAnchor="middle" fill={INK.strong}>
              a reading
            </text>
            <path d="M82 75 H126" fill="none" stroke={INK.line} />
            <rect x="126" y="52" width="66" height="46" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="159" y="79" fontSize="9" textAnchor="middle" fill={INK.strong}>
              the seam
            </text>
            <path d="M192 64 H246" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <rect x="246" y="44" width="62" height="34" fill="none" stroke={INK.strong} />
            <text x="277" y="65" fontSize="9" textAnchor="middle" fill={INK.strong}>
              stored
            </text>
            <path d="M192 90 H246" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
            <rect x="246" y="80" width="62" height="34" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
            <text x="277" y="96" fontSize="8.5" textAnchor="middle" fill={INK.warn}>
              refused,
            </text>
            <text x="277" y="108" fontSize="8.5" textAnchor="middle" fill={INK.warn}>
              counted
            </text>
          </svg>
          <Readout>Two outcomes. No quality column, so no reader can forget to read one.</Readout>
          </>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'The read side can be replaced without touching ingestion. Swapping the query layer is a read-path change; the store’s invariants are untouched.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'The read side is free to be standards-shaped without that shape constraining how data is written or validated.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'Nothing, and this axis records a cost instead: two paths to operate and monitor rather than one, and a data model that serves reads well is not always the one that accepts writes well. The separation is real work, not free.',
    },
  },
};
