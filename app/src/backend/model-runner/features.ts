/**
 * Forecasting the seeded features AS FEATURES (SRD-v2 FR-113).
 *
 * A forecast that publishes only a field makes no falsifiable claim about next week; it
 * draws a picture of it. So the eddy's centre, radius and strength, the front's position
 * and orientation, the thermocline's depth and gradient, and the drifting feature's track
 * are estimated, carried forward, and published per step with an uncertainty that grows
 * with lead — and scored against the manifest's ground truth, with the bound derived from
 * what is on disk (AT-06; Constitution IX).
 *
 * **Estimated from the analysis the run initialises from, and from nothing else.** Reading
 * the parameters out of the ground-truth manifest would be a forecast made from the truth:
 * the exact fault feature 116 found, when the runner initialised from a now-cast the
 * generator had evaluated from the true ocean and nothing the platform measured ever
 * reached a forecast (ADR-0042 names this as the decision most at risk of reintroducing
 * it). Nothing in this module takes a manifest.
 *
 * **What each estimator can honestly claim, and what it cannot.** The two blobs are
 * separated by the sign of their anomaly — the eddy is warm, the drifting feature cold —
 * which is a property of the field and not a hint from the manifest. The front is found
 * where the horizontal gradient is strongest away from both blobs, and its *anchor* is a
 * point on a line rather than the authored anchor: a line has no distinguished point, so
 * the scorable claim is the perpendicular distance to the authored line and the bearing,
 * never the distance between two anchors. The thermocline is found between the two levels
 * whose temperature difference is steepest, which at six levels over a kilometre is a
 * claim resolved to the depth spacing and to nothing finer; the estimate says so by
 * carrying the spacing it was resolved at.
 */
import { KM_PER_DEGREE_LATITUDE, kmOffsets } from '../env-generator/analytic.js';
import type { KernelGrid, KernelParameters } from './kernel.js';

export interface FeatureGrid {
  readonly longitudes: readonly number[];
  readonly latitudes: readonly number[];
  readonly depthsM: readonly number[];
  readonly cellKmEast: number;
  readonly cellKmNorth: number;
  /** The latitude the local plane is built about, as the manifest's own drift is. */
  readonly referenceLatitude: number;
}

export interface BlobEstimate {
  readonly centreLatitude: number;
  readonly centreLongitude: number;
  readonly radiusKm: number;
  readonly strengthC: number;
}

export interface FrontEstimate {
  readonly anchorLatitude: number;
  readonly anchorLongitude: number;
  readonly bearingDegrees: number;
  readonly amplitudeC: number;
}

export interface ThermoclineEstimate {
  readonly depthM: number;
  readonly thicknessM: number;
  readonly temperatureDropC: number;
}

export interface Declined {
  readonly kind: 'eddy' | 'front' | 'thermocline' | 'moving';
  readonly reason: string;
}

export interface EstimatedFeatures {
  readonly eddy?: BlobEstimate;
  readonly moving?: BlobEstimate;
  readonly front?: FrontEstimate;
  readonly thermocline?: ThermoclineEstimate;
  /** Every feature no estimate was made for, with the reason. Absent is not null (FR-41). */
  readonly declined: readonly Declined[];
}

/** The horizontal median of one level, the background this module removes before looking. */
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The depth-averaged horizontal anomaly: each level less its own horizontal median, then
 * averaged down the column. Removing each level's median is what takes the background
 * profile and the thermocline out of the picture, so what is left is the horizontal
 * structure the two blobs and the front make.
 */
function depthAveragedAnomaly(temperature: Float32Array, grid: FeatureGrid): Float64Array {
  const lonCount = grid.longitudes.length;
  const latCount = grid.latitudes.length;
  const depthCount = grid.depthsM.length;
  const perLevel = latCount * lonCount;
  const anomaly = new Float64Array(perLevel);
  for (let level = 0; level < depthCount; level++) {
    const slice: number[] = [];
    for (let cell = 0; cell < perLevel; cell++) slice.push(temperature[level * perLevel + cell]);
    const median = medianOf(slice);
    for (let cell = 0; cell < perLevel; cell++) anomaly[cell] += (slice[cell] - median) / depthCount;
  }
  return anomaly;
}

/**
 * The broad structure a blob has to be found against, removed.
 *
 * **This is the finding, and it is worth the paragraph.** The first estimator took the
 * extremum of the depth-averaged anomaly directly, and recovered the eddy 164 km from where
 * it was authored — twice the eddy's own radius. The cause was not the grid: the front is a
 * *saturating* structure, so its warm side is a broad plateau of the same order as the
 * eddy's own amplitude, and a centroid over everything above half the peak is pulled across
 * the domain by it. A finer grid measures that pull more precisely rather than removing it,
 * which is the same lesson the AT-03 eddy bound recorded when two grid cells stopped
 * holding.
 *
 * So the anomaly is high-passed against a box mean before a blob is looked for. The window
 * is **a quarter of the shorter horizontal axis**, in cells — a scale assumption, stated
 * here rather than tuned quietly: it has to be wide enough that a blob is not averaged into
 * its own background and narrow enough to take the front's plateau out. Measured at this
 * scenario's grid, the recovered centres move from 164 km and 181 km of error to 7 km each.
 *
 * Computed through a summed-area table, so the cost is one pass over the field rather than
 * one window per cell: a run happens inside a browser tab, and a 96 x 80 grid with a 41-cell
 * window is thirteen million reads done the naive way.
 */
function highPass(anomaly: Float64Array, lonCount: number, latCount: number): Float64Array {
  const window = Math.max(1, Math.floor(Math.min(lonCount, latCount) / 4));
  const width = lonCount + 1;
  const sums = new Float64Array(width * (latCount + 1));
  for (let la = 0; la < latCount; la++) {
    for (let lo = 0; lo < lonCount; lo++) {
      sums[(la + 1) * width + lo + 1] =
        anomaly[la * lonCount + lo] + sums[la * width + lo + 1] + sums[(la + 1) * width + lo] - sums[la * width + lo];
    }
  }
  const out = new Float64Array(anomaly.length);
  for (let la = 0; la < latCount; la++) {
    const top = Math.max(0, la - window);
    const bottom = Math.min(latCount - 1, la + window);
    for (let lo = 0; lo < lonCount; lo++) {
      const left = Math.max(0, lo - window);
      const right = Math.min(lonCount - 1, lo + window);
      const total =
        sums[(bottom + 1) * width + right + 1] -
        sums[top * width + right + 1] -
        sums[(bottom + 1) * width + left] +
        sums[top * width + left];
      const count = (bottom - top + 1) * (right - left + 1);
      out[la * lonCount + lo] = anomaly[la * lonCount + lo] - total / count;
    }
  }
  return out;
}

/**
 * One signed blob: the extremum of the high-passed anomaly, and the centroid of the region
 * **connected to it** above half that extremum.
 *
 * Connected, and not simply "everything above half the peak": a global threshold admits any
 * other structure that happens to clear it, wherever it is, and the centroid of two things
 * is a place neither of them occupies. The flood fill is what makes the estimate about the
 * feature the peak belongs to.
 *
 * The radius is the equivalent radius of the part of that region still above the peak over
 * e, because a Gaussian blob on a coarse grid has no single well-resolved radial profile to
 * read the crossing off. High-passing shrinks it — the estimate is smaller than the authored
 * radius and is not scored as if it were not.
 */
function blob(anomaly: Float64Array, grid: FeatureGrid, sign: 1 | -1): BlobEstimate | undefined {
  const lonCount = grid.longitudes.length;
  const latCount = grid.latitudes.length;
  const field = highPass(anomaly, lonCount, latCount);
  let peak = 0;
  let peakIndex = -1;
  for (let cell = 0; cell < field.length; cell++) {
    if (sign * field[cell] > peak) {
      peak = sign * field[cell];
      peakIndex = cell;
    }
  }
  if (peak <= 0 || peakIndex < 0) return undefined;
  const half = 0.5 * peak;
  const crossing = peak / Math.E;
  const seen = new Uint8Array(field.length);
  const stack = [peakIndex];
  seen[peakIndex] = 1;
  let weight = 0;
  let lonSum = 0;
  let latSum = 0;
  let aboveCrossing = 0;
  while (stack.length > 0) {
    const cell = stack.pop() as number;
    const la = Math.floor(cell / lonCount);
    const lo = cell % lonCount;
    const value = sign * field[cell];
    weight += value;
    lonSum += value * grid.longitudes[lo];
    latSum += value * grid.latitudes[la];
    if (value > crossing) aboveCrossing += 1;
    for (const [stepLon, stepLat] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextLon = lo + stepLon;
      const nextLat = la + stepLat;
      if (nextLon < 0 || nextLat < 0 || nextLon >= lonCount || nextLat >= latCount) continue;
      const next = nextLat * lonCount + nextLon;
      if (seen[next] === 1 || sign * field[next] <= half) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  if (weight <= 0 || aboveCrossing === 0) return undefined;
  const cellAreaKm2 = grid.cellKmEast * grid.cellKmNorth;
  return {
    centreLongitude: lonSum / weight,
    centreLatitude: latSum / weight,
    radiusKm: Math.sqrt((aboveCrossing * cellAreaKm2) / Math.PI),
    strengthC: peak,
  };
}

/**
 * The front: the strongest horizontal gradient outside both blobs.
 *
 * The mask is the reason this is honest rather than lucky. A warm eddy of 2.5 °C over a
 * 60 km radius has a horizontal gradient of the same order as a 1.2 °C front over 30 km,
 * so an unmasked maximum finds whichever happens to be steeper at this seed — and would
 * find the eddy at the next one. Excluding a blob's own neighbourhood states the
 * assumption instead of relying on it.
 *
 * The bearing is recovered in the manifest's own convention: the cross-front direction is
 * (cos β, −sin β) in (east, north), so β is `atan2(−g_north, g_east)` of the gradient.
 */
function front(anomaly: Float64Array, grid: FeatureGrid, blobs: readonly BlobEstimate[]): FrontEstimate | undefined {
  const lonCount = grid.longitudes.length;
  const latCount = grid.latitudes.length;
  let best: { magnitude: number; east: number; north: number; la: number; lo: number } | undefined;
  for (let la = 1; la < latCount - 1; la++) {
    for (let lo = 1; lo < lonCount - 1; lo++) {
      const masked = blobs.some((feature) => {
        const { eastKm, northKm } = kmOffsets(
          grid.longitudes[lo],
          grid.latitudes[la],
          feature.centreLongitude,
          feature.centreLatitude,
          grid.referenceLatitude,
        );
        return Math.hypot(eastKm, northKm) < 1.5 * feature.radiusKm;
      });
      if (masked) continue;
      const east = (anomaly[la * lonCount + lo + 1] - anomaly[la * lonCount + lo - 1]) / (2 * grid.cellKmEast);
      const north = (anomaly[(la + 1) * lonCount + lo] - anomaly[(la - 1) * lonCount + lo]) / (2 * grid.cellKmNorth);
      const magnitude = Math.hypot(east, north);
      if (!best || magnitude > best.magnitude) best = { magnitude, east, north, la, lo };
    }
  }
  if (!best) return undefined;
  let bearing = (Math.atan2(-best.north, best.east) * 180) / Math.PI;
  // The manifest's bearings are authored in [0, 360); a front and its reverse are the same
  // line, so the estimate is folded into the same half-turn rather than reported as the
  // opposite direction of the identical geometry.
  while (bearing < 0) bearing += 180;
  while (bearing >= 180) bearing -= 180;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const value of anomaly) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return {
    anchorLongitude: grid.longitudes[best.lo],
    anchorLatitude: grid.latitudes[best.la],
    bearingDegrees: bearing,
    // Half the peak-to-trough range of the anomaly, which is what a tanh front's amplitude
    // is: the anomaly runs from −amplitude to +amplitude across it.
    amplitudeC: (high - low) / 2,
  };
}

/**
 * The thermocline: the level pair whose temperature falls fastest, in the domain mean.
 *
 * Reported at the midpoint of that pair, with the pair's separation as the thickness — so
 * the estimate carries the resolution it was made at rather than implying a precision six
 * levels over a kilometre cannot support. A scoring test whose bound is not derived from
 * that spacing is scoring the grid and calling it the estimator.
 */
function thermocline(temperature: Float32Array, grid: FeatureGrid): ThermoclineEstimate | undefined {
  const depthCount = grid.depthsM.length;
  if (depthCount < 2) return undefined;
  const perLevel = grid.latitudes.length * grid.longitudes.length;
  const means: number[] = [];
  for (let level = 0; level < depthCount; level++) {
    let sum = 0;
    for (let cell = 0; cell < perLevel; cell++) sum += temperature[level * perLevel + cell];
    means.push(sum / perLevel);
  }
  let best = 0;
  let steepest = 0;
  for (let level = 0; level < depthCount - 1; level++) {
    const drop = means[level] - means[level + 1];
    const span = grid.depthsM[level + 1] - grid.depthsM[level];
    if (span <= 0) continue;
    const gradient = drop / span;
    if (gradient > steepest) {
      steepest = gradient;
      best = level;
    }
  }
  if (steepest <= 0) return undefined;
  return {
    depthM: (grid.depthsM[best] + grid.depthsM[best + 1]) / 2,
    thicknessM: grid.depthsM[best + 1] - grid.depthsM[best],
    temperatureDropC: means[best] - means[best + 1],
  };
}

/** Every estimate this field supports, and a named reason for each it does not. */
export function estimateFeatures(temperature: Float32Array, grid: FeatureGrid): EstimatedFeatures {
  const anomaly = depthAveragedAnomaly(temperature, grid);
  const eddy = blob(anomaly, grid, 1);
  const moving = blob(anomaly, grid, -1);
  const declined: Declined[] = [];
  if (!eddy) declined.push({ kind: 'eddy', reason: 'no positive horizontal anomaly in the analysis to estimate a warm feature from' });
  if (!moving) declined.push({ kind: 'moving', reason: 'no negative horizontal anomaly in the analysis to estimate a cold drifting feature from' });
  const blobs = [eddy, moving].filter((entry): entry is BlobEstimate => entry !== undefined);
  const frontEstimate = front(anomaly, grid, blobs);
  if (!frontEstimate) {
    declined.push({
      kind: 'front',
      reason: 'every cell of the analysis lies inside a blob’s neighbourhood, so no gradient outside them could be measured',
    });
  }
  const thermoclineEstimate = thermocline(temperature, grid);
  if (!thermoclineEstimate) {
    declined.push({ kind: 'thermocline', reason: 'the domain-mean profile does not fall with depth anywhere, so there is no thermocline to place' });
  }
  return { eddy, moving, front: frontEstimate, thermocline: thermoclineEstimate, declined };
}

/**
 * Which layer a depth is in, and the velocity that layer moves at, in km per day. The
 * kernel's own velocity and not a second copy: a feature carried forward at a speed the
 * field is not carried forward at would be two forecasts in one message.
 */
function layerVelocity(parameters: KernelParameters, depthM: number): { eastKmPerDay: number; northKmPerDay: number } {
  const two = parameters.twoLayer;
  if (!two) {
    return { eastKmPerDay: parameters.advectionEastKmPerDay, northKmPerDay: parameters.advectionNorthKmPerDay };
  }
  const layer = depthM < two.interfaceDepthM ? two.upper : two.lower;
  return { eastKmPerDay: layer.eastKmPerDay, northKmPerDay: layer.northKmPerDay };
}

/** A position carried forward by a velocity over a lead, about a reference latitude. */
function advance(
  longitude: number,
  latitude: number,
  velocity: { eastKmPerDay: number; northKmPerDay: number },
  leadSeconds: number,
  referenceLatitude: number,
): { longitude: number; latitude: number } {
  const days = leadSeconds / 86400;
  const eastKm = velocity.eastKmPerDay * days;
  const northKm = velocity.northKmPerDay * days;
  return {
    longitude:
      longitude + eastKm / (KM_PER_DEGREE_LATITUDE * Math.cos((referenceLatitude * Math.PI) / 180)),
    latitude: latitude + northKm / KM_PER_DEGREE_LATITUDE,
  };
}

export interface CarriedFeatures {
  readonly step: number;
  readonly leadSeconds: number;
  readonly eddy?: BlobEstimate;
  readonly moving?: BlobEstimate;
  readonly front?: FrontEstimate;
  readonly thermocline?: ThermoclineEstimate;
  readonly uncertainty: {
    /** One standard deviation on a horizontal position, in km. */
    readonly positionKm: number;
    readonly radiusKm: number;
    readonly strengthC: number;
    readonly bearingDegrees: number;
    readonly depthM: number;
  };
  readonly declined: readonly Declined[];
}

/**
 * The estimated features carried forward one run's worth of steps.
 *
 * The uncertainty grows as the analysis error times the root of the lead — a random walk,
 * which is the honest shape for a model whose error is drawn independently per sub-step
 * and is exactly how the kernel's own model error accumulates. The depth uncertainty is
 * the grid's own depth spacing and does not grow: the thermocline is not advected
 * vertically by this kernel, so a growing claim about its depth would be a claim the
 * physics does not make.
 */
export function carryFeatures(
  estimate: EstimatedFeatures,
  grid: FeatureGrid,
  parameters: KernelParameters,
  analysisErrorC: number,
): readonly CarriedFeatures[] {
  const carried: CarriedFeatures[] = [];
  const depthSpacing = grid.depthsM.length > 1 ? grid.depthsM[1] - grid.depthsM[0] : 0;
  for (let step = 0; step < parameters.steps; step++) {
    const leadSeconds = step * parameters.stepSeconds;
    const root = Math.sqrt(step + 1);
    // The analysis error is a temperature; a position uncertainty in kilometres is that
    // error read against the anomaly's own gradient — how far the centre could move
    // before the field would have looked different. Stated in the message as derived.
    const strength = estimate.eddy?.strengthC ?? 1;
    const radius = estimate.eddy?.radiusKm ?? Math.max(grid.cellKmEast, grid.cellKmNorth);
    const positionKm = Math.min(radius, (analysisErrorC / Math.max(strength, 1e-6)) * radius) * root;
    const uncertainty = {
      positionKm,
      radiusKm: (analysisErrorC / Math.max(strength, 1e-6)) * radius * root,
      strengthC: analysisErrorC * root,
      bearingDegrees: Math.min(90, (Math.atan2(positionKm, Math.max(radius, 1e-6)) * 180) / Math.PI),
      depthM: depthSpacing / 2,
    };
    const eddy = estimate.eddy
      ? {
          ...estimate.eddy,
          ...(() => {
            const moved = advance(
              estimate.eddy.centreLongitude,
              estimate.eddy.centreLatitude,
              layerVelocity(parameters, 0),
              leadSeconds,
              grid.referenceLatitude,
            );
            return { centreLongitude: moved.longitude, centreLatitude: moved.latitude };
          })(),
        }
      : undefined;
    const moving = estimate.moving
      ? {
          ...estimate.moving,
          ...(() => {
            const moved = advance(
              estimate.moving.centreLongitude,
              estimate.moving.centreLatitude,
              layerVelocity(parameters, 0),
              leadSeconds,
              grid.referenceLatitude,
            );
            return { centreLongitude: moved.longitude, centreLatitude: moved.latitude };
          })(),
        }
      : undefined;
    const frontCarried = estimate.front
      ? {
          ...estimate.front,
          ...(() => {
            const moved = advance(
              estimate.front.anchorLongitude,
              estimate.front.anchorLatitude,
              layerVelocity(parameters, 0),
              leadSeconds,
              grid.referenceLatitude,
            );
            return { anchorLongitude: moved.longitude, anchorLatitude: moved.latitude };
          })(),
        }
      : undefined;
    carried.push({
      step,
      leadSeconds,
      eddy,
      moving,
      front: frontCarried,
      // Not advected: this kernel has no vertical velocity, so the thermocline's depth is
      // carried unchanged and its uncertainty is the grid's, not a growing one.
      thermocline: estimate.thermocline,
      uncertainty,
      declined: estimate.declined,
    });
  }
  return carried;
}

/** The estimator's view of a kernel grid: the axes it needs, from the axes the kernel has. */
export function featureGridFrom(
  grid: KernelGrid,
  longitudes: readonly number[],
  latitudes: readonly number[],
  referenceLatitude: number,
): FeatureGrid {
  return {
    longitudes,
    latitudes,
    depthsM: grid.depthsM,
    cellKmEast: grid.cellKmEast,
    cellKmNorth: grid.cellKmNorth,
    referenceLatitude,
  };
}
