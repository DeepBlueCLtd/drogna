/**
 * Confidence ages by the planner's published projection, or it does not age at all.
 *
 * FR-022's negative half is the whole test. The client must not compute its own decay
 * model, and the tempting version — interpolate between `uncertainty_now` and
 * `saturated_uncertainty` over `timescale_seconds` — is a few lines away in every
 * implementation of this. It is forbidden because it produces a second model of a
 * quantity the planner already computed, and two models of the same number disagree.
 *
 * So what is asserted here is that the display answers the confidence question by reading
 * the published crossing instant, and that with no projection the field renders and says
 * it is not decaying rather than being decayed by something local.
 */
import { describe, expect, it } from "vitest";

import { confidenceCounts, decayAt, decayWords, NOT_DECAYING } from "../../src/uncertainty/decayFromProjection";

import { samplingRecommendation } from "../control";

const PROJECTION = samplingRecommendation().projection;
const BEFORE_CROSSING = "2026-08-26T00:30:00.000000Z";
const AFTER_CROSSING = "2026-08-26T02:00:00.000000Z";

describe("decay driven by the projection", () => {
  it("reports every region the planner projected, and no more", () => {
    const view = decayAt(PROJECTION, BEFORE_CROSSING);
    expect(view.decaying).toBe(true);
    expect(view.regions).toHaveLength(PROJECTION.regions.length);
    expect(view.regionCount).toBe(PROJECTION.region_count);
  });

  it("reads the confidence off the published crossing instant, not off a curve", () => {
    const early = decayAt(PROJECTION, BEFORE_CROSSING);
    const late = decayAt(PROJECTION, AFTER_CROSSING);
    const crossing = (view: typeof early) =>
      view.regions.find((region) => region.crossingSimTime !== null)?.confidence;
    expect(crossing(early)).toBe("lapses-later");
    expect(crossing(late)).toBe("lapsed");
  });

  it("crosses exactly at the instant the planner named, not before", () => {
    const at = decayAt(PROJECTION, "2026-08-26T01:00:00.000000Z");
    const justBefore = decayAt(PROJECTION, "2026-08-26T00:59:59.999999Z");
    const crossing = (view: typeof at) =>
      view.regions.find((region) => region.crossingSimTime !== null)?.confidence;
    expect(crossing(justBefore)).toBe("lapses-later");
    expect(crossing(at)).toBe("lapsed");
  });

  it("carries a region already below usable as lapsed at any instant", () => {
    for (const instant of [BEFORE_CROSSING, AFTER_CROSSING]) {
      const region = decayAt(PROJECTION, instant).regions[0];
      expect(region?.confidence, instant).toBe("lapsed");
      expect(region?.because, instant).toContain("already below usable");
    }
  });

  it("carries a region that does not lapse within the horizon as usable, and says so", () => {
    const region = decayAt(PROJECTION, AFTER_CROSSING).regions[2];
    expect(region?.confidence).toBe("usable");
    expect(region?.because).toContain("does not lapse");
  });

  it("reports the planner's own figures rather than figures derived from them", () => {
    const region = decayAt(PROJECTION, BEFORE_CROSSING).regions[1];
    const published = PROJECTION.regions[1];
    expect(region?.uncertaintyAtProjection).toBe(published?.uncertainty_now);
    expect(region?.saturatedUncertainty).toBe(published?.saturated_uncertainty);
  });

  it("does not move a region's published uncertainty as simulation time advances", () => {
    // The heart of FR-022: the numbers are the planner's and they are not re-evaluated
    // here. Only the confidence verdict changes, and it changes by a lookup.
    const early = decayAt(PROJECTION, BEFORE_CROSSING).regions.map((region) => region.uncertaintyAtProjection);
    const late = decayAt(PROJECTION, AFTER_CROSSING).regions.map((region) => region.uncertaintyAtProjection);
    expect(early).toEqual(late);
  });

  it("counts the regions in each state for a one-line summary", () => {
    const counts = confidenceCounts(decayAt(PROJECTION, BEFORE_CROSSING));
    expect(counts.lapsed).toBe(1);
    expect(counts["lapses-later"]).toBe(1);
    expect(counts.usable).toBe(1);
    expect(counts.unknown).toBe(0);
  });

  it("says a projection is incomplete when fewer regions arrived than were stated", () => {
    const truncated = { ...PROJECTION, region_count: 9 };
    expect(decayWords(decayAt(truncated, BEFORE_CROSSING))).toContain("incomplete");
  });

  it("reports unknown rather than guessing when an instant cannot be read", () => {
    const view = decayAt(PROJECTION, "half past three");
    expect(view.regions[1]?.confidence).toBe("unknown");
  });
});

describe("with no projection available", () => {
  it("renders and is marked as not decaying", () => {
    const view = decayAt(null, BEFORE_CROSSING);
    expect(view).toEqual(NOT_DECAYING);
    expect(view.decaying).toBe(false);
    expect(view.notDecayingBecause).toContain("second model");
  });

  it("says so in the words the display prints", () => {
    expect(decayWords(decayAt(null, BEFORE_CROSSING))).toContain("Not decaying");
  });

  it("does not fall back to a decay computed here", () => {
    expect(decayAt(null, BEFORE_CROSSING).regions).toEqual([]);
    expect(decayAt(null, AFTER_CROSSING).regions).toEqual([]);
  });
});
