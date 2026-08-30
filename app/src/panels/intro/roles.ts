/**
 * What the Intro tab draws, and what crosses between the parts (feature 118).
 *
 * **This is a schematic, and it names nothing.** Six roles — what is measured, what tests
 * it against belief, what re-forecasts, what is believed, who is told, who asks — and not
 * one component id among them. That is the whole bargain of the redraw: an abstract
 * picture cannot go stale when a component lands, because it never claimed to be the
 * component list. The five passes before this one drew the declared components and needed
 * a gate to stop the picture quietly falling behind the tree; this one needs no gate
 * because it makes no claim a merge can falsify.
 *
 * What it does claim is the *shape*: measurements arrive, they are tested against what is
 * believed, sustained difference warrants a run, a run produces a new belief, the new
 * belief is announced, and whoever cares comes back and asks. Every one of those is true
 * of drogna and would still be true of a real system built the same way.
 *
 * **The motion is illustrative, and the panel says so.** Feature 115's FR-71 holds the
 * Messages tab to motion that comes from received traffic and nothing else. This tab is
 * deliberately outside that rule (FR-80): it runs on a fixed CSS cycle, independent of
 * whether anything is running, so the Intro tab reads the same on a stopped clock, in a
 * screenshot, and in a printed page. The cost is that a reader must not mistake it for a
 * readout — which is why the panel labels it, and why every sample below is marked as a
 * shape rather than a value.
 */

/** The six parts, in the order they arrive. */
export interface Role {
  readonly id: string;
  readonly name: string;
  /** The one line under the name. */
  readonly gloss: string;
}

/**
 * A channel is the space between two roles, and the reason this drawing has space in it.
 * A line says *A talks to B* and stops; a channel has room for what is crossing, drawn
 * large enough to aim at and open.
 */
export interface Channel {
  readonly id: string;
  /** The standard or the mechanism, shown above the channel. */
  readonly protocol: string;
  /** What a reader should notice about it, shown below. */
  readonly note: string;
  /** Which sample opens when a mark on this channel is clicked. */
  readonly sample: Sample;
  /** Marks travel right to left where the answer comes back. */
  readonly reverse?: boolean;
  /** How many marks are in flight at once. The stream is busier than the events. */
  readonly marks: number;
}

/**
 * What the inspector shows. Deliberately shaped like the real thing and deliberately not
 * claimed to be one: `caveat` is rendered with every sample, so a reader cannot come away
 * thinking they read a value the system produced.
 */
export interface Sample {
  readonly head: string;
  readonly fields: readonly (readonly [string, string])[];
  readonly caveat: string;
}

const ILLUSTRATIVE = 'A sample of the shape, not a value this run produced.';

export const ROLES: readonly Role[] = [
  { id: 'measured', name: 'Measurements', gloss: 'what was found, and where' },
  { id: 'tested', name: 'Divergence', gloss: 'measured against believed' },
  { id: 'ran', name: 'Model run', gloss: 'assimilate, re-forecast' },
  { id: 'believed', name: 'The forecast', gloss: 'what is believed' },
  { id: 'told', name: 'A client', gloss: 'this page, or anything' },
  { id: 'answered', name: 'What came back', gloss: 'a slice, and a trajectory' },
];

export const CHANNELS: Readonly<Record<string, Channel>> = {
  obs: {
    id: 'obs',
    protocol: 'SensorThings',
    note: 'result · time · location',
    marks: 5,
    sample: {
      head: 'an observation',
      fields: [
        ['phenomenonTime', '2026-01-01T00:04:00Z'],
        ['result', '11.62 degC'],
        ['datastream', 'temperature-050m'],
        ['location', '48.3486, -8.0657'],
        ['depth', '50 m'],
      ],
      caveat: ILLUSTRATIVE,
    },
  },
  div: {
    id: 'div',
    protocol: 'MQTT · divergence',
    note: 'sustained, never one spike',
    marks: 1,
    sample: {
      head: 'a divergence event',
      fields: [
        ['kind', 'sustained'],
        ['streak', '6 samples'],
        ['mean residual', '0.84 degC'],
        ['warrants', 'a run, not a timer'],
      ],
      caveat: ILLUSTRATIVE,
    },
  },
  pub: {
    id: 'pub',
    protocol: 'a new field',
    note: 'digest-checked before it is servable',
    marks: 1,
    sample: {
      head: 'the forecast that came out',
      fields: [
        ['era', 'instance'],
        ['variables', 'temperature, salinity'],
        ['ensemble', '8 members'],
        ['spread', 'published beside the mean'],
      ],
      caveat: ILLUSTRATIVE,
    },
  },
  ann: {
    id: 'ann',
    protocol: 'MQTT · run published',
    note: 'consumers subscribe; nothing polls',
    marks: 1,
    sample: {
      head: 'the announcement',
      fields: [
        ['valid from', '2026-01-01T00:00:00Z'],
        ['cause', 'divergence-triggered'],
        ['ensemble', '8 members'],
        ['who hears it', 'anything subscribed'],
      ],
      caveat: ILLUSTRATIVE,
    },
  },
  req: {
    id: 'req',
    protocol: 'OGC API-EDR · request',
    note: 'a URL you could paste',
    marks: 1,
    sample: {
      head: 'the question asked',
      fields: [
        ['coords', 'POINT(-8.02 48.41)'],
        ['datetime', '2026-01-01T00:00:00Z'],
        ['parameter-name', 'temperature'],
        ['z', '50'],
        ['f', 'CoverageJSON'],
      ],
      caveat: ILLUSTRATIVE,
    },
  },
  res: {
    id: 'res',
    protocol: 'CoverageJSON · response',
    note: 'a 2-D slice, and a trajectory',
    marks: 1,
    reverse: true,
    sample: {
      head: 'what came back',
      fields: [
        ['domain', 'Grid, 6 × 4'],
        ['ranges', 'temperature'],
        ['unit', 'degC'],
        ['trajectory', 'the forecast along the path ahead'],
      ],
      caveat: ILLUSTRATIVE,
    },
  },
};

/** One step of the walkthrough: what appears, and what there is to say about it. */
export interface Beat {
  /** The address this step answers to: `#/view/intro/measured`. */
  readonly id: string;
  readonly title: string;
  readonly prose: readonly string[];
  /** The roles this step brings in. */
  readonly roles: readonly string[];
  /** The channels this step brings to life. */
  readonly channels: readonly string[];
  readonly liveView?: { readonly view: string; readonly label: string };
}

export const BEATS: readonly Beat[] = [
  {
    id: 'measured',
    title: 'Something is measured',
    prose: [
      'A platform reports what it finds and where it found it. Each reading is a ' +
        'SensorThings observation: a result, the time it was taken, the datastream it ' +
        'belongs to, and the location it came from.',
    ],
    roles: ['measured'],
    channels: [],
    liveView: { view: 'map', label: 'Watch the platform move on the Map' },
  },
  {
    id: 'tested',
    title: 'It is tested against what is believed',
    prose: [
      'The gap between the two is the interesting part, so it is drawn as a gap. ' +
        'Observations cross it a few a second — click one and read it.',
      'Each is compared against what the current forecast says should be there. A single ' +
        'difference is weather in the numbers; difference that persists is divergence.',
    ],
    roles: ['tested'],
    channels: ['obs'],
    liveView: { view: 'messages', label: 'The real traffic, in Messages' },
  },
  {
    id: 'ran',
    title: 'Sustained difference warrants a run',
    prose: [
      'Divergence is published as an event, and that event is what triggers a model run — ' +
        'not a timer. A run that fires on every spike is a run that never stops.',
    ],
    roles: ['ran'],
    channels: ['div'],
    liveView: { view: 'operator', label: 'What the scheduler decided, in Operator' },
  },
  {
    id: 'believed',
    title: 'A new forecast is what comes out',
    prose: [
      'The run assimilates what was measured and produces a new field: an ensemble mean ' +
        'with its spread beside it, checked against its own digest before anything may ' +
        'read it.',
    ],
    roles: ['believed'],
    channels: ['pub'],
    liveView: { view: 'holdings', label: 'The instances published, in Holdings' },
  },
  {
    id: 'told',
    title: 'Downstream is told, and does not poll',
    prose: [
      'The new forecast is announced over MQTT. Anything that cares is already subscribed; ' +
        'nothing is asking repeatedly whether there is news yet.',
    ],
    roles: ['told'],
    channels: ['ann'],
    liveView: { view: 'messages', label: 'Announcements on their own topic' },
  },
  {
    id: 'asked',
    title: 'And then asks, over OGC API-EDR',
    prose: [
      'Being told is not being sent. The client comes back and asks for exactly what it ' +
        'needs — a two-dimensional slice at a depth and an instant, and a trajectory: the ' +
        'forecast sampled along the path the platform will actually take.',
      'That trajectory is what the next round of measurements is compared against, which ' +
        'is where this lane rejoins the one above. Click the request to see what was ' +
        'asked, and the response to see the shape of what came back.',
    ],
    roles: ['answered'],
    channels: ['req', 'res'],
    liveView: { view: 'map', label: 'Compose an EDR query yourself' },
  },
];

/** Every role and channel visible at a step. */
export function shownAt(step: number): { roles: Set<string>; channels: Set<string> } {
  const seen = BEATS.slice(0, step);
  return {
    roles: new Set(seen.flatMap((beat) => beat.roles)),
    channels: new Set(seen.flatMap((beat) => beat.channels)),
  };
}
