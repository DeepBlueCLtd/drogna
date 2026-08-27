/**
 * An empty route is a result, and the reason is the interesting part of it.
 *
 * FR-029. A planner that always recommends motion is a planner nobody can trust when it
 * recommends motion, so "nothing worth sampling" and "budget too small" are answers rather
 * than failures to answer — and a display that drew a placeholder line, or an empty map
 * with no explanation, would hide the more informative of the two outcomes.
 *
 * The other half is the no-plan case, which is different again: no plan has been published
 * at all, and the page must not fill the gap with a line between two points.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArrivalTimeControl } from "../../src/route/ArrivalTimeControl";
import { EMPTY_REASON_WORDS, RecommendationLabel } from "../../src/route/RecommendationLabel";
import { routeDisplay, routeLayerInputs } from "../../src/route/RouteLayer";

import { emptyRecommendation, samplingRecommendation } from "../control";

describe("a route the planner left empty", () => {
  it("states the reason the planner gave, in words", () => {
    for (const reason of ["budget-too-small", "nothing-worth-sampling", "no-field"] as const) {
      const route = routeDisplay(emptyRecommendation(reason));
      const markup = renderToStaticMarkup(<RecommendationLabel route={route} />);
      expect(markup, reason).toContain('data-state="empty"');
      expect(markup, reason).toContain(EMPTY_REASON_WORDS[reason]);
    }
  });

  it("says an empty route is a result rather than a failure", () => {
    const markup = renderToStaticMarkup(<RecommendationLabel route={routeDisplay(emptyRecommendation())} />);
    expect(markup).toContain("a result, not a failure");
  });

  it("draws no placeholder line", () => {
    expect(routeLayerInputs(routeDisplay(emptyRecommendation())).path).toEqual([]);
  });

  it("says there is nowhere along it to move to", () => {
    const markup = renderToStaticMarkup(
      <ArrivalTimeControl
        route={routeDisplay(emptyRecommendation())}
        conditions={null}
        selected={0}
        onSelect={() => undefined}
      />,
    );
    expect(markup).toContain('data-testid="arrival-empty-route"');
  });

  it("still calls itself a recommendation", () => {
    expect(renderToStaticMarkup(<RecommendationLabel route={routeDisplay(emptyRecommendation())} />)).toContain(
      "This is a recommendation",
    );
  });

  it("falls back to the planner's state where it gave no reason", () => {
    const stateOnly = routeDisplay({ ...emptyRecommendation(), empty_reason: null });
    const markup = renderToStaticMarkup(<RecommendationLabel route={stateOnly} />);
    expect(markup).toContain("gave no reason");
    expect(markup).toContain("nothing-worth-sampling");
  });
});

describe("no plan at all", () => {
  it("says so, and does not invent a line between two points", () => {
    const markup = renderToStaticMarkup(<RecommendationLabel route={null} />);
    expect(markup).toContain('data-state="unheard"');
    expect(markup).toContain("No plan has been published");
    expect(markup).toContain("inventing a recommendation");
  });
});

describe("a route with vertices", () => {
  const route = routeDisplay(samplingRecommendation());

  it("summarises what was considered against what was chosen", () => {
    const markup = renderToStaticMarkup(<RecommendationLabel route={route} />);
    expect(markup).toContain('data-testid="route-summary"');
    expect(markup).toContain("64");
    expect(markup).toContain("of which 4 were chosen");
  });

  it("says the value is collapse-aware, so a reader does not sum the vertices", () => {
    expect(renderToStaticMarkup(<RecommendationLabel route={route} />)).toContain("collapse-aware");
  });

  it("names the plan it replaces, where it replaces one", () => {
    const replan = routeDisplay(samplingRecommendation({ supersedes: "0a1b2c3d4e5f6070" }));
    const markup = renderToStaticMarkup(<RecommendationLabel route={replan} />);
    expect(markup).toContain('data-testid="route-supersedes"');
    expect(markup).toContain("0a1b2c3d4e5f6070");
  });

  it("says nothing about a predecessor for a first recommendation", () => {
    expect(renderToStaticMarkup(<RecommendationLabel route={route} />)).not.toContain(
      'data-testid="route-supersedes"',
    );
  });
});
