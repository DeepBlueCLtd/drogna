/**
 * 6 — OGC API-EDR (interactive, 7 steps). The long one.
 *
 * URLs are generic to the standard, against a fictional host (FR-022). The live
 * composer is reached by link (FR-005) rather than imitated here: a drawing that
 * looked pasteable would invite a viewer to paste it.
 */
import { INK, MarkDefs, PokeRegion, Sample, categoryStyle, range } from '../marks.js';
import { Readout } from '../layout.js';
import type { Explainer } from '../model.js';

const fields = categoryStyle('fields');
const points = categoryStyle('points');

const HOST = 'data.example.org/edr/collections/temperature/';

const AREA_QUERIES = [
  { id: 'radius', label: 'radius', gloss: 'everything within 40 km of here', path: 'radius?coords=POINT(-11.2 46.1)&within=40&within-units=km' },
  { id: 'area', label: 'area', gloss: 'everything inside this polygon', path: 'area?coords=POLYGON((-12 45,-10 45,-10 47,-12 47,-12 45))' },
  { id: 'corridor', label: 'corridor', gloss: 'within 8 km either side of this route', path: 'corridor?coords=LINESTRING(-12 45,-10 47)&corridor-width=8' },
];

export const edr: Explainer = {
  id: 'edr',
  title: 'OGC API-EDR',
  form: 'interactive',
  idea: 'The query is a geometry. “Conditions along my planned route” is one request, not a client-side loop.',
  steps: [
    {
      title: 'You want conditions along a planned route',
      prose: [
        'A point interface answers about points. Each client picks forty positions, issues forty requests, stitches the results and interpolates the gaps.',
        'Each client does that slightly differently. The disagreements surface later.',
      ],
      figure: {
        minWidth: 340,
        label: 'A client issuing many separate point requests along a route and stitching the answers',
        caption: 'Without EDR: the route is decomposed on the client, once per client.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 160" width="100%">
            <MarkDefs />
            <rect x="12" y="40" width="70" height="46" fill="none" stroke={INK.line} />
            <text x="47" y="67" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              client
            </text>
            {range(9).map((index) => (
              <line
                key={index}
                x1={82}
                y1={63}
                x2={210}
                y2={16 + index * 16}
                stroke={INK.quiet}
                strokeWidth="0.8"
              />
            ))}
            <rect x="210" y="40" width="96" height="46" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="258" y="67" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              the server
            </text>
          </svg>
          <Readout>
            Forty requests, stitched on the client, gaps interpolated on the client — and once more,
            differently, in the next client.
          </Readout>
          </>
        ),
      },
    },
    {
      title: 'Send the shape of the question',
      prose: [
        'EDR makes the query a geometry. The route goes to the server, which does the subsetting where the field already sits.',
        'One request, one answer, and one implementation of the interpolation rather than one per client.',
      ],
      figure: {
        minWidth: 340,
        label: 'The same route sent as one request, the server returning the sampled path',
        caption: 'The geometry travels to the data rather than the data to the client.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 160" width="100%">
            <MarkDefs />
            <rect x="12" y="40" width="70" height="46" fill="none" stroke={INK.line} />
            <text x="47" y="67" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              client
            </text>
            <path d="M82 58 C 130 40, 160 76, 210 58" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="106" y="34" fontSize="9" fill={points.stroke}>
              the route, as one geometry
            </text>
            <rect x="210" y="40" width="96" height="46" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="258" y="67" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              the server
            </text>
            <path d="M210 78 C 160 96, 130 60, 82 78" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="98" y="110" fontSize="9" fill={fields.stroke}>
              the sampled path, as one answer
            </text>
          </svg>
          <Readout>
            <code>GET {HOST}corridor?coords=LINESTRING(…)</code>
          </Readout>
          </>
        ),
      },
    },
    {
      title: 'The queries that are about depth',
      prose: [
        'A position asks one place at one depth. A vertical profile asks one place at all depths — the shape of a cast, served from a field.',
        'Both read naturally in section.',
      ],
      note: 'Section view: depth down the page.',
      figure: {
        minWidth: 340,
        label: 'Position and vertical profile queries drawn in section view',
        caption: 'Section view: the two queries whose shape is about depth.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <rect x="12" y="24" width="290" height="118" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            {Sample({ x: 88, y: 70, scale: 1.2 })}
            <text x="88" y="158" fontSize="9" textAnchor="middle" fill={points.stroke}>
              position
            </text>
            <line x1="220" y1="28" x2="220" y2="138" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            {[38, 62, 86, 110, 132].map((depth) => Sample({ x: 220, y: depth, scale: 0.6 }))}
            <text x="220" y="158" fontSize="9" textAnchor="middle" fill={points.stroke}>
              vertical profile
            </text>
            <text x="12" y="18" fontSize="9" fill={INK.quiet}>
              surface
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The queries that are about area',
      prose: [
        'Everything within a radius, inside a polygon, or within a stated width of a route.',
        'These cannot be drawn in section, so the viewpoint changes here — and the step says so rather than letting the reader work it out.',
      ],
      note: 'Plan view: looking down.',
      play: 'Pick a query type and watch the catchment and the request change.',
      figure: {
        minWidth: 380,
        label: 'Radius, area and corridor queries drawn in plan view',
        caption: 'Plan view: the three queries whose shape is horizontal.',
        draw: ({ poke, onPoke }) => {
          const chosen = AREA_QUERIES.find((query) => query.id === poke) ?? AREA_QUERIES[0];
          return (
            <>
              <svg viewBox="0 0 320 190" width="100%">
              <MarkDefs />
              <rect x="12" y="16" width="290" height="118" fill="none" stroke={INK.line} />
              {chosen.id === 'radius' ? (
                <circle cx="157" cy="75" r="46" fill={fields.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
              ) : null}
              {chosen.id === 'area' ? (
                <polygon
                  points="90,36 226,36 208,112 108,116"
                  fill={fields.fill}
                  stroke={points.stroke}
                  strokeWidth={points.strokeWidth}
                />
              ) : null}
              {chosen.id === 'corridor' ? (
                <polygon
                  points="44,110 196,30 216,52 64,132"
                  fill={fields.fill}
                  stroke={points.stroke}
                  strokeWidth={points.strokeWidth}
                />
              ) : null}
              {AREA_QUERIES.map((query, index) => (
                <PokeRegion
                  key={query.id}
                  x={12 + index * 98}
                  y={140}
                  width={92}
                  height={20}
                  label={`the ${query.label} query`}
                  active={chosen.id === query.id}
                  onPoke={() => onPoke(query.id)}
                >
                  <text x={58 + index * 98} y={154} fontSize="9" textAnchor="middle" fill={INK.strong}>
                    {query.label}
                  </text>
                </PokeRegion>
              ))}
              </svg>
              <Readout>
                {chosen.gloss}
                <br />
                <code>
                  GET {HOST}
                  {chosen.path}
                </code>
              </Readout>
              </>
          );
        },
      },
    },
    {
      title: 'Trajectory: the one with time in it',
      prose: [
        'Every vertex carries its own time, so each is sampled from the forecast valid at that moment rather than from one snapshot.',
        'The answer is the water as it will be on arrival.',
      ],
      figure: {
        minWidth: 360,
        label: 'A trajectory query carrying time along its length, giving conditions at arrival rather than now',
        caption: 'The query moves through the forecast in time as well as space.',
        draw: () => (
          <>
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {range(4).map((slab) => (
              <g key={slab}>
                <rect
                  x={12 + slab * 74}
                  y={24}
                  width={70}
                  height={90}
                  fill={fields.fill}
                  stroke={fields.stroke}
                  strokeWidth={fields.strokeWidth}
                />
                <text x={47 + slab * 74} y={18} fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
                  {['t+0h', 't+3h', 't+6h', 't+9h'][slab]}
                </text>
              </g>
            ))}
            <path d="M24 96 C 90 84, 150 56, 292 40" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            {[
              [24, 96],
              [98, 86],
              [172, 62],
              [246, 46],
            ].map(([x, y]) => Sample({ x, y, scale: 0.7 }))}
          </svg>
          <Readout>
            Each vertex carries its own time, so each is answered from the forecast valid then rather
            than from one snapshot.
          </Readout>
          </>
        ),
      },
    },
    {
      title: 'What comes back is the same shape every time',
      prose: [
        'Whatever the geometry of the question, the response is CoverageJSON: one structure, one way of saying where and when a value applies, and one way of saying there is no value.',
        'A client parses it once.',
      ],
      liveView: { view: 'map', label: 'Compose a real EDR request against this run' },
      figure: {
        minWidth: 340,
        label: 'Six differently shaped queries all returning the same response format',
        caption: 'Six query shapes in; one response format out.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {['position', 'profile', 'radius', 'area', 'corridor', 'trajectory'].map((query, index) => (
              <g key={query}>
                <rect x="12" y={12 + index * 24} width="92" height="20" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <text x="58" y={26 + index * 24} fontSize="9" textAnchor="middle" fill={INK.strong}>
                  {query}
                </text>
                <line x1="104" y1={22 + index * 24} x2="188" y2="80" stroke={INK.quiet} strokeWidth="0.8" />
              </g>
            ))}
            <rect x="188" y="56" width="118" height="48" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="247" y="78" fontSize="10" textAnchor="middle" fill={INK.strong}>
              CoverageJSON
            </text>
            <text x="247" y="92" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              parsed once
            </text>
            <text x="188" y="130" fontSize="9" fill={INK.quiet}>
              and one agreed way to say
            </text>
            <text x="188" y="144" fontSize="9" fill={INK.quiet}>
              “there is no value here”.
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'One implementation of subsetting and interpolation beside the data, rather than one per client, each drifting independently.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'The query types mean the same thing on every EDR service.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'Subsetting, path interpolation, the response format, and the vocabulary for absent values.',
    },
  },
};
