/**
 * Feature 109: the map's pure data builders — testable without WebGL, because the
 * canvas is presentation and these are the facts it presents.
 */
import { describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import type { Plan } from '../../generated/types.js';
import { gridCells, projectionCells, rampColour, routePositionAt, validAt, type GridCoverage } from './map-data.js';

const coverage: GridCoverage = {
  domain: {
    domainType: 'Grid',
    axes: {
      x: { values: [-12, -11.5, -11] },
      y: { values: [45, 45.4] },
      z: { values: [50] },
      t: { values: ['2026-01-01T00:00:00.000000Z'] },
    },
  },
  ranges: { temperature: { shape: [1, 1, 2, 3], values: [10, 11, 12, 13, 14, 15] } },
};

describe('the map data builders (feature 109)', () => {
  it('turns a Grid coverage into drawable cells, row-major, with the observed range', () => {
    const grid = gridCells(coverage, 'temperature');
    expect(grid).toBeDefined();
    expect(grid?.cells.length).toBe(6);
    expect(grid?.minimum).toBe(10);
    expect(grid?.maximum).toBe(15);
    // Cell 4 is (latIndex 1, lonIndex 1): centred on (-11.5, 45.4), half-spacings 0.25/0.2.
    expect(grid?.cells[4].value).toBe(14);
    const [west, south, east, north] = grid?.cells[4].bounds ?? [];
    expect(west).toBeCloseTo(-11.75, 10);
    expect(south).toBeCloseTo(45.2, 10);
    expect(east).toBeCloseTo(-11.25, 10);
    expect(north).toBeCloseTo(45.6, 10);
    // A parameter the coverage does not carry is not drawn, not invented.
    expect(gridCells(coverage, 'sound_speed')).toBeUndefined();
  });

  it('the ramp is bounded and monotone in lightness, so it stays legible in greyscale', () => {
    const low = rampColour(10, 10, 15);
    const high = rampColour(15, 10, 15);
    const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance(high)).toBeGreaterThan(luminance(low));
    for (const channel of [...low, ...high]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it('advisory validity is start-inclusive, end-exclusive against the displayed instant', () => {
    const advisory = {
      valid_time: {
        start_sim_time: '2026-01-01T01:00:00.000000Z',
        end_sim_time: '2026-01-01T05:00:00.000000Z',
      },
    };
    expect(validAt(advisory, '2026-01-01T00:59:59.000000Z')).toBe(false);
    expect(validAt(advisory, '2026-01-01T01:00:00.000000Z')).toBe(true);
    expect(validAt(advisory, '2026-01-01T04:59:59.000000Z')).toBe(true);
    expect(validAt(advisory, '2026-01-01T05:00:00.000000Z')).toBe(false);
  });

  it('interpolates the platform along the route at the displayed instant, and holds at the ends', () => {
    const plan = {
      platform: { latitude: 46, longitude: -11, depth_m: 0 },
      horizon: {
        start_sim_time: '2026-01-01T00:00:00.000000Z',
        end_sim_time: '2026-01-01T06:00:00.000000Z',
        span_seconds: 21600,
      },
      route: {
        vertices: [
          {
            sequence: 0,
            h3_index: latLngToCell(46.2, -11.2, 5),
            depth_band: 0,
            arrival_sim_time: '2026-01-01T01:00:00.000000Z',
            latitude: 46.2,
            longitude: -11.2,
            depth_m: 60,
            marginal_value: 1,
          },
          {
            sequence: 1,
            h3_index: latLngToCell(46.4, -11.4, 5),
            depth_band: 0,
            arrival_sim_time: '2026-01-01T03:00:00.000000Z',
            latitude: 46.4,
            longitude: -11.4,
            depth_m: 80,
            marginal_value: 1,
          },
        ],
      },
    } as unknown as Plan;

    const before = routePositionAt(plan, '2025-12-31T23:00:00.000000Z');
    expect(before).toMatchObject({ longitude: -11, latitude: 46, towardSequence: 0 });

    // Halfway between the two arrivals: halfway between the two vertices.
    const between = routePositionAt(plan, '2026-01-01T02:00:00.000000Z');
    expect(between?.longitude).toBeCloseTo(-11.3, 10);
    expect(between?.latitude).toBeCloseTo(46.3, 10);
    expect(between?.depthM).toBeCloseTo(70, 10);
    expect(between?.towardSequence).toBe(1);

    const after = routePositionAt(plan, '2026-01-01T05:00:00.000000Z');
    expect(after).toMatchObject({ longitude: -11.4, latitude: 46.4, towardSequence: null });
  });

  it('shades projection cells by the fraction of saturation, capped at one', () => {
    const cell = latLngToCell(46, -11, 5);
    const plan = {
      projection: {
        regions: [
          {
            h3_index: cell,
            depth_band: 0,
            state: 'crossing',
            crossing_sim_time: '2026-01-01T02:00:00.000000Z',
            uncertainty_now: 0.3,
            saturated_uncertainty: 0.6,
            timescale_seconds: 86400,
          },
          {
            h3_index: cell,
            depth_band: 1,
            state: 'already-lapsed',
            crossing_sim_time: null,
            uncertainty_now: 0.9,
            saturated_uncertainty: 0.6,
            timescale_seconds: 86400,
          },
        ],
      },
    } as unknown as Plan;
    const band0 = projectionCells(plan, 0);
    expect(band0).toHaveLength(1);
    expect(band0[0].fraction).toBeCloseTo(0.5, 10);
    expect(band0[0].boundary.length).toBeGreaterThanOrEqual(6);
    const band1 = projectionCells(plan, 1);
    expect(band1[0].fraction).toBe(1);
  });
});
