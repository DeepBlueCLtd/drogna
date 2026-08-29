/**
 * 5 — SensorThings (interactive, 7 steps).
 *
 * Vocabulary hazard, and the reason this comment exists. Constitution V forbids a
 * family of entity nouns outright, and an explainer about sensing is exactly where
 * one gets typed — "the sensor's range", and the gate fires. A sensor *samples*; an
 * instrument *reports*; a reading *is made*. Write around it. Reaching for the
 * gate's marker to get prose through would be using an exemption to say the
 * forbidden thing, which is worse than saying it plainly.
 *
 * URLs here are generic to the standard, against a fictional host (FR-022). They are
 * artwork about a shape, never a path this page serves.
 */
import { INK, MarkDefs, PokeRegion, Sample, categoryStyle } from '../marks.js';
import type { Explainer } from '../model.js';

const points = categoryStyle('points');

const CHAIN = [
  { id: 'observation', label: 'Observation', gloss: '8.4 °C at 09:14', path: 'Observations(1041)' },
  { id: 'datastream', label: 'Datastream', gloss: 'temperature at 50 m, this hull', path: 'Observations(1041)/Datastream' },
  { id: 'property', label: 'ObservedProperty', gloss: 'sea water temperature', path: 'Datastreams(3)/ObservedProperty' },
  { id: 'sensor', label: 'Sensor', gloss: 'CTD, calibrated 2026-02-11', path: 'Datastreams(3)/Sensor' },
  { id: 'thing', label: 'Thing', gloss: 'the buoy', path: 'Datastreams(3)/Thing' },
  { id: 'location', label: 'Location', gloss: 'where the buoy is', path: 'Things(7)/Locations' },
];

const HOST = 'sensors.example.org/v1.1/';

export const sensorthings: Explainer = {
  id: 'sensorthings',
  title: 'SensorThings',
  form: 'interactive',
  idea: 'Provenance is structural. Every number walks back to the instrument that made it, because that path is the shape of the data rather than a column someone remembered to add.',
  steps: [
    {
      title: 'A reading, on its own',
      prose: [
        '8.4 at 09:14. Not wrong, but unusable.',
        'Nothing here says whether to trust it, what to compare it against, or how to correct it.',
      ],
      figure: {
        minWidth: 300,
        label: 'A single reading sitting alone in a table row',
        caption: 'A value and a timestamp, with no other context.',
        draw: () => (
          <svg viewBox="0 0 300 120" width="100%">
            <MarkDefs />
            <rect x="60" y="40" width="180" height="34" fill="none" stroke={INK.line} />
            <text x="76" y="62" fontSize="12" fill={INK.strong}>
              09:14
            </text>
            <text x="150" y="62" fontSize="12" fill={INK.strong}>
              8.4
            </text>
            {Sample({ x: 216, y: 57 })}
            <text x="60" y="96" fontSize="9.5" fill={INK.quiet}>
              Degrees of what? Measured by what? Correct for what?
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'The whole model fits on one screen',
      prose: [
        'Eight types, and that is the entire standard. Worth seeing once, because the usual fear about adopting a standard is that it is unbounded. This one you can hold in your head.',
        'We walk the six that answer “can I trust this reading”. HistoricalLocation and FeatureOfInterest are named here; the second appears again in step 5, where the contrast with Location makes the point.',
      ],
      figure: {
        minWidth: 340,
        label: 'The eight SensorThings entity types shown once, with the ones this explainer walks marked',
        caption: 'The whole model, once. It is bounded.',
        draw: () => (
          <svg viewBox="0 0 320 150" width="100%">
            <MarkDefs />
            {[
              'Thing',
              'Location',
              'HistoricalLocation',
              'Datastream',
              'Sensor',
              'ObservedProperty',
              'Observation',
              'FeatureOfInterest',
            ].map((entity, index) => {
              const walked = !entity.startsWith('Historical');
              return (
                <g key={entity}>
                  <rect
                    x={12 + (index % 4) * 76}
                    y={24 + Math.floor(index / 4) * 46}
                    width={70}
                    height={34}
                    fill="none"
                    stroke={walked ? points.stroke : INK.quiet}
                    strokeWidth={walked ? points.strokeWidth : 1}
                    strokeDasharray={walked ? undefined : '4 3'}
                  />
                  <text
                    x={47 + (index % 4) * 76}
                    y={45 + Math.floor(index / 4) * 46}
                    fontSize="8"
                    textAnchor="middle"
                    fill={walked ? INK.strong : INK.quiet}
                  >
                    {entity}
                  </text>
                </g>
              );
            })}
            <text x="12" y="140" fontSize="9" fill={INK.quiet}>
              Solid: walked here. Dashed: named and left. That is all of it.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'It belongs to a stream',
      prose: [
        'A stream is one quantity, from one instrument, on one platform, over time.',
        'The reading is a member of it, and the rest of the chain hangs off this relationship.',
      ],
      figure: {
        minWidth: 320,
        label: 'The reading linked to the datastream it belongs to',
        caption: 'The first hop: a reading resolves to its stream.',
        draw: () => (
          <svg viewBox="0 0 320 120" width="100%">
            <MarkDefs />
            {Sample({ x: 46, y: 54, scale: 1.4, label: '8.4 °C' })}
            <line x1="66" y1="54" x2="128" y2="54" stroke={INK.line} strokeWidth="1.5" />
            <rect x="128" y="36" width="130" height="36" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="193" y="58" fontSize="10" textAnchor="middle" fill={INK.strong}>
              Datastream
            </text>
            <text x="128" y="94" fontSize="9" fill={INK.quiet}>
              one quantity · one instrument · one hull · over time
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'What it measures, and what did the measuring',
      prose: [
        'The property is the quantity: sea water temperature, defined the same way everywhere.',
        'The sensor is the device, with its make, its calibration date and its sampling behaviour.',
        'The model keeps them separate, which is what lets you compare one hull against another.',
      ],
      figure: {
        minWidth: 340,
        label: 'The datastream linked to what it measures and the instrument that samples it',
        caption: 'Two links: what is measured, and what did the measuring.',
        draw: () => (
          <svg viewBox="0 0 320 140" width="100%">
            <MarkDefs />
            <rect x="16" y="52" width="100" height="36" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="66" y="74" fontSize="10" textAnchor="middle" fill={INK.strong}>
              Datastream
            </text>
            <line x1="116" y1="62" x2="188" y2="34" stroke={INK.line} />
            <line x1="116" y1="78" x2="188" y2="106" stroke={INK.line} />
            <rect x="188" y="16" width="118" height="36" fill="none" stroke={INK.line} />
            <text x="247" y="32" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              ObservedProperty
            </text>
            <text x="247" y="45" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              sea water temperature
            </text>
            <rect x="188" y="88" width="118" height="36" fill="none" stroke={INK.line} />
            <text x="247" y="104" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              Sensor
            </text>
            <text x="247" y="117" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              CTD, calibrated 2026-02-11
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'What it is attached to',
      prose: [
        'A Thing is the buoy. It has a location, and carries several streams at once — temperature, salinity, pressure, from the same hull at the same moment. That is how you find out what else was happening when a reading looked odd.',
        'Beside it sits the feature of interest: what the reading is about. For a moored instrument in a current, the water it sampled has already moved on, so where the sensor is and where the observation applies are different facts.',
      ],
      figure: {
        minWidth: 360,
        label: 'The datastream linked to the platform carrying it, that platform’s location, and the water the reading is about',
        caption: 'Where the instrument sits, and where the observation applies.',
        draw: () => (
          <svg viewBox="0 0 320 170" width="100%">
            <MarkDefs />
            <rect x="12" y="20" width="88" height="120" fill="none" stroke={points.stroke} strokeWidth={points.strokeWidth} />
            <text x="56" y="38" fontSize="10" textAnchor="middle" fill={INK.strong}>
              Thing
            </text>
            {['temperature', 'salinity', 'pressure'].map((stream, index) => (
              <g key={stream}>
                <rect x="20" y={52 + index * 28} width="72" height="22" fill="none" stroke={INK.line} />
                <text x="56" y={67 + index * 28} fontSize="8.5" textAnchor="middle" fill={INK.line}>
                  {stream}
                </text>
              </g>
            ))}
            <line x1="100" y1="52" x2="164" y2="42" stroke={INK.line} />
            <rect x="164" y="24" width="140" height="36" fill="none" stroke={INK.line} />
            <text x="234" y="40" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              Location
            </text>
            <text x="234" y="53" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              where the hull is
            </text>
            <line x1="100" y1="110" x2="164" y2="118" stroke={INK.line} />
            <rect x="164" y="100" width="140" height="36" fill="none" stroke={INK.line} strokeDasharray="4 3" />
            <text x="234" y="116" fontSize="9.5" textAnchor="middle" fill={INK.strong}>
              FeatureOfInterest
            </text>
            <text x="234" y="129" fontSize="8.5" textAnchor="middle" fill={INK.quiet}>
              the water the reading is about
            </text>
            <text x="12" y="160" fontSize="9" fill={INK.quiet}>
              In a current these are not the same place, and the model does not pretend they are.
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Walk it backwards from any number',
      prose: [
        'From one reading to the stream, the instrument, its calibration, the hull and its position.',
        'The navigation is the data model rather than an added provenance feature, so a client that has never seen this system can walk it.',
      ],
      note: 'The paths are generic to the standard, against a fictional host. Nothing here is a route this page serves.',
      play: 'Pick a hop to see the request that walks it.',
      liveView: { view: 'messages', label: 'Watch real observations arriving in this run' },
      figure: {
        minWidth: 380,
        label: 'The full chain walked backwards from a single reading, with the request path at each hop',
        caption: 'Each hop is defined by the standard, not by this server.',
        draw: ({ poke, onPoke }) => {
          const chosen = CHAIN.find((hop) => hop.id === poke) ?? CHAIN[0];
          return (
            <svg viewBox="0 0 320 190" width="100%">
              <MarkDefs />
              {CHAIN.map((hop, index) => (
                <PokeRegion
                  key={hop.id}
                  x={12}
                  y={16 + index * 24}
                  width={296}
                  height={22}
                  label={`the hop to ${hop.label}`}
                  active={chosen.id === hop.id}
                  onPoke={() => onPoke(hop.id)}
                >
                  <text x={22} y={31 + index * 24} fontSize="9.5" fill={INK.strong}>
                    {hop.label}
                  </text>
                  <text x={128} y={31 + index * 24} fontSize="8.5" fill={INK.quiet}>
                    {hop.gloss}
                  </text>
                </PokeRegion>
              ))}
              <text x="12" y="176" fontSize="9" fill={points.stroke} fontFamily="monospace">
                GET {HOST}
                {chosen.path}
              </text>
            </svg>
          );
        },
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'Structural provenance has no separate convention to sustain, so none to lapse.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'A client written against SensorThings works against any SensorThings server.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'The entity model, the navigation links and the filter syntax.',
    },
  },
};
