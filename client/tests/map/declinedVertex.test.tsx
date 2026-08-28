/**
 * A vertex the forecast declined is drawn as declined, and never quietly left out.
 *
 * FR-004 and 012's FR-027 are the same rule seen from two sides: the arrival panel says
 * there is no forecast for that moment, and the map must not respond to the same fact by
 * drawing three waypoints where the planner published four. A silently missing waypoint
 * reads as a route the planner did not recommend, which is a claim about the planner that
 * nothing supports.
 *
 * The marking has to survive greyscale (FR-005), so it is filled against hollow rather than
 * one colour against another — and both marks are achromatic, so there is no colour for the
 * distinction to have been carried by in the first place. That is asserted on the channels
 * rather than trusted.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapSurface, NO_FIELD } from "../../src/map/MapSurface";
import { chooseExtent, extentFromDeclaration } from "../../src/map/extent";
import { routeLayers } from "../../src/map/layers";
import { layerProp } from "./layerProps";
import { routeDisplay, routeLayerInputs } from "../../src/route/RouteLayer";
import { readTrajectory } from "../../src/route/trajectoryQuery";

import type { RouteVertex } from "../../src/route/RouteLayer";
import type { TrajectoryResult } from "../../src/route/trajectoryQuery";

import { DECLARED_MAP } from "../runtimeConfig";
import { samplingRecommendation } from "../control";

const DISPLAY = routeDisplay(samplingRecommendation());
const ROUTE = routeLayerInputs(DISPLAY);
const LAST = DISPLAY.vertices.length - 1;
const REASON = "beyond the forecast's valid time";

/** A trajectory response of the shape the query layer builds, with its last vertex declined. */
function withLastDeclined(): TrajectoryResult {
  const rows = DISPLAY.vertices.map((vertex) => [
    vertex.arrivalSimTime,
    vertex.longitude,
    vertex.latitude,
    vertex.depthM,
  ]);
  const outcome = readTrajectory({
    type: "Coverage",
    domain: {
      domainType: "Trajectory",
      axes: { composite: { dataType: "tuple", coordinates: ["t", "x", "y", "z"], values: rows } },
    },
    ranges: {
      sea_water_temperature: {
        axisNames: ["composite"],
        values: DISPLAY.vertices.map((_unused, sequence) => (sequence === LAST ? null : 20 + sequence)),
      },
    },
    "drogna:declined": [{ vertex: LAST, reason: REASON }],
  });
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome;
}

const CONDITIONS = withLastDeclined();
const DECLINED = new Set(
  CONDITIONS.conditions.filter((entry) => entry.declined).map((entry) => entry.sequence),
);

describe("the declined vertex on the map", () => {
  it("is still drawn: the route keeps one mark per published waypoint", () => {
    const [, vertices] = routeLayers({ route: ROUTE, declined: DECLINED, selected: null });
    const data = layerProp<RouteVertex[]>(vertices, "data");
    expect(DECLINED.has(LAST)).toBe(true);
    expect(data).toHaveLength(DISPLAY.vertices.length);
    expect(data.map((vertex) => vertex.sequence)).toContain(LAST);
  });

  it("is filled differently from an answered vertex, and both are achromatic", () => {
    const [, vertices] = routeLayers({ route: ROUTE, declined: DECLINED, selected: null });
    const fill = layerProp<(vertex: RouteVertex) => number[]>(vertices, "getFillColor");
    const data = layerProp<RouteVertex[]>(vertices, "data");
    const answered = fill(data[0] as RouteVertex);
    const refused = fill(data[LAST] as RouteVertex);
    expect(refused).not.toEqual(answered);
    for (const shade of [answered, refused]) {
      expect(shade[0]).toBe(shade[1]);
      expect(shade[1]).toBe(shade[2]);
    }
  });

  it("is outlined more heavily as well, so the mark differs in two ways", () => {
    const [, vertices] = routeLayers({ route: ROUTE, declined: DECLINED, selected: null });
    const width = layerProp<(vertex: RouteVertex) => number>(vertices, "getLineWidth");
    const data = layerProp<RouteVertex[]>(vertices, "data");
    expect(width(data[LAST] as RouteVertex)).toBeGreaterThan(width(data[0] as RouteVertex));
  });

  it("draws every vertex as answered where the response declined none", () => {
    const [, vertices] = routeLayers({ route: ROUTE, declined: new Set(), selected: null });
    const fill = layerProp<(vertex: RouteVertex) => number[]>(vertices, "getFillColor");
    const data = layerProp<RouteVertex[]>(vertices, "data");
    expect(fill(data[LAST] as RouteVertex)).toEqual(fill(data[0] as RouteVertex));
  });
});

describe("the map region with a route on it", () => {
  const markup = renderToStaticMarkup(
    <MapSurface
      extent={chooseExtent(null, extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical))}
      field={NO_FIELD}
      route={DISPLAY}
      conditions={CONDITIONS}
      selectedVertex={0}
      onSelectVertex={() => undefined}
    />,
  );

  it("says how many vertices are drawn, one per published waypoint", () => {
    expect(markup).toContain(`drawn with ${DISPLAY.vertices.length} vertices`);
    expect(markup).toContain(`data-map-plan="${DISPLAY.planId}"`);
  });

  it("says it is a recommendation, and offers nothing that would make it more", () => {
    expect(markup).toContain("It is a recommendation");
    expect(markup).not.toMatch(/\baccept(s|ed|ing)?\b/i);
    expect(markup).not.toMatch(/\bexecut(e|es|ed|ing|ion)\b/i);
  });
});
