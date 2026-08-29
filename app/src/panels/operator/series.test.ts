/**
 * The rolling windows (FR-58). Each assertion here was watched failing: the bound
 * removed (the window grew without limit), the gap split removed (a line slid through
 * a silence), and the empty case made to return a zero-height line rather than
 * nothing.
 */
import { describe, expect, it } from 'vitest';
import { Series } from './series.js';

const BOX = { x: 0, y: 0, width: 100, height: 10 };

describe('the faces’ rolling windows (feature 113)', () => {
  it('is bounded, and drops the oldest rather than the newest', () => {
    const series = new Series(3);
    for (let tick = 0; tick < 10; tick++) series.push(tick, tick);
    expect(series.length).toBe(3);
    expect(series.all().map((sample) => sample.tick)).toEqual([7, 8, 9]);
    expect(series.latest()?.value).toBe(9);
  });

  it('an empty series is empty, and is not a flat line at zero', () => {
    const series = new Series(5);
    expect(series.empty).toBe(true);
    // Nothing to draw, and nothing drawn: the caller says so in words instead.
    expect(series.segments(BOX, 1)).toEqual([]);
    expect(series.latest()).toBeUndefined();
  });

  it('a single sample is still not a line', () => {
    const series = new Series(5);
    series.push(4, 12);
    expect(series.empty).toBe(false);
    expect(series.segments(BOX, 1)).toEqual([]);
  });

  it('a gap is drawn as a gap, not slid through', () => {
    const series = new Series(10);
    for (const tick of [0, 1, 2]) series.push(tick, tick);
    // A silence of thirty ticks where one was expected.
    for (const tick of [32, 33, 34]) series.push(tick, tick);
    const segments = series.segments(BOX, 1);
    expect(segments).toHaveLength(2);
    expect(segments[0].split(' ')).toHaveLength(3);
    expect(segments[1].split(' ')).toHaveLength(3);
  });

  it('a repeated tick is one instant reported twice, not a second measurement', () => {
    const series = new Series(10);
    series.push(7, 1);
    series.push(7, 99);
    expect(series.length).toBe(1);
    expect(series.latest()?.value).toBe(1);
  });

  it('a flat series is drawn flat rather than dividing by nothing', () => {
    const series = new Series(10);
    for (const tick of [0, 1, 2]) series.push(tick, 5);
    const points = series.segments(BOX, 1)[0].split(' ').map((p) => Number(p.split(',')[1]));
    expect(points.every((y) => Number.isFinite(y))).toBe(true);
    expect(new Set(points).size).toBe(1);
  });
});
