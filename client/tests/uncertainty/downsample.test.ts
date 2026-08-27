/**
 * A field too large to draw is reduced, and the display says what it reduced it to.
 *
 * FR-024's whole weight is on one word: *never silently*. Downsampling is not the
 * failure — every map does it — the failure is a display that downsamples and then lets
 * the viewer read the result at the resolution they assumed. So the tests below check the
 * arithmetic and then check that the sentence beside the overlay states the reduction.
 *
 * The other property is that every cell drawn is a cell the field contains. An averaged
 * cell carries a value no cell had, which is a small piece of bespoke mathematics
 * arriving in the browser by the back door — the same argument as FR-022's, one scale
 * down.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_MAXIMUM_DRAWN_CELLS, drawnField, layerInputs, resolutionWords } from "../../src/uncertainty/UncertaintyLayer";
import type { FieldCell, FieldGrid } from "../../src/uncertainty/UncertaintyLayer";

function grid(columns: number, rows: number): FieldGrid {
  const cells: FieldCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        latitude: 50 + row / 1000,
        longitude: -3 + column / 1000,
        spread: row * columns + column,
      });
    }
  }
  return { runId: "run-0007", cells, columns, rows };
}

describe("a field that fits", () => {
  it("is drawn entire, and says so", () => {
    const field = drawnField(grid(20, 20), 4096);
    expect(field.downsampled).toBe(false);
    expect(field.stride).toBe(1);
    expect(field.cells).toHaveLength(400);
    expect(resolutionWords(field)).toContain("entire");
  });
});

describe("a field that does not fit", () => {
  it("is reduced to within the bound", () => {
    const field = drawnField(grid(400, 400), DEFAULT_MAXIMUM_DRAWN_CELLS);
    expect(field.cells.length).toBeLessThanOrEqual(DEFAULT_MAXIMUM_DRAWN_CELLS);
    expect(field.downsampled).toBe(true);
    expect(field.stride).toBeGreaterThan(1);
  });

  it("states the resolution it is showing, in cells and in stride", () => {
    const field = drawnField(grid(400, 400), DEFAULT_MAXIMUM_DRAWN_CELLS);
    const words = resolutionWords(field);
    expect(words).toContain("Downsampled");
    expect(words).toContain(String(field.stride));
    expect(words).toContain(String(field.cells.length));
    expect(words).toContain(String(field.cellsInField));
  });

  it("draws only cells the field contains, never an average of several", () => {
    const source = grid(100, 100);
    const field = drawnField(source, 400);
    const values = new Set(source.cells.map((cell) => cell.spread));
    for (const cell of field.cells) {
      expect(values.has(cell.spread)).toBe(true);
    }
    expect(resolutionWords(field)).toContain("none is an average");
  });

  it("keeps the run identifier, so the overlay says which run it is showing", () => {
    expect(drawnField(grid(400, 400)).runId).toBe("run-0007");
  });

  it("reduces further as the bound tightens", () => {
    const strides = [4096, 1024, 256, 64].map((bound) => drawnField(grid(400, 400), bound).stride);
    for (let index = 1; index < strides.length; index += 1) {
      expect(strides[index]!).toBeGreaterThanOrEqual(strides[index - 1]!);
    }
  });

  it("is deterministic: the same field and bound give the same cells", () => {
    const first = drawnField(grid(300, 300), 1000);
    const second = drawnField(grid(300, 300), 1000);
    expect(first.cells).toEqual(second.cells);
  });

  it("survives a bound of zero rather than drawing nothing at all", () => {
    const field = drawnField(grid(10, 10), 0);
    expect(field.cells.length).toBeGreaterThan(0);
  });
});

describe("the layer inputs", () => {
  it("reads a cell's position and value through named accessors", () => {
    const inputs = layerInputs(drawnField(grid(4, 4)));
    const first = inputs.data[0]!;
    expect(inputs.getPosition(first)).toEqual([first.longitude, first.latitude]);
    expect(inputs.getValue(first)).toBe(first.spread);
  });

  it("states the range the shading spans, from the cells actually drawn", () => {
    const field = drawnField(grid(10, 10), 25);
    const inputs = layerInputs(field);
    const drawn = field.cells.map((cell) => cell.spread);
    expect(inputs.valueRange[0]).toBe(Math.min(...drawn));
    expect(inputs.valueRange[1]).toBe(Math.max(...drawn));
  });

  it("names the layer after the run, so a refresh replaces rather than accumulates", () => {
    expect(layerInputs(drawnField(grid(4, 4))).id).toContain("run-0007");
  });

  it("survives an empty field without inventing a range", () => {
    const inputs = layerInputs(drawnField({ runId: "run-0007", cells: [], columns: 0, rows: 0 }));
    expect(inputs.data).toEqual([]);
    expect(inputs.valueRange).toEqual([0, 0]);
  });
});
