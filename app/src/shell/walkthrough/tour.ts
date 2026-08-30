/**
 * The walkthrough (feature 110): a step-through of the harness, one component at a
 * time, driving the panel the reader is looking at.
 *
 * `docs/v2/plan.md` §5 reserved feature 110 for "interactive walkthrough machinery (a
 * step-through mode driving the other panels)" and left the slot named but unclaimed.
 * This claims it.
 *
 * **What this is, and what it is not.** The prose here is authored explanation, on
 * feature 111's precedent: an explainer teaches, and Constitution VII is not engaged
 * by teaching. What it must never do is *assert live state* — so no step says a
 * component is running, or how many observations it has published. Each step points at
 * the node that shows those things and says what the component is for. The reader's
 * eye does the rest, from figures the panel drew from received traffic.
 *
 * **What a reader can do, said where they can do it.** From feature 114 the Operator
 * tab is a control plane as well as a picture, and the controls live in each node's
 * own drawer. A tour that walked past them would be a tour of a system the reader
 * cannot touch, so the steps for the components that take controls say what is there
 * and what the component will do about it — including declining. They say it in the
 * conditional, because that is the truth: a prompt is considered, a tuning is
 * published, and neither is a promise about what happens next.
 *
 * **The steps cannot drift.** They are keyed by component id and checked against the
 * shell's declared component list: `missingSteps` names any component with no step,
 * and any step naming a component that is not declared. A walkthrough that quietly
 * stopped covering a component would be worse than none, because it would read as a
 * complete tour.
 */
import type { ConfigShell } from '../../generated/types.js';

export interface TourStep {
  /** The component this step is about, or undefined for a step about the view itself. */
  readonly component?: string;
  /** CSS selector for the element to highlight. Absent steps show as a centred card. */
  readonly element?: string;
  readonly title: string;
  /** What the component does. Two or three sentences, domain-first. */
  readonly what: string;
  /** What its panel shows, and what a reader can do with it. */
  readonly panel: string;
}

export interface Tour {
  readonly id: string;
  /** The view this tour runs in; the button opens it before starting. */
  readonly view: string;
  readonly title: string;
  readonly steps: readonly TourStep[];
}

const COMPONENT_STEPS: Record<string, { title: string; what: string; panel: string }> = {
  clock: {
    title: 'The simulation clock',
    what: 'Every other component takes its time from here, and none of them reads the host clock. That is what makes a run replayable: the same seed and the same configuration produce the same run, tick for tick.',
    panel: 'The strip at the top of the shell shows the simulation instant and the rate. The rate is the one the clock acknowledged, never the one that was asked for. Above the chart are two step buttons: one tick, and a burst of as many as the operator surface says it will accept in one command — every tick in a burst is published, heard and acted on exactly as a single step is.',
  },
  broker: {
    title: 'The broker',
    what: 'An in-browser message broker with MQTT topic semantics: a topic tree, wildcard subscriptions, and role-based rules that decide who may say what. Every component talks through it and to nothing else.',
    panel: 'The Messages tab shows the live traffic. The rates on this node are counted by the shell from what reached it, which is why they are marked as counted here rather than reported.',
  },
  boundary: {
    title: 'The release gate',
    what: 'Default deny at the seam. Exposure is opt-in one path prefix at a time, so adding a collection never exposes it by accident, and a denial is a visible event rather than a silent nothing.',
    panel: 'The face shows what it allowed and what it refused, with the last refusal in the gate’s own words — a denial you cannot read is a denial you cannot act on.',
  },
  'env-generator': {
    title: 'The environment generator',
    what: 'The synthetic ocean: temperature and salinity fields with an eddy, a front, a thermocline and a moving feature, all drawn from seeded parameters recorded in a ground-truth manifest. Nothing here is real, and the manifest is what lets the harness score how well the truth is recovered.',
    panel: 'A cadence bar counts down to the next now-cast, and the digest names the seeded truth the current field came from. It publishes nothing but heartbeats, which is why its arrows are dashed: it reaches the sensors through a port, not the broker.',
  },
  platform: {
    title: 'The platform',
    what: 'The vehicle the instruments ride on. It holds a demanded course, speed and depth beside its current ones, and works from one toward the other under declared limits — a turn rate, an acceleration, a dive rate.',
    panel: 'Open this node and the dial shows demanded as a hollow mark and current as the solid one, with the limit that is binding named beneath. Under it are the controls: sliders that run between zero and the limits the platform itself reported, and presets — reverse course, all stop, full ahead, surface — each demanding only what it names, so anything a demand leaves out stays standing. What you send is published, not applied; watch the hollow mark move, then the solid one chase it.',
  },
  sensors: {
    title: 'The sensors',
    what: 'Simulated instruments sampling the true field on a cadence and adding their declared noise. They sample where the platform last said it was — and when that position goes stale they publish nothing and say why, rather than sampling a place nobody has reported.',
    panel: 'The face carries a line per instrument with its recent values. The sentence underneath is the sensors’ own: it names the tick they last heard a position at.',
  },
  ingest: {
    title: 'The ingestion seam',
    what: 'The observation store’s only writer. It validates every message against the committed master, refuses what fails with the fault named, absorbs redelivery, and range-checks the ownship values against the platform’s own declared limits.',
    panel: 'Two lanes — accepted and flagged — and the flag reasons by name, because “six flagged” is a count and not a fault.',
  },
  'observation-store': {
    title: 'The observation store',
    what: 'Where measurements land, keyed by an identifier derived from the seed and the observation’s logical position. That is what makes a redelivered message a no-op rather than a duplicate row.',
    panel: 'Volume and growth, and the share each datastream holds. The ownship rows are drawn as part of the whole, because that is what they are: ordinary measurements through the ordinary seam.',
  },
  'feature-store': {
    title: 'The feature store',
    what: 'The scenario’s geometry: the domain and the loiter region. Read-only for the whole run, which is why it is the one face with nothing moving on it.',
    panel: 'A read-only mark and the features it holds. Drawing a growth line here would be an invention.',
  },
  query: {
    title: 'The query components',
    what: 'OGC API-EDR and SensorThings, served read-only over the stores. Each states plainly which subset of the standard it implements, and every refusal names the thing refused — an offered-but-stubbed capability is the exact dishonesty this harness exists to avoid.',
    panel: 'A tape of what was served and what was refused. The Map’s ownship track comes through this line and no other, which is what makes it a query rather than a wire.',
  },
  'coverage-store': {
    title: 'The coverage store',
    what: 'Where forecast fields and the historic archive live, published atomically and announced when they land. A holding is a instance of a field with its own manifest of axes.',
    panel: 'A stack of holdings, newest highlighted, each bar’s length its size — so a run that published a thin holding is visible as a short bar rather than as one more row.',
  },
  monitor: {
    title: 'The monitor',
    what: 'It pairs co-located temperature and salinity samples, derives sound speed, and scores the residual against the current forecast. A single spike never raises anything: a divergence needs a sustained streak, and evidence gathered against a superseded forecast is discarded.',
    panel: 'The drift face: the residual with the breach threshold drawn across it, and the persistence streak beneath. That streak is the thing that will trigger a new forecast, drawn as what it is. Both numbers it scores against are tunable here — lower the threshold and the streak beside it starts filling against the new one. What the slider holds is what you are asking for; the value marked in force is what the monitor reports it is using, and a restart returns it to what was configured.',
  },
  scheduler: {
    title: 'The scheduler',
    what: 'Whether a run is warranted. It declines a divergence inside the minimum interval, refuses a duplicate while one is outstanding, and asks for a run on schedule alone when the cadence floor comes due — so the loop cannot be becalmed.',
    panel: 'Every decision, not only the ones that led to a run, and the two clocks that produce them. You can ask for a run here, and you can move both intervals. The ask goes to the scheduler rather than around it, so it is weighed under the policy a divergence is weighed under: inside the minimum interval it is declined, and the decline appears in this drawer in the scheduler’s own words. That is a complete answer, not a failure.',
  },
  'model-runner': {
    title: 'The model runner',
    what: 'It takes a run request and produces a small ensemble through an analytic kernel behind a port, then publishes the result as a holding. The kernel is deliberately fake and says so.',
    panel: 'The inbound trigger and the ensemble filling — the forecast drawn as it is produced rather than announced after the fact.',
  },
  planner: {
    title: 'The planner',
    what: 'It combines ensemble spread with observation age to say where the harness is least sure, and recommends where sampling would reduce that most. It recommends and does nothing else: turning a recommendation into an order is a decision, and no component here makes it.',
    panel: 'Doubt against the threshold that makes a region unusable, and the recommended route. Note that its arrow stops at its own topic — there is no line from here to the platform, and that absence is the point.',
  },
  telemetry: {
    title: 'Telemetry',
    what: 'It aggregates what the loop reports: residual statistics, throughput per simulation second, and forecast skill always scored against a persistence reference — so when the model is not earning its compute, the harness says so.',
    panel: 'The skill gauge carries the component’s own sentence, in its words, including the unflattering one.',
  },
  operator: {
    title: 'The operator surface',
    what: 'The control plane: it aggregates what components report about themselves and dispatches commands. A component never heard from is reported unheard, not absent, and a refused command names the rule rather than failing quietly.',
    panel: 'This is the surface you are looking through, and the one that dispatched everything you have pressed: its figures count what it published and what it refused by rule. It also states what the plane offers — the step bound, the tunables and their bounds, the promptable events — and this panel draws exactly that and nothing else, so a control you can see is one the surface would accept. Stopping it is refused, and the refusal says why.',
  },
  'advisory-source': {
    title: 'The shore advisory source',
    what: 'Deterministically authored advisories — the shore’s view arriving in the harness, valid over a stated window.',
    panel: 'What it last wrote, in its own words, when the next one is due, and how many were authored because somebody asked. You can ask here: prompted or on cadence it is the same deterministic next advisory in the sequence, so the prompt moves when it is written and never what it says.',
  },
  'advisory-store': {
    title: 'The advisory store',
    what: 'Append-only. An advisory is never edited or removed; a later one supersedes it, and both remain readable.',
    panel: 'Which advisories are valid at the instant on screen, and which are merely stored. The Map draws the valid ones and lists the rest.',
  },
  offload: {
    title: 'The offload packager',
    what: 'It stages an export and announces its departure. Nothing actually leaves: the shape is real, the transfer waits for Version 3, and the face says so rather than letting a packager that transfers nothing read as one that does.',
    panel: 'Packages announced and bytes staged against the declared bound.',
  },
};

/**
 * The tour of the components, built against the shell's declared list so its order is
 * the picture's order and a new component cannot be quietly left out.
 */
export function componentTour(shell: ConfigShell): Tour {
  const steps: TourStep[] = [
    {
      element: '[data-testid="flow-chart"]',
      title: 'The harness, end to end',
      what: 'drogna is a synthetic ocean, sensors that sample it, a forecast loop that assimilates what they report, and a query layer that serves the result. Everything in it is deliberately fake and says so.',
      panel: 'This is the flow chart: every component drawn once, with the arrows derived from the broker wiring rather than drawn by hand. A node is lit only because a heartbeat from it arrived, and a node marked with a ▸ takes controls — open it and you can steer the platform, tune what the loop scores against, or ask a component to act now. Use Next to walk the components one at a time.',
    },
    ...shell.components.map((component) => {
      const copy = COMPONENT_STEPS[component.id];
      return {
        component: component.id,
        element: `[data-flow-node="${component.id}"]`,
        title: copy?.title ?? component.label,
        what: copy?.what ?? 'No explanation has been written for this component yet.',
        panel: copy?.panel ?? 'Its node carries whatever it reports about itself.',
      };
    }),
    {
      title: 'That is the tour',
      what: 'The loop turns because the world diverged: the monitor sees drift, the scheduler decides a run is warranted, the runner produces one, and the store announces it — which is what the monitor then scores against.',
      panel: 'Now drive it. Stop a component from its node and watch what it costs the ones downstream; steer the platform into a different part of the ocean and watch the residual answer; drop the drift threshold until the streak fills, or ask the scheduler for a run and read what it decides. Nothing here is a mock: a stopped component goes dark because its heartbeats cease, a tuning changes what the monitor genuinely scores against, and a prompt can be declined — never because a response said so.',
    },
  ];
  return { id: 'components', view: 'operator', title: 'The system, component by component', steps };
}

/**
 * What the tour does not cover, and what it covers that does not exist. Named rather
 * than counted: a walkthrough that quietly stopped covering a component would read as
 * a complete tour, which is worse than no tour at all.
 */
export function missingSteps(shell: ConfigShell): string[] {
  const findings: string[] = [];
  for (const component of shell.components) {
    if (!COMPONENT_STEPS[component.id]) {
      findings.push(`the walkthrough has no step for '${component.id}'`);
    }
  }
  for (const id of Object.keys(COMPONENT_STEPS)) {
    if (!shell.components.some((component) => component.id === id)) {
      findings.push(`the walkthrough explains '${id}', which is not a declared component`);
    }
  }
  return findings;
}
