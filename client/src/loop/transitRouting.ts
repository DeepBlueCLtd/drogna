/**
 * Which boundary a control message crosses, and which turn of the cycle it marks.
 *
 * This is a static architectural fact recorded once: a topic, the component that
 * publishes it, and the boundary in the layout that crossing corresponds to. It places a
 * transit. It never claims a component exists, never lights one, and cannot be reached
 * from the liveness reducer (FR-003, Constitution VII). A message addressed to a
 * component nothing has been heard from draws a transit to a grey box, which is the
 * honest picture: somebody spoke *about* it, which is not the same as it speaking.
 *
 * Exactly one boundary per topic, so the count of transits equals the count of routable
 * messages received (SC-001). Where a message is genuinely read by several components —
 * `ctl/run-published` is read by the monitor, the planner and this page — the boundary
 * drawn is the leg of the cycle the message closes, because the cycle is what the picture
 * is for. The others are visible in the layout as edges and are not redrawn per message.
 *
 * `ctl/heartbeat` is deliberately unrouted. It is published by every component and
 * crosses no single boundary, and its job is illumination rather than transit: the shell
 * lights a box from it and the loop leaves it alone. Counting it as a transit would swamp
 * the four messages of a run with the cadence of eighteen components saying they are
 * alive, and would make SC-001's equality meaningless.
 */
// One line, deliberately: the literal-path gate reads a wrapped import's closing line as a bare string.
import { CLOCK_TOPIC, DIVERGENCE_TOPIC, PLAN_TOPIC, RUN_PUBLISHED_TOPIC, RUN_REQUEST_TOPIC, RUN_STARTED_TOPIC, TELEMETRY_TOPIC } from "../data/topics";
import { boundaryId } from "../legibility/classification";

/**
 * The turn of the loop a message marks.
 *
 * Four phases because SRD §2 draws four, and the four control messages of a run map onto
 * them one for one. `none` is not a fifth phase: it is the absence of any, which is what a
 * page shows before it has received anything.
 */
export type CyclePhase = "sense" | "decide" | "act" | "publish";

export const CYCLE_PHASES: readonly CyclePhase[] = ["sense", "decide", "act", "publish"];

/** What each phase means, so the picture does not depend on the reader knowing already. */
export const PHASE_WORDS: Readonly<Record<CyclePhase, string>> = {
  sense: "Sense — the monitor scored observations against the current forecast and found it disagreeing.",
  decide: "Decide — the scheduler judged a model run warranted and asked for one.",
  act: "Act — the model runner began the run it was asked for.",
  publish: "Publish — the completed run became visible in one indivisible step, and was announced.",
};

export interface TopicRoute {
  readonly topic: string;
  /** The component that publishes on this topic. A fact about the architecture. */
  readonly publisher: string;
  /** The components that read it. Recorded for the inspector, not to place the transit. */
  readonly consumers: readonly string[];
  /** The one boundary a transit is drawn on. */
  readonly boundary: string;
  /** The phase this message makes active, where it is one of a run's four. */
  readonly phase: CyclePhase | null;
}

const ROUTES: readonly TopicRoute[] = [
  {
    topic: DIVERGENCE_TOPIC,
    publisher: "monitor",
    consumers: ["scheduler"],
    boundary: boundaryId("monitor", "scheduler"),
    phase: "sense",
  },
  {
    topic: RUN_REQUEST_TOPIC,
    publisher: "scheduler",
    consumers: ["model_runner"],
    boundary: boundaryId("scheduler", "model_runner"),
    phase: "decide",
  },
  {
    topic: RUN_STARTED_TOPIC,
    publisher: "model_runner",
    consumers: ["publisher", "telemetry"],
    boundary: boundaryId("model_runner", "publisher"),
    phase: "act",
  },
  {
    topic: RUN_PUBLISHED_TOPIC,
    publisher: "publisher",
    consumers: ["monitor", "planner", "client"],
    boundary: boundaryId("publisher", "monitor"),
    phase: "publish",
  },
  {
    topic: PLAN_TOPIC,
    publisher: "planner",
    consumers: ["client"],
    boundary: boundaryId("planner", "broker"),
    phase: null,
  },
  {
    topic: TELEMETRY_TOPIC,
    publisher: "telemetry",
    consumers: ["client"],
    boundary: boundaryId("telemetry", "broker"),
    phase: null,
  },
  {
    topic: CLOCK_TOPIC,
    publisher: "clock",
    consumers: ["client"],
    boundary: boundaryId("clock", "broker"),
    phase: null,
  },
];

export const ROUTES_BY_TOPIC: ReadonlyMap<string, TopicRoute> = new Map(
  ROUTES.map((route) => [route.topic, route]),
);

/** Every topic that draws a transit. Heartbeats are not among them; see the header. */
export const ROUTABLE_TOPICS: readonly string[] = ROUTES.map((route) => route.topic);

/** Where a message on this topic crosses, or null if it draws no transit. */
export function routeFor(topic: string): TopicRoute | null {
  return ROUTES_BY_TOPIC.get(topic) ?? null;
}

/** The phase a message on this topic makes active, or null if it advances no cycle. */
export function phaseFor(topic: string): CyclePhase | null {
  return routeFor(topic)?.phase ?? null;
}
