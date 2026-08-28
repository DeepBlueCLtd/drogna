/**
 * The volume is a second reading of the cube the flat map already drew.
 *
 * Story 3's first acceptance scenario says "the same run's data", and that phrase is the
 * whole design: the flat map draws one depth slice of a fetched cube and the volume draws
 * every slice of the same one, so there is nothing for a mode switch to ask for. If the
 * volume built its own picture from its own request, the two views could disagree about the
 * same run and a viewer would have no way to tell which was current.
 *
 * The depth axis is asserted in two places, because a sign error on a vertical axis is
 * invisible in a picture and entirely plausible in a plot: the label states the convention
 * in words, and the drawn coordinates go downwards as depth increases.
 */
import { describe, expect, it } from "vitest";

import { DEPTH_AXIS_LABEL, drawnVolume, volumeBoxLayer, volumeLayers, volumeWords } from "../../src/map/layers";
import { cellCount, readFieldCube, sliceAt } from "../../src/map/fieldCube";

import type { VolumePoint } from "../../src/map/layers";

import { CUBE_PARAMETER, cubeResponse } from "./cubeResponse";
import { layerProp } from "./layerProps";

const ASKED = { runId: "run-0007", collection: "forecast", parameter: CUBE_PARAMETER };

function cube(shape = {}) {
  const outcome = readFieldCube(cubeResponse(shape), ASKED);
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome;
}

describe("the volume", () => {
  it("is built from every node of the cube the flat map drew a slice of", () => {
    const drawn = cube();
    const volume = drawnVolume(drawn, 0, 4096);
    expect(volume?.points).toHaveLength(cellCount(drawn));
    expect(volume?.cellsInCube).toBe(cellCount(drawn));
    expect(volume?.downsampled).toBe(false);
    expect(volume?.runId).toBe(drawn.runId);
  });

  it("draws the same values the flat map's slice drew, at the same positions", () => {
    const drawn = cube();
    const slice = sliceAt(drawn, 0, 0);
    if (!slice.ok) {
      throw new Error(slice.reason);
    }
    const volume = drawnVolume(drawn, 0, 4096);
    const shallowest = (volume?.points ?? []).filter(
      (point) => point.depthM === (drawn.depths[0] as number),
    );
    expect(shallowest.map((point) => point.value)).toEqual(
      slice.grid.cells.map((cell) => cell.spread),
    );
    expect(shallowest.map((point) => point.latitude)).toEqual(
      slice.grid.cells.map((cell) => cell.latitude),
    );
  });

  it("states its depth range from the cube's own vertical axis", () => {
    const volume = drawnVolume(cube(), 0, 4096);
    expect(volume?.depthRange).toEqual([0, 100]);
  });

  it("labels the axis depth, positive downwards, in words rather than by an arrow", () => {
    expect(DEPTH_AXIS_LABEL).toContain("positive downwards");
    expect(DEPTH_AXIS_LABEL).toContain("Nothing here is elevation");
  });

  it("draws deeper nodes lower, so the convention the label states is the one drawn", () => {
    const volume = drawnVolume(cube(), 0, 4096);
    const byDepth = new Map<number, number>();
    for (const point of volume?.points ?? []) {
      byDepth.set(point.depthM, point.position[2]);
    }
    expect(byDepth.get(100)).toBeLessThan(byDepth.get(0) as number);
    // The shallowest node sits at the top of the drawn box; negative zero is still zero.
    expect(byDepth.get(0)).toBeCloseTo(0, 10);
  });

  it("says what it reduced, when the budget makes it reduce anything", () => {
    const wide = cube({
      longitudes: Array.from({ length: 12 }, (_unused, step) => -6 + step * 0.25),
      latitudes: Array.from({ length: 12 }, (_unused, step) => 48 + step * 0.15),
      depths: [0, 100, 200, 300],
    });
    const volume = drawnVolume(wide, 0, 100);
    expect(volume?.downsampled).toBe(true);
    expect(volume?.stride).toBeGreaterThan(1);
    expect(volume?.points.length).toBeLessThanOrEqual(100);
    expect(volumeWords(volume as NonNullable<typeof volume>)).toContain("1 node in");
    expect(volumeWords(volume as NonNullable<typeof volume>)).toContain("none is an average");
  });

  it("says so plainly when it is showing the cube entire", () => {
    const volume = drawnVolume(cube(), 0, 4096);
    expect(volumeWords(volume as NonNullable<typeof volume>)).toContain("the cube entire");
  });

  it("is nothing at all for an instant the cube does not carry", () => {
    expect(drawnVolume(cube(), 7, 4096)).toBeNull();
  });

  it("skips a node the response did not report, rather than drawing it at zero", () => {
    const values = Array.from({ length: 18 }, (_unused, index) => (index + 1) / 10);
    values[3] = null as unknown as number;
    const volume = drawnVolume(cube({ values }), 0, 4096);
    expect(volume?.points).toHaveLength(17);
    expect((volume?.points ?? []).every((point) => Number.isFinite(point.value))).toBe(true);
  });
});

describe("the volume's layers", () => {
  it("draw the box as twelve edges, four of them the uprights the depth axis lives on", () => {
    // The box was written as three paths and the four vertical edges were not drawn at
    // all: a path layer extrudes a ribbon along each segment's direction, and a segment
    // whose ends differ only in depth has no direction to extrude along. What it drew was
    // two floating rectangles with nothing joining them, and every test here passed. Found
    // by looking at it in a browser, which is the only place it was visible.
    const box = volumeBoxLayer();
    const edges = layerProp<{ from: number[]; to: number[] }[]>(box, "data");
    expect(edges).toHaveLength(12);
    const uprights = edges.filter(
      (edge) => edge.from[0] === edge.to[0] && edge.from[1] === edge.to[1],
    );
    expect(uprights).toHaveLength(4);
    for (const upright of uprights) {
      expect(upright.to[2]).toBeLessThan(upright.from[2] as number);
    }
  });

  it("are the point cloud and the box its depth axis is measured against", () => {
    const volume = drawnVolume(cube(), 0, 4096);
    const layers = volumeLayers(volume as NonNullable<typeof volume>);
    expect(layers).toHaveLength(2);
    expect(layers[0]?.id).toBe("volume-run-0007");
    expect(layers[1]?.id).toBe("volume-box");
  });

  it("colour every node achromatically, as the flat map does", () => {
    const volume = drawnVolume(cube(), 0, 4096);
    const [cloud] = volumeLayers(volume as NonNullable<typeof volume>);
    const colour = layerProp<(point: VolumePoint) => number[]>(cloud, "getColor");
    for (const point of volume?.points ?? []) {
      const [red, green, blue] = colour(point);
      expect(red).toBe(green);
      expect(green).toBe(blue);
    }
  });
});
