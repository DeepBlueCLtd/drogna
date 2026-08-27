/**
 * The recommended route as a curve through the forecast volume.
 *
 * FR-025 asks for four dimensions and means it: a horizontal path, a depth at each
 * vertex, and the simulation instant the platform would arrive there. Drop the fourth and
 * the route becomes a line on a chart, which is the thing FR-047 exists to be more than —
 * the arrival instants are what make the conditions shown at each point the conditions
 * forecast for the moment of arrival rather than the conditions now.
 *
 * The display model here is the client's own vocabulary, adapted from the planner's
 * published recommendation. It is not a second declaration of that contract: the shape
 * that crosses the boundary is `DrognaSamplingRecommendation`, imported from the
 * generated types, and this is what the map needs of it (Constitution III).
 *
 * The vertical convention is stated because a sign error in it is invisible in a picture
 * and entirely plausible in a plot. The planner publishes `depth_m`, positive downwards.
 * WKT Z is elevation, positive up. The conversion happens once, in `trajectoryQuery`, and
 * this module keeps depth as the planner spelt it.
 *
 * Nothing here is a control. A route is drawn and labelled; the interface offers no way to
 * accept, task, execute or order it (FR-028, Constitution VIII).
 */
import type { DrognaSamplingRecommendation } from "../generated/messages/plan";

export interface RouteVertex {
  readonly sequence: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Metres below the surface, positive downwards, as the planner published it. */
  readonly depthM: number;
  /** The simulation instant the platform would reach this vertex. */
  readonly arrivalSimTime: string;
  /** The H3 cell the planner chose, at the resolution the recommendation states. */
  readonly cell: string;
  /** What this vertex adds to the route's value once earlier visits have collapsed it. */
  readonly marginalValue: number;
}

export interface RouteDisplay {
  readonly planId: string;
  /** The plan this one replaces, or null for the first of a scenario. */
  readonly supersedes: string | null;
  readonly vertices: readonly RouteVertex[];
  /** Why the route is empty, or null when it is not. */
  readonly emptyReason: DrognaSamplingRecommendation["empty_reason"];
  readonly state: DrognaSamplingRecommendation["state"];
  /** The H3 resolution every cell on the route belongs to. */
  readonly h3Resolution: number;
  /** The collapse-aware value of the whole route, as the planner computed it. */
  readonly value: number;
  readonly budgetSeconds: number;
  readonly consumedSeconds: number;
  readonly distanceM: number;
  /** How many cells were considered, and how many chosen. */
  readonly candidateCellCount: number;
  readonly visitedCellCount: number;
}

/** Adapt a published recommendation into what the map draws. Pure. */
export function routeDisplay(plan: DrognaSamplingRecommendation): RouteDisplay {
  return {
    planId: plan.plan_id,
    supersedes: plan.supersedes,
    vertices: plan.route.vertices.map((vertex) => ({
      sequence: vertex.sequence,
      latitude: vertex.latitude,
      longitude: vertex.longitude,
      depthM: vertex.depth_m,
      arrivalSimTime: vertex.arrival_sim_time,
      cell: vertex.h3_index,
      marginalValue: vertex.marginal_value,
    })),
    emptyReason: plan.empty_reason,
    state: plan.state,
    h3Resolution: plan.indexing.h3_resolution,
    value: plan.route.value,
    budgetSeconds: plan.route.budget_seconds,
    consumedSeconds: plan.route.consumed_seconds,
    distanceM: plan.route.distance_m,
    candidateCellCount: plan.selection.candidate_cell_count,
    visitedCellCount: plan.selection.visited_cell_count,
  };
}

/** The inputs a Deck.gl path layer needs, plus the depth and time each vertex carries. */
export interface RouteLayerInputs {
  readonly id: string;
  /** The horizontal path, longitude first, as a path layer reads it. */
  readonly path: readonly (readonly [number, number])[];
  /** One entry per vertex, for the layer that draws depth and the control that reads time. */
  readonly data: readonly RouteVertex[];
  readonly getPosition: (vertex: RouteVertex) => readonly [number, number, number];
  readonly getArrival: (vertex: RouteVertex) => string;
  /** The shallowest and deepest points, so a vertical section states its own span. */
  readonly depthRange: readonly [number, number];
}

/**
 * Layer inputs for a route.
 *
 * `getPosition` returns elevation as the third ordinate, because that is what a map layer
 * expects and because putting the conversion here rather than in the caller means there is
 * one place where depth becomes elevation on the drawing side, as there is one place where
 * it happens on the query side.
 */
export function routeLayerInputs(route: RouteDisplay): RouteLayerInputs {
  let shallowest = Number.POSITIVE_INFINITY;
  let deepest = Number.NEGATIVE_INFINITY;
  for (const vertex of route.vertices) {
    shallowest = Math.min(shallowest, vertex.depthM);
    deepest = Math.max(deepest, vertex.depthM);
  }
  const empty = route.vertices.length === 0;
  return {
    id: `route-${route.planId}`,
    path: route.vertices.map((vertex) => [vertex.longitude, vertex.latitude] as const),
    data: route.vertices,
    getPosition: (vertex) => [vertex.longitude, vertex.latitude, -vertex.depthM],
    getArrival: (vertex) => vertex.arrivalSimTime,
    depthRange: empty ? [0, 0] : [shallowest, deepest],
  };
}

/** Whether the route's arrival instants increase along it, which a curve in time must. */
export function arrivalsIncrease(route: RouteDisplay): boolean {
  for (let index = 1; index < route.vertices.length; index += 1) {
    const previous = route.vertices[index - 1];
    const current = route.vertices[index];
    if (previous === undefined || current === undefined) {
      return false;
    }
    if (current.arrivalSimTime <= previous.arrivalSimTime) {
      return false;
    }
  }
  return true;
}
