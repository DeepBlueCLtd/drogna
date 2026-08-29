/**
 * The updated-region leakage score (issue #57). A leakage check that has never
 * been seen to catch a leak is not evidence of anything (V1's FR-013), so the
 * case where a known leak must be caught is a first-class test here rather than a
 * plant done once by hand: a release that only updates where it measured is scored, and must be
 * detected. The inconclusive cases are held just as firmly, because each of them is
 * a way a check can report a pass it has not earned.
 */
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../generated/types.js';
import { bufferedCells, measurementSpanMetres, scoreUpdatedRegion, type ReleasedProduct } from './leakage.js';

const grid: Manifest['grid'] = {
  longitude: { minimum: -14, maximum: -8, count: 24, spacing: 0.26, units: 'degrees_east', direction: 'east' },
  latitude: { minimum: 44, maximum: 48, count: 20, spacing: 0.21, units: 'degrees_north', direction: 'north' },
  depth: { minimum: 0, maximum: 1000, count: 2, spacing: 1000, units: 'm', direction: 'down' },
  time: {
    origin_sim_time: '2026-01-01T00:00:00.000000Z',
    start_offset_seconds: 0,
    step_seconds: 3600,
    count: 2,
    units: 'seconds',
  },
} as Manifest['grid'];

const CELLS = grid.longitude.count * grid.latitude.count;
const PER_VARIABLE = grid.time.count * grid.depth.count * CELLS;
const VARIABLES = ['temperature', 'salinity'];

/** Two measurements far enough apart to span more than the radius below. */
const geometry = {
  identification_radius_m: 30_000,
  interval_seconds: 600,
  measurements: [
    { longitude: -13, latitude: 45, simulation_seconds: 0 },
    { longitude: -9, latitude: 47, simulation_seconds: 300 },
  ],
};

function product(fill: (variable: number, cell: number) => number): ReleasedProduct {
  const values = new Float32Array(VARIABLES.length * PER_VARIABLE);
  for (let variable = 0; variable < VARIABLES.length; variable++) {
    for (let index = 0; index < PER_VARIABLE; index++) {
      values[variable * PER_VARIABLE + index] = fill(variable, index % CELLS);
    }
  }
  return { grid, variables: VARIABLES, values };
}

describe('the updated-region leakage score (issue #57)', () => {
  const before = product(() => 10);
  const buffer = bufferedCells(grid, geometry);
  const bufferedCount = buffer.reduce((sum: number, cell) => sum + cell, 0);

  it('buffers the domain around the measurements, and neither nothing nor everything', () => {
    expect(bufferedCount).toBeGreaterThan(0);
    expect(bufferedCount).toBeLessThan(CELLS);
    // The span is what makes the comparison possible at all: two measurements
    // inside one radius of each other buffer to a single blob.
    expect(measurementSpanMetres(geometry.measurements)).toBeGreaterThan(
      geometry.identification_radius_m,
    );
  });

  it('detects a release that only updates where it measured', () => {
    // The leak: values move in the buffered cells and nowhere else, which is what
    // an observation-age-driven variable does to a released product.
    const after = product((_variable, cell) => (buffer[cell] === 1 ? 11 : 10));
    const verdict = scoreUpdatedRegion(before, after, geometry);
    expect(verdict.conclusive).toBe(true);
    if (!verdict.conclusive) return;
    expect(verdict.leaking).toBe(true);
    expect(verdict.worst.recovery).toBe(1);
    expect(verdict.worst.recovery).toBeGreaterThan(verdict.worst.bound);
  });

  it('scores a whole-domain rewrite at chance, and calls it clear', () => {
    const after = product((_variable, cell) => 10 + ((cell % 7) + 1) / 100);
    const verdict = scoreUpdatedRegion(before, after, geometry);
    expect(verdict.conclusive).toBe(true);
    if (!verdict.conclusive) return;
    expect(verdict.leaking).toBe(false);
    expect(verdict.worst.recovery).toBeCloseTo(bufferedCount / CELLS, 10);
  });

  it('will not let a domain-wide rewrite hide one leaking variable (V1 FR-015)', () => {
    // Temperature is rewritten everywhere; salinity moves only where measured.
    // The union of the two masks covers the domain and scores at chance — a check
    // reading only the union would report this pair as mitigated.
    const after = product((variable, cell) =>
      variable === 0 ? 10 + ((cell % 7) + 1) / 100 : buffer[cell] === 1 ? 11 : 10,
    );
    const verdict = scoreUpdatedRegion(before, after, geometry);
    expect(verdict.conclusive).toBe(true);
    if (!verdict.conclusive) return;
    const union = verdict.scores.find((score) => score.variable === 'union');
    expect(union?.detected).toBe(false);
    expect(verdict.worst.variable).toBe('salinity');
    expect(verdict.leaking).toBe(true);
  });

  it('refuses an absent geometry rather than reading it as an empty one', () => {
    const after = product(() => 11);
    expect(scoreUpdatedRegion(before, after, undefined)).toMatchObject({
      conclusive: false,
      reason: 'no-measurements',
    });
    expect(
      scoreUpdatedRegion(before, after, { ...geometry, measurements: [] }),
    ).toMatchObject({ conclusive: false, reason: 'no-measurements' });
  });

  it('reports the inconclusive cases by name, and never as a pass', () => {
    // Identical products: no mask to score.
    expect(scoreUpdatedRegion(before, product(() => 10), geometry)).toMatchObject({
      conclusive: false,
      reason: 'empty-mask',
    });
    // Measurements that do not span the radius: the buffer is one blob.
    const loitering = {
      ...geometry,
      measurements: [
        { longitude: -11, latitude: 46, simulation_seconds: 0 },
        { longitude: -11.01, latitude: 46.01, simulation_seconds: 300 },
      ],
    };
    expect(scoreUpdatedRegion(before, product(() => 11), loitering)).toMatchObject({
      conclusive: false,
      reason: 'measurements-within-radius',
    });
    // A radius wide enough to buffer the whole domain: every mask scores one. The
    // measurements still span more than the radius, so this is the buffer's own
    // case rather than the blob case above.
    const wide = {
      ...geometry,
      identification_radius_m: 350_000,
      measurements: [
        { longitude: -14, latitude: 44, simulation_seconds: 0 },
        { longitude: -8, latitude: 48, simulation_seconds: 100 },
        { longitude: -11, latitude: 46, simulation_seconds: 200 },
      ],
    };
    expect(measurementSpanMetres(wide.measurements)).toBeGreaterThan(wide.identification_radius_m);
    expect(scoreUpdatedRegion(before, product(() => 11), wide)).toMatchObject({
      conclusive: false,
      reason: 'buffer-covers-domain',
    });
    // Products that are not comparable at all.
    const coarser = {
      ...before,
      grid: { ...grid, depth: { ...grid.depth, count: 3 } } as Manifest['grid'],
    };
    expect(scoreUpdatedRegion(before, coarser, geometry)).toMatchObject({
      conclusive: false,
      reason: 'grid-mismatch',
    });
    expect(
      scoreUpdatedRegion(before, { ...before, variables: ['temperature', 'observation_age'] }, geometry),
    ).toMatchObject({ conclusive: false, reason: 'variable-mismatch' });
  });
});
