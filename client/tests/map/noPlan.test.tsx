/**
 * With no plan published, no route is drawn, and the absence is stated.
 *
 * Story 2's third acceptance scenario. It is the same discipline as the field's, applied to
 * a different absence: a map that drew a plausible curve because the panel beside it looked
 * empty would be inventing a recommendation, and Constitution VIII makes recommending
 * something only the planner may do.
 *
 * The empty-recommendation case is different again and is kept apart here, because "the
 * planner has not spoken" and "the planner recommends no route" are two different answers
 * and only one of them is a result.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NO_PLAN_RECEIVED } from "../../src/map/absence";
import { MapSurface, NO_FIELD } from "../../src/map/MapSurface";
import { chooseExtent, extentFromDeclaration } from "../../src/map/extent";
import { routeLayers } from "../../src/map/layers";
import { routeDisplay, routeLayerInputs } from "../../src/route/RouteLayer";

import type { RouteDisplay } from "../../src/route/RouteLayer";

import { DECLARED_MAP } from "../runtimeConfig";
import { emptyRecommendation } from "../control";

const EXTENT = chooseExtent(null, extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical));

function render(route: RouteDisplay | null): string {
  return renderToStaticMarkup(
    <MapSurface
      extent={EXTENT}
      field={NO_FIELD}
      route={route}
      conditions={null}
      selectedVertex={0}
      onSelectVertex={() => undefined}
    />,
  );
}

describe("no plan published at all", () => {
  const markup = render(null);

  it("states the absence in the words absence.ts holds", () => {
    expect(markup).toContain(NO_PLAN_RECEIVED.slice(0, 60));
    expect(markup).toContain("inventing a recommendation");
  });

  it("carries no plan in the readiness the page publishes", () => {
    expect(markup).toContain('data-map-plan=""');
  });
});

describe("a recommendation the planner deliberately left empty", () => {
  const empty = routeDisplay(emptyRecommendation("nothing-worth-sampling"));
  const markup = render(empty);

  it("says the planner recommended no route, which is a result and not a silence", () => {
    expect(markup).toContain("The planner recommended no route");
    expect(markup).not.toContain(NO_PLAN_RECEIVED.slice(0, 60));
  });

  it("names the plan it is empty for, so the two absences are told apart", () => {
    expect(markup).toContain(`data-map-plan="${empty.planId}"`);
  });

  it("draws no line between two points in its place", () => {
    expect(routeLayers({ route: routeLayerInputs(empty), declined: new Set(), selected: null })).toEqual(
      [],
    );
  });
});
