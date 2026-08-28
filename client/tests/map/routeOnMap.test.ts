/**
 * The planner's route, as layer objects on the map's own surface.
 *
 * Feature 012 T038 built and tested everything about the route except the thing that draws
 * it: "no Deck.gl layer object is constructed, and no map surface renders one yet". This is
 * that object, and what is asserted here is the join — that the layers carry exactly the
 * vertices `routeLayerInputs` produced, in the order the planner published them, and that
 * an empty recommendation produces no path rather than a line between two points.
 *
 * The layers are constructed under Node, without a WebGL context, because a Deck.gl layer
 * is its properties until something draws it. What cannot be asserted here is rasterisation,
 * and nothing here claims anything about pixels.
 */
import { describe, expect, it } from "vitest";

import { routeDisplay, routeLayerInputs } from "../../src/route/RouteLayer";
import { INK } from "../../src/map/shading";
import { routeLayers } from "../../src/map/layers";
import { layerProp } from "./layerProps";

import type { RouteVertex } from "../../src/route/RouteLayer";

import { emptyRecommendation, samplingRecommendation } from "../control";

const ROUTE = routeLayerInputs(routeDisplay(samplingRecommendation()));

function layersFor(declined: ReadonlySet<number> = new Set(), selected: number | null = null) {
  return routeLayers({ route: ROUTE, declined, selected });
}

describe("the route drawn on the map", () => {
  it("is a path and its vertices, which answer two different questions", () => {
    const [path, vertices] = layersFor();
    expect(path?.id).toBe(`${ROUTE.id}-path`);
    expect(vertices?.id).toBe(`${ROUTE.id}-vertices`);
  });

  it("has one vertex per published waypoint, in the sequence the planner published", () => {
    const [, vertices] = layersFor();
    const data = layerProp<RouteVertex[]>(vertices, "data");
    expect(data).toHaveLength(ROUTE.data.length);
    expect(data.map((vertex) => vertex.sequence)).toEqual(ROUTE.data.map((v) => v.sequence));
    expect(data.map((vertex) => vertex.sequence)).toEqual([0, 1, 2, 3]);
  });

  it("draws the path through the same positions the planner published, longitude first", () => {
    const [path] = layersFor();
    const drawn = layerProp<{ path: number[][] }[]>(path, "data")[0]?.path;
    expect(drawn).toEqual(ROUTE.data.map((vertex) => [vertex.longitude, vertex.latitude]));
  });

  it("draws nothing at all for a recommendation the planner left empty", () => {
    const empty = routeLayerInputs(routeDisplay(emptyRecommendation()));
    expect(routeLayers({ route: empty, declined: new Set(), selected: null })).toEqual([]);
  });

  it("marks the selected vertex by size, which is not a colour", () => {
    const [, vertices] = layersFor(new Set(), 2);
    const radius = layerProp<(vertex: RouteVertex) => number>(vertices, "getRadius");
    const data = layerProp<RouteVertex[]>(vertices, "data");
    expect(radius(data[2] as RouteVertex)).toBeGreaterThan(radius(data[0] as RouteVertex));
  });

  it("keeps the layer identifier derived from the plan, so a replay draws the same layers", () => {
    const again = routeLayerInputs(routeDisplay(samplingRecommendation()));
    expect(routeLayers({ route: again, declined: new Set(), selected: null })[0]?.id).toBe(
      layersFor()[0]?.id,
    );
    expect(ROUTE.id).toContain("route-");
  });

  it("draws the route in ink rather than in a colour", () => {
    const [path] = layersFor();
    const [red, green, blue] = layerProp<number[]>(path, "getColor");
    expect(red).toBe(green);
    expect(green).toBe(blue);
    expect(layerProp<number[]>(path, "getColor")).toEqual([...INK.route]);
  });
});
