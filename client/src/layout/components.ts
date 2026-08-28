/**
 * The layout map: a drawing of the intended architecture.
 *
 * This module determines what is *drawn*. It never determines what is *lit*. Nothing
 * here asserts that any of these components exists, is running, or ever will run; a node
 * is lit because a heartbeat from it arrived inside its window, and for no other reason
 * (Constitution VII). Adding a node here adds a grey box to a diagram and nothing else,
 * which is why the diagram carries a label saying so in words.
 *
 * The components are the SRD's component table, C-01 to C-21, and the arrangement is the
 * SRD's own organising picture: a flow chart with a loop in it. The loop — monitor,
 * scheduler, model runner, publisher, and back to the monitor — is the architecture's
 * interesting property, and a structural diagram that flattened it into a row of boxes
 * would hide the one thing worth showing.
 *
 * The count is not written down twice. `layout.test.tsx` reads the identifiers out of
 * `harness-srd.md` and fails when the table and this file disagree in either direction,
 * because a number typed into a test is satisfied by the wrong twenty as readily as by
 * the right ones. C-19 and C-20 arrived with the SRD's v0.4 scope amendment and nothing
 * implements them: they are drawn dark, like anything else nobody has heard from. C-21
 * arrived the same way, from feature 021's own amendment, and the correspondence test is
 * what noticed the SRD had gained a component the drawing had not.
 *
 * `kind` records SRD §2.2's distinction. Bespoke means the component holds logic written
 * for drogna that could not be had off the shelf: the divergence rules, the scheduling
 * policy, the sound speed and uncertainty mathematics, the quality flagging, the data
 * dictionary made executable. Plumbing means a well-chosen standard part — broker,
 * stores, query layer, proxy — or the scaffolding around them. The distinction is drawn
 * so that a reader can see how little of this system is actually novel.
 */

export type ComponentKind = "bespoke" | "plumbing";

export interface ComponentNode {
  /** The component id a heartbeat must carry to light this node. */
  readonly id: string;
  /** The SRD's identifier, so a reader can find the row in the component table. */
  readonly reference: string;
  readonly name: string;
  readonly responsibility: string;
  readonly kind: ComponentKind;
  /** Position in the flow, as a grid cell. The diagram turns these into coordinates. */
  readonly column: number;
  readonly row: number;
}

export interface ComponentEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  /** Whether this edge is part of the sense, decide, act, publish cycle. */
  readonly loop?: boolean;
  /** Perpendicular offset, for an edge that would otherwise cross a box. */
  readonly bow?: number;
}

/** The client's own id. It cannot hear itself over the broker, and does not pretend to. */
export const CLIENT_COMPONENT_ID = "client";

export const COMPONENTS: readonly ComponentNode[] = [
  {
    id: "env_generator",
    reference: "C-02",
    name: "Environment generator",
    responsibility: "Synthetic four-dimensional fields and a ground-truth manifest",
    kind: "bespoke",
    column: 0,
    row: 0,
  },
  {
    id: "clock",
    reference: "C-01",
    name: "Simulation clock",
    responsibility: "The single source of time, rate-controllable",
    kind: "plumbing",
    column: 0,
    row: 1,
  },
  {
    id: "client",
    reference: "C-18",
    name: "Browser client",
    responsibility: "This page: the component shell, and later the map surfaces",
    kind: "plumbing",
    column: 0,
    row: 2,
  },
  {
    id: "telemetry",
    reference: "C-16",
    name: "Telemetry",
    responsibility: "Health indicators and forecast skill against a persistence reference",
    kind: "bespoke",
    column: 0,
    row: 3,
  },
  {
    id: "sensors",
    reference: "C-04",
    name: "Simulated sensors",
    responsibility: "Sample the synthetic field and publish in SensorThings vocabulary",
    kind: "bespoke",
    column: 1,
    row: 0,
  },
  {
    id: "broker",
    reference: "C-03",
    name: "Broker",
    responsibility: "Pub/sub transport, with obs/ and ctl/ namespaced apart",
    kind: "plumbing",
    column: 1,
    row: 1,
  },
  {
    id: "proxy",
    reference: "C-10",
    name: "Reverse proxy",
    responsibility: "TLS, authentication, path policy, and the WebSocket upgrade",
    kind: "plumbing",
    column: 1,
    row: 2,
  },
  {
    id: "feature_store",
    reference: "C-07",
    name: "Feature store",
    responsibility: "Static spatial reference: bathymetry and coastlines",
    kind: "plumbing",
    column: 1,
    row: 3,
  },
  {
    id: "ingest",
    reference: "C-05",
    name: "Ingest client",
    responsibility: "The single write seam: the data dictionary made executable",
    kind: "bespoke",
    column: 2,
    row: 0,
  },
  {
    id: "observation_store",
    reference: "C-06",
    name: "Observation store",
    responsibility: "Point observations, in Postgres with PostGIS",
    kind: "plumbing",
    column: 2,
    row: 1,
  },
  {
    id: "query_layer",
    reference: "C-09",
    name: "Query layer",
    responsibility: "pygeoapi: SensorThings and OGC API-EDR read access",
    kind: "plumbing",
    column: 2,
    row: 2,
  },
  {
    id: "planner",
    reference: "C-15",
    name: "Planner",
    responsibility: "Where sampling would most reduce uncertainty. Recommends; never commands",
    kind: "bespoke",
    column: 2,
    row: 3,
  },
  {
    id: "monitor",
    reference: "C-11",
    name: "Monitor",
    responsibility: "Residual and divergence rules against the current forecast",
    kind: "bespoke",
    column: 3,
    row: 0,
  },
  {
    id: "publisher",
    reference: "C-14",
    name: "Publisher",
    responsibility: "Make a completed run visible atomically, and announce it",
    kind: "plumbing",
    column: 3,
    row: 1,
  },
  {
    id: "coverage_store",
    reference: "C-08",
    name: "Coverage store",
    responsibility: "Gridded forecast and uncertainty fields, NetCDF with CF conventions",
    kind: "plumbing",
    column: 3,
    row: 2,
  },
  {
    id: "offload",
    reference: "C-17",
    name: "Offload packager",
    responsibility: "Export with an integrity guarantee, and no provenance leakage",
    kind: "plumbing",
    column: 3,
    row: 3,
  },
  {
    id: "scheduler",
    reference: "C-12",
    name: "Scheduler",
    responsibility: "Whether a model run is warranted, without thrashing",
    kind: "bespoke",
    column: 4,
    row: 0,
  },
  {
    id: "model_runner",
    reference: "C-13",
    name: "Model runner",
    responsibility: "Analytic advection, seeded noise, ensemble spread",
    kind: "bespoke",
    column: 4,
    row: 1,
  },
  {
    id: "shore_advisory",
    reference: "C-19",
    name: "Shore advisory source",
    responsibility: "A shore role the harness plays for itself: authors advisories, and the seam that admits them",
    kind: "bespoke",
    column: 4,
    row: 2,
  },
  {
    id: "advisory_store",
    reference: "C-20",
    name: "Advisory store",
    responsibility: "Advisories as received, appended and never revised, in Postgres beside the other two schemas",
    kind: "plumbing",
    column: 4,
    row: 3,
  },
  {
    id: "system_controller",
    reference: "C-21",
    name: "System controller",
    responsibility: "What components said about themselves, aggregated and served to an operator; commands dispatched, never invented",
    kind: "plumbing",
    column: 0,
    row: 4,
  },
];

/**
 * The flow, including the cycle.
 *
 * The four edges marked `loop` close on themselves: monitor to scheduler to model runner
 * to publisher and back to the monitor. That closure is the picture the SRD asks for, and
 * a test asserts it stays closed rather than leaving it to the eye.
 */
export const EDGES: readonly ComponentEdge[] = [
  { from: "env_generator", to: "sensors", label: "ground truth" },
  { from: "clock", to: "broker", label: "ctl/clock" },
  { from: "sensors", to: "broker", label: "obs/" },
  { from: "broker", to: "ingest", label: "obs/" },
  { from: "ingest", to: "observation_store", label: "batch write" },
  { from: "observation_store", to: "monitor", label: "residuals" },
  { from: "monitor", to: "scheduler", label: "divergence", loop: true },
  { from: "scheduler", to: "model_runner", label: "run request", loop: true },
  { from: "model_runner", to: "publisher", label: "ensemble", loop: true },
  { from: "publisher", to: "monitor", label: "run published", loop: true },
  { from: "model_runner", to: "coverage_store", label: "fields" },
  { from: "coverage_store", to: "query_layer", label: "EDR" },
  { from: "observation_store", to: "query_layer", label: "SensorThings" },
  { from: "feature_store", to: "query_layer", label: "reference" },
  { from: "query_layer", to: "proxy", label: "read" },
  { from: "proxy", to: "client", label: "TLS, path policy" },
  { from: "broker", to: "proxy", label: "WebSocket upgrade" },
  { from: "coverage_store", to: "planner", label: "uncertainty", bow: 26 },
  { from: "planner", to: "broker", label: "ctl/plan", bow: -70 },
  { from: "publisher", to: "broker", label: "ctl/run-published", bow: -64 },
  { from: "coverage_store", to: "offload", label: "export" },
  { from: "telemetry", to: "broker", label: "ctl/telemetry", bow: 80 },
  // The advisory arrives from outside the loop and joins the fabric, which is why its
  // source sits apart from the cycle and reaches the broker by the long way round.
  { from: "shore_advisory", to: "broker", label: "ctl/advisory", bow: -40 },
  { from: "shore_advisory", to: "advisory_store", label: "validated, appended" },
  { from: "advisory_store", to: "query_layer", label: "advisories", bow: -40 },
  { from: "broker", to: "system_controller", label: "ctl/, observed" },
  { from: "system_controller", to: "proxy", label: "operator REST", bow: -30 },
];

/** The layout, by id, for the view model to join against what has been heard. */
export const COMPONENTS_BY_ID: ReadonlyMap<string, ComponentNode> = new Map(
  COMPONENTS.map((component) => [component.id, component]),
);

/** What the legend says the two kinds mean, in words rather than by colour alone. */
export const KIND_LEGEND: Readonly<Record<ComponentKind, string>> = {
  bespoke:
    "Bespoke: logic written for drogna — divergence rules, scheduling policy, sound speed and uncertainty mathematics, quality flagging, the data dictionary made executable (SRD 2.2).",
  plumbing:
    "Plumbing: well-chosen standard parts and the scaffolding around them — broker, stores, query layer, proxy. Chosen, not invented.",
};
