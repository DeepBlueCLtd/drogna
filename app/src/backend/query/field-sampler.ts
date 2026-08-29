/**
 * Sampling a holding's stored bytes at a point: nearest neighbour in all four
 * dimensions, which is what the subset statement says and all the honesty the grid
 * supports. The value served is the value STORED — never a fresh evaluation of the
 * analytic form — so what the query seam answers is what publication was digest-
 * checked against, and AT-01 scores that against the manifest's ground truth.
 */
import type { CoverageHolding, Manifest, ManifestSpatialAxis } from '../../generated/types.js';
import { parseEpochMicros } from '../lib/sim-time.js';

export interface SamplePoint {
  longitude: number;
  latitude: number;
  depthM: number;
  posixSeconds: number;
}

export interface Sampled {
  /** One value per variable, in the manifest's variable order. */
  values: number[];
  /** The grid point the request snapped to, honestly reported. */
  snapped: { longitude: number; latitude: number; depthM: number; simTime: string; secondsFromOrigin: number };
}

export type SampleResult = { ok: true; value: Sampled } | { ok: false; refusal: string };

function nearestIndex(axis: ManifestSpatialAxis, value: number): number | undefined {
  if (value < axis.minimum - axis.spacing / 2 || value > axis.maximum + axis.spacing / 2) return undefined;
  const index = Math.round((value - axis.minimum) / axis.spacing);
  return Math.min(Math.max(index, 0), axis.count - 1);
}

export function axisValueAt(axis: ManifestSpatialAxis, index: number): number {
  return axis.minimum + index * axis.spacing;
}

export function timeAxisPosixOrigin(manifest: Manifest): number {
  return Number(parseEpochMicros(manifest.grid.time.origin_sim_time) / 1_000_000n);
}

export function sampleHolding(
  holding: { descriptor: CoverageHolding; bytes: Uint8Array },
  point: SamplePoint,
): SampleResult {
  const manifest = holding.descriptor.manifest;
  const { longitude, latitude, depth, time } = manifest.grid;
  const lonIndex = nearestIndex(longitude, point.longitude);
  const latIndex = nearestIndex(latitude, point.latitude);
  const depthIndex = nearestIndex(depth, point.depthM);
  if (lonIndex === undefined || latIndex === undefined || depthIndex === undefined) {
    return {
      ok: false,
      refusal: `position (${point.longitude}, ${point.latitude}, ${point.depthM} m) is outside the collection's spatial extent lon [${longitude.minimum}, ${longitude.maximum}], lat [${latitude.minimum}, ${latitude.maximum}], depth [${depth.minimum}, ${depth.maximum}] m`,
    };
  }
  const originPosix = timeAxisPosixOrigin(manifest);
  const secondsFromOrigin = point.posixSeconds - originPosix;
  const stepIndexRaw = Math.round((secondsFromOrigin - time.start_offset_seconds) / time.step_seconds);
  if (stepIndexRaw < 0 || stepIndexRaw > time.count - 1) {
    const begin = time.start_offset_seconds;
    const end = time.start_offset_seconds + (time.count - 1) * time.step_seconds;
    return {
      ok: false,
      refusal: `time ${point.posixSeconds}s (POSIX) is outside the collection's temporal extent: [${begin}, ${end}] seconds from ${time.origin_sim_time}`,
    };
  }
  const timeIndex = stepIndexRaw;

  const cellsPerVariable = time.count * depth.count * latitude.count * longitude.count;
  const index =
    ((timeIndex * depth.count + depthIndex) * latitude.count + latIndex) * longitude.count + lonIndex;
  const view = new DataView(holding.bytes.buffer, holding.bytes.byteOffset, holding.bytes.byteLength);
  const values = manifest.variables.map((_, variableIndex) =>
    view.getFloat32((variableIndex * cellsPerVariable + index) * 4, true),
  );
  const snappedSeconds = time.start_offset_seconds + timeIndex * time.step_seconds;
  return {
    ok: true,
    value: {
      values,
      snapped: {
        longitude: axisValueAt(longitude, lonIndex),
        latitude: axisValueAt(latitude, latIndex),
        depthM: axisValueAt(depth, depthIndex),
        simTime: posixToIso(originPosix + snappedSeconds),
        secondsFromOrigin: snappedSeconds,
      },
    },
  };
}

export interface SampledGrid {
  /** The grid axis values inside the requested box, ascending. */
  lons: number[];
  lats: number[];
  snapped: { depthM: number; simTime: string; secondsFromOrigin: number };
  /** Per variable in manifest order: values row-major (y outer, x inner). */
  values: number[][];
}

export type GridSampleResult = { ok: true; value: SampledGrid } | { ok: false; refusal: string };

/**
 * Sampling a holding over a bounding box at one depth and one instant: the stored
 * grid points falling inside the box, values from the stored bytes — the area
 * query's whole implementation, and the map's one source of field pixels.
 */
export function sampleGrid(
  holding: { descriptor: CoverageHolding; bytes: Uint8Array },
  box: { west: number; south: number; east: number; north: number },
  depthM: number,
  posixSeconds: number,
): GridSampleResult {
  const manifest = holding.descriptor.manifest;
  const { longitude, latitude, depth, time } = manifest.grid;
  const lonRange = indicesInside(longitude, box.west, box.east);
  const latRange = indicesInside(latitude, box.south, box.north);
  if (!lonRange || !latRange) {
    return {
      ok: false,
      refusal: `the requested box lon [${box.west}, ${box.east}], lat [${box.south}, ${box.north}] contains no grid point of the collection's extent lon [${longitude.minimum}, ${longitude.maximum}], lat [${latitude.minimum}, ${latitude.maximum}]`,
    };
  }
  const depthIndex = nearestIndex(depth, depthM);
  if (depthIndex === undefined) {
    return { ok: false, refusal: `depth ${depthM} m is outside the collection's extent [${depth.minimum}, ${depth.maximum}] m` };
  }
  const originPosix = timeAxisPosixOrigin(manifest);
  const secondsFromOrigin = posixSeconds - originPosix;
  const timeIndex = Math.round((secondsFromOrigin - time.start_offset_seconds) / time.step_seconds);
  if (timeIndex < 0 || timeIndex > time.count - 1) {
    const begin = time.start_offset_seconds;
    const end = time.start_offset_seconds + (time.count - 1) * time.step_seconds;
    return {
      ok: false,
      refusal: `time ${posixSeconds}s (POSIX) is outside the collection's temporal extent: [${begin}, ${end}] seconds from ${time.origin_sim_time}`,
    };
  }

  const view = new DataView(holding.bytes.buffer, holding.bytes.byteOffset, holding.bytes.byteLength);
  const cellsPerVariable = time.count * depth.count * latitude.count * longitude.count;
  const values = manifest.variables.map((_, variableIndex) => {
    const grid: number[] = [];
    for (let latIndex = latRange.first; latIndex <= latRange.last; latIndex++) {
      for (let lonIndex = lonRange.first; lonIndex <= lonRange.last; lonIndex++) {
        const index =
          ((timeIndex * depth.count + depthIndex) * latitude.count + latIndex) * longitude.count + lonIndex;
        grid.push(view.getFloat32((variableIndex * cellsPerVariable + index) * 4, true));
      }
    }
    return grid;
  });
  const snappedSeconds = time.start_offset_seconds + timeIndex * time.step_seconds;
  return {
    ok: true,
    value: {
      lons: rangeValues(longitude, lonRange),
      lats: rangeValues(latitude, latRange),
      snapped: {
        depthM: axisValueAt(depth, depthIndex),
        simTime: posixToIso(originPosix + snappedSeconds),
        secondsFromOrigin: snappedSeconds,
      },
      values,
    },
  };
}

function indicesInside(
  axis: ManifestSpatialAxis,
  low: number,
  high: number,
): { first: number; last: number } | undefined {
  const first = Math.max(Math.ceil((low - axis.minimum) / axis.spacing - 1e-9), 0);
  const last = Math.min(Math.floor((high - axis.minimum) / axis.spacing + 1e-9), axis.count - 1);
  return first > last ? undefined : { first, last };
}

function rangeValues(axis: ManifestSpatialAxis, range: { first: number; last: number }): number[] {
  return Array.from({ length: range.last - range.first + 1 }, (_, i) => axisValueAt(axis, range.first + i));
}

export function posixToIso(posixSeconds: number): string {
  const micros = BigInt(Math.round(posixSeconds * 1e6));
  const wholeMicros = ((micros % 1_000_000n) + 1_000_000n) % 1_000_000n;
  const millis = (micros - wholeMicros) / 1000n;
  const seconds = new Date(Number(millis)).toISOString().slice(0, 19);
  return `${seconds}.${wholeMicros.toString().padStart(6, '0')}Z`;
}
