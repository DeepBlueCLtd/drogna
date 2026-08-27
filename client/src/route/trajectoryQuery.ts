/**
 * The EDR trajectory query: every vertex asked for its own arrival time.
 *
 * This is the module FR-026 lives in, and the requirement is easy to state and easy to get
 * wrong in a way nothing on the screen would show. A route rendered against the current
 * forecast field looks exactly like a route rendered against the field at each vertex's
 * arrival — same curve, same colours, plausible numbers — and it answers a different
 * question. "What will it be like there when we get there" is the question the trajectory
 * query exists for; "what is it like there now" is the question a careless implementation
 * answers instead.
 *
 * So the per-vertex time is carried explicitly, in the one place the standard puts it: the
 * **M ordinate** of a WKT `LINESTRING ZM` in the `coords` parameter (SRD FR-20). One
 * distinct M per vertex, taken from the planner's published arrival instant. A request
 * whose M ordinates were all equal would be the bug, and `arrivalConditions.test.ts`
 * asserts they are not.
 *
 * Two conventions must match feature 008's provider exactly, because a disagreement
 * between the two ends produces a plausible wrong answer rather than an error:
 *
 * - **M is seconds since the Unix epoch.** The provider records this as
 *   `VERTEX_TIME_ENCODING` and says in as many words that the client and the provider must
 *   agree either way.
 * - **WKT Z is elevation, positive up**, while the planner publishes depth, positive down.
 *   The conversion happens here, once, and the response's own `z` comes back as depth.
 *
 * Nothing in this module reads a clock of any kind. Every instant it sends is one the
 * planner published, which is what keeps ADR-0007's third rule intact through the one part
 * of this feature that talks to the network.
 */
import { microsFromIso } from "../controls/simInstant";

import type { RouteVertex } from "./RouteLayer";

const MICROS_PER_SECOND = 1_000_000;

/** What the M ordinate means, agreed with `query/plugins/edr_trajectory.py`. */
export const VERTEX_TIME_ENCODING = "seconds since 1970-01-01T00:00:00Z";

/** One vertex's conditions, as the trajectory response gave them. */
export interface ArrivalConditions {
  readonly sequence: number;
  /** The instant the response answered for. Compared against the vertex's own arrival. */
  readonly forSimTime: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Depth in metres, positive downwards, as the response reports its vertical axis. */
  readonly depthM: number;
  /** Parameter name to value. Null where the response declined to answer. */
  readonly values: Readonly<Record<string, number | null>>;
  /** True where the vertex fell outside the forecast's extent. */
  readonly declined: boolean;
  /** Why, where it was declined. Null otherwise. */
  readonly declinedReason: string | null;
}

export interface TrajectoryResult {
  readonly conditions: readonly ArrivalConditions[];
  /** The parameters the response carried, in the order it declared them. */
  readonly parameters: readonly string[];
}

export type TrajectoryFailure = { readonly ok: false; readonly reason: string };
export type TrajectoryOutcome = ({ readonly ok: true } & TrajectoryResult) | TrajectoryFailure;

function epochSeconds(simTime: string): number | null {
  const micros = microsFromIso(simTime);
  return micros === null ? null : micros / MICROS_PER_SECOND;
}

/**
 * The `coords` value for a route: one vertex, one position, one distinct arrival time.
 *
 * Returns null rather than a route with a missing time, because a `LINESTRING ZM` with a
 * gap in M is exactly the input the provider is written to refuse, and sending it would
 * turn a client defect into a server error report.
 */
export function trajectoryCoords(vertices: readonly RouteVertex[]): string | null {
  if (vertices.length < 2) {
    return null;
  }
  const points: string[] = [];
  for (const vertex of vertices) {
    const seconds = epochSeconds(vertex.arrivalSimTime);
    if (seconds === null) {
      return null;
    }
    // Z is elevation and the planner published depth, so the sign turns here and nowhere
    // else. M is the vertex's own arrival instant, never the instant of asking.
    points.push(`${vertex.longitude} ${vertex.latitude} ${-vertex.depthM} ${seconds}`);
  }
  return `LINESTRING ZM (${points.join(", ")})`;
}

export interface TrajectoryRequest {
  readonly url: string;
  readonly coords: string;
}

/**
 * Where to ask, and what to ask.
 *
 * The base path arrives from runtime configuration and is never written here
 * (Constitution IV, FR-031). What this module owns is the shape of the question.
 */
export function trajectoryRequest(
  collectionUrl: string,
  vertices: readonly RouteVertex[],
  parameters: readonly string[],
): TrajectoryRequest | null {
  const coords = trajectoryCoords(vertices);
  if (coords === null) {
    return null;
  }
  // Assembled by hand rather than with the browser's search-parameter class, whose name
  // feature 003's standing scan of this source forbids outright: a client that can read
  // its own address bar can be told what to display by a link, which is Constitution
  // VII's failure arriving by another door. This builds an outgoing query and is not
  // that, and the way to say so is to not reach for the name at all rather than to
  // weaken a scan that is deliberately blunt.
  const query = [`coords=${encodeURIComponent(coords)}`];
  if (parameters.length > 0) {
    query.push(`parameter-name=${encodeURIComponent(parameters.join(","))}`);
  }
  return { url: `${collectionUrl}?${query.join("&")}`, coords };
}

interface CompositeAxis {
  readonly coordinates?: unknown;
  readonly values?: unknown;
}

function readComposite(document: Record<string, unknown>): readonly unknown[][] | null {
  const domain = document["domain"] as Record<string, unknown> | undefined;
  const axes = domain?.["axes"] as Record<string, unknown> | undefined;
  const composite = axes?.["composite"] as CompositeAxis | undefined;
  const values = composite?.values;
  if (!Array.isArray(values)) {
    return null;
  }
  return values.filter((row): row is unknown[] => Array.isArray(row));
}

function readRanges(document: Record<string, unknown>): Map<string, readonly unknown[]> {
  const ranges = (document["ranges"] as Record<string, unknown> | undefined) ?? {};
  const found = new Map<string, readonly unknown[]>();
  for (const [name, block] of Object.entries(ranges)) {
    const values = (block as Record<string, unknown> | undefined)?.["values"];
    if (Array.isArray(values)) {
      found.set(name, values);
    }
  }
  return found;
}

function readDeclined(document: Record<string, unknown>): Map<number, string> {
  const declined = document["drogna:declined"];
  const found = new Map<number, string>();
  if (!Array.isArray(declined)) {
    return found;
  }
  for (const entry of declined) {
    const record = entry as Record<string, unknown>;
    const index = record["vertex"];
    if (typeof index === "number") {
      found.set(index, typeof record["reason"] === "string" ? record["reason"] : "declined");
    }
  }
  return found;
}

/**
 * Read a CoverageJSON Trajectory response into one row per vertex.
 *
 * The composite axis carries `(t, x, y, z)` per vertex in the order asked for, so the
 * response's own instants come back with the values rather than being assumed. That is
 * what lets the arrival-time test compare what the display shows against what the
 * response answered *for that vertex's timestamp*, instead of trusting the ordering.
 */
export function readTrajectory(document: unknown): TrajectoryOutcome {
  if (typeof document !== "object" || document === null) {
    return { ok: false, reason: "the trajectory response was not an object." };
  }
  const record = document as Record<string, unknown>;
  const composite = readComposite(record);
  if (composite === null) {
    return {
      ok: false,
      reason: "the trajectory response carried no composite axis, so there is nothing to place on the route.",
    };
  }
  const ranges = readRanges(record);
  const declined = readDeclined(record);
  const parameters = [...ranges.keys()];
  const conditions = composite.map((row, sequence) => {
    const values: Record<string, number | null> = {};
    for (const [name, series] of ranges) {
      const value = series[sequence];
      values[name] = typeof value === "number" ? value : null;
    }
    const reason = declined.get(sequence) ?? null;
    return {
      sequence,
      forSimTime: typeof row[0] === "string" ? row[0] : "",
      longitude: typeof row[1] === "number" ? row[1] : Number.NaN,
      latitude: typeof row[2] === "number" ? row[2] : Number.NaN,
      depthM: typeof row[3] === "number" ? row[3] : Number.NaN,
      values,
      declined: reason !== null,
      declinedReason: reason,
    };
  });
  return { ok: true, conditions, parameters };
}

/**
 * The conditions for one vertex, only if the response answered for that vertex's arrival.
 *
 * The comparison is the point. A response that answered every vertex at one instant — the
 * failure mode that follows from losing the M ordinate, and which the provider's own
 * docstring says produces HTTP 200 and reasonable-looking values — is refused here rather
 * than drawn, because a route showing the conditions now while claiming to show the
 * conditions at arrival is worse than a route showing nothing.
 */
export function conditionsAtArrival(
  result: TrajectoryResult,
  vertex: RouteVertex,
): ArrivalConditions | null {
  const answered = result.conditions[vertex.sequence];
  if (answered === undefined) {
    return null;
  }
  const asked = microsFromIso(vertex.arrivalSimTime);
  const given = microsFromIso(answered.forSimTime);
  if (asked === null || given === null || asked !== given) {
    return null;
  }
  return answered;
}

/** Why a vertex has nothing to show, in a sentence a viewer reads. */
export function noConditionsWords(vertex: RouteVertex, answered: ArrivalConditions | null): string {
  if (answered === null) {
    return (
      `There is no forecast for ${vertex.arrivalSimTime}, the moment of arrival at vertex ` +
      `${vertex.sequence}. The nearest available field is not shown in its place: it describes a ` +
      `different moment, and showing it would answer a question nobody asked.`
    );
  }
  return (
    `The forecast declined vertex ${vertex.sequence} at ${vertex.arrivalSimTime}: ` +
    `${answered.declinedReason ?? "outside the forecast's extent"}. Nothing is extrapolated.`
  );
}
