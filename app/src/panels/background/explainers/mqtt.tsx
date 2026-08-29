/**
 * 8 — MQTT (interactive, 7 steps).
 *
 * The topic strings drawn here are artwork about a hierarchy, against a fictional
 * fleet. They are not this run's topics, which come from the configuration document
 * and are watched live in Messages.
 */
import { INK, MarkDefs, PokeRegion, categoryStyle } from '../marks.js';
import type { Explainer } from '../model.js';

const points = categoryStyle('points');
const fields = categoryStyle('fields');

const TOPICS = [
  'ctd/hull-044/temperature',
  'ctd/hull-044/salinity',
  'adcp/hull-044/velocity',
  'ctd/hull-091/temperature',
];

const PATTERNS = [
  { id: 'hull', pattern: 'ctd/hull-044/+', matches: (topic: string) => topic.startsWith('ctd/hull-044/') },
  { id: 'everything', pattern: 'ctd/#', matches: (topic: string) => topic.startsWith('ctd/') },
  { id: 'quantity', pattern: '+/+/temperature', matches: (topic: string) => topic.endsWith('/temperature') },
];

export const mqtt: Explainer = {
  id: 'mqtt',
  title: 'MQTT',
  form: 'interactive',
  idea: 'A new consumer is a subscription, not a change to the producer.',
  steps: [
    {
      title: 'Everyone wired to everyone',
      prose: [
        'Each producer holds a list of who wants its output.',
        'Adding a consumer means editing, testing and redeploying every producer that consumer needs, so a small change becomes a release.',
      ],
      figure: {
        minWidth: 340,
        label: 'Three producers wired directly to four consumers, twelve connections in all',
        caption: 'Point to point: connections grow with producers times consumers.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {[0, 1, 2].map((producer) => (
              <g key={producer}>
                <rect x="12" y={26 + producer * 46} width="66" height="30" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <text x="45" y={45 + producer * 46} fontSize="8.5" textAnchor="middle" fill={INK.strong}>
                  producer
                </text>
                {[0, 1, 2, 3].map((consumer) => (
                  <line
                    key={consumer}
                    x1="78"
                    y1={41 + producer * 46}
                    x2="238"
                    y2={22 + consumer * 38}
                    stroke={INK.quiet}
                    strokeWidth="0.7"
                  />
                ))}
              </g>
            ))}
            {[0, 1, 2, 3].map((consumer) => (
              <g key={consumer}>
                <rect x="238" y={8 + consumer * 38} width="68" height="28" fill="none" stroke={INK.line} />
                <text x="272" y={26 + consumer * 38} fontSize="8.5" textAnchor="middle" fill={INK.line}>
                  consumer
                </text>
              </g>
            ))}
            <text x="12" y="164" fontSize="9.5" fill={INK.warn}>
              twelve connections, and each producer knows all four of them
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Publish to a topic, not to a person',
      prose: [
        'The producer sends to a topic and does not know who is listening, or whether anyone is.',
        'That is what makes the next consumer cheap to add.',
      ],
      figure: {
        minWidth: 320,
        label: 'Producers sending to a broker which consumers then receive from',
        caption: 'The broker removes the producer’s knowledge of its consumers.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {[0, 1, 2].map((producer) => (
              <g key={producer}>
                <rect x="12" y={26 + producer * 46} width="66" height="30" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <text x="45" y={45 + producer * 46} fontSize="8.5" textAnchor="middle" fill={INK.strong}>
                  producer
                </text>
                <line x1="78" y1={41 + producer * 46} x2="132" y2="82" stroke={INK.line} />
              </g>
            ))}
            <rect x="132" y="52" width="60" height="62" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="162" y="88" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              broker
            </text>
            {[0, 1, 2, 3].map((consumer) => (
              <g key={consumer}>
                <line x1="192" y1="82" x2="238" y2={22 + consumer * 38} stroke={INK.line} />
                <rect x="238" y={8 + consumer * 38} width="68" height="28" fill="none" stroke={INK.line} />
                <text x="272" y={26 + consumer * 38} fontSize="8.5" textAnchor="middle" fill={INK.line}>
                  consumer
                </text>
              </g>
            ))}
            <text x="12" y="164" fontSize="9.5" fill={fields.stroke}>
              seven connections, and no producer knows a consumer
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The topic tree carries meaning',
      prose: [
        'Each level carries meaning: kind of instrument, which hull, which quantity.',
        'A well-designed tree makes the next subscription expressible without a schema change.',
      ],
      figure: {
        minWidth: 340,
        label: 'A hierarchical topic tree with meaningful segments',
        caption: 'Each segment is a level of the hierarchy.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            {['kind of instrument', 'which hull', 'which quantity'].map((level, index) => (
              <g key={level}>
                <rect x={12 + index * 102} y="26" width="94" height="30" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <text x={59 + index * 102} y="45" fontSize="8.5" textAnchor="middle" fill={INK.strong}>
                  {level}
                </text>
                {index < 2 ? <text x={110 + index * 102} y="45" fontSize="12" fill={INK.quiet}>/</text> : null}
              </g>
            ))}
            <text x="12" y="90" fontSize="11" fill={INK.strong} fontFamily="monospace">
              ctd / hull-044 / temperature
            </text>
            <text x="12" y="124" fontSize="9" fill={INK.quiet}>
              Read left to right, it narrows. Read right to left, it generalises.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'One subscription, many streams',
      prose: [
        '+ matches one level, # matches the rest, so “everything from hull 044, whatever the instrument” is one subscription.',
        'The fourth topic does not match. That is how the rule is learned.',
      ],
      play: 'Pick a pattern and watch which topics it catches.',
      figure: {
        minWidth: 360,
        label: 'A wildcard subscription matching several topics and not others',
        caption: 'One pattern, its matches and its misses.',
        draw: ({ poke, onPoke }) => {
          const chosen = PATTERNS.find((entry) => entry.id === poke) ?? PATTERNS[0];
          return (
            <svg viewBox="0 0 320 190" width="100%">
              <MarkDefs />
              {PATTERNS.map((entry, index) => (
                <PokeRegion
                  key={entry.id}
                  x={12 + index * 102}
                  y={12}
                  width={94}
                  height={24}
                  label={`the pattern ${entry.pattern}`}
                  active={chosen.id === entry.id}
                  onPoke={() => onPoke(entry.id)}
                >
                  <text x={59 + index * 102} y={28} fontSize="9" textAnchor="middle" fill={INK.strong} fontFamily="monospace">
                    {entry.pattern}
                  </text>
                </PokeRegion>
              ))}
              {TOPICS.map((topic, index) => {
                const caught = chosen.matches(topic);
                return (
                  <g key={topic}>
                    <rect
                      x="12"
                      y={54 + index * 28}
                      width="230"
                      height="22"
                      fill="none"
                      stroke={caught ? points.stroke : INK.quiet}
                      strokeWidth={caught ? points.strokeWidth : 1}
                      strokeDasharray={caught ? undefined : '4 3'}
                    />
                    <text x="20" y={69 + index * 28} fontSize="9" fill={caught ? INK.strong : INK.quiet} fontFamily="monospace">
                      {topic}
                    </text>
                    <text x="250" y={69 + index * 28} fontSize="9" fill={caught ? points.stroke : INK.quiet}>
                      {caught ? 'caught' : 'not caught'}
                    </text>
                  </g>
                );
              })}
              <text x="12" y="182" fontSize="9" fill={INK.quiet}>
                + stands for exactly one level. # stands for everything below.
              </text>
            </svg>
          );
        },
      },
    },
    {
      title: 'What else comes with the broker',
      prose: [
        'A retained message hands a late-joining client the current value immediately instead of leaving it blank until the next send. That is how this page populates on load.',
        'Each message also carries a delivery guarantee, from fire-and-forget for a reading superseded within a second, to exactly-once for one that must not be lost.',
      ],
      figure: {
        minWidth: 340,
        label: 'A retained message giving a late joiner the current value immediately, and the three delivery guarantees',
        caption: 'Retained state for late joiners; three delivery guarantees.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <rect x="12" y="20" width="140" height="60" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="82" y="44" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              retained value
            </text>
            <text x="82" y="60" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              held by the broker
            </text>
            <path d="M152 50 H206 M200 44 L206 50 L200 56" fill="none" stroke={INK.line} />
            <rect x="206" y="30" width="100" height="40" fill="none" stroke={INK.line} />
            <text x="256" y="48" fontSize="9" textAnchor="middle" fill={INK.strong}>
              late joiner
            </text>
            <text x="256" y="62" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              not left blank
            </text>
            {['at most once', 'at least once', 'exactly once'].map((guarantee, index) => (
              <g key={guarantee}>
                <rect x={12 + index * 102} y="104" width="94" height="26" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
                <text x={59 + index * 102} y="121" fontSize="8.5" textAnchor="middle" fill={INK.strong}>
                  {guarantee}
                </text>
              </g>
            ))}
            <text x="12" y="152" fontSize="9" fill={INK.quiet}>
              Cheapest on the left. The choice is per message, not per system.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Adding a consumer changes nothing upstream',
      prose: [
        'A new client subscribes and starts receiving. No producer edited, no release cut, nothing redeployed.',
        'In step 1 the same request required changes to every producer.',
      ],
      liveView: { view: 'messages', label: 'Watch this run’s real topic tree and traffic' },
      figure: {
        minWidth: 320,
        label: 'A fifth consumer added by subscribing, with no change to any producer',
        caption: 'One new subscription; the producers are unchanged.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            {[0, 1, 2].map((producer) => (
              <g key={producer}>
                <rect x="12" y={26 + producer * 46} width="66" height="30" fill="none" stroke={INK.quiet} />
                <text x="45" y={45 + producer * 46} fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
                  unchanged
                </text>
                <line x1="78" y1={41 + producer * 46} x2="132" y2="82" stroke={INK.quiet} />
              </g>
            ))}
            <rect x="132" y="52" width="60" height="62" fill={fields.fill} stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="162" y="88" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              broker
            </text>
            {[0, 1, 2, 3].map((consumer) => (
              <g key={consumer}>
                <line x1="192" y1="82" x2="238" y2={22 + consumer * 32} stroke={INK.quiet} />
                <rect x="238" y={8 + consumer * 32} width="68" height="24" fill="none" stroke={INK.quiet} />
              </g>
            ))}
            <line x1="192" y1="82" x2="238" y2="150" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <rect x="238" y="136" width="68" height="26" fill={points.fill} stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="272" y="153" fontSize="8.5" textAnchor="middle" fill={INK.strong}>
              the new one
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'The cost of a new consumer stops scaling with the number of producers.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'Topic semantics, wildcards and delivery guarantees are portable across brokers, with clients in most languages.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'Fan-out, subscription management, reconnection and back-off, and the wire protocol.',
    },
  },
};
