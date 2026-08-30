/**
 * Feature 109: the map's pure data builders — testable without WebGL, because the
 * canvas is presentation and these are the facts it presents.
 */
import { describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import type { Plan } from '../../generated/types.js';
import {
  PROVENANCE_INK,
  provenanceCells,
  demandRay,
  graticule,
  gridCells,
  insideRing,
  manifestInstants,
  nearestInstant,
  ownshipTrack,
  projectionCells,
  rampColour,
  routePositionAt,
  type GridCoverage,
  validAt,
} from './map-data.js';

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

  it('generates the graticule locally: full longitude sweep, latitudes short of the poles', () => {
    const paths = graticule(15);
    // 24 meridians (360/15) and 11 parallels (-80 stepping 15 up to 70).
    expect(paths.length).toBe(24 + 11);
    for (const path of paths) {
      for (const [lon, lat] of path) {
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(80);
      }
    }
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

  it('says whether a picked position is inside the domain ring, edges included by side', () => {
    // The domain as the reference collection serves it: a closed lon/lat ring.
    const ring: [number, number][] = [
      [-14, 44],
      [-8, 44],
      [-8, 48],
      [-14, 48],
      [-14, 44],
    ];
    expect(insideRing(ring, -11, 46)).toBe(true);
    expect(insideRing(ring, -20, 46)).toBe(false);
    expect(insideRing(ring, -11, 40)).toBe(false);
    expect(insideRing(ring, -11, 52)).toBe(false);
    // Half-open: the west and south edges are in, the east and north are out, so a
    // click on a shared edge belongs to exactly one side.
    expect(insideRing(ring, -14, 46)).toBe(true);
    expect(insideRing(ring, -8, 46)).toBe(false);
    expect(insideRing(ring, -11, 44)).toBe(true);
    expect(insideRing(ring, -11, 48)).toBe(false);
  });

  it('takes the field\'s instants from the manifest and snaps the displayed one to them (#60)', () => {
    const instants = manifestInstants({
      origin_sim_time: '2026-01-01T00:00:00.000000Z',
      start_offset_seconds: 0,
      step_seconds: 3600,
      count: 4,
    });
    expect(instants).toEqual([
      '2026-01-01T00:00:00.000000Z',
      '2026-01-01T01:00:00.000000Z',
      '2026-01-01T02:00:00.000000Z',
      '2026-01-01T03:00:00.000000Z',
    ]);
    // Inside the axis: the nearest step, which is the one the server's own
    // nearest-neighbour sampler would answer with.
    expect(nearestInstant(instants, '2026-01-01T00:29:00.000000Z')?.instant).toBe(
      '2026-01-01T00:00:00.000000Z',
    );
    expect(nearestInstant(instants, '2026-01-01T00:31:00.000000Z')?.instant).toBe(
      '2026-01-01T01:00:00.000000Z',
    );
    // A tie goes to the earlier step, by rule rather than by accident.
    expect(nearestInstant(instants, '2026-01-01T00:30:00.000000Z')?.instant).toBe(
      '2026-01-01T00:00:00.000000Z',
    );
    // Outside it: clamped, and named as outside, so the panel can admit that the
    // field is showing an end of its extent rather than the instant displayed.
    expect(nearestInstant(instants, '2025-12-31T23:00:00.000000Z')).toEqual({
      instant: '2026-01-01T00:00:00.000000Z',
      beyond: 'before',
    });
    expect(nearestInstant(instants, '2026-01-01T09:00:00.000000Z')).toEqual({
      instant: '2026-01-01T03:00:00.000000Z',
      beyond: 'after',
    });
    expect(nearestInstant([], '2026-01-01T00:00:00.000000Z')).toBeUndefined();
    expect(nearestInstant(instants, '')).toBeUndefined();
  });
});

describe('the ownship track (feature 113)', () => {
  it('orders by phenomenon time and keeps only what has a position', () => {
    const at = (lon: number, lat: number, depth: number) => ({
      feature: { type: 'Point', coordinates: [lon, lat, depth] },
    });
    const track = ownshipTrack([
      { phenomenonTime: '2026-01-01T02:00:00.000000Z', result: 90, FeatureOfInterest: at(-11, 46, 50) },
      { phenomenonTime: '2026-01-01T01:00:00.000000Z', result: 88, FeatureOfInterest: at(-12, 45, 40) },
      // No geometry: dropped, not defaulted to zero, which would put the platform in
      // the Gulf of Guinea.
      { phenomenonTime: '2026-01-01T03:00:00.000000Z', result: 91 },
    ]);
    expect(track.map((point) => point.simTime)).toEqual([
      '2026-01-01T01:00:00.000000Z',
      '2026-01-01T02:00:00.000000Z',
    ]);
    expect(track[0].latitude).toBe(45);
  });

  it('an empty answer is an empty track, never a stub', () => {
    expect(ownshipTrack([])).toEqual([]);
  });

  it('the demanded ray points where it was told, and is absent when nothing was', () => {
    const here = { longitude: -11, latitude: 46 };
    // Due east: all of it into longitude, none into latitude.
    const east = demandRay(here, 90, 3, 1000);
    expect(east?.[1][1]).toBeCloseTo(46, 9);
    expect(east?.[1][0]).toBeGreaterThan(-11);
    // Due north: the other way round.
    const north = demandRay(here, 0, 3, 1000);
    expect(north?.[1][0]).toBeCloseTo(-11, 9);
    expect(north?.[1][1]).toBeGreaterThan(46);
    // No standing demand: no ray. A ray along the current course would say the
    // platform had been told to carry on, which nobody told it.
    expect(demandRay(here, undefined, 3, 1000)).toBeUndefined();
    expect(demandRay(here, 90, undefined, 1000)).toBeUndefined();
  });
});

describe('the provenance tint (feature 115)', () => {
  const grid = (shares: Record<string, number[]>): GridCoverage => ({
    domain: {
      domainType: 'Grid',
      axes: { x: { values: [-12, -11.75] }, y: { values: [45, 45.2] }, z: { values: [50] }, t: { values: ['2026-01-01T00:00:00.000000Z'] } },
    },
    ranges: Object.fromEntries(
      Object.entries(shares).map(([name, values]) => [name, { shape: [1, 1, 2, 2], values }]),
    ),
  });

  const NAMES = [
    'temperature_share_archive',
    'temperature_share_departure_forecast',
    'temperature_share_measurement',
    'temperature_share_model',
  ];

  it('tints each cell by the share that owns most of it', () => {
    // Four cells, one owned by each share in turn.
    const built = provenanceCells(
      grid({
        [NAMES[0]]: [0.7, 0.1, 0.1, 0.1],
        [NAMES[1]]: [0.1, 0.7, 0.1, 0.1],
        [NAMES[2]]: [0.1, 0.1, 0.7, 0.1],
        [NAMES[3]]: [0.1, 0.1, 0.1, 0.7],
      }),
      NAMES,
    );
    expect(built?.cells.map((cell) => cell.dominant)).toEqual([0, 1, 2, 3]);
    expect(built?.cells.every((cell) => cell.fraction === 0.7)).toBe(true);
    expect(built?.overshooting).toBe(0);
    // Every position has a legend entry, or a cell would be drawn in an ink nothing
    // names.
    expect(PROVENANCE_INK).toHaveLength(NAMES.length);
  });

  it('counts an overshoot rather than rounding it to a full share', () => {
    // Where the analysis extrapolated past the reading, measurement holds more than
    // the whole cell and a prior share is negative. Both are reported as they stand.
    const built = provenanceCells(
      grid({
        [NAMES[0]]: [-0.12, 0.4, 0.4, 0.4],
        [NAMES[1]]: [0, 0.3, 0.3, 0.3],
        [NAMES[2]]: [1.12, 0.2, 0.2, 0.2],
        [NAMES[3]]: [0, 0.1, 0.1, 0.1],
      }),
      NAMES,
    );
    expect(built?.overshooting).toBe(1);
    expect(built?.cells[0].dominant).toBe(2);
    expect(built?.cells[0].fraction).toBeCloseTo(1.12, 6);
  });

  it('declines a coverage that is not a grid, or that lacks a share it was asked for', () => {
    const notGrid = { ...grid({ [NAMES[0]]: [1, 1, 1, 1] }) };
    notGrid.domain = { ...notGrid.domain, domainType: 'Trajectory' };
    expect(provenanceCells(notGrid, NAMES)).toBeUndefined();
    expect(provenanceCells(grid({ [NAMES[0]]: [1, 1, 1, 1] }), NAMES)).toBeUndefined();
    expect(provenanceCells(grid({ [NAMES[0]]: [1, 1, 1, 1] }), [])).toBeUndefined();
  });
});
