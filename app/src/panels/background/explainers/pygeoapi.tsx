/**
 * 7 — pygeoapi (slides, 5 steps).
 *
 * Present tense about the real deployment, and unambiguous that V2 serves these
 * interfaces in the browser rather than through pygeoapi (FR-013). A viewer who
 * concluded this page were a pygeoapi instance would have been misled by us.
 */
import { INK, MarkDefs, categoryStyle } from '../marks.js';
import type { Explainer } from '../model.js';

const fields = categoryStyle('fields');
const points = categoryStyle('points');

export const pygeoapi: Explainer = {
  id: 'pygeoapi',
  title: 'pygeoapi',
  form: 'slides',
  idea: 'One server, many standards, plugin-shaped. New capability arrives as configuration rather than as a project.',
  steps: [
    {
      title: 'One server, several standards',
      prose: [
        'The data stays where it is. A single server in front of it speaks several OGC standards over the same holdings.',
        'You configure collections rather than write endpoints.',
      ],
      note: 'This describes the real deployment. This page is not it: V2 serves these interfaces in the browser, behind a wire-protocol seam, and no pygeoapi instance is running anywhere near it.',
      figure: {
        minWidth: 340,
        label: 'One server in front of the stores, speaking several standards at once',
        caption: 'Three stores, one server, four standards.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {['archive', 'now-cast', 'observations'].map((store, index) => (
              <g key={store}>
                <rect x="12" y={20 + index * 42} width="80" height="32" fill="none" stroke={INK.line} />
                <text x="52" y={40 + index * 42} fontSize="9" textAnchor="middle" fill={INK.line}>
                  {store}
                </text>
                <line x1="92" y1={36 + index * 42} x2="128" y2="80" stroke={INK.quiet} />
              </g>
            ))}
            <rect x="128" y="52" width="66" height="56" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="161" y="84" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              one server
            </text>
            {['EDR', 'Features', 'Coverages', 'SensorThings'].map((standard, index) => (
              <g key={standard}>
                <line x1="194" y1="80" x2="230" y2={22 + index * 36} stroke={INK.quiet} />
                <rect x="230" y={10 + index * 36} width="76" height="24" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <text x="268" y={26 + index * 36} fontSize="9" textAnchor="middle" fill={INK.strong}>
                  {standard}
                </text>
              </g>
            ))}
          </svg>
        ),
      },
    },
    {
      title: 'What arrives without being asked for',
      prose: [
        'Discovery, conformance, queryables, paging, and both HTML and JSON representations.',
        'This tier of work is invisible in a demo and rarely appears in an estimate.',
      ],
      figure: {
        minWidth: 320,
        label: 'Capabilities that arrive on day one from configuration alone',
        caption: 'Machinery every API needs, available from configuration.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            {[
              'discovery',
              'conformance',
              'queryables',
              'paging',
              'HTML views',
              'JSON views',
              'content negotiation',
              'collection metadata',
            ].map((capability, index) => (
              <g key={capability}>
                <rect
                  x={12 + (index % 2) * 152}
                  y={14 + Math.floor(index / 2) * 34}
                  width={144}
                  height={26}
                  fill={fields.fill}
                  stroke={fields.stroke}
                  strokeWidth={fields.strokeWidth}
                />
                <text
                  x={84 + (index % 2) * 152}
                  y={31 + Math.floor(index / 2) * 34}
                  fontSize="9.5"
                  textAnchor="middle"
                  fill={INK.strong}
                >
                  {capability}
                </text>
              </g>
            ))}
          </svg>
        ),
      },
    },
    {
      title: 'And what it opens next',
      prose: [
        'Tiles for a fast map client, Records for a catalogue, Processes for derived products computed on demand.',
        'Each is a configuration change rather than a new component.',
      ],
      figure: {
        minWidth: 340,
        label: 'Capabilities not yet enabled, available later without a new system',
        caption: 'Enabled today on the left; available without new code on the right.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <text x="12" y="18" fontSize="9" fill={INK.quiet}>
              enabled today
            </text>
            {['EDR', 'Features', 'Coverages'].map((capability, index) => (
              <g key={capability}>
                <rect x="12" y={26 + index * 34} width="130" height="26" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
                <text x="77" y={43 + index * 34} fontSize="9.5" textAnchor="middle" fill={INK.strong}>
                  {capability}
                </text>
              </g>
            ))}
            <text x="176" y="18" fontSize="9" fill={INK.quiet}>
              a configuration change away
            </text>
            {['Tiles', 'Records', 'Processes'].map((capability, index) => (
              <g key={capability}>
                <rect x="176" y={26 + index * 34} width="130" height="26" fill="none" stroke={INK.quiet} strokeDasharray="4 3" />
                <text x="241" y={43 + index * 34} fontSize="9.5" textAnchor="middle" fill={INK.quiet}>
                  {capability}
                </text>
              </g>
            ))}
          </svg>
        ),
      },
    },
    {
      title: 'Where it does not reach, you extend it',
      prose: [
        'Adoption is not free. Where a standard is newer than its implementations you write a provider against the plugin seam. drogna wrote two.',
        'The cost is bounded, and it lands in one place rather than spreading through the server.',
      ],
      note: 'Again, plainly: this page serves its interfaces in the browser. pygeoapi is what the real deployment runs, and nothing in this tab is served through it.',
      figure: {
        minWidth: 340,
        label: 'Where the standard runs ahead of its implementations, a provider is written at the plugin seam',
        caption: 'Extension happens at the plugin seam, not in the server.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <rect x="12" y="20" width="180" height="100" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="102" y="40" fontSize="10" textAnchor="middle" fill={INK.strong}>
              the server, maintained upstream
            </text>
            <line x1="192" y1="70" x2="222" y2="70" stroke={INK.line} strokeDasharray="3 3" />
            <text x="196" y="62" fontSize="8" fill={INK.quiet}>
              seam
            </text>
            <rect x="222" y="42" width="84" height="56" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="264" y="66" fontSize="9" textAnchor="middle" fill={INK.strong}>
              your
            </text>
            <text x="264" y="80" fontSize="9" textAnchor="middle" fill={INK.strong}>
              provider
            </text>
            <text x="12" y="140" fontSize="9" fill={INK.quiet}>
              Two of them, in drogna&rsquo;s case. The cost was bounded and it stayed put.
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'The server is maintained upstream, and new capability arrives as configuration.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'Several standards from one deployment over one set of holdings.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'Discovery, conformance, content negotiation, paging, HTML views and the collection machinery.',
    },
  },
};
