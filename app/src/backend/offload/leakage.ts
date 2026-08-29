/**
 * The updated-region leakage score (SRD-v2 FR-38's second leakage path, V1's
 * FR-015 to FR-017 lineage; issue #57).
 *
 * Two successive released products for the same collection on the same grid are
 * compared cell by cell. The cells whose released value moved are the change mask;
 * the cells within the identification radius of a measurement taken in the interval
 * are the buffer, and the buffer is the ground truth the mask is scored against. A
 * release that only updates where it measured hands the reader its sampling
 * geometry — the mask *is* the buffer — and that is what this scores.
 *
 * Three things this deliberately does not do, each one a way a leakage check can
 * report a pass it has not earned:
 *
 * - It never unions the variables' masks and stops there. A whole-domain rewrite
 *   produces a mask covering nearly every cell, which scores at chance and swamps a
 *   single variable that is driven by observation age. Every variable is scored on
 *   its own as well, and the figure acted on is the worst of them, named.
 * - It never reads an absent geometry as an empty one. A comparison with nothing to
 *   score against is inconclusive, and an inconclusive result nobody reads is
 *   indistinguishable from a pass.
 * - It has no pass-by-default: every inconclusive case carries a reason code, and
 *   the caller has to decide what to do about each one rather than being handed a
 *   boolean that hides them.
 *
 * The released form here is float32 and carries no coarser quantisation, so any
 * difference in a released value is a difference — the mask needs no threshold
 * typed into it, and would need one if the release were ever quantised.
 */
import type { Manifest, RunManifestMeasurement } from '../../generated/types.js';
import { KM_PER_DEGREE_LATITUDE } from '../env-generator/analytic.js';

/** One released product: the grid it is on, its variables, and its bytes as floats. */
export interface ReleasedProduct {
  grid: Manifest['grid'];
  /** Variable names in the order the bytes carry them. */
  variables: string[];
  /** [variable][time][depth][latitude][longitude], C order. */
  values: Float32Array;
}

export interface MeasurementGeometry {
  identification_radius_m: number;
  interval_seconds: number;
  measurements: readonly RunManifestMeasurement[];
}

export interface MaskScore {
  /** A variable name, or 'union' for the union of every variable's mask. */
  variable: string;
  /** Horizontal cells in the mask: a column counts as changed if any value in it did. */
  changedCells: number;
  bufferedCells: number;
  totalCells: number;
  /** What fraction of the domain the buffer covers: the rate a blind mask scores at. */
  chanceRate: number;
  /** What fraction of the changed cells fall in the buffer: the recovery statistic. */
  recovery: number;
  /** Chance plus three binomial standard errors for this mask's size. Derived. */
  bound: number;
  detected: boolean;
}

/** Why a comparison could not be scored. Each is a fail, never a quiet pass. */
export type InconclusiveReason =
  | 'no-measurements'
  | 'grid-mismatch'
  | 'variable-mismatch'
  | 'empty-mask'
  | 'measurements-within-radius'
  | 'buffer-covers-domain';

export type LeakageVerdict =
  | { conclusive: false; reason: InconclusiveReason; detail: string }
  | { conclusive: true; scores: MaskScore[]; worst: MaskScore; leaking: boolean };

/** Metres between two lon/lat pairs, flat-earth over a domain this size. */
function metresBetween(
  longitudeA: number,
  latitudeA: number,
  longitudeB: number,
  latitudeB: number,
): number {
  const north = (latitudeA - latitudeB) * KM_PER_DEGREE_LATITUDE * 1000;
  const east =
    (longitudeA - longitudeB) *
    KM_PER_DEGREE_LATITUDE *
    1000 *
    Math.cos((((latitudeA + latitudeB) / 2) * Math.PI) / 180);
  return Math.hypot(north, east);
}

/**
 * A released product as this scorer reads it, from the holding the release names:
 * the grid and variables from its ground-truth manifest, and its bytes as floats.
 * The bytes are the released form — nothing is recomputed here.
 */
export function releasedProduct(manifest: Manifest, bytes: Uint8Array): ReleasedProduct {
  return {
    grid: manifest.grid,
    variables: manifest.variables.map((variable) => variable.name),
    values: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
  };
}

/** The horizontal cells within the identification radius of any measurement. */
export function bufferedCells(
  grid: Manifest['grid'],
  geometry: MeasurementGeometry,
): Uint8Array {
  const buffer = new Uint8Array(grid.longitude.count * grid.latitude.count);
  for (let latIndex = 0; latIndex < grid.latitude.count; latIndex++) {
    const latitude = grid.latitude.minimum + latIndex * grid.latitude.spacing;
    for (let lonIndex = 0; lonIndex < grid.longitude.count; lonIndex++) {
      const longitude = grid.longitude.minimum + lonIndex * grid.longitude.spacing;
      for (const measurement of geometry.measurements) {
        if (
          metresBetween(longitude, latitude, measurement.longitude, measurement.latitude) <=
          geometry.identification_radius_m
        ) {
          buffer[latIndex * grid.longitude.count + lonIndex] = 1;
          break;
        }
      }
    }
  }
  return buffer;
}

/** The widest separation between two measurements in the interval, in metres. */
export function measurementSpanMetres(measurements: readonly RunManifestMeasurement[]): number {
  let widest = 0;
  for (let a = 0; a < measurements.length; a++) {
    for (let b = a + 1; b < measurements.length; b++) {
      widest = Math.max(
        widest,
        metresBetween(
          measurements[a].longitude,
          measurements[a].latitude,
          measurements[b].longitude,
          measurements[b].latitude,
        ),
      );
    }
  }
  return widest;
}

function sameGrid(before: Manifest['grid'], after: Manifest['grid']): boolean {
  const axes = ['longitude', 'latitude', 'depth', 'time'] as const;
  return axes.every((axis) => {
    const a = before[axis] as { count: number };
    const b = after[axis] as { count: number };
    return a.count === b.count;
  });
}

/**
 * Score the change mask between two successive released products against the
 * geometry recorded for the interval between them.
 */
export function scoreUpdatedRegion(
  before: ReleasedProduct,
  after: ReleasedProduct,
  geometry: MeasurementGeometry | undefined,
): LeakageVerdict {
  if (!geometry || geometry.measurements.length === 0) {
    return {
      conclusive: false,
      reason: 'no-measurements',
      detail:
        'the run-manifest sibling carries no measurement geometry, so there is nothing to score the mask against; an absent geometry is refused rather than read as an empty one',
    };
  }
  if (!sameGrid(before.grid, after.grid)) {
    return {
      conclusive: false,
      reason: 'grid-mismatch',
      detail: 'the two released products are not on the same grid, so their cells are not comparable',
    };
  }
  if (
    before.variables.length !== after.variables.length ||
    before.variables.some((name, index) => name !== after.variables[index])
  ) {
    return {
      conclusive: false,
      reason: 'variable-mismatch',
      detail: `the two released products carry different variables (${before.variables.join(', ')} against ${after.variables.join(', ')})`,
    };
  }

  const span = measurementSpanMetres(geometry.measurements);
  if (span <= geometry.identification_radius_m) {
    return {
      conclusive: false,
      reason: 'measurements-within-radius',
      detail: `every measurement in the interval lies within one identification radius of every other (${Math.round(span)} m apart at the widest, radius ${geometry.identification_radius_m} m): the buffer is a single blob, and a mask that covers it says nothing about where inside it the sampling happened`,
    };
  }

  const buffer = bufferedCells(before.grid, geometry);
  const totalCells = buffer.length;
  const buffered = buffer.reduce((sum: number, cell) => sum + cell, 0);
  if (buffered === totalCells) {
    return {
      conclusive: false,
      reason: 'buffer-covers-domain',
      detail: `the buffer covers every cell of the domain (${totalCells}), so every mask scores one and no mask can be told from any other`,
    };
  }

  const cellsPerVariable =
    before.grid.time.count * before.grid.depth.count * totalCells;
  const union = new Uint8Array(totalCells);
  const scores: MaskScore[] = [];
  const chanceRate = buffered / totalCells;

  const scoreMask = (variable: string, mask: Uint8Array): MaskScore => {
    let changedCells = 0;
    let changedInBuffer = 0;
    for (let cell = 0; cell < totalCells; cell++) {
      if (mask[cell] === 0) continue;
      changedCells += 1;
      if (buffer[cell] === 1) changedInBuffer += 1;
    }
    const recovery = changedCells === 0 ? 0 : changedInBuffer / changedCells;
    // Three binomial standard errors above chance, for a mask of this size: the
    // bound comes from the comparison's own numbers rather than from a figure
    // typed in, so a coarser grid or a smaller mask widens it by itself.
    const bound =
      changedCells === 0
        ? 1
        : Math.min(1, chanceRate + 3 * Math.sqrt((chanceRate * (1 - chanceRate)) / changedCells));
    return {
      variable,
      changedCells,
      bufferedCells: buffered,
      totalCells,
      chanceRate,
      recovery,
      bound,
      detected: changedCells > 0 && recovery > bound,
    };
  };

  for (let variable = 0; variable < before.variables.length; variable++) {
    const mask = new Uint8Array(totalCells);
    const base = variable * cellsPerVariable;
    for (let index = 0; index < cellsPerVariable; index++) {
      if (before.values[base + index] !== after.values[base + index]) {
        const cell = index % totalCells;
        mask[cell] = 1;
        union[cell] = 1;
      }
    }
    scores.push(scoreMask(before.variables[variable], mask));
  }
  scores.push(scoreMask('union', union));

  if (scores.every((score) => score.changedCells === 0)) {
    return {
      conclusive: false,
      reason: 'empty-mask',
      detail:
        'the two released products are identical value for value: there is no change mask to score, and a comparison with nothing in it is not a clean release',
    };
  }

  // The worst is the highest recovery among the masks that have any cells at all —
  // per variable and for the union, so a single leaking variable cannot be hidden
  // inside a domain-wide rewrite (V1's FR-015, the reason it is worded that way).
  const worst = scores
    .filter((score) => score.changedCells > 0)
    .reduce((worstSoFar, score) => (score.recovery > worstSoFar.recovery ? score : worstSoFar));
  return { conclusive: true, scores, worst, leaking: worst.detected };
}
