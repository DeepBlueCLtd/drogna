/**
 * 1 — Why a standard at all (slides, 5 steps).
 *
 * The argument the other ten are judged by, which is why it opens the course. One of
 * only two explainers that opens on the painful alternative, because here the
 * alternative is genuinely what most people do.
 */
import { INK, MarkDefs, categoryStyle } from '../marks.js';
import type { Explainer } from '../model.js';

const fields = categoryStyle('fields');
const points = categoryStyle('points');

export const whyAStandard: Explainer = {
  id: 'why-a-standard',
  title: 'Why a standard at all',
  form: 'slides',
  idea: 'A bespoke interface is cheap to build and expensive to live with. The interface should outlive the system behind it.',
  steps: [
    {
      title: 'The interface outlives the system',
      prose: [
        'Systems get replaced. What outlasts a replacement is the agreement about how other people reach them, so that agreement is worth choosing carefully.',
      ],
      figure: {
        minWidth: 300,
        label: 'One interface line persisting above three successive systems',
        caption: 'Three systems over fifteen years, one interface across all of them.',
        draw: () => (
          <svg viewBox="0 0 280 150" width="100%">
            <MarkDefs />
            <line x1="20" y1="42" x2="260" y2="42" stroke={fields.stroke} strokeWidth="3" />
            <text x="20" y="32" fontSize="11" fill={fields.stroke}>
              the interface
            </text>
            {[24, 110, 196].map((x, index) => (
              <g key={x}>
                <rect
                  x={x}
                  y="76"
                  width="60"
                  height="34"
                  fill="none"
                  stroke={index === 2 ? INK.strong : INK.line}
                />
                <text
                  x={x + 30}
                  y="97"
                  fontSize="10"
                  textAnchor="middle"
                  fill={index === 2 ? INK.strong : INK.line}
                >
                  {['system v1', 'v2', 'v3'][index]}
                </text>
                <line x1={x + 30} y1="76" x2={x + 30} y2="42" stroke={INK.line} strokeDasharray="2 2" />
              </g>
            ))}
            <text x="140" y="136" fontSize="10" textAnchor="middle" fill={INK.quiet}>
              2009 → 2016 → 2024
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The bespoke interface, on the day it ships',
      prose: [
        'It fits your data exactly and it is the cheapest option to build. Each consumer needs an adapter, but there are three of them and you know all three.',
      ],
      figure: {
        minWidth: 300,
        label: 'A bespoke server reached by three consumers, each through its own adapter',
        caption: 'One adapter per consumer, each with an owner.',
        draw: () => (
          <svg viewBox="0 0 280 150" width="100%">
            <MarkDefs />
            <rect x="16" y="56" width="62" height="40" fill="none" stroke={INK.strong} strokeWidth="1.6" />
            <text x="47" y="80" fontSize="10" textAnchor="middle" fill={INK.strong}>
              your API
            </text>
            <text x="143" y="10" fontSize="8" textAnchor="middle" fill={INK.quiet}>
              adapter
            </text>
            {[16, 66, 116].map((y, index) => (
              <g key={y}>
                <rect x="130" y={y} width="26" height="20" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <line x1="78" y1={70 + index * 6} x2="130" y2={y + 10} stroke={INK.line} />
                <line x1="156" y1={y + 10} x2="204" y2={y + 10} stroke={INK.line} />
                <rect x="204" y={y - 2} width="60" height="24" fill="none" stroke={INK.line} />
                <text x="234" y={y + 14} fontSize="9" textAnchor="middle" fill={INK.line}>
                  consumer
                </text>
              </g>
            ))}
          </svg>
        ),
      },
    },
    {
      title: 'Five years later',
      prose: [
        'The author moved on. Documentation and code drifted, and only one of them is executable.',
        'A fourth consumer now needs someone who can say what the interface currently does. That cost recurs with each new consumer.',
      ],
      figure: {
        minWidth: 300,
        label: 'The same bespoke diagram five years later, two adapters unmaintained',
        caption: 'The same topology five years on. Two adapters unmaintained, one still working.',
        draw: () => (
          <svg viewBox="0 0 280 150" width="100%">
            <MarkDefs />
            <rect x="16" y="56" width="62" height="40" fill="none" stroke={INK.strong} strokeWidth="1.6" />
            <text x="47" y="80" fontSize="10" textAnchor="middle" fill={INK.strong}>
              your API
            </text>
            <text x="47" y="112" fontSize="9" textAnchor="middle" fill={INK.warn}>
              v2.3, undocumented
            </text>
            <rect x="130" y="16" width="26" height="20" fill="none" stroke={INK.warn} strokeDasharray="3 2" />
            <rect x="130" y="66" width="26" height="20" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <rect x="130" y="116" width="26" height="20" fill="none" stroke={INK.warn} strokeDasharray="3 2" />
            <line x1="78" y1="70" x2="130" y2="28" stroke={INK.warn} strokeDasharray="3 2" />
            <line x1="78" y1="76" x2="130" y2="76" stroke={INK.line} />
            <line x1="78" y1="82" x2="130" y2="124" stroke={INK.warn} strokeDasharray="3 2" />
            <text x="196" y="30" fontSize="9" fill={INK.warn}>
              author left
            </text>
            <text x="196" y="80" fontSize="9" fill={INK.line}>
              still works
            </text>
            <text x="196" y="126" fontSize="9" fill={INK.warn}>
              new consumer:
            </text>
            <text x="196" y="138" fontSize="9" fill={INK.warn}>
              a project
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The same picture, with a standard',
      prose: [
        'Same consumers, but they arrive already knowing how to ask. The adapters are gone, and so is the work of maintaining them.',
      ],
      note: 'This is the criterion the other ten explainers are judged by.',
      figure: {
        minWidth: 300,
        label: 'A standards-serving API reached directly by three consumers that already speak it',
        caption: 'The adapter layer is absent.',
        draw: () => (
          <svg viewBox="0 0 280 150" width="100%">
            <MarkDefs />
            <rect x="16" y="56" width="62" height="40" fill="none" stroke={fields.stroke} strokeWidth="2" />
            <text x="47" y="74" fontSize="9" textAnchor="middle" fill={fields.stroke}>
              API that
            </text>
            <text x="47" y="86" fontSize="9" textAnchor="middle" fill={fields.stroke}>
              speaks EDR
            </text>
            {[18, 64, 110].map((y, index) => (
              <g key={y}>
                <line x1="78" y1={68 + index * 8} x2="188" y2={y + 12} stroke={fields.stroke} strokeWidth="1.4" />
                <rect x="188" y={y} width="76" height="24" fill="none" stroke={INK.line} />
                <text x="226" y={y + 16} fontSize="9" textAnchor="middle" fill={INK.line}>
                  {['a GIS client', 'a browser app', 'another agency'][index]}
                </text>
              </g>
            ))}
            <text x="133" y="146" fontSize="9" textAnchor="middle" fill={fields.stroke}>
              no adapter — they already speak it
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'A bespoke interface is supported by whoever wrote it. A standard is supported by everyone who implements it.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'A consumer that already speaks the standard needs no integration work.',
    },
    'what you do not have to build': {
      kind: 'omitted',
      reason: 'This explainer sets the criterion; the ten that follow are where it is spent.',
    },
  },
};
