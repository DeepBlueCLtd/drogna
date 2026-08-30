/**
 * The chart's geometry (feature 121, FR-08, FR-09, SC-006).
 */
import { describe, expect, it } from 'vitest';
import { instantToMillis, path, series, valueTicks } from './series.js';
import type { ObservationPoint } from './read.js';

function point(simTime: string, result: number, id = simTime): ObservationPoint {
  return { id, simTime, result };
}

describe('the measurement series', () => {
  it('reads a microsecond simulation instant', () => {
    expect(instantToMillis('2026-01-01T00:00:00.000000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    expect(instantToMillis('2026-01-01T00:00:01.500000Z')).toBe(Date.parse('2026-01-01T00:00:01.500Z'));
  });

  it('takes its extent from the observations, never from an expectation', () => {
    const drawn = series(
      [
        point('2026-01-01T00:00:00.000000Z', 10),
        point('2026-01-01T01:00:00.000000Z', 14),
        point('2026-01-01T02:00:00.000000Z', 12),
      ],
      100,
      50,
    );
    expect(drawn?.value).toEqual({ minimum: 10, maximum: 14 });
    // The extremes land on the box's edges, so the line uses the height it is given.
    expect(drawn?.plotted[1].y).toBeCloseTo(0);
    expect(drawn?.plotted[0].y).toBeCloseTo(50);
    expect(drawn?.plotted[0].x).toBeCloseTo(0);
    expect(drawn?.plotted[2].x).toBeCloseTo(100);
  });

  it('sorts by simulation time rather than by arrival', () => {
    const drawn = series(
      [point('2026-01-01T02:00:00.000000Z', 3), point('2026-01-01T00:00:00.000000Z', 1)],
      100,
      50,
    );
    expect(drawn?.plotted.map((entry) => entry.point.result)).toEqual([1, 3]);
  });

  it('draws a series that never moved as a flat line, not a division by zero', () => {
    const drawn = series(
      [point('2026-01-01T00:00:00.000000Z', 7), point('2026-01-01T01:00:00.000000Z', 7)],
      100,
      50,
    );
    expect(drawn?.plotted.every((entry) => Number.isFinite(entry.y))).toBe(true);
    expect(drawn?.plotted[0].y).toBeCloseTo(25);
    expect(drawn?.value).toEqual({ minimum: 7, maximum: 7 });
  });

  it('puts a single reading in the middle rather than on the axis, where it would read as absent', () => {
    const drawn = series([point('2026-01-01T00:00:00.000000Z', 4)], 100, 50);
    expect(drawn?.plotted[0].x).toBeCloseTo(50);
  });

  it('is undefined for no observations, so the caller must say why rather than draw empty axes', () => {
    expect(series([], 100, 50)).toBeUndefined();
    expect(series([point('not-an-instant', 1)], 100, 50)).toBeUndefined();
  });

  it('plots every observation it was given: a chart that drops points is a chart that lies', () => {
    const points = Array.from({ length: 250 }, (_, index) =>
      point(new Date(Date.UTC(2026, 0, 1) + index * 60000).toISOString(), Math.sin(index)),
    );
    const drawn = series(points, 100, 50);
    if (!drawn) throw new Error('250 observations produced no series');
    expect(drawn.plotted).toHaveLength(250);
    expect(path(drawn.plotted).split(' ')).toHaveLength(250);
  });

  it('labels the axis with the values observed, not with the padded band', () => {
    const drawn = series(
      [point('2026-01-01T00:00:00.000000Z', 10), point('2026-01-01T01:00:00.000000Z', 20)],
      100,
      50,
    );
    if (!drawn) throw new Error('two observations produced no series');
    expect(valueTicks(drawn).map((tick) => tick.value)).toEqual([20, 15, 10]);
  });
});
