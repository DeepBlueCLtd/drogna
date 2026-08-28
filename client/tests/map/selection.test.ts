/**
 * What a picked cell reports, and what it deliberately does not.
 *
 * FR-009 names four things — value, position, depth and the simulation time the cell
 * belongs to — and then draws a line under them: "the foundation later provenance work
 * builds on, and no more than that". So the assertions here are in two halves. The first is
 * that all four come back and come back from the fetched response rather than from anything
 * the drawing did to them. The second is that nothing else does: no ranking, no comparison,
 * no judgement about whether the value is high, because a display that ranked a cell would
 * be making the planner's argument on the planner's behalf.
 *
 * The instant is the response's own, from the cube's time axis. There is no clock anywhere
 * near this, and the test would fail if there were: the cube's instant is a fixed string
 * and the assertion is on that string.
 */
import { describe, expect, it } from "vitest";

import { pickedCell, pickedWords } from "../../src/map/selection";
import { readFieldCube, sliceAt } from "../../src/map/fieldCube";

import { CUBE_PARAMETER, cubeResponse } from "./cubeResponse";

const ASKED = { runId: "run-0007", collection: "uncertainty-run-0007", parameter: CUBE_PARAMETER };
const READ = readFieldCube(cubeResponse(), ASKED);
if (!READ.ok) {
  throw new Error(READ.reason);
}
const CUBE = READ;

function cellAt(index: number) {
  const slice = sliceAt(CUBE, 0, 0);
  if (!slice.ok) {
    throw new Error(slice.reason);
  }
  const cell = slice.grid.cells[index];
  if (cell === undefined) {
    throw new Error(`no cell at ${index}`);
  }
  return cell;
}

describe("picking a drawn cell", () => {
  it("reports its value, position, depth and simulation time, and its run", () => {
    const picked = pickedCell(CUBE, 0, 0, cellAt(4));
    expect(picked).toEqual({
      runId: "run-0007",
      parameter: CUBE_PARAMETER,
      unit: "degree_C",
      latitude: 50,
      longitude: -3.5,
      depthM: 0,
      simTime: "2026-08-26T00:10:00.000000Z",
      value: 0.5,
    });
  });

  it("reports the depth of the slice that was drawn, not the cube's first", () => {
    const deeper = pickedCell(CUBE, 0, 1, cellAt(0));
    expect(deeper?.depthM).toBe(100);
    expect(deeper?.value).toBeCloseTo(1.0, 10);
  });

  it("reads the value back out of the response rather than out of the drawing", () => {
    // The cell handed to the layer carries the same number, and this asserts the reader
    // goes back to the cube for it: a value that had been scaled for drawing would differ.
    const cell = cellAt(4);
    expect(pickedCell(CUBE, 0, 0, cell)?.value).toBe(cell.spread);
  });

  it("says all four in one sentence, and says nothing about whether it is high", () => {
    const words = pickedWords(pickedCell(CUBE, 0, 0, cellAt(4)) as NonNullable<ReturnType<typeof pickedCell>>);
    expect(words).toContain("0.5 degree_C");
    expect(words).toContain("50, -3.5");
    expect(words).toContain("0 m below the surface");
    expect(words).toContain("2026-08-26T00:10:00.000000Z");
    expect(words).toContain("nothing derived from it");
    expect(words).not.toMatch(/\bhigh\b|\blow\b|\bworse\b|\bbetter\b/i);
  });

  it("refuses rather than reports where the cube holds no value there", () => {
    const values = Array.from({ length: 18 }, (_unused, index) => (index + 1) / 10);
    values[0] = null as unknown as number;
    const holed = readFieldCube(cubeResponse({ values }), ASKED);
    if (!holed.ok) {
      throw new Error(holed.reason);
    }
    expect(pickedCell(holed, 0, 0, { latitude: 49.5, longitude: -4, spread: 0 })).toBeNull();
  });

  it("refuses an instant or a depth the cube does not carry", () => {
    expect(pickedCell(CUBE, 3, 0, cellAt(0))).toBeNull();
    expect(pickedCell(CUBE, 0, 5, cellAt(0))).toBeNull();
  });
});
