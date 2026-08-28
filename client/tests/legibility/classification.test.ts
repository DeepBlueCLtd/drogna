/**
 * Every element classified, every bespoke claim named, and nothing lit by either.
 *
 * SRD §2.2 asks the display to distinguish what drogna wrote from what it chose. FR-016
 * makes that total — no unclassified element — and FR-017 makes it specific: a component
 * claimed as bespoke names the logic that makes it so. FR-018 is the one that keeps the
 * treatment honest, and it is a negative: classification changes appearance and never
 * illumination.
 */
import { describe, expect, it } from "vitest";

import { COMPONENTS, EDGES } from "../../src/layout/components";
import { BESPOKE_LOGIC, BOUNDARIES, BOUNDARIES_BY_ID, boundaryId, CONCERN_WORDS, concernsFor, overclaimedComponents, unclassifiedBoundaries, unexplainedBespokeComponents } from "../../src/legibility/classification";

/**
 * The items SRD §2.2 names as drogna's own, which FR-017 requires be attributed.
 *
 * Eight of them, not the six this comment used to claim — it was written against a
 * shorter list and nobody recounted when the list grew. `advisory-authoring` is the
 * newest, added by the SRD's v0.4 scope amendment along with C-19.
 */
const NAMED_IN_THE_SRD = [
  "residual-and-divergence-rules",
  "scheduling-policy",
  "sound-speed-computation",
  "quality-flagging",
  "uncertainty-mathematics",
  "planning-mathematics",
  "executable-data-dictionary",
  "advisory-authoring",
] as const;

describe("classification coverage", () => {
  it("classifies every component in the layout, with no third state", () => {
    for (const component of COMPONENTS) {
      expect(["bespoke", "plumbing"], component.id).toContain(component.kind);
    }
  });

  it("classifies every boundary in the layout", () => {
    expect(unclassifiedBoundaries()).toEqual([]);
    expect(BOUNDARIES).toHaveLength(EDGES.length);
    for (const boundary of BOUNDARIES) {
      expect(["bespoke", "plumbing"], boundary.id).toContain(boundary.kind);
    }
  });

  it("gives every boundary a reason, so the reading can be argued with", () => {
    for (const boundary of BOUNDARIES) {
      expect(boundary.because.length, `${boundary.id} claims ${boundary.kind} without saying why`).toBeGreaterThan(20);
    }
  });

  it("keeps the boundary index addressable by the pair of components it joins", () => {
    for (const edge of EDGES) {
      expect(BOUNDARIES_BY_ID.get(boundaryId(edge.from, edge.to))?.label).toBe(edge.label);
    }
  });

  it("claims less than half the boundaries as bespoke, which is the point of the exercise", () => {
    const bespoke = BOUNDARIES.filter((boundary) => boundary.kind === "bespoke");
    expect(bespoke.length).toBeGreaterThan(0);
    expect(bespoke.length).toBeLessThan(BOUNDARIES.length / 2);
  });
});

describe("named bespoke logic", () => {
  it("names logic for every component claimed as bespoke", () => {
    expect(unexplainedBespokeComponents()).toEqual([]);
  });

  it("claims no bespoke logic for a component classified as plumbing", () => {
    expect(overclaimedComponents()).toEqual([]);
  });

  it("attributes each item SRD §2.2 names to the component that owns it", () => {
    const claimed = new Set(Object.values(BESPOKE_LOGIC).flat());
    for (const concern of NAMED_IN_THE_SRD) {
      expect(claimed.has(concern), `${concern} is named by no component`).toBe(true);
    }
  });

  it("says what each named concern is, rather than asserting bespokeness in the abstract", () => {
    for (const concerns of Object.values(BESPOKE_LOGIC)) {
      for (const concern of concerns) {
        expect(CONCERN_WORDS[concern].length, concern).toBeGreaterThan(30);
      }
    }
  });

  it("puts the divergence rules on the monitor and the scheduling policy on the scheduler", () => {
    expect(concernsFor("monitor")).toContain("residual-and-divergence-rules");
    expect(concernsFor("scheduler")).toContain("scheduling-policy");
    expect(concernsFor("telemetry")).toContain("quality-flagging");
    expect(concernsFor("planner")).toContain("planning-mathematics");
    expect(concernsFor("ingest")).toContain("executable-data-dictionary");
  });

  it("names nothing for a component nobody claims, rather than inventing a concern", () => {
    expect(concernsFor("broker")).toEqual([]);
    expect(concernsFor("a-component-that-does-not-exist")).toEqual([]);
  });
});

describe("classification and illumination", () => {
  it("exposes no function that could report a component as alive", () => {
    // The structural half of FR-018: this module has no route to the liveness state, so
    // there is no accessor here a display could mistake for evidence.
    const surface = Object.keys({ BESPOKE_LOGIC, BOUNDARIES, CONCERN_WORDS });
    for (const name of surface) {
      expect(/lit|alive|heard|liveness|illuminat/i.test(name), name).toBe(false);
    }
  });
});
