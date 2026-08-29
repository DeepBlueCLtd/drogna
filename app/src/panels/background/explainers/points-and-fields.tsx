/**
 * 2 — Points and fields (interactive, 6 steps).
 *
 * The load-bearing explainer. If this does not land, SensorThings and EDR read as
 * two ways to do one thing and the whole standards argument reads as indecision.
 * Section view throughout: depth down the page, the natural frame for a cast.
 */
import { Eddy, Front, INK, MarkDefs, PokeRegion, Sample, Thermocline, categoryStyle, range } from '../marks.js';
import type { Explainer } from '../model.js';

const points = categoryStyle('points');
const fields = categoryStyle('fields');
const archive = categoryStyle('archive');

/** The section every step of this explainer is framed in. */
function Section({ children }: { children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 190" width="100%">
      <MarkDefs />
      <rect x="10" y="18" width="300" height="150" fill="none" stroke={INK.line} />
      <text x="10" y="13" fontSize="9" fill={INK.quiet}>
        surface
      </text>
      <text x="10" y="180" fontSize="9" fill={INK.quiet}>
        1000 m
      </text>
      {children}
    </svg>
  );
}

const CAST_POSITIONS = [
  { id: 'west', x: 70, label: 'cast at 12°W' },
  { id: 'middle', x: 160, label: 'cast at 11°W' },
  { id: 'east', x: 250, label: 'cast at 10°W' },
];

export const pointsAndFields: Explainer = {
  id: 'points-and-fields',
  title: 'Points and fields',
  form: 'interactive',
  idea: 'A cast and a forecast are different animals. This is why SensorThings and EDR are a pair and not a duplication.',
  steps: [
    {
      title: 'The sea has a temperature everywhere',
      prose: [
        'A warm core, a front, the thermocline across the section. Every point in this water has a value.',
        'You have measured none of them.',
      ],
      note: 'Section view: depth runs down the page, as it does on a cast.',
      figure: {
        minWidth: 340,
        label: 'Section through the sea showing continuous structure: eddy, front and thermocline',
        caption: 'The field is continuous. Everything that follows is a sample of it.',
        draw: () => (
          <Section>
            <Thermocline x={160} y={58} width={280} label="thermocline" />
            {Eddy({ x: 100, y: 110, scale: 1.4, label: 'eddy' })}
            {Front({ x: 240, y: 112, scale: 1.2, label: 'front' })}
          </Section>
        ),
      },
    },
    {
      title: 'You never have the sea. You have where you looked.',
      prose: [
        'Three casts, eleven readings, each attached to an instrument, a moment and a depth.',
        'Behind them in grey is the monthly archive: six cells across and years out of date, but what you held before anyone went to sea. The casts correct it rather than filling gaps in nothing.',
      ],
      play: 'Pick a cast to see what that one column caught.',
      figure: {
        minWidth: 340,
        label: 'Three casts sampling the section over the coarse archive behind them',
        caption: 'Casts over the archive. The archive is dated and real, not a blank.',
        draw: ({ poke, onPoke }) => (
          <Section>
            {range(4).map((row) =>
              range(6).map((column) => (
                <rect
                  key={`${row}-${column}`}
                  x={10 + column * 50}
                  y={18 + row * 37.5}
                  width={50}
                  height={37.5}
                  fill={archive.fill}
                  stroke={archive.stroke}
                  strokeWidth={archive.strokeWidth}
                  strokeDasharray={archive.strokeDasharray}
                />
              )),
            )}
            {CAST_POSITIONS.map((cast) => (
              <PokeRegion
                key={cast.id}
                x={cast.x - 14}
                y={24}
                width={28}
                height={138}
                label={cast.label}
                active={poke === cast.id}
                onPoke={() => onPoke(poke === cast.id ? undefined : cast.id)}
              >
                <line
                  x1={cast.x}
                  y1={28}
                  x2={cast.x}
                  y2={158}
                  stroke={points.stroke}
                  strokeWidth={points.strokeWidth}
                />
                {[36, 62, 92, 126, 154].map((depth) => Sample({ x: cast.x, y: depth, scale: 0.6 }))}
              </PokeRegion>
            ))}
            {poke ? (
              <text x="16" y="184" fontSize="9" fill={points.stroke}>
                {CAST_POSITIONS.find((cast) => cast.id === poke)?.label}: five readings, one column, one hour.
                Everywhere else is still the archive.
              </text>
            ) : null}
          </Section>
        ),
      },
    },
    {
      title: 'A forecast has a value everywhere',
      prose: [
        'Computed rather than measured. A different object from the casts: complete and regular.',
        'And only as good as the model and the observations that fed it.',
      ],
      figure: {
        minWidth: 340,
        label: 'A model grid covering the same section, every cell carrying a computed value',
        caption: 'A forecast field over the same water. Complete by construction.',
        draw: () => (
          <Section>
            {range(6).map((row) =>
              range(12).map((column) => (
                <rect
                  key={`${row}-${column}`}
                  x={10 + column * 25}
                  y={18 + row * 25}
                  width={25}
                  height={25}
                  fill={fields.fill}
                  stroke={fields.stroke}
                  strokeWidth={fields.strokeWidth}
                />
              )),
            )}
            <text x="16" y="184" fontSize="9" fill={fields.stroke}>
              Every cell carries a value. None of them was measured.
            </text>
          </Section>
        ),
      },
    },
    {
      title: 'Ask them both the same question',
      prose: [
        '“What is the temperature at 200 metres, here?” The field answers everywhere.',
        'The observations answer “nothing was measured there”, which is distinct from a null and from a refusal. An interface has to be able to say all three separately.',
      ],
      note: 'This is the beat. Everything downstream depends on it landing.',
      play: 'Move the crosshair between the three positions and watch both answers change.',
      figure: {
        minWidth: 360,
        label: 'The same question asked of both: the field answers, the observations report nothing measured there',
        caption: 'One question, two answers of different kinds.',
        draw: ({ poke, onPoke }) => {
          const asked = CAST_POSITIONS.find((cast) => cast.id === poke) ?? CAST_POSITIONS[1];
          const onACast = poke === undefined || poke === 'middle';
          return (
            <Section>
              {range(6).map((row) =>
                range(12).map((column) => (
                  <rect
                    key={`${row}-${column}`}
                    x={10 + column * 25}
                    y={18 + row * 25}
                    width={25}
                    height={25}
                    fill="none"
                    stroke={fields.stroke}
                    strokeWidth={fields.strokeWidth}
                  />
                )),
              )}
              <line x1={160} y1={28} x2={160} y2={158} stroke={points.stroke} strokeWidth={points.strokeWidth} />
              {[36, 62, 92, 126, 154].map((depth) => Sample({ x: 160, y: depth, scale: 0.6 }))}
              {CAST_POSITIONS.map((position) => (
                <PokeRegion
                  key={position.id}
                  x={position.x - 16}
                  y={82}
                  width={32}
                  height={24}
                  label={`ask at ${position.label}`}
                  active={asked.id === position.id}
                  onPoke={() => onPoke(position.id)}
                />
              ))}
              <line x1={asked.x - 20} y1={94} x2={asked.x + 20} y2={94} stroke={INK.strong} />
              <line x1={asked.x} y1={74} x2={asked.x} y2={114} stroke={INK.strong} />
              <text x="16" y="180" fontSize="9" fill={fields.stroke}>
                field: 11.2 °C
              </text>
              <text x="140" y="180" fontSize="9" fill={onACast ? points.stroke : INK.warn}>
                {onACast ? 'observations: 11.4 °C, CTD, 09:14' : 'observations: nothing was measured there'}
              </text>
            </Section>
          );
        },
      },
    },
    {
      title: 'So they need different questions asked of them',
      prose: [
        'Points want provenance: which instrument, calibrated when, in what units, measuring what else at the same moment.',
        'Fields want geometry: this slice, along this route, at these depths, valid then.',
        'Two shapes, two query languages. That is why SensorThings and EDR are a pair rather than a redundancy.',
      ],
      figure: {
        minWidth: 360,
        label: 'What each shape needs from an interface, listed side by side',
        caption: 'Two vocabularies, with little overlap.',
        draw: () => (
          <svg viewBox="0 0 320 190" width="100%">
            <MarkDefs />
            <rect x="8" y="10" width="146" height="172" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="18" y="30" fontSize="11" fill={points.stroke}>
              points ask for
            </text>
            {['which instrument', 'calibrated when', 'in what units', 'measuring what', 'on which hull', 'at what moment'].map(
              (line, index) => (
                <text key={line} x="18" y={52 + index * 20} fontSize="10" fill={INK.line}>
                  {line}
                </text>
              ),
            )}
            <rect x="166" y="10" width="146" height="172" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="176" y="30" fontSize="11" fill={fields.stroke}>
              fields ask for
            </text>
            {['this position', 'this profile', 'this area', 'this route', 'these depths', 'valid when'].map((line, index) => (
              <text key={line} x="176" y={52 + index * 20} fontSize="10" fill={INK.line}>
                {line}
              </text>
            ))}
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'Choosing two stores and two query languages up front costs less than retrofitting the second when one interface has to answer both.',
      qualitative: true,
    },
    interoperability: {
      kind: 'omitted',
      reason: 'Not this explainer’s. This is about the shape of the data; interoperability arrives with the standards that serve each shape, in 5 and 6.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'Knowing which shape you hold tells you which standard already covers it.',
    },
  },
};
