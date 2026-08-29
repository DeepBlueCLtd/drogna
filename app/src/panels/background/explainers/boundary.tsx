/**
 * 11 — What is allowed to leave (interactive, 7 steps).
 *
 * The course closes here because for an evaluator in this domain the boundary is the
 * first question asked, and the course was silent on it until this pass. Not a
 * standard either: it is what it takes to use the standards honestly.
 */
import { INK, MarkDefs, PokeRegion, categoryStyle } from '../marks.js';
import type { Explainer } from '../model.js';

const points = categoryStyle('points');
const fields = categoryStyle('fields');
const archive = categoryStyle('archive');

const PROBES = [
  { id: 'released', label: 'a path that is released' },
  { id: 'withheld', label: 'a path that is withheld' },
  { id: 'absent', label: 'a path that never existed' },
];

const VARIABLES = [
  { name: 'temperature', leakage: 0.11 },
  { name: 'salinity', leakage: 0.08 },
  { name: 'sound speed', leakage: 0.14 },
  { name: 'spread', leakage: 0.61 },
];

const THRESHOLD = 0.4;

export const boundary: Explainer = {
  id: 'boundary',
  title: 'What is allowed to leave',
  form: 'interactive',
  idea: 'Data that is fine inside is not automatically fine outside. The boundary denies by default, withholds by absence rather than by filtering, and publishes its refusals.',
  steps: [
    {
      title: 'Fine inside is not fine outside',
      prose: [
        'Everything so far has been about serving data well. None of it has asked whether a given caller should see a given holding.',
        'A run manifest records exactly where and when sampling happened: useful inside, and not something to publish.',
      ],
      figure: {
        minWidth: 340,
        label: 'Holdings inside a boundary, with a caller outside asking for them',
        caption: 'Which of these may cross the line, and for whom.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <line x1="196" y1="8" x2="196" y2="150" stroke={INK.warn} strokeWidth="2" />
            <text x="12" y="20" fontSize="9" fill={INK.quiet}>
              inside
            </text>
            <text x="206" y="20" fontSize="9" fill={INK.quiet}>
              outside
            </text>
            {[
              { label: 'the archive', style: archive },
              { label: 'the now-cast', style: fields },
              { label: 'the run manifest', style: points },
            ].map((holding, index) => (
              <g key={holding.label}>
                <rect
                  x="12"
                  y={34 + index * 40}
                  width="150"
                  height="30"
                  fill={holding.style.fill}
                  stroke={holding.style.stroke}
                  strokeWidth={holding.style.strokeWidth}
                  strokeDasharray={holding.style.strokeDasharray}
                />
                <text x="87" y={54 + index * 40} fontSize="9" textAnchor="middle" fill={INK.strong}>
                  {holding.label}
                </text>
              </g>
            ))}
            <rect x="216" y="66" width="90" height="34" fill="none" stroke={INK.line} />
            <text x="261" y="87" fontSize="9" textAnchor="middle" fill={INK.strong}>
              a caller
            </text>
            <text x="12" y="164" fontSize="9" fill={INK.quiet}>
              The manifest says where and when someone sampled. That is not a publication.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Denied by default, and identically',
      prose: [
        'Everything is refused unless a rule allows it, so adding a collection never exposes it by accident.',
        'The refusals are identical: a released path, an unreleased path and a path that never existed all answer the same way to an uncleared caller, so probing yields no information.',
      ],
      play: 'Pick any of the three and watch the answer not change.',
      figure: {
        minWidth: 360,
        label: 'Three different requests receiving one identical refusal, so the boundary cannot be probed',
        caption: 'Three different requests, one indistinguishable refusal.',
        draw: ({ poke, onPoke }) => {
          const probe = PROBES.find((entry) => entry.id === poke) ?? PROBES[0];
          return (
            <svg viewBox="0 0 320 170" width="100%">
              <MarkDefs />
              {PROBES.map((entry, index) => (
                <PokeRegion
                  key={entry.id}
                  x={12}
                  y={16 + index * 30}
                  width={180}
                  height={24}
                  label={entry.label}
                  active={probe.id === entry.id}
                  onPoke={() => onPoke(entry.id)}
                >
                  <text x={22} y={32 + index * 30} fontSize="9" fill={INK.strong}>
                    {entry.label}
                  </text>
                </PokeRegion>
              ))}
              <path d="M196 58 H236" fill="none" stroke={INK.warn} />
              <rect x="236" y="34" width="72" height="48" fill="none" stroke={INK.warn} strokeWidth="2" />
              <text x="272" y="56" fontSize="10" textAnchor="middle" fill={INK.warn}>
                403
              </text>
              <text x="272" y="70" fontSize="8" textAnchor="middle" fill={INK.warn}>
                denied
              </text>
              <text x="12" y="128" fontSize="9" fill={INK.quiet}>
                Same status, same body, same timing. The caller learns nothing about what exists.
              </text>
              <text x="12" y="146" fontSize="9" fill={INK.quiet}>
                A refusal that varied would be a directory listing in disguise.
              </text>
            </svg>
          );
        },
      },
    },
    {
      title: 'Withholding is absence, not filtering',
      prose: [
        'A holding that must not leave is absent from the released list, so the boundary has no route to it, and nothing rewrites a response body on the way out.',
        'The difference is the failure mode: a broken filter leaks quietly, while a route that does not exist cannot open.',
      ],
      figure: {
        minWidth: 360,
        label: 'Withholding by absence from configuration, contrasted with a filter that rewrites responses',
        caption: 'Withholding by absence and by filtering, with different failure modes.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <text x="12" y="18" fontSize="9" fill={fields.stroke}>
              by absence
            </text>
            <rect x="12" y="24" width="140" height="52" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="20" y="44" fontSize="8.5" fill={INK.line}>
              released: archive, now-cast
            </text>
            <text x="20" y="60" fontSize="8.5" fill={INK.line}>
              no route to anything else
            </text>
            <text x="12" y="96" fontSize="8.5" fill={fields.stroke}>
              fails closed: a missing route
            </text>
            <text x="12" y="110" fontSize="8.5" fill={fields.stroke}>
              cannot open by accident
            </text>
            <text x="176" y="18" fontSize="9" fill={INK.warn}>
              by filtering
            </text>
            <rect x="176" y="24" width="132" height="52" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
            <text x="184" y="44" fontSize="8.5" fill={INK.warn}>
              serve everything, then
            </text>
            <text x="184" y="60" fontSize="8.5" fill={INK.warn}>
              strip the parts that must not go
            </text>
            <text x="176" y="96" fontSize="8.5" fill={INK.warn}>
              fails open: a filter that
            </text>
            <text x="176" y="110" fontSize="8.5" fill={INK.warn}>
              misses a field leaks quietly
            </text>
            <text x="12" y="150" fontSize="9" fill={INK.quiet}>
              Both can be correct on the day they ship. Only one of them stays correct
            </text>
            <text x="12" y="164" fontSize="9" fill={INK.quiet}>
              when somebody adds a field.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'A refusal is published, not swallowed',
      prose: [
        'Every denial goes onto a topic where it can be watched and counted — for the operator, not the caller, who still learns nothing.',
        'A silent refusal is indistinguishable from a boundary nobody has tested.',
      ],
      liveView: { view: 'messages', label: 'Watch this run’s denial topic' },
      figure: {
        minWidth: 340,
        label: 'A denial published on a topic and counted in the shell, rather than discarded',
        caption: 'Denials are published and counted, not discarded.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            <rect x="12" y="46" width="76" height="40" fill="none" stroke={INK.warn} strokeWidth="2" />
            <text x="50" y="70" fontSize="9" textAnchor="middle" fill={INK.warn}>
              denial
            </text>
            <path d="M88 66 H140" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <rect x="140" y="46" width="76" height="40" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="178" y="70" fontSize="9" textAnchor="middle" fill={INK.strong}>
              a topic
            </text>
            <path d="M216 66 H262" fill="none" stroke={INK.line} />
            <rect x="262" y="46" width="46" height="40" fill="none" stroke={INK.line} />
            <text x="285" y="70" fontSize="9" textAnchor="middle" fill={INK.strong}>
              counted
            </text>
            <text x="12" y="122" fontSize="9" fill={INK.quiet}>
              The caller still receives the same opaque refusal. The operator sees the count.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The worst variable, not the average',
      prose: [
        'Evidence that the boundary holds is computed per released variable, and the gate acts on the worst, reported with the variable name.',
        'The aggregate is still shown, since its distance from the worst is informative, but it is not what decides.',
        'An average over four variables will hide one that is leaking. This repository has watched that happen.',
      ],
      note: 'This is the beat: the aggregate passes the case the gate exists to catch.',
      figure: {
        minWidth: 360,
        label: 'Leakage scored per variable, where the aggregate passes but the worst variable fails',
        caption: 'The mean clears the threshold. One variable does not. The gate reads the worst.',
        draw: () => {
          const mean = VARIABLES.reduce((total, variable) => total + variable.leakage, 0) / VARIABLES.length;
          return (
            <svg viewBox="0 0 320 190" width="100%">
              <MarkDefs />
              <line x1="90" y1="14" x2="90" y2="140" stroke={INK.quiet} />
              {VARIABLES.map((variable, index) => {
                const failing = variable.leakage > THRESHOLD;
                return (
                  <g key={variable.name}>
                    <text x="84" y={38 + index * 26} fontSize="8.5" textAnchor="end" fill={INK.line}>
                      {variable.name}
                    </text>
                    <rect
                      x="90"
                      y={26 + index * 26}
                      width={variable.leakage * 300}
                      height="16"
                      fill={failing ? 'none' : fields.fill}
                      stroke={failing ? INK.warn : fields.stroke}
                      strokeWidth={fields.strokeWidth}
                      strokeDasharray={failing ? '4 3' : undefined}
                    />
                  </g>
                );
              })}
              <line x1={90 + THRESHOLD * 300} y1="14" x2={90 + THRESHOLD * 300} y2="140" stroke={INK.warn} strokeDasharray="5 3" />
              <text x={92 + THRESHOLD * 300} y="152" fontSize="8" fill={INK.warn}>
                threshold
              </text>
              <rect x="90" y={132} width={mean * 300} height="8" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
              <text x="84" y={140} fontSize="8.5" textAnchor="end" fill={points.stroke}>
                mean
              </text>
              <text x="12" y="176" fontSize="9" fill={INK.warn}>
                The mean passes. Spread does not. The gate refuses on spread, by name.
              </text>
            </svg>
          );
        },
      },
    },
    {
      title: 'And it is tested from the inside',
      prose: [
        'A boundary that refuses everything passes every refusal test and serves nobody.',
        'The tests exercise at least one allowed request as well, checking the response is byte-identical to what upstream produced.',
        'A boundary that has never been entered is untested from the inside.',
      ],
      figure: {
        minWidth: 340,
        label: 'Boundary tests exercising an allowed request as well as the refusals',
        caption: 'Refusals tested, and one allowed request tested alongside them.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            {['an unreleased path', 'a path that never existed', 'an uncleared caller'].map((probe, index) => (
              <g key={probe}>
                <rect x="12" y={14 + index * 28} width="180" height="22" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
                <text x="20" y={29 + index * 28} fontSize="8.5" fill={INK.warn}>
                  {probe}
                </text>
                <text x="200" y={29 + index * 28} fontSize="8.5" fill={INK.warn}>
                  refused
                </text>
              </g>
            ))}
            <rect x="12" y="98" width="180" height="22" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="20" y="113" fontSize="8.5" fill={INK.strong}>
              a released path, cleared caller
            </text>
            <text x="200" y="113" fontSize="8.5" fill={fields.stroke}>
              byte-identical
            </text>
            <text x="12" y="142" fontSize="9" fill={INK.quiet}>
              Without the last row, a boundary that refuses everything looks perfect.
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'Binary clearance is testable in a way per-field redaction is not: redaction must be re-proven whenever a field is added.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'The boundary does not fork the API. A cleared caller receives the ordinary standard responses byte for byte.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'A redaction engine, and the recurring review of whether it is still correct.',
    },
  },
};
