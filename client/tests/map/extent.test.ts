/**
 * Where the map is, and where it got that from.
 *
 * FR-001: the extent derives from served data or served configuration and never from a
 * value written into client source. There are two sources, they are ranked, and the
 * ranking is the interesting part — the announcement describes the run that is being
 * drawn, and the declaration describes the destination. A map that drew a published run
 * inside the declared extent would be putting a frame around the wrong thing while looking
 * entirely correct.
 *
 * The re-derivation test is the specification's own edge case: a run whose grid extent
 * differs from the previous run's must move the frame, because a remembered extent is a
 * claim about a run that has been superseded.
 */
import { describe, expect, it } from "vitest";

import {
  NO_EXTENT,
  chooseExtent,
  contains,
  degreeLabel,
  extentFromAnnouncement,
  extentFromDeclaration,
  extentWords,
  canvasWidth,
  fitView,
  graticule,
  graticuleSpacing,
} from "../../src/map/extent";

import { DECLARED_MAP } from "../runtimeConfig";
import { runPublished } from "../control";

const DECLARED = extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical);

describe("the extent an announcement states", () => {
  it("is the published grid's own bounds, on all three axes", () => {
    const extent = extentFromAnnouncement(runPublished());
    expect(extent).toEqual({
      minimumLongitude: -4,
      minimumLatitude: 49.5,
      maximumLongitude: -2.5,
      maximumLatitude: 50.5,
      minimumDepthM: 0,
      maximumDepthM: 500,
    });
  });

  it("is nothing at all where the message does not validate", () => {
    expect(extentFromAnnouncement({ run_id: "run-0009" })).toBeNull();
  });

  it("is nothing where the run was published for inspection rather than made current", () => {
    expect(extentFromAnnouncement(runPublished({ current: false }))).toBeNull();
  });
});

describe("choosing between the two sources", () => {
  it("prefers the announcement, because it describes the run being drawn", () => {
    const chosen = chooseExtent(extentFromAnnouncement(runPublished()), DECLARED);
    expect(chosen.source).toBe("announced");
    expect(chosen.extent?.maximumDepthM).toBe(500);
  });

  it("falls to the served declaration before any run has been announced", () => {
    const chosen = chooseExtent(null, DECLARED);
    expect(chosen.source).toBe("declared");
    expect(chosen.extent?.minimumLongitude).toBe(-6);
  });

  it("draws no frame where neither source said anything", () => {
    expect(chooseExtent(null, null)).toBe(NO_EXTENT);
    expect(chooseExtent(null, null).extent).toBeNull();
  });

  it("says which source it used, in words a reader can argue with", () => {
    expect(extentWords(chooseExtent(null, DECLARED))).toContain("declared");
    expect(extentWords(chooseExtent(extentFromAnnouncement(runPublished()), DECLARED))).toContain(
      "announced",
    );
  });
});

describe("a second run whose grid differs from the first", () => {
  it("re-derives the extent rather than remembering the earlier one", () => {
    const first = extentFromAnnouncement(runPublished());
    const second = extentFromAnnouncement(
      runPublished({
        run_id: "run-0008",
        grid_bounds: {
          minimum_latitude: 48,
          maximum_latitude: 48.5,
          minimum_longitude: -6,
          maximum_longitude: -5,
          minimum_depth_m: 0,
          maximum_depth_m: 100,
        },
      }),
    );
    expect(first?.maximumLatitude).toBe(50.5);
    expect(second?.maximumLatitude).toBe(48.5);
    expect(chooseExtent(second, DECLARED).extent).toEqual(second);
  });
});

describe("the graticule", () => {
  it("is drawn inside the extent it belongs to, and nowhere else", () => {
    const extent = extentFromAnnouncement(runPublished());
    if (extent === null) {
      throw new Error("the announcement carried no bounds");
    }
    const lines = graticule(extent);
    expect(lines.lines.length).toBeGreaterThan(0);
    for (const line of lines.lines) {
      for (const [longitude, latitude] of line.path) {
        expect(contains(extent, longitude, latitude)).toBe(true);
      }
    }
  });

  it("closes its frame on the extent's own corners", () => {
    const lines = graticule(DECLARED as NonNullable<typeof DECLARED>);
    expect(lines.frame[0]).toEqual([-6, 48]);
    expect(lines.frame[lines.frame.length - 1]).toEqual([-6, 48]);
  });

  it("chooses a spacing from the span, so a wide extent is not a black rectangle", () => {
    const wide = { ...(DECLARED as NonNullable<typeof DECLARED>), minimumLongitude: -60, maximumLongitude: 60 };
    const narrow = { ...(DECLARED as NonNullable<typeof DECLARED>), minimumLongitude: -6, maximumLongitude: -5.9 };
    expect(graticuleSpacing(wide)).toBeGreaterThan(graticuleSpacing(narrow));
    expect(graticule(wide).lines.length).toBeLessThan(60);
    expect(graticule(narrow).lines.length).toBeGreaterThan(1);
  });

  it("stands its lines at multiples of the spacing, so two extents share them", () => {
    const shifted = { ...(DECLARED as NonNullable<typeof DECLARED>), minimumLatitude: 48.13 };
    for (const line of graticule(shifted, 0.5).lines) {
      expect(Math.abs(line.degrees / 0.5 - Math.round(line.degrees / 0.5))).toBeLessThan(1e-6);
    }
  });

  it("labels degrees with a hemisphere rather than a minus sign", () => {
    expect(degreeLabel(-6, "meridian")).toBe("6°W");
    expect(degreeLabel(50, "parallel")).toBe("50°N");
    expect(degreeLabel(-3.5, "parallel")).toBe("3.5°S");
  });
});

describe("the canvas the extent is drawn on", () => {
  it("takes the extent's own shape, so a square scenario is not drawn with empty margins", () => {
    const extent = DECLARED as NonNullable<typeof DECLARED>;
    // Three degrees of longitude at forty-nine north is about two degrees of latitude, so
    // this extent is close to square in the projection it is drawn in.
    expect(canvasWidth(extent, 440)).toBeGreaterThan(380);
    expect(canvasWidth(extent, 440)).toBeLessThan(500);
  });

  it("is wider for a wider extent and narrower for a narrower one", () => {
    const extent = DECLARED as NonNullable<typeof DECLARED>;
    const wide = { ...extent, maximumLongitude: 6 };
    const narrow = { ...extent, maximumLongitude: -5.5 };
    expect(canvasWidth(wide, 440)).toBeGreaterThan(canvasWidth(extent, 440));
    expect(canvasWidth(narrow, 440)).toBeLessThan(canvasWidth(extent, 440));
  });

  it("is bounded at both ends, so a strip and a column are both still readable", () => {
    const extent = DECLARED as NonNullable<typeof DECLARED>;
    expect(canvasWidth({ ...extent, maximumLongitude: 170, minimumLongitude: -170 }, 440)).toBe(1000);
    expect(canvasWidth({ ...extent, maximumLongitude: -5.99 }, 440)).toBe(320);
  });
});

describe("fitting the extent into a viewport", () => {
  it("centres on the extent and zooms far enough out to hold all of it", () => {
    const extent = DECLARED as NonNullable<typeof DECLARED>;
    const fit = fitView(extent, 800, 600);
    expect(fit.longitude).toBeCloseTo(-4.5, 6);
    expect(fit.latitude).toBeGreaterThan(48);
    expect(fit.latitude).toBeLessThan(50);
    // Every corner of the extent lies inside the viewport at the fitted zoom.
    const world = 512 * 2 ** fit.zoom;
    expect((Math.abs(extent.maximumLongitude - extent.minimumLongitude) / 360) * world).toBeLessThanOrEqual(800);
  });

  it("zooms further in for a smaller extent", () => {
    const extent = DECLARED as NonNullable<typeof DECLARED>;
    const small = { ...extent, maximumLongitude: -5.9, maximumLatitude: 48.1 };
    expect(fitView(small, 800, 600).zoom).toBeGreaterThan(fitView(extent, 800, 600).zoom);
  });
});
