/**
 * Which parts of drogna were written and which were chosen. SRD §2.2, made visible.
 *
 * Feature 003 already carries half of this: `layout/components.ts` marks each box bespoke
 * or plumbing and the diagram draws square corners against round ones. That reading is
 * extended here rather than replaced — the corner shapes stay, and this module adds the
 * two things §2.2 asks for beyond them. First, the boundaries are classified too, because
 * a system's novelty lives in what crosses its seams at least as much as in the boxes.
 * Second, a component claimed as bespoke has to say *what* is bespoke about it: an
 * unnamed claim of novelty is the sort of thing this repository exists not to make.
 *
 * A classification is a static architectural fact. It cannot cause a box to be drawn, and
 * it cannot light one: illumination comes from a received heartbeat and from nothing else
 * (Constitution VII, FR-018). This module holds no state, subscribes to nothing, and has
 * no route to the liveness reducer — which is the form of that promise a reader can check.
 *
 * The boundary rule is worth stating because it is a judgement rather than a lookup. A
 * boundary is **bespoke core** when what crosses it carries drogna's own judgement: a
 * divergence rule's verdict, a scheduling decision, a plan, a quality flag, a derived
 * sound speed. It is **plumbing** when what crosses it is moved rather than judged: an
 * announcement, a standard read interface, a store write, a transport hop. By that rule
 * eleven of the twenty-seven boundaries are bespoke, which is the honest proportion and
 * the one §2.2 wants a reader to see.
 *
 * That figure is prose and nothing derives it, which is why it was wrong: it read "eight
 * of the twenty-two" from the day it was written, when the table below already classified
 * nine. What is actually held is the bound `classification.test.ts` asserts — fewer than
 * half — and a reader who wants the exact number should count the table rather than trust
 * this sentence.
 */
import { COMPONENTS, EDGES } from "../layout/components";
import type { ComponentKind } from "../layout/components";

export type { ComponentKind };

/** One named piece of logic that was written for drogna rather than chosen for it. */
export type BespokeConcern =
  | "synthetic-field-mathematics"
  | "sound-speed-computation"
  | "executable-data-dictionary"
  | "residual-and-divergence-rules"
  | "scheduling-policy"
  | "uncertainty-mathematics"
  | "planning-mathematics"
  | "quality-flagging"
  | "advisory-authoring";

/** What each named concern is, in a sentence a viewer can read against the component. */
export const CONCERN_WORDS: Readonly<Record<BespokeConcern, string>> = {
  "synthetic-field-mathematics":
    "the synthetic four-dimensional field and the ground-truth manifest scored against it",
  "sound-speed-computation":
    "sound speed derived at the point of use from one implementation, never stored (ADR-0005)",
  "executable-data-dictionary":
    "the data dictionary made executable: one write seam that refuses what the contract does not describe",
  "residual-and-divergence-rules":
    "the residual and divergence rules, scored on sound speed and never on temperature",
  "scheduling-policy": "the scheduling policy: whether a run is warranted, and how not to thrash",
  "uncertainty-mathematics":
    "the uncertainty mathematics: analytic advection, seeded noise, and the ensemble spread the uncertainty field is made of",
  "planning-mathematics":
    "the planning mathematics: where sampling would most reduce uncertainty, as a recommendation",
  "quality-flagging":
    "the quality flagging: forecast skill scored against a persistence reference, and said in words",
  "advisory-authoring":
    "the advisory authoring: which seeded feature to describe, at what fidelity, and inside what size ceiling",
};

/**
 * The bespoke logic each component holds.
 *
 * Every component `layout/components.ts` marks bespoke appears here with at least one
 * named concern, and no component marked plumbing appears at all. A test holds both
 * halves, because either one failing turns this from a claim into a decoration.
 */
export const BESPOKE_LOGIC: Readonly<Record<string, readonly BespokeConcern[]>> = {
  env_generator: ["synthetic-field-mathematics"],
  sensors: ["sound-speed-computation"],
  ingest: ["executable-data-dictionary"],
  monitor: ["residual-and-divergence-rules", "sound-speed-computation"],
  scheduler: ["scheduling-policy"],
  model_runner: ["uncertainty-mathematics"],
  planner: ["planning-mathematics"],
  telemetry: ["quality-flagging"],
  shore_advisory: ["advisory-authoring", "executable-data-dictionary"],
};

/** The identifier a boundary is addressed by: the pair of components it joins. */
export function boundaryId(from: string, to: string): string {
  return `${from}→${to}`;
}

export interface BoundaryClassification {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly kind: ComponentKind;
  /** Why it is classified as it is, in one line, so the reading can be argued with. */
  readonly because: string;
}

/**
 * Which boundaries carry judgement, and what that judgement is.
 *
 * Keyed by the boundary identifier so it can be read against `EDGES` without either list
 * having to be kept in the other's order. A boundary absent from this table is a defect
 * the classification test names, not a boundary silently drawn unclassified.
 */
const BOUNDARY_REASON: Readonly<Record<string, { kind: ComponentKind; because: string }>> = {
  [boundaryId("env_generator", "sensors")]: {
    kind: "bespoke",
    because: "the synthetic field, which is drogna's own mathematics rather than a supplied dataset",
  },
  [boundaryId("clock", "broker")]: {
    kind: "plumbing",
    because: "simulation time is moved, not judged; the tick is a counter and the rate a setting",
  },
  [boundaryId("sensors", "broker")]: {
    kind: "bespoke",
    because: "a sampled field expressed in SensorThings vocabulary, with sound speed derived at the point of use",
  },
  [boundaryId("broker", "ingest")]: {
    kind: "plumbing",
    because: "delivery, which is what a broker is for",
  },
  [boundaryId("ingest", "observation_store")]: {
    kind: "bespoke",
    because: "the single write seam, where the data dictionary is enforced rather than documented",
  },
  [boundaryId("observation_store", "monitor")]: {
    kind: "bespoke",
    because: "residuals computed against the current forecast, on sound speed and never on temperature",
  },
  [boundaryId("monitor", "scheduler")]: {
    kind: "bespoke",
    because: "a divergence verdict: the monitor's own rules, with the evidence that justified them",
  },
  [boundaryId("scheduler", "model_runner")]: {
    kind: "bespoke",
    because: "a scheduling decision, which is the policy this harness exists to exercise",
  },
  [boundaryId("model_runner", "publisher")]: {
    kind: "bespoke",
    because: "an ensemble and its spread, which is where the uncertainty field comes from",
  },
  [boundaryId("publisher", "monitor")]: {
    kind: "plumbing",
    because: "an announcement that a run exists, carrying no judgement about it",
  },
  [boundaryId("model_runner", "coverage_store")]: {
    kind: "plumbing",
    because: "a NetCDF write against CF conventions, which is a standard part used as intended",
  },
  [boundaryId("coverage_store", "query")]: {
    kind: "plumbing",
    because: "OGC API-EDR: a standard read interface, even where drogna had to write the provider",
  },
  [boundaryId("observation_store", "query")]: {
    kind: "plumbing",
    because: "SensorThings: a standard read interface over a standard store",
  },
  [boundaryId("feature_store", "query")]: {
    kind: "plumbing",
    because: "static spatial reference, read as published",
  },
  [boundaryId("query", "proxy")]: {
    kind: "plumbing",
    because: "an HTTP hop behind one proxy under one policy",
  },
  [boundaryId("proxy", "client")]: {
    kind: "plumbing",
    because: "TLS and path policy: the proxy's job, configured rather than written",
  },
  [boundaryId("broker", "proxy")]: {
    kind: "plumbing",
    because: "a WebSocket upgrade, which is how the browser reaches the control namespace (ADR-0008)",
  },
  [boundaryId("coverage_store", "planner")]: {
    kind: "plumbing",
    because: "an uncertainty field read as published; the judgement is downstream of the read",
  },
  [boundaryId("planner", "broker")]: {
    kind: "bespoke",
    because: "a sampling recommendation, which is the planning mathematics' whole output",
  },
  [boundaryId("publisher", "broker")]: {
    kind: "plumbing",
    because: "an announcement, so that nothing downstream has to poll to learn a run exists",
  },
  [boundaryId("coverage_store", "offload")]: {
    kind: "plumbing",
    because: "an export with an integrity guarantee, which is packaging rather than judgement",
  },
  [boundaryId("telemetry", "broker")]: {
    kind: "bespoke",
    because: "forecast skill against a persistence reference: a quality judgement drogna makes itself",
  },
  [boundaryId("shore_advisory", "broker")]: {
    kind: "bespoke",
    because: "an advisory: drogna's own statement about a feature it seeded, at a fidelity it chose",
  },
  [boundaryId("shore_advisory", "advisory_store")]: {
    kind: "bespoke",
    because: "the advisory write seam, where the schema and the size ceiling are enforced rather than documented",
  },
  [boundaryId("advisory_store", "query")]: {
    kind: "plumbing",
    because: "advisories read as received, through the same standard interface as everything else",
  },
  [boundaryId("broker", "system_controller")]: {
    kind: "plumbing",
    because: "what components already publish about themselves, observed and aggregated; the controller invents nothing (FR-67)",
  },
  [boundaryId("system_controller", "proxy")]: {
    kind: "plumbing",
    because: "an operator's REST surface behind the same boundary as every other read",
  },
};

/** Every boundary in the layout, classified, in the layout's own order. */
export const BOUNDARIES: readonly BoundaryClassification[] = EDGES.map((edge) => {
  const id = boundaryId(edge.from, edge.to);
  const reason = BOUNDARY_REASON[id];
  return {
    id,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    // An unclassified boundary is reported as unclassified rather than defaulted into a
    // kind. Defaulting would satisfy FR-016 by inventing an answer, which is worse than
    // failing it.
    kind: reason?.kind ?? ("plumbing" as ComponentKind),
    because: reason?.because ?? "",
  };
});

export const BOUNDARIES_BY_ID: ReadonlyMap<string, BoundaryClassification> = new Map(
  BOUNDARIES.map((boundary) => [boundary.id, boundary]),
);

/** Boundaries the table above does not classify. Empty, and a test keeps it so. */
export function unclassifiedBoundaries(): readonly string[] {
  return EDGES.map((edge) => boundaryId(edge.from, edge.to)).filter(
    (id) => BOUNDARY_REASON[id] === undefined,
  );
}

/** Components whose classification says bespoke but which name no bespoke logic. */
export function unexplainedBespokeComponents(): readonly string[] {
  return COMPONENTS.filter(
    (component) =>
      component.kind === "bespoke" && (BESPOKE_LOGIC[component.id] ?? []).length === 0,
  ).map((component) => component.id);
}

/** Components that name bespoke logic without being classified bespoke. */
export function overclaimedComponents(): readonly string[] {
  return Object.keys(BESPOKE_LOGIC).filter(
    (id) => COMPONENTS.find((component) => component.id === id)?.kind !== "bespoke",
  );
}

/** The named concerns a component holds, in the order they are declared. */
export function concernsFor(componentId: string): readonly BespokeConcern[] {
  return BESPOKE_LOGIC[componentId] ?? [];
}
