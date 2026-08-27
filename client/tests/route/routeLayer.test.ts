/**
 * The route is four-dimensional, and the fourth dimension is the one that is easy to drop.
 *
 * FR-025. A route with horizontal position and depth is a line through a volume; a route
 * with horizontal position, depth and an arrival instant at each vertex is a curve through
 * a forecast, and only the second can be asked what conditions will be like when the
 * platform gets there. So the tests here hold the arrival instants as hard as they hold
 * the positions.
 */
import { describe, expect, it } from "vitest";

import { arrivalsIncrease, routeDisplay, routeLayerInputs } from "../../src/route/RouteLayer";

import { emptyRecommendation, samplingRecommendation } from "../control";

const ROUTE = routeDisplay(samplingRecommendation());

describe("the route as drawn", () => {
  it("carries horizontal position, depth and arrival instant at every vertex", () => {
    expect(ROUTE.vertices.length).toBeGreaterThan(1);
    for (const vertex of ROUTE.vertices) {
      expect(typeof vertex.latitude).toBe("number");
      expect(typeof vertex.longitude).toBe("number");
      expect(typeof vertex.depthM).toBe("number");
      expect(vertex.arrivalSimTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    }
  });

  it("keeps the vertices in the order the planner published them", () => {
    expect(ROUTE.vertices.map((vertex) => vertex.sequence)).toEqual([0, 1, 2, 3]);
  });

  it("has arrival instants that increase along it, as a curve in time must", () => {
    expect(arrivalsIncrease(ROUTE)).toBe(true);
  });

  it("reports a route whose instants do not increase, rather than reordering it", () => {
    const scrambled = {
      ...ROUTE,
      vertices: [ROUTE.vertices[1]!, ROUTE.vertices[0]!, ROUTE.vertices[2]!, ROUTE.vertices[3]!],
    };
    expect(arrivalsIncrease(scrambled)).toBe(false);
  });

  it("carries the planning resolution, so the granularity of the claim is visible", () => {
    expect(ROUTE.h3Resolution).toBe(10);
    for (const vertex of ROUTE.vertices) {
      expect(vertex.cell).toMatch(/^[0-9a-f]{15,16}$/);
    }
  });

  it("carries the collapse-aware value and what was considered against what was chosen", () => {
    expect(ROUTE.value).toBe(2.5);
    expect(ROUTE.candidateCellCount).toBe(64);
    expect(ROUTE.visitedCellCount).toBe(4);
  });
});

describe("the layer inputs", () => {
  const inputs = routeLayerInputs(ROUTE);

  it("gives the horizontal path longitude first, as a path layer reads it", () => {
    expect(inputs.path).toEqual(ROUTE.vertices.map((vertex) => [vertex.longitude, vertex.latitude]));
  });

  it("gives elevation as the third ordinate, turning the sign exactly once", () => {
    for (const vertex of ROUTE.vertices) {
      expect(inputs.getPosition(vertex)).toEqual([vertex.longitude, vertex.latitude, -vertex.depthM]);
    }
  });

  it("keeps the arrival instant reachable from the layer's own data", () => {
    for (const vertex of ROUTE.vertices) {
      expect(inputs.getArrival(vertex)).toBe(vertex.arrivalSimTime);
    }
  });

  it("states the depth span the route covers", () => {
    expect(inputs.depthRange).toEqual([20, 180]);
  });

  it("names the layer after the plan, so a replan replaces rather than accumulates", () => {
    expect(inputs.id).toContain(ROUTE.planId);
  });

  it("is deterministic: the same plan gives the same inputs", () => {
    expect(routeLayerInputs(routeDisplay(samplingRecommendation())).path).toEqual(inputs.path);
  });
});

describe("an empty route", () => {
  const empty = routeDisplay(emptyRecommendation());

  it("has no vertices and says why, rather than a placeholder line", () => {
    expect(empty.vertices).toEqual([]);
    expect(empty.emptyReason).toBe("budget-too-small");
  });

  it("draws no path at all", () => {
    const inputs = routeLayerInputs(empty);
    expect(inputs.path).toEqual([]);
    expect(inputs.depthRange).toEqual([0, 0]);
  });

  it("is trivially in increasing time order, which is not a claim about anything", () => {
    expect(arrivalsIncrease(empty)).toBe(true);
  });
});
