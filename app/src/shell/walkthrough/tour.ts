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
    panel: 'A cadence bar counts down to the next now-cast, and the digest names the seeded truth the current field came from. You can ask for the next one now: it supersedes the one before it — there is one now-cast at a time — and it reaches the coverage store and the map. It does not reach the sensors, which sample the world through a port rather than reading a holding, which is also why its arrows here are dashed.',
  },
  'snapshot-source': {
    title: 'The snapshot source',
    what: 'Where the ocean and the forecasts came from. Every situation’s four eras — the archive and the now-cast from the generator above, the analyses from the analyst and the forecast instances from the model runner — were authored ahead of time, from that situation’s own recorded seed, and committed as a build artefact, because computing them again on every visit cost several seconds and produced the same bytes. This component republishes them, and the loop takes over live from there.',
    panel: 'The face says how many holdings it replayed and how many the artefact held. What makes this a cache rather than a fixture is two things you can check: a gate rebuilds the artefact on every change and fails the build if one byte differs from what these three components would author now, and the holdings arrive through the coverage store’s one write path, digest-checked exactly as a live publication is — a corrupted artefact is refused in the same words. Where a situation has no artefact, or one could not be fetched, this node says so and the ocean and its forecasts were computed live instead, several seconds slower and every bit as true.',
  },
  platform: {
    title: 'The platform',
    what: 'The vehicle the instruments ride on. It holds a demanded course, speed and depth beside its current ones, and works from one toward the other under declared limits — a turn rate, an acceleration, a dive rate.',
    panel: 'Open this node and the dial shows demanded as a hollow mark and current as the solid one, with the limit that is binding named beneath. Under it are the controls: sliders that run between zero and the limits the platform itself reported, and presets — reverse course, all stop, full ahead, surface — each demanding only what it names, so anything a demand leaves out stays standing. What you send is published, not applied; watch the hollow mark move, then the solid one chase it. How often it reports where it is is tunable here, and it will report one impossible depth on request — a fault in an instrument, not in the vehicle: it reports a depth it cannot reach and does not dive to one.',
  },
  sensors: {
    title: 'The sensors',
    what: 'Simulated instruments sampling the true field on a cadence and adding their declared noise. They sample where the platform last said it was — and when that position goes stale they publish nothing and say why, rather than sampling a place nobody has reported.',
    panel: 'The face carries a line per instrument with its recent values, and the sentence underneath is the sensors’ own: the tick they last heard a position at. Their sampling cadence is tunable here, and it is two rules at once — how often they sample, and how long a heard position stays fresh — so shortening it below the platform’s reporting interval starves them, and they say so and count the skipped ticks. The platform’s reporting interval is the other half of that pair. You can also ask these instruments for one deliberately malformed sample: they publish it, the ingestion seam refuses it against the committed master and names the fault, and they report that you asked.',
  },
  ingest: {
    title: 'The ingestion seam',
    what: 'The observation store’s only writer. It validates every message against the committed master, refuses what fails with the fault named, absorbs redelivery, and range-checks the ownship values against the platform’s own declared limits.',
    panel: 'Two lanes — accepted and flagged — and the flag reasons by name, because “six flagged” is a count and not a fault. Ask the sensors for a malformed sample or the platform for an impossible depth, and watch the answer arrive here: a refusal against the master, or a flag against the platform’s own declared limits, which this seam reads rather than holding a second copy of.',
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
  analyst: {
    title: 'The analyst',
    what: 'It corrects the standing forecast by what the instruments have actually measured, before anything is forecast from it. The correction is optimal interpolation: each cell moves toward the observations in proportion to how uncertain the forecast was there and how certain the instrument is, and the reach is a declared correlation that falls to exactly nothing at its support. It also publishes where every cell’s value came from.',
    panel: 'The observations each cycle took in, and how far the analysis moved the field. Before this component existed the runner initialised from a field evaluated straight from the synthetic truth, so nothing measured here ever reached a forecast.',
  },
  'model-runner': {
    title: 'The model runner',
    what: 'It takes the analysis the analyst published, perturbs a small ensemble around it by the error the analysis left, and runs each member through an analytic kernel behind a port before publishing the mean as a forecast and the spread as uncertainty. The kernel is deliberately fake and says so.',
    panel: 'The inbound trigger and the ensemble filling — the forecast drawn as it is produced rather than announced after the fact.',
  },
  planner: {
    title: 'The planner',
    what: 'It reads the error the analysis left to say where the harness is least sure, and recommends where sampling would reduce that most. It used to multiply the ensemble spread by how long ago each region was measured, because the spread carried no spatial structure at all; now the doubt it scores is the doubt the analysis actually computed. It recommends and does nothing else: turning a recommendation into an order is a decision, and no component here makes it.',
    panel: 'Doubt against the threshold that makes a region unusable, and the recommended route. You can move that threshold and ask it to recompute now; with no uncertainty field to work from it says so rather than publishing a hollow plan, and the plan it does publish carries the threshold that produced it. Note that its arrow stops at its own topic — there is no line from here to the platform, and that absence is the point. Nothing on this tab turns a recommendation into an order.',
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
    panel: 'Packages announced and bytes staged against the declared bound. You can ask it to stage a window now, over the release it last heard. It answers under the rules it already had: nothing released yet, at its staging bound, or no measurements in the interval — a bundle nobody can score is not staged, and being told so is half of what the button is for.',
  },
};

/**
 * The tour of the components, built against the shell's declared list so its order is
 * the picture's order and a new component cannot be quietly left out.
 */
// (the component tour follows; the per-surface tours of feature 115 are below it)
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
 * What the component tour does not cover, and what it covers that does not exist. Named
 * rather than counted: a walkthrough that quietly stopped covering a component would
 * read as a complete tour, which is worse than no tour at all.
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

// ------------------------------------------- the per-surface tours (feature 115) ---
//
// FR-61 held the component tour to the shell's declared component list. FR-75
// generalises that rule rather than repeating it: every tour is held to a list on disk,
// and `uncoveredSubjects` below is the one check that does the holding. The map's
// authority is its own layer registry; Holdings' and Messages' are the regions their
// panels declare. A surface that gains a feature and not a step is named, because a
// bound typed into a test would not survive the next layer (CLAUDE.md, lesson 2).

/** One thing a surface offers, as the surface itself declares it. */
export interface TourSubject {
  readonly id: string;
  readonly label: string;
  readonly element: string;
}

/**
 * A step keyed to a subject, so the check can say which subject has none. Kept apart
 * from `TourStep`'s optional `component`: a component is a thing in the harness, a
 * subject is a thing on a surface, and one field meaning both is one field that will
 * eventually be asked which it means.
 */
export interface SubjectStep extends TourStep {
  readonly subject: string;
}

/**
 * What a tour of these subjects does not cover, and what it covers that the surface does
 * not offer. The same two findings the component tour has always produced, in the same
 * words, over a different list on disk.
 */
export function uncoveredSubjects(
  tourId: string,
  subjects: readonly TourSubject[],
  steps: readonly SubjectStep[],
): string[] {
  const findings: string[] = [];
  for (const subject of subjects) {
    if (!steps.some((step) => step.subject === subject.id)) {
      findings.push(`the ${tourId} tour has no step for '${subject.id}'`);
    }
  }
  for (const step of steps) {
    if (!subjects.some((subject) => subject.id === step.subject)) {
      findings.push(`the ${tourId} tour explains '${step.subject}', which the surface does not offer`);
    }
  }
  return findings;
}

/**
 * Build a tour from subject-keyed steps. The completeness check is deliberately not run
 * here: it needs the surface's own subject list, which lives with the surface, and a
 * tour that threw at render would take the panel down rather than report the gap. The
 * check runs where a finding can be read — a test, per FR-75.
 */
function surfaceTour(id: string, view: string, title: string, steps: readonly SubjectStep[]): Tour {
  return { id, view, title, steps };
}

const MESSAGES_STEPS: SubjectStep[] = [
  {
    subject: 'traffic',
    element: '[data-region="traffic"]',
    title: 'The traffic display',
    what: 'Every message this page passes crosses one broker, and this is that traffic drawn rather than listed. A lane is a top-level namespace the topology artefact declares; a mark is one message that arrived.',
    panel: 'Nothing here moves except on arrival, so a still lane means a quiet namespace and never a paused display. Stop the sensors from the Operator tab and watch the observation lane drain while the clock lane goes on beating.',
  },
  {
    subject: 'tree',
    element: '[data-region="tree"]',
    title: 'The topic tree',
    what: 'The shape of the broker\'s topic space, drawn from the derived topology artefact — the structure — and lit by traffic that genuinely arrived. The two never mix, which is why a topic nobody declared shows up as an undeclared branch rather than not at all.',
    panel: 'Select a node to narrow the traffic display and the list to that subtree. The chips beside a leaf are the consumers whose declared filters cover it.',
  },
  {
    subject: 'list',
    element: '[data-region="list"]',
    title: 'The list',
    what: 'The messages themselves, newest first. Heartbeats and clock samples are hidden here by default because they are most of the traffic and rarely what anyone came for — each has its own toggle, and both are counted and drawn either way.',
    panel: 'The counters at the top say how many messages were received and how many their masters refused. That second number is a claim this display makes, and a test holds it to it.',
  },
  {
    subject: 'inspector',
    element: '[data-region="inspector"]',
    title: 'The inspector',
    what: 'A message read against the master its topic declares: each field named as the master names it, with the unit where the master states one. A refusal is marked on the field that caused it rather than printed as a sentence above the document.',
    panel: 'The raw wire document is one control away for every message, because the wire form is what the seam actually carried. A topic with no declared master says so by name and shows the document.',
  },
];

/**
 * The Messages tour. Its authority is the panel's own declared region list, imported by
 * the test rather than by this module: a tour importing the panel it explains would put
 * a React tree behind every consumer of this file.
 */
export function messagesTour(): Tour {
  return surfaceTour('messages', 'messages', 'The Messages tab, region by region', MESSAGES_STEPS);
}

/** The Messages tour's steps, for the completeness check. */
export const MESSAGES_TOUR_STEPS: readonly SubjectStep[] = MESSAGES_STEPS;

const DATA_STEPS: SubjectStep[] = [
  {
    subject: 'tree',
    element: '[data-region="tree"]',
    title: 'Everything the system holds',
    what: 'Three stores answer here through three standard interfaces, and the tree gathers them by *kind* rather than by standard: what the sensors measured, the five eras of gridded field, and what shore has sent. The count beside each branch is what that store reports, not what this tab has drawn.',
    panel: 'Choosing a branch changes the address, so any node in this tab can be linked to directly. Nothing here polls: a branch refreshes when its store announces a publication, which is why a count can sit still while the clock runs.',
  },

  {
    subject: 'timeline',
    element: '[data-region="timeline"]',
    title: 'The store, filling up',
    what: 'The coverage store holds three kinds of field: a historic archive authored when the run was provisioned, a now-cast replaced on its cadence, and one forecast instance for every turn the loop has taken. Each is drawn at the interval its own manifest says it covers, not at the moment it was published.',
    panel: 'The archive spans twenty years and an instance spans hours, so the axis is logarithmic in elapsed time and says so beneath itself rather than leaving you to infer it from the tick spacing. Every bar is a button: tab through them and you walk the store’s history in the order it happened.',
  },
  {
    subject: 'manifest',
    element: '[data-region="manifest"]',
    title: 'The ground-truth manifest',
    what: 'Every generated field carries the document that produced it: the grid, the background state, the four seeded features with their parameters, the seed and the generator version. It is sufficient on its own — with the version it names, the field can be reconstructed at any point without the stored bytes.',
    panel: 'It is shown whole and never summarised, because it is the thing the recovery tests score against. The facts above it are the same ones the timeline announces to a screen reader.',
  },
  {
    subject: 'comparison',
    element: '[data-region="comparison"]',
    title: 'Was the forecast any good?',
    what: 'For an instance whose validity has elapsed, the truth for the instant it forecast has since been published — so the two can be differenced. Beside that difference goes a third: the forecast’s own initial field held constant, which is what doing nothing would have produced. A picture of forecast error alone is a skill claim, and no skill claim is admitted here without that reference.',
    panel: 'Both differences are drawn on one shared scale, so they are comparable by eye, and the panel says plainly which is closer — including when it is the reference. The three requests it made are on screen and copyable: a figure this page computed and you cannot re-derive is an assertion.',
  },
  {
    subject: 'volume',
    element: '[data-region="volume"]',
    title: 'The field as a volume, through its own time',
    what: 'Longitude, latitude and depth, drawn as a rotating stack — each level a genuine EDR area query against this holding — and a fourth axis stepping the time values the holding’s own manifest declares. Months for the archive, hours for a forecast run.',
    panel: 'Steps are fetched as they are asked for and kept. Nothing is ever drawn that was not fetched: scrub to a step that has not arrived and it says so, rather than showing you a neighbour’s field at an instant nobody asked the store about.',
  },
  {
    subject: 'chart',
    element: '[data-region="chart"]',
    title: 'What an instrument reported',
    what: 'A platform carries datastreams and a datastream carries observations — SensorThings’ own grouping, kept rather than regrouped. What is drawn is that datastream’s whole history, paged out of the store until it is exhausted.',
    panel: 'The axes come from the observations and from nothing else: a chart drawn to a configured expectation would look the same whether an instrument had behaved or failed high. Two tabs turn the same fetched history around — the chart for what an instrument has been doing, the table for exactly what it said and when.',
  },
  {
    subject: 'advisories',
    element: '[data-region="advisories"]',
    title: 'What shore has sent',
    what: 'Advisories carry a kind, a region and a window of validity, and no free text anywhere — every field is an enum, a bounded pattern or a timestamp. So they are drawn: the advised region, coloured by kind.',
    panel: 'An advisory whose validity has lapsed stays on the canvas, drawn spent. Removing it would answer “has anything been advised here?” with “no”, when the truth is “yes, and it has expired”. Watch them accumulate as the clock runs.',
  },
];

/** The Data tour, held to the panel's own declared region list. */
export function dataTour(): Tour {
  return surfaceTour('data', 'data', 'The Data tab, region by region', DATA_STEPS);
}

/** The Data tour's steps, for the completeness check. */
export const DATA_TOUR_STEPS: readonly SubjectStep[] = DATA_STEPS;

const MAP_STEPS: SubjectStep[] = [
  {
    subject: 'projections',
    element: '[data-testid="projection-select"]',
    title: 'Three ways to look at one volume',
    what: 'The ocean here is four-dimensional — longitude, latitude, depth and time — and no single projection shows all of it. A plan view is a slice at one depth; a globe puts that slice on a sphere you can turn; a depth volume draws every level of the holding\'s own depth axis at once, rotatable.',
    panel: 'The volume is not a rendering trick: each level in it is a separate area query, and the panel says how many answered. The cube query type is outside the served subset of the standard, and the composer says so by name rather than offering it and failing.',
  },
  {
    subject: 'field',
    element: '.map-canvas',
    title: 'The field',
    what: 'Temperature or salinity over the domain, at the chosen depth and the displayed instant. It is a genuine area query against a holding the coverage store serves through OGC API-EDR — the same request any other client would make.',
    panel: 'The status line names the holding it was served from and the depth and instant it answered for. Those are the served values, not the requested ones: the sampler is nearest-neighbour, so a level you can select may not be one the holding stores, and the difference belongs on screen.',
  },
  {
    subject: 'doubt',
    element: '[data-testid="doubt-select"]',
    title: 'The doubt over it',
    what: 'Two different things can be drawn as doubt and they are never mixed. The planner\'s projection cells are where it expects confidence to have lapsed by a given time; a run\'s spread is the ensemble\'s own disagreement, served as an ordinary coverage.',
    panel: 'The spread is a second query rather than a second computation of doubt, which is why it can only be offered once a run has published one.',
  },
  {
    subject: 'ownship',
    element: '[data-testid="ownship-status"]',
    title: 'Where the platform has been, and where it was told to go',
    what: 'The track is the positions the platform reported, read back through the query layer as ordinary measurements — not a wire from the simulator. The demanded course is drawn as a ray from where it is, one hour long at the demanded speed.',
    panel: 'Both appear in every projection. In the volume the track is drawn at the depths the platform reported, against the levels the volume already draws — flattening it to the surface would discard the one dimension that view exists for. Where nothing has been served the panel says so rather than drawing a stub.',
  },
  {
    subject: 'route',
    element: '.map-canvas',
    title: 'The route the planner recommends',
    what: 'A four-dimensional curve: each stop has a place, a depth and an arrival time. It is drawn as a curve because it is a plan, deliberately unlike the track, which is joined point to point because it is a record.',
    panel: 'Click a stop and the panel asks what conditions will be there at the moment of arrival — a position query at that place, that depth and that instant. Nothing about the route is a command: the planner recommends and no component here turns a recommendation into an order.',
  },
  {
    subject: 'advisories',
    element: '.map-canvas',
    title: 'Shore advisories',
    what: 'Deterministically authored advice arriving from ashore, valid over a stated window. They are drawn only while they are valid at the displayed instant, and they stay queryable outside it.',
    panel: 'They are visibly distinct and legible with colour removed, because an advisory a reader cannot pick out is an advisory that was not delivered.',
  },
  {
    subject: 'domain',
    element: '.map-canvas',
    title: 'The domain, and the features that do not move',
    what: 'The extent the generated field covers, and the read-only scenario geometry — the loiter region and its kin. The feature store holds them and never changes them for the life of a run.',
    panel: 'Drawn as a frame rather than as data, because that is what they are: the edges of what any of the queries above can honestly answer for.',
  },
  {
    subject: 'time',
    element: '[data-testid="time-control"]',
    title: 'The time control',
    what: 'The displayed instant, from the clock\'s own samples out to the plan\'s horizon. It carries the field as well as the route: moving it asks the field for the step the instant falls on.',
    panel: 'The field refetches at the holding\'s own step and no faster, because what throttles the scrubber is a number in the manifest rather than one typed into the shell.',
  },
  {
    subject: 'composer',
    element: '[data-testid="composer-toggle"]',
    title: 'The EDR composer',
    what: 'Build a query against the served subset of OGC API-EDR and see exactly what is asked and what comes back. Click the canvas with it open and the click places the query\'s position, in any projection.',
    panel: 'It offers only what the query layer states it serves, and names what it does not. An offered-but-stubbed capability is the exact dishonesty this harness exists to avoid.',
  },
];

/** The Map tour, held to the panel's own layer registry (`panels/map/layers.ts`). */
export function mapTour(): Tour {
  return surfaceTour('map', 'map', 'The Map, layer by layer', MAP_STEPS);
}

/** The Map tour's steps, for the completeness check. */
export const MAP_TOUR_STEPS: readonly SubjectStep[] = MAP_STEPS;


const FORECAST_STEPS: SubjectStep[] = [
  {
    subject: 'indicator',
    element: '[data-region="indicator"]',
    title: 'Why a run is warranted, and what one costs',
    what: 'A forecast that takes minutes is not an engineering embarrassment to be optimised away; it is a planning problem the operator owns. The vessel chooses when to spend the compute — on passage, in quiet water, before a decision point — so need and cost belong in one frame or the region has not done its job.',
    panel: 'The gauge draws whatever is published on the declared indicator topic, with the threshold at which a run becomes warranted marked across it, and it names which indicator it is showing. What that indicator ought to be is environmental science and belongs elsewhere; this is the socket. With the topic silent the region says so and draws no gauge, because an empty gauge and an unheard indicator are different facts. Beneath it is what a run costs, stated by the component that will spend it and by no other.',
  },
  {
    subject: 'volume',
    element: '[data-region="volume"]',
    title: 'What a cell’s value was made from',
    what: 'The question an operator asks of a forecast is not which model ran but what a given number is made of: which observations moved it, by how much, and where the rest came from when nothing sampled. Assimilation is arithmetic over published numbers, and every reader assumes it is magic.',
    panel: 'This region is feature 124 and is not built. It says so rather than drawing an empty canvas: a picture that showed nothing would be a claim the shell is not entitled to make, and the difference between "not built" and "nothing to show" is the difference this whole surface exists to keep.',
  },
  {
    subject: 'ahead',
    element: '[data-region="ahead"]',
    title: 'The spread ahead',
    what: 'An ensemble disagrees with itself, and how much it disagrees along the route you intend to take is a different question from how much it disagrees on average. Confidence decays against a declared timescale, and a forecast that does not widen with lead is making a stronger claim than it can support.',
    panel: 'This region is feature 124 and is not built. The spread itself is published and the Map draws it: what is missing is this region, not the figure.',
  },
  {
    subject: 'timeline',
    element: '[data-region="timeline"]',
    title: 'The runs, in simulation time',
    what: 'Four things can happen when a run is considered, and they are four facts rather than one appearance: a run is requested, declined by the minimum interval, declined as a duplicate, or held because the standing forecast still has more life left than the run costs. The hold is not a decline — it is the loop waiting until the compute is worth spending, and it releases as the headroom decays so the new run lands as the old one lapses.',
    panel: 'Each entry is labelled by what asked for it, read from the run request where the scheduler declares it rather than inferred from a sentence. A run announces its start and publishes when the ticks it costs are spent, so the interval between the two is the cost being spent rather than a spinner. Select an entry and the address names it, so a link opens this view at the run being discussed.',
  },
];

/** The Forecast tour, held to the panel's own declared region list. */
export function forecastTour(): Tour {
  return surfaceTour('forecast', 'forecast', 'The Forecast tab, region by region', FORECAST_STEPS);
}

/** The Forecast tour's steps, for the completeness check. */
export const FORECAST_TOUR_STEPS: readonly SubjectStep[] = FORECAST_STEPS;

/**
 * Every tour the shell offers, so the checks that apply to *all* of them (FR-62, SC-09)
 * can enumerate rather than being told. A tour added without being listed here would be
 * a tour no rule covered, which is the failure mode the list exists against.
 */
export function allTours(shell: ConfigShell): readonly Tour[] {
  return [componentTour(shell), mapTour(), dataTour(), messagesTour(), forecastTour()];
}
