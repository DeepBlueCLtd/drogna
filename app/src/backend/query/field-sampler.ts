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

export function posixToIso(posixSeconds: number): string {
  const micros = BigInt(Math.round(posixSeconds * 1e6));
  const wholeMicros = ((micros % 1_000_000n) + 1_000_000n) % 1_000_000n;
  const millis = (micros - wholeMicros) / 1000n;
  const seconds = new Date(Number(millis)).toISOString().slice(0, 19);
  return `${seconds}.${wholeMicros.toString().padStart(6, '0')}Z`;
}
