/**
 * The depth-cube's pure half (issue #59). The frame's inverse is what places an EDR
 * query from a click on a slice, so it is held as a round trip: a point put into the
 * cube and taken back out must be the point that went in, or the composed URL asks
 * about somewhere the reader did not click.
 */
import { describe, expect, it } from 'vitest';
import { axisValues, cubeFrame, ownshipInCube, volumeEdges, type CubeBounds } from './cube.js';

const bounds: CubeBounds = { west: -14, east: -8, south: 44, north: 48, deepest: 1000 };

describe('the depth cube (issue #59)', () => {
  it('takes the levels from the axis the manifest states, not from dividing the extent', () => {
    expect(axisValues({ minimum: 0, maximum: 1000, count: 6, spacing: 200 })).toEqual([
      0, 200, 400, 600, 800, 1000,
    ]);
    // The archive's coarser axis: four levels, and the last one is the extent's own
    // maximum — a manifest whose spacing and extent disagreed would show up here.
    expect(axisValues({ minimum: 0, maximum: 900, count: 4, spacing: 300 })).toEqual([0, 300, 600, 900]);
  });

  it('carries a position into the cube and back out unchanged (the click round trip)', () => {
    const frame = cubeFrame(bounds);
    for (const [longitude, latitude, depth] of [
      [-11, 46, 0],
      [-13.75, 44.25, 200],
      [-8.5, 47.9, 1000],
    ] as [number, number, number][]) {
      const [x, y, z] = frame.toCartesian(longitude, latitude, depth);
      expect(frame.toGeographic(x, y)).toEqual({ longitude, latitude });
      expect(frame.depthAt(z)).toBeCloseTo(depth, 6);
    }
  });

  it('draws depth downwards and keeps a slice square with the domain', () => {
    const frame = cubeFrame(bounds);
    // Depth is positive downwards in the documents, so deeper draws lower.
    expect(frame.toCartesian(-11, 46, 0)[2]).toBe(0);
    expect(frame.toCartesian(-11, 46, 500)[2]).toBeLessThan(0);
    expect(frame.toCartesian(-11, 46, 1000)[2]).toBeLessThan(frame.toCartesian(-11, 46, 500)[2]);
    // One scale for both horizontal axes: six degrees of longitude and four of
    // latitude keep their 3:2 ratio, so a slice is not stretched into a square.
    const [xWest] = frame.toCartesian(bounds.west, 46, 0);
    const [xEast] = frame.toCartesian(bounds.east, 46, 0);
    const [, ySouth] = frame.toCartesian(-11, bounds.south, 0);
    const [, yNorth] = frame.toCartesian(-11, bounds.north, 0);
    expect((xEast - xWest) / (yNorth - ySouth)).toBeCloseTo(6 / 4, 10);
    // A depth beyond the volume is clamped rather than reported as a place.
    expect(frame.depthAt(-1000)).toBe(1000);
    expect(frame.depthAt(20)).toBe(0);
  });

  it('frames the volume with twelve edges: two faces and four uprights', () => {
    const edges = volumeEdges(cubeFrame(bounds));
    expect(edges).toHaveLength(6);
    expect(edges[0]).toHaveLength(5);
    expect(edges[0][0]).toEqual(edges[0][4]);
    // Every upright runs from the surface to the deepest level, straight down.
    for (const upright of edges.slice(2)) {
      expect(upright).toHaveLength(2);
      expect(upright[0][0]).toBeCloseTo(upright[1][0], 10);
      expect(upright[0][1]).toBeCloseTo(upright[1][1], 10);
      expect(upright[0][2]).toBe(0);
      expect(upright[1][2]).toBeLessThan(0);
    }
  });
});

describe('the platform in the volume (feature 115, FR-74)', () => {
  const frame = cubeFrame({ west: -2, east: -1, south: 50, north: 51, deepest: 400 });

  it('draws the track at the depths the platform reported, not at the surface', () => {
    // The claim SC-07 makes, and the one this file exists to hold: the plan view and the
    // globe flatten a track of necessity, and the volume must not. A track along the
    // floor of a display whose subject is depth is the panel discarding the one dimension
    // that view exists for.
    const { track } = ownshipInCube(
      frame,
      [
        { longitude: -1.5, latitude: 50.5, depthM: 0 },
        { longitude: -1.4, latitude: 50.6, depthM: 100 },
        { longitude: -1.3, latitude: 50.7, depthM: 300 },
      ],
      undefined,
      undefined,
    );
    expect(track).toHaveLength(3);
    const heights = track.map(([, , z]) => z);
    // Distinct, ordered downwards, and derived from the frame rather than typed here.
    expect(new Set(heights).size).toBe(3);
    expect(heights[0]).toBe(0);
    expect(heights[1]).toBeGreaterThan(heights[2]);
    expect(frame.depthAt(heights[1])).toBeCloseTo(100);
    expect(frame.depthAt(heights[2])).toBeCloseTo(300);
  });

  it('draws the demanded course at the depth the platform is at, not at the surface', () => {
    const { demand } = ownshipInCube(
      frame,
      [],
      [
        [-1.5, 50.5],
        [-1.4, 50.6],
      ],
      120,
    );
    expect(demand).toHaveLength(2);
    // A demand carries a course and a speed and says nothing about descending, so the ray
    // sits at the reported depth. On the surface it would say the platform had been told
    // to come up, which nobody told it.
    for (const [, , z] of demand ?? []) expect(frame.depthAt(z)).toBeCloseTo(120);
  });

  it('draws no ray where no demand is standing, and none where no depth was reported', () => {
    expect(ownshipInCube(frame, [], undefined, 120).demand).toBeUndefined();
    expect(
      ownshipInCube(frame, [], [[-1.5, 50.5], [-1.4, 50.6]], undefined).demand,
    ).toBeUndefined();
  });
});
