/**
 * Reading a cube, and refusing one that cannot be read.
 *
 * The failure this file exists to prevent is not a crash. It is a response read in the
 * wrong axis order, or with a range that does not match its axes, drawn as a field of
 * plausible numbers in the wrong places — which looks exactly like a field of plausible
 * numbers in the right places. So the reader checks the response's own `axisNames` rather
 * than assuming the order, and refuses anything it cannot place.
 *
 * The slice test is the one that matters most: `sliceAt` hands feature 012's `drawnField`
 * a grid whose `columns` and `rows` it indexes positionally, so a cell in the wrong place
 * here becomes a downsampled field that is quietly transposed.
 */
import { describe, expect, it } from "vitest";

import { cellCount, readFieldCube, sliceAt, valueIndex } from "../../src/map/fieldCube";
import { drawnField, layerInputs } from "../../src/uncertainty/UncertaintyLayer";

import { CUBE_PARAMETER, cubeResponse } from "./cubeResponse";

const ASKED = { runId: "run-0007", collection: "uncertainty-run-0007", parameter: CUBE_PARAMETER };

function read(document: unknown) {
  const outcome = readFieldCube(document, ASKED);
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome;
}

describe("a cube response", () => {
  it("is read into the four axes the response declared", () => {
    const cube = read(cubeResponse());
    expect(cube.longitudes).toEqual([-4, -3.5, -3]);
    expect(cube.latitudes).toEqual([49.5, 50, 50.5]);
    expect(cube.depths).toEqual([0, 100]);
    expect(cube.times).toEqual(["2026-08-26T00:10:00.000000Z"]);
    expect(cellCount(cube)).toBe(18);
    expect(cube.unit).toBe("degree_C");
  });

  it("indexes its values in t, z, y, x order, as the range declares", () => {
    const cube = read(cubeResponse());
    // The first value belongs to the first time, the first depth, the first latitude and
    // the first longitude, and the values increase along that ordering.
    expect(cube.values[valueIndex(cube, 0, 0, 0, 0)]).toBeCloseTo(0.1, 10);
    expect(cube.values[valueIndex(cube, 0, 0, 0, 1)]).toBeCloseTo(0.2, 10);
    expect(cube.values[valueIndex(cube, 0, 0, 1, 0)]).toBeCloseTo(0.4, 10);
    expect(cube.values[valueIndex(cube, 0, 1, 0, 0)]).toBeCloseTo(1.0, 10);
  });
});

describe("a response that cannot be read", () => {
  it("is refused when it is not an object at all", () => {
    const outcome = readFieldCube("a cube, honestly", ASKED);
    expect(outcome.ok).toBe(false);
  });

  it("is refused when an axis is missing, rather than read as an empty grid", () => {
    const document = cubeResponse();
    const domain = document["domain"] as { axes: Record<string, unknown> };
    delete domain.axes["z"];
    const outcome = readFieldCube(document, ASKED);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("all four axes");
  });

  it("is refused when it carries no range for the parameter that was asked for", () => {
    const outcome = readFieldCube(cubeResponse({ parameter: "sea_water_temperature" }), ASKED);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("sea_water_temperature");
  });

  it("is refused when the range declares a different axis order, rather than transposed", () => {
    const document = cubeResponse();
    const ranges = document["ranges"] as Record<string, { axisNames: string[] }>;
    (ranges[CUBE_PARAMETER] as { axisNames: string[] }).axisNames = ["t", "z", "x", "y"];
    const outcome = readFieldCube(document, ASKED);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("wrong axis order");
  });

  it("is refused when the range's length and its axes disagree", () => {
    const outcome = readFieldCube(cubeResponse({ values: [1, 2, 3] }), ASKED);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("imply 18");
  });
});

describe("one horizontal slice", () => {
  it("is row-major over latitude then longitude, as feature 012's grid indexes it", () => {
    const cube = read(cubeResponse());
    const slice = sliceAt(cube, 0, 0);
    if (!slice.ok) {
      throw new Error(slice.reason);
    }
    expect(slice.grid.columns).toBe(3);
    expect(slice.grid.rows).toBe(3);
    expect(slice.grid.cells[0]).toEqual({ latitude: 49.5, longitude: -4, spread: 0.1 });
    expect(slice.grid.cells[1]?.longitude).toBe(-3.5);
    expect(slice.grid.cells[3]?.latitude).toBe(50);
  });

  it("hands 012's downsampling a grid it can index, and gets the field entire back", () => {
    const cube = read(cubeResponse());
    const slice = sliceAt(cube, 0, 0);
    if (!slice.ok) {
      throw new Error(slice.reason);
    }
    const field = drawnField(slice.grid, 4096);
    expect(field.downsampled).toBe(false);
    expect(field.cells).toHaveLength(9);
    expect(layerInputs(field).valueRange).toEqual([0.1, 0.9]);
  });

  it("reads a deeper slice from the same cube without another response", () => {
    const cube = read(cubeResponse());
    const deeper = sliceAt(cube, 0, 1);
    if (!deeper.ok) {
      throw new Error(deeper.reason);
    }
    expect(deeper.grid.cells[0]?.spread).toBeCloseTo(1.0, 10);
  });

  it("refuses a slice the response left a hole in, rather than drawing the rest", () => {
    const values = Array.from({ length: 18 }, (_unused, index) => (index + 1) / 10);
    values[4] = null as unknown as number;
    const cube = read(cubeResponse({ values }));
    const slice = sliceAt(cube, 0, 0);
    expect(slice.ok).toBe(false);
    expect(slice.ok ? "" : slice.reason).toContain("no value for 1 of 9 cells");
  });

  it("refuses an instant or a depth the cube does not carry", () => {
    const cube = read(cubeResponse());
    expect(sliceAt(cube, 4, 0).ok).toBe(false);
    expect(sliceAt(cube, 0, 9).ok).toBe(false);
  });
});
