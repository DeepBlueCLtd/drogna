/**
 * What a drawn cell says when a viewer picks it.
 *
 * FR-009 names four things and then draws a line under them: value, position, depth and the
 * simulation time the cell belongs to, "taken from the fetched data — the foundation later
 * provenance work builds on, and no more than that". So this reports those four and the
 * three facts needed to make sense of them — which run, which parameter, in what unit — and
 * stops. No derived statistic, no comparison against a neighbour, no judgement about whether
 * the value is high: a display that ranked a cell would be making the planner's argument on
 * the planner's behalf.
 *
 * The simulation instant is the one the cube's own time axis carries, and the depth is the
 * one its vertical axis carries. Neither is inferred and neither is read from a clock: a
 * cell belongs to the instant the response said it belonged to, which is the whole reason
 * the request asked for one instant and printed which.
 *
 * Two interactions or fewer, SC-002 asks. It is one: click the cell.
 */
import type { FieldCell } from "../uncertainty/UncertaintyLayer";
import type { FieldCube } from "./fieldCube";
import { valueIndex } from "./fieldCube";

export interface PickedCell {
  readonly runId: string;
  readonly parameter: string;
  readonly unit: string | null;
  readonly latitude: number;
  readonly longitude: number;
  /** Metres below the surface, positive downwards, as the cube's own axis states it. */
  readonly depthM: number;
  readonly simTime: string;
  readonly value: number;
}

/** The index of an axis value, by exact match and then by nearest. */
function indexOf(values: readonly number[], wanted: number): number {
  const exact = values.indexOf(wanted);
  if (exact !== -1) {
    return exact;
  }
  let nearest = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    const candidate = Math.abs((values[index] as number) - wanted);
    if (candidate < distance) {
      distance = candidate;
      nearest = index;
    }
  }
  return nearest;
}

/**
 * The cell that was picked, read back out of the cube it was drawn from.
 *
 * Read back rather than carried along, because the value a layer was handed and the value
 * the response holds are two different things once anything has been scaled or normalised
 * for drawing, and the one worth reporting is the response's. Returns null where the cube
 * holds no value there, which is a refusal rather than a zero.
 */
export function pickedCell(
  cube: FieldCube,
  timeIndex: number,
  depthIndex: number,
  cell: FieldCell,
): PickedCell | null {
  const simTime = cube.times[timeIndex];
  const depthM = cube.depths[depthIndex];
  if (simTime === undefined || depthM === undefined) {
    return null;
  }
  const latitudeIndex = indexOf(cube.latitudes, cell.latitude);
  const longitudeIndex = indexOf(cube.longitudes, cell.longitude);
  if (latitudeIndex === -1 || longitudeIndex === -1) {
    return null;
  }
  const value = cube.values[valueIndex(cube, timeIndex, depthIndex, latitudeIndex, longitudeIndex)];
  if (value === null || value === undefined) {
    return null;
  }
  return {
    runId: cube.runId,
    parameter: cube.parameter,
    unit: cube.unit,
    latitude: cube.latitudes[latitudeIndex] as number,
    longitude: cube.longitudes[longitudeIndex] as number,
    depthM,
    simTime,
    value,
  };
}

/** The four facts in one sentence, for a reader rather than for a machine. */
export function pickedWords(picked: PickedCell): string {
  const unit = picked.unit === null ? "" : ` ${picked.unit}`;
  return (
    `${picked.value}${unit} at ${picked.latitude}, ${picked.longitude}, ` +
    `${picked.depthM} m below the surface, for simulation time ${picked.simTime}, from run ` +
    `${picked.runId}. That is the value the response carried for that cell and nothing ` +
    `derived from it.`
  );
}
