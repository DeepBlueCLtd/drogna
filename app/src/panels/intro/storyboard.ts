/**
 * The Intro tab's architecture walkthrough (SRD-v2 FR-76 to FR-79, feature 117): what
 * is revealed, in what order, what is said about it, and where it sits.
 *
 * **This is a curated picture, and it says which parts it leaves out.** Twenty-one
 * components run; fourteen are drawn. The four flows a reader arrives wanting — samples
 * in, validated and stored, the forecast updated when the field drifts or the cadence
 * falls due, and the result interrogated from outside through standard interfaces — are
 * carried by those fourteen, and the other seven are a second subject each. The Operator
 * tab already draws all twenty-one with every wire; a second complete flow chart here
 * would be the same picture told worse.
 *
 * The fourteenth arrived by merge rather than by design. Feature 116 landed the analyst
 * while this was in flight, and the gate below stopped the build naming it, because a
 * component that had landed was in neither the drawing nor the omissions. It is drawn,
 * and the model runner's step was rewritten around it — that step said the runner
 * assimilated the observations, which had stopped being true. That is the whole case for
 * the gate, made by an event rather than by a plant.
 *
 * A curated picture is only honest if the curation is recorded, so `NOT_DRAWN` names
 * every omission **with its reason**, and `storyboardFindings` fails on a component that
 * is neither drawn nor listed. A component that lands and is quietly missing from both
 * is what the gate exists to catch.
 *
 * This file authors **four** things and nothing else: the order, the words, the cell each
 * node occupies, and which components are left out. Everything else in the drawing is
 * derived — a node's text is the component's own declared label, the wires are the wiring
 * (`panels/operator/graph.ts`, the same derivation the Operator flow chart draws), the
 * plane strip is the components that declare themselves the plane, the coverage store's
 * eras are the enum in the holding master, and the interfaces on the arrow out are the
 * shell's declared endpoints.
 *
 * The composition is the argument. The top row is the world and the instruments in it;
 * the right column is the write path, straight down — sample, validate, store; the five
 * boxes at the left are banded because the forecast loop is a loop, and a picture of it
 * that is not a ring has lost the one thing worth saying about it; the foot is the way
 * out.
 */
import type { ConfigShell } from '../../generated/types.js';

export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** One component's place in the drawing, and the two things a node can carry. */
export interface Node {
  /**
   * A declared component id. The node's text is that component's own declared label,
   * never a second name for it typed here (Constitution VII).
   */
  readonly component: string;
  readonly place: Cell;
  /**
   * Marks the node that answers the outside world, so the drawing can put the arrow that
   * leaves the harness beside that node rather than have the panel know which one it is.
   * The interfaces the arrow names are the shell's own declared endpoints.
   */
  readonly servesOutside?: boolean;
  /**
   * Marks the node that holds the coverage store's eras. Which eras those are is not
   * authored here: they are the enum in the holding master, so a fourth era would appear
   * in the picture on its own.
   */
  readonly showsEras?: boolean;
}

/** One step: what appears, and what there is to say about it. */
export interface Beat {
  /** The address this step answers to. A name, not a number: `#/view/intro/the-loop`. */
  readonly id: string;
  readonly title: string;
  /** One paragraph per entry. Longer where the step is carrying the argument. */
  readonly prose: readonly string[];
  readonly reveals: readonly Node[];
  /** Where in the running shell this part of the picture can be watched working. */
  readonly liveView?: { readonly view: string; readonly label: string };
}

/**
 * The row the plane occupies. Its membership is not authored: a component is in the
 * strip when it declares `band: "plane"`, and the gate holds the two to each other.
 */
export const PLANE_ROW = 4;

/**
 * The cells the loop turns in, drawn as a band behind them. The ring is the argument of
 * the whole drawing — store, monitor, scheduler, analyst, runner, and back to the store —
 * and a band around it is what stops a reader having to trace five wires to see that it
 * closes.
 *
 * The band is authored, like the cells; what is checked is that everything inside it
 * declares `band: "loop"`. The check is one-directional on purpose: the environment
 * generator declares that band too and is drawn outside the ring, because it is where
 * the field comes from rather than one of the loop's turns.
 */
export const LOOP_REGION = {
  from: { col: 0, row: 1 },
  to: { col: 1, row: 3 },
} as const;

export const STORYBOARD: readonly Beat[] = [
  {
    id: 'the-ocean',
    title: 'A synthetic ocean, authored',
    prose: [
      'Nothing in drogna was measured at sea. When this page opened, the environment ' +
        'generator authored a four-dimensional field of temperature and salinity — a ' +
        'warm-core eddy, a front, a thermocline, a drifting feature — from this run’s ' +
        'seed, and wrote the exact draw order into a ground-truth manifest.',
      'Everything else in this drawing is downstream of that field, and everything that ' +
        'claims to have recovered it can be scored against it. That is the whole reason ' +
        'the world is synthetic: a demonstration that cannot mark its own homework is a ' +
        'demonstration of nothing.',
    ],
    reveals: [{ component: 'env-generator', place: { col: 0, row: 0 } }],
    liveView: { view: 'holdings', label: 'Read the manifest in Holdings' },
  },
  {
    id: 'sampling',
    title: 'A platform, and instruments that sample the truth',
    prose: [
      'A simulated platform loiters over the eddy and reports where it is. Its ' +
        'instruments read the true field through a port rather than a message — the ' +
        'dashed line, the kind of coupling that carries no traffic — at temperature and ' +
        'salinity at two depths, on a fixed cadence, at wherever the platform has got to.',
    ],
    reveals: [
      // The instruments sit beside the field they sample and the platform beside them:
      // the sampler port is then one short hop instead of an arc across the whole
      // picture, which is what it was when the platform sat between them.
      { component: 'sensors', place: { col: 1, row: 0 } },
      { component: 'platform', place: { col: 2, row: 0 } },
    ],
    liveView: { view: 'map', label: 'Watch the platform move on the Map' },
  },
  {
    id: 'measurement-in',
    title: 'Measurement and location, in SensorThings vocabulary',
    prose: [
      'Each sample leaves as a SensorThings observation — a result, the phenomenon time ' +
        'it was taken at, the datastream it belongs to, and the location it came from — ' +
        'published over a broker with MQTT topic semantics. Position is an observation ' +
        'like any other, on its own topic; nothing about where the platform is travels ' +
        'by a private route.',
      'The ingestion seam is the only way in. Every message is validated against the ' +
        'committed master its topic declares, and one that fails is refused with the ' +
        'reason named and counted where the count can be seen. That is what makes the ' +
        'vocabulary a contract rather than a convention.',
      'The broker carries every message in the picture, so its own wires are not drawn: ' +
        'forty lines through one box would hide the ones that carry meaning. It sits in ' +
        'the strip at the foot, with the rest of the plane.',
    ],
    reveals: [
      { component: 'broker', place: { col: 1, row: PLANE_ROW } },
      { component: 'ingest', place: { col: 2, row: 1 } },
    ],
    liveView: { view: 'messages', label: 'The topic tree, lit by traffic' },
  },
  {
    id: 'stored',
    title: 'Stored, behind a store interface',
    prose: [
      'Observations accumulate in a store with one writer and no other way in: values at ' +
        'instants at places, kept as what a sensor said, never smoothed into a field.',
      'Here that store is in memory, behind an interface. In V1 it was PostgreSQL with ' +
        'PostGIS and the same interface stood in front of it; the engines return in V3. ' +
        'What the rest of the picture depends on is the interface and its one-writer ' +
        'rule, which is exactly why the store is a port and the database is not the ' +
        'subject of the drawing.',
    ],
    reveals: [{ component: 'observation-store', place: { col: 2, row: 2 } }],
    liveView: { view: 'messages', label: 'The refusals, counted, in Messages' },
  },
  {
    id: 'the-fields',
    title: 'The fields, in three eras',
    prose: [
      'Beside the points sits the coverage store, which holds gridded fields: the ' +
        'archive, twenty years of monthly history; the now-cast, replaced on its ' +
        'cadence; and the forecast instances that accumulate once the loop turns. The ' +
        'three slabs in the box are the three the holding master declares, and nothing ' +
        'else is admitted.',
    ],
    reveals: [{ component: 'coverage-store', place: { col: 0, row: 1 }, showsEras: true }],
    liveView: { view: 'holdings', label: 'The store filling up, in Holdings' },
  },
  {
    id: 'drift',
    title: 'Drift is watched, not guessed at',
    prose: [
      'The monitor pairs each observation with the forecast that claimed to cover it and ' +
        'scores the residual. Sound speed is derived by one implementation, so two parts ' +
        'of the system cannot quietly disagree about it.',
      'A divergence is raised only on sustained persistence. One spike is weather in the ' +
        'numbers, and a loop that ran on every spike would be a loop that never stopped ' +
        'running.',
    ],
    reveals: [{ component: 'monitor', place: { col: 0, row: 2 } }],
    liveView: { view: 'operator', label: 'The streak filling, in Operator' },
  },
  {
    id: 'warranted',
    title: 'A run is warranted — by drift, or by the clock',
    prose: [
      'The scheduler holds the policy, and it has two doors. A sustained divergence asks ' +
        'for a cycle; so does the cadence floor, which fires when enough simulation time ' +
        'has elapsed whether or not anything has drifted. A run warranted by the floor ' +
        'alone is labelled scheduled, never divergence-driven, wherever runs appear.',
      'The other half of the policy is the minimum interval: a breach that arrives too ' +
        'soon after the last run is declined, observably, with the bound named. Between ' +
        'the two the loop can neither be stampeded nor becalmed for good.',
    ],
    reveals: [{ component: 'scheduler', place: { col: 0, row: 3 } }],
    liveView: { view: 'operator', label: 'What it decided last, in Operator' },
  },
  {
    id: 'assimilation',
    title: 'The measurements are let into the field',
    prose: [
      'This is the step the loop went without until feature 116, and it is where the ' +
        'question a reader arrives with — what did the platform\u2019s measurements ' +
        'actually change? — is finally answerable. The analyst takes the standing ' +
        'forecast as its background and corrects it by the observations taken since its ' +
        'last cycle, by optimal interpolation: the background error comes from the ' +
        'run\u2019s own published spread and the observation error from each ' +
        'instrument\u2019s declared noise, so the weight a reading is given is derived ' +
        'from what the system already said about its own confidence rather than tuned by ' +
        'hand.',
      'It publishes three things, not one: the analysis, the error the correction left ' +
        'behind, and a provenance field saying what share of each cell came from the ' +
        'archive, from the forecast and from the measurements. The doubt the planner ' +
        'reads is that error field, so confidence falls where sampling genuinely reduced ' +
        'it rather than where a timer said it should have.',
    ],
    reveals: [{ component: 'analyst', place: { col: 1, row: 2 } }],
    liveView: { view: 'map', label: 'Where the measurements landed, on the Map' },
  },
  {
    id: 'the-loop',
    title: 'The forecast runs on, and the loop closes',
    prose: [
      'The model runner initialises from what the analysis announcement names — not from ' +
        'the last forecast, which is the whole difference the analysis step makes — ' +
        'perturbs its members by the error the analysis left, and advects a small ' +
        'ensemble behind the kernel port. It publishes the mean with its spread back into ' +
        'the coverage store, through the same digest-checked seam as everything else.',
      'That write is the last side of the ring. The store feeds the monitor, the monitor ' +
        'feeds the scheduler, the scheduler asks for a cycle, the analyst lets the ' +
        'measurements in, the runner carries the result forward and writes the store — ' +
        'five turns, and the picture is a ring because the system is one.',
    ],
    reveals: [{ component: 'model-runner', place: { col: 1, row: 1 } }],
    liveView: { view: 'holdings', label: 'The instances it published' },
  },
  {
    id: 'interrogated',
    title: 'Interrogated from outside, through interfaces nobody has to be taught',
    prose: [
      'Both stores are answered by the query components through standard interfaces: OGC ' +
        'API-EDR over the coverages — CoverageJSON, position, area and trajectory with ' +
        'per-vertex time — read-only SensorThings over the observations, and OGC ' +
        'API-Features over the reference geometry. Each is a stated subset, and ' +
        'everything not implemented is refused by its own name rather than answered ' +
        'vaguely.',
      'The arrow leaving the picture is the one that matters. This browser page is not ' +
        'privileged: the Map fetches the field with the same EDR request anyone outside ' +
        'would make, and the composer will write you the URL. Every answer passes the ' +
        'release gate first, which denies by default and releases data prefixes one at a ' +
        'time.',
    ],
    reveals: [
      { component: 'query', place: { col: 2, row: 3 }, servesOutside: true },
      { component: 'boundary', place: { col: 2, row: PLANE_ROW } },
    ],
    liveView: { view: 'map', label: 'Compose an EDR query yourself' },
  },
  {
    id: 'the-clock',
    title: 'One clock, and it is not yours',
    prose: [
      'Everything above beats on one simulation clock. Nothing in the picture reads the ' +
        'time on your wall, which is what makes a run replay byte-for-byte from its ' +
        'manifest — and what lets you stop the clock and watch the whole thing hold ' +
        'still.',
      'That is the shape of it. It is entirely synthetic, and it says so.',
    ],
    reveals: [{ component: 'clock', place: { col: 0, row: PLANE_ROW } }],
    liveView: { view: 'operator', label: 'Step the clock yourself' },
  },
];

/**
 * The components that run and are deliberately not in this drawing, each with the reason.
 * The panel shows this list; the gate fails on a component that is in neither it nor the
 * storyboard, so the next component to land is named by the build rather than quietly
 * absent from a picture that claims to be the architecture.
 */
export const NOT_DRAWN: readonly { readonly component: string; readonly reason: string }[] = [
  {
    component: 'planner',
    reason:
      'reads the released spread and recommends where to sample next — a second argument, ' +
      'and one the Map draws better than a box could',
  },
  {
    component: 'telemetry',
    reason:
      'scores the residuals into skill against persistence; the figure it produces is the ' +
      'subject of the Operator tab, not of a wiring diagram',
  },
  {
    component: 'feature-store',
    reason: 'read-only reference geometry, written by nobody at run time',
  },
  {
    component: 'advisory-source',
    reason: 'the shore-advisory path, which is about what a boundary admits rather than how the loop turns',
  },
  { component: 'advisory-store', reason: 'the same path: append-only, size-capped, no free text' },
  {
    component: 'offload',
    reason: 'stages an export beside each run; announcement-only until a real backend receives it',
  },
  {
    component: 'operator',
    reason: 'the way a reader reaches back into the machinery — it is the tab you press the button on',
  },
];

/**
 * Where the picture and the declaration disagree, in sentences. Empty is the only passing
 * answer; a gate reads this, and so does the panel's own test.
 *
 * Deliberately not a drift check against a committed picture: there is no committed
 * picture to drift from, which is the point (the reasoning is
 * `check-flow-completeness.ts`'s, and is worth carrying).
 */
export function storyboardFindings(
  shell: ConfigShell,
  storyboard: readonly Beat[] = STORYBOARD,
  notDrawn: readonly { component: string; reason: string }[] = NOT_DRAWN,
): string[] {
  const findings: string[] = [];
  const declared = new Map(shell.components.map((component) => [component.id, component]));
  const drawn = new Set<string>();
  const cells = new Map<string, string>();

  for (const beat of storyboard) {
    for (const node of beat.reveals) {
      const component = declared.get(node.component);
      if (!component) {
        findings.push(
          `the Intro drawing has a node for '${node.component}', which the shell declares no component for`,
        );
      }
      if (drawn.has(node.component)) {
        findings.push(`the Intro drawing reveals '${node.component}' more than once`);
      }
      drawn.add(node.component);

      const key = `${node.place.col},${node.place.row}`;
      const occupant = cells.get(key);
      if (occupant !== undefined) {
        findings.push(
          `'${node.component}' and '${occupant}' both claim cell ${key} in the Intro drawing`,
        );
      }
      cells.set(key, node.component);

      if (component) {
        const inPlaneRow = node.place.row === PLANE_ROW;
        if (component.band === 'plane' && !inPlaneRow) {
          findings.push(
            `'${node.component}' declares itself the plane and is drawn outside the Intro drawing's plane strip`,
          );
        }
        if (component.band !== 'plane' && inPlaneRow) {
          findings.push(
            `'${node.component}' is drawn in the Intro drawing's plane strip but declares band '${component.band}'`,
          );
        }
      }
    }
  }

  for (const beat of storyboard) {
    for (const node of beat.reveals) {
      const inLoop =
        node.place.col >= LOOP_REGION.from.col &&
        node.place.col <= LOOP_REGION.to.col &&
        node.place.row >= LOOP_REGION.from.row &&
        node.place.row <= LOOP_REGION.to.row;
      const band = declared.get(node.component)?.band;
      if (inLoop && band !== undefined && band !== 'loop') {
        findings.push(
          `'${node.component}' is drawn inside the Intro drawing's loop band but declares band '${band}'`,
        );
      }
    }
  }

  const omitted = new Set<string>();
  for (const omission of notDrawn) {
    if (!declared.has(omission.component)) {
      findings.push(
        `the Intro drawing's omissions name '${omission.component}', which the shell declares no component for`,
      );
    }
    if (drawn.has(omission.component)) {
      findings.push(
        `'${omission.component}' is both drawn in the Intro drawing and listed as deliberately not drawn`,
      );
    }
    if (omission.reason.trim().length === 0) {
      findings.push(`the Intro drawing omits '${omission.component}' with no reason given`);
    }
    omitted.add(omission.component);
  }

  for (const component of shell.components) {
    if (!drawn.has(component.id) && !omitted.has(component.id)) {
      findings.push(
        `component '${component.id}' is declared but the Intro drawing neither draws it nor records why it is left out`,
      );
    }
  }
  return findings;
}

/** Every node in the drawing, in reveal order. */
export function nodesOf(storyboard: readonly Beat[] = STORYBOARD): readonly Node[] {
  return storyboard.flatMap((beat) => beat.reveals);
}
