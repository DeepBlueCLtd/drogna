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
import type { KernelParameters, ModelKernel } from './kernel.js';

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
  /**
   * The peak of the high-passed, depth-averaged anomaly. **Not the feature's authored
   * strength**, and named so it cannot be mistaken for it: the authored figure is a
   * three-dimensional amplitude at the blob's own depth, and this is that amplitude
   * flattened down the column and then shrunk again by the high pass. Recovering the
   * authored one needs the depth structure, which no estimator here reads.
   */
  readonly anomalyPeakC: number;
}

export interface FrontEstimate {
  readonly anchorLatitude: number;
  readonly anchorLongitude: number;
  readonly bearingDegrees: number;
  /**
   * Half the depth-averaged anomaly's range across the front, outside both blobs. **Not
   * the authored amplitude**: that is a surface figure decaying with depth on a scale this
   * estimator does not recover, so the two differ by a factor nobody here can compute.
   */
  readonly anomalyStepC: number;
}

export interface ThermoclineEstimate {
  readonly depthM: number;
  /** The grid interval the drop below was taken over — the resolution, carried with it. */
  readonly thicknessM: number;
  /**
   * The domain-mean temperature drop across that grid interval. **Not the authored
   * temperature drop**, which is taken across a thermocline an order of magnitude thinner
   * than the interval: a 200 m grid cannot see a 30 m layer, so the two are different
   * quantities and the gradients they imply differ by the same factor.
   */
  readonly layerDropC: number;
}

export interface Declined {
  readonly kind: 'eddy' | 'front' | 'thermocline' | 'moving';
  /**
   * The quantity not recovered, where the rest of the feature was. Absent means the whole
   * feature. Named because "the thermocline was not estimated" and "its gradient was not"
   * are different facts, and a forecast that published the second as the first would be
   * throwing away a depth it did recover.
   */
  readonly quantity?: string;
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
function highPassWindow(lonCount: number, latCount: number): number {
  return Math.max(1, Math.floor(Math.min(lonCount, latCount) / 4));
}

function highPass(anomaly: Float64Array, lonCount: number, latCount: number): Float64Array {
  const window = highPassWindow(lonCount, latCount);
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
 * One signed blob in an already high-passed field: its extremum, and the centroid of the region
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
function blob(
  field: Float64Array,
  grid: FeatureGrid,
  sign: 1 | -1,
  keepOut?: (longitude: number, latitude: number) => boolean,
): BlobEstimate | undefined {
  const lonCount = grid.longitudes.length;
  const latCount = grid.latitudes.length;
  /*
   * A blob already found is excluded, out to the width of the high pass itself — and this
   * is the second finding in this module, caught by scoring every start condition's seed
   * rather than one.
   *
   * Subtracting a box mean from a warm blob leaves a **cold ring** around it: that is what
   * a high pass does, and the ring is an artefact of the filter and not a feature of the
   * ocean. At four of the five seeds the drifting feature's own anomaly was the deeper of
   * the two and the estimator found it. At the fifth the ring won, and the drifting feature
   * was reported 213 km from where it was authored — the width of the domain — with an
   * uncertainty of a few kilometres beside it. A single-seed test called that a pass.
   *
   * The ring cannot reach further than the window that made it, so the window is the
   * exclusion radius: derived from the grid, like the window itself, and never a distance
   * typed here. A drifting feature genuinely inside that radius is not found at all, and is
   * reported as not estimated with the reason — which is the right answer, because at that
   * separation the filter cannot tell the two apart.
   */
  const excluded = (cell: number): boolean => {
    if (!keepOut) return false;
    const la = Math.floor(cell / lonCount);
    const lo = cell % lonCount;
    return keepOut(grid.longitudes[lo], grid.latitudes[la]);
  };
  let peak = 0;
  let peakIndex = -1;
  let sum = 0;
  let sumSquares = 0;
  for (let cell = 0; cell < field.length; cell++) {
    sum += field[cell];
    sumSquares += field[cell] * field[cell];
    if (excluded(cell)) continue;
    if (sign * field[cell] > peak) {
      peak = sign * field[cell];
      peakIndex = cell;
    }
  }
  if (peak <= 0 || peakIndex < 0) return undefined;
  /*
   * A peak that does not stand above the field's own scatter is not a feature.
   *
   * **This is the third finding in this module, and the one a single seed hid completely.**
   * Scored at one seed the drifting feature came back a few kilometres from where it was
   * authored; scored at every seed the start conditions run under, one of the five put it
   * 213 km away — the estimator had found the front's cold side, because at that seed the
   * drifting feature's own anomaly was the weaker of the two. Publishing that with an
   * uncertainty of a few kilometres beside it is exactly the failure Constitution IX
   * forbids, and widening the bound until it passed would have been the other one.
   *
   * So the peak is held against the standard deviation of the high-passed field it was
   * found in. Two standard deviations is a convention rather than a fit — it is the
   * ordinary 95% line, stated here as a rule and not chosen to make a number pass — and it
   * is measured on the field rather than against the truth, so the estimator can apply it
   * without knowing the answer. At the shipped seeds the four sound estimates stand at 2.9
   * to 4.4 sigma and the wrong one at 1.9. A future seed that puts a real feature below the
   * line loses that estimate rather than misreporting it, which is the direction to fail in.
   */
  const mean = sum / field.length;
  const deviation = Math.sqrt(Math.max(0, sumSquares / field.length - mean * mean));
  if (deviation > 0 && peak < 2 * deviation) return undefined;
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
      // The exclusion holds for the region as well as for its peak. Guarding only the peak
      // left the flood fill free to grow back into the ring, and the centroid of a region
      // half of which is an artefact is a place the feature is not: at one seed the peak
      // was outside the ring and the centroid came back inside it, 213 km from the truth.
      if (seen[next] === 1 || sign * field[next] <= half || excluded(next)) continue;
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
    anomalyPeakC: peak,
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
  const outsideBlobs = (lo: number, la: number): boolean =>
    !blobs.some((feature) => {
      const { eastKm, northKm } = kmOffsets(
        grid.longitudes[lo],
        grid.latitudes[la],
        feature.centreLongitude,
        feature.centreLatitude,
        grid.referenceLatitude,
      );
      return Math.hypot(eastKm, northKm) < 1.5 * feature.radiusKm;
    });

  interface Sample {
    readonly magnitude: number;
    readonly east: number;
    readonly north: number;
    readonly lo: number;
    readonly la: number;
  }
  const samples: Sample[] = [];
  let peak = 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let la = 1; la < latCount - 1; la++) {
    for (let lo = 1; lo < lonCount - 1; lo++) {
      if (!outsideBlobs(lo, la)) continue;
      const value = anomaly[la * lonCount + lo];
      if (value < low) low = value;
      if (value > high) high = value;
      const east = (anomaly[la * lonCount + lo + 1] - anomaly[la * lonCount + lo - 1]) / (2 * grid.cellKmEast);
      const north = (anomaly[(la + 1) * lonCount + lo] - anomaly[(la - 1) * lonCount + lo]) / (2 * grid.cellKmNorth);
      const magnitude = Math.hypot(east, north);
      samples.push({ magnitude, east, north, lo, la });
      if (magnitude > peak) peak = magnitude;
    }
  }
  if (samples.length === 0 || peak <= 0) return undefined;

  /*
   * The bearing, averaged over the front rather than read off one cell.
   *
   * **This is a finding and the numbers are worth keeping.** Taking the direction of the
   * single steepest gradient gave errors of 0.5 to 39.6 degrees across seven seeds — at 39
   * degrees a folded bearing is barely distinguishable from chance, and the 9.3 degrees the
   * first record quoted was one seed being kind. One cell of a noisy field is one sample.
   *
   * Averaging has to be done in doubled angles: a front and its reverse are the same line,
   * so 179 degrees and 1 degree are two degrees apart and a naive mean of them is 90 — the
   * answer perpendicular to both. Doubling maps the two onto the same direction, the mean
   * is taken there, and halving brings it back. Weighted by gradient magnitude, over every
   * cell within half the peak, this gives 0.5 to 2.2 degrees across the same seven seeds.
   */
  let doubledEast = 0;
  let doubledNorth = 0;
  for (const sample of samples) {
    if (sample.magnitude < 0.5 * peak) continue;
    // The cross-front direction is (cos B, -sin B) in (east, north), which is the manifest's
    // own convention, so B is atan2(-north, east) of the gradient.
    const angle = Math.atan2(-sample.north, sample.east);
    doubledEast += sample.magnitude * Math.cos(2 * angle);
    doubledNorth += sample.magnitude * Math.sin(2 * angle);
  }
  let bearing = ((Math.atan2(doubledNorth, doubledEast) / 2) * 180) / Math.PI;
  while (bearing < 0) bearing += 180;
  while (bearing >= 180) bearing -= 180;

  // The anchor is the steepest cell: a point on the line, and scored as a perpendicular
  // distance to the authored line rather than as a distance to the authored anchor, because
  // a line has no distinguished point.
  const steepest = samples.reduce((best, sample) => (sample.magnitude > best.magnitude ? sample : best), samples[0]);
  return {
    anchorLongitude: grid.longitudes[steepest.lo],
    anchorLatitude: grid.latitudes[steepest.la],
    bearingDegrees: bearing,
    // Half the range **outside the blobs**. Taking it over the whole field measured the
    // blobs instead: the gradient search masks them and this did not, which made the figure
    // a property of the eddy at every seed where the eddy was the stronger anomaly.
    anomalyStepC: (high - low) / 2,
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
    layerDropC: means[best] - means[best + 1],
  };
}

/**
 * Every estimate this field supports, and a named reason for each it does not.
 *
 * **The order is the argument.** The warm blob is found first, because it is the strongest
 * compact anomaly. The front is found next, outside the warm blob, because an unmasked
 * gradient maximum finds whichever of the two happens to be steeper at this seed. The cold
 * blob is found last, outside **both** — and that is what four of the five start-condition
 * seeds did not need and the fifth did: with only the warm blob excluded, the deepest cold
 * anomaly left was the front's own cold side, and the drifting feature was reported 213 km
 * from where it was authored. Each mask is a scale derived from the grid or from the
 * feature it excludes, and none is a distance typed here.
 */
export function estimateFeatures(temperature: Float32Array, grid: FeatureGrid): EstimatedFeatures {
  const anomaly = depthAveragedAnomaly(temperature, grid);
  const lonCount = grid.longitudes.length;
  const latCount = grid.latitudes.length;
  /**
   * How far the high pass's own artefacts reach: subtracting a box mean from a blob leaves
   * a ring of the opposite sign around it, and the ring cannot be wider than the window
   * that made it. Derived from the grid, like the window.
   */
  const ringKm = highPassWindow(lonCount, latCount) * Math.max(grid.cellKmEast, grid.cellKmNorth);
  // Filtered once, for both searches. The summed-area table exists because thirteen million
  // reads inside a browser tab is the naive way round, and computing it twice would be the
  // naive way round twice — and would leave two callers free to disagree about the window.
  const passed = highPass(anomaly, lonCount, latCount);
  const declined: Declined[] = [];

  const eddy = blob(passed, grid, 1);
  if (!eddy) {
    declined.push({
      kind: 'eddy',
      reason:
        'no positive horizontal anomaly in the analysis standing two standard deviations above the high-passed field’s own scatter — a peak that does not clear that line is not distinguishable from the filter’s noise',
    });
  }

  const nearEddy = (longitude: number, latitude: number): boolean => {
    if (!eddy) return false;
    const { eastKm, northKm } = kmOffsets(longitude, latitude, eddy.centreLongitude, eddy.centreLatitude, grid.referenceLatitude);
    return Math.hypot(eastKm, northKm) < ringKm;
  };
  const moving = blob(passed, grid, -1, nearEddy);
  if (!moving) {
    declined.push({
      kind: 'moving',
      reason:
        'no negative horizontal anomaly outside the warm feature’s high-pass ring standing two standard deviations above the field’s own scatter. At one of the shipped start conditions this is the honest answer: the drifting feature’s anomaly there is weaker than the front’s cold side, and an estimate would have been the front reported as a drifting feature 213 km from where it was authored',
    });
  }

  /*
   * The front last, masked against **both** blobs — which is what this module has claimed
   * from the start and did not do.
   *
   * The mask argument is that an unmasked gradient maximum finds whichever anomaly happens
   * to be steeper at this seed, and would find the other at the next one. It was applied to
   * the warm blob and not the cold one, because the front was found before the cold blob
   * existed to mask with. Measured across the shipped seeds, the anchor then landed *inside*
   * the authored drifting feature at three of five, and the step taken across "the front"
   * was 16% to 35% larger than the quantity its master describes. The ordering was never
   * load-bearing — the cold search needs only the warm blob — so it is simply reordered.
   */
  const frontEstimate = front(anomaly, grid, [eddy, moving].filter((entry): entry is BlobEstimate => entry !== undefined));
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

  /*
   * The magnitudes that are **not** recovered, named every time rather than left to be
   * inferred from what is absent (FR-41; Constitution IX).
   *
   * Each of the three has a specific reason and none of them is "the estimator is weak".
   * They are quantities a horizontal estimator over a coarse grid cannot see, and the first
   * draft of this module published them under the manifest's own property names — where a
   * scoring test compares like with like — at up to sixteen times the uncertainty it
   * declared for them. Softening a bound until that passes is the failure mode this list
   * exists instead of.
   */
  if (eddy) {
    declined.push({
      kind: 'eddy',
      quantity: 'strength_c',
      reason:
        'the authored strength is a three-dimensional amplitude at the feature’s own depth; what a horizontal estimator sees is that amplitude averaged down the column and shrunk again by the high pass, and converting between them needs the depth structure no estimator here recovers. The peak that was measured is published as anomaly_peak_c, which does not claim to be it',
    });
  }
  if (moving) {
    declined.push({
      kind: 'moving',
      quantity: 'strength_c',
      reason: 'as the eddy’s: a depth-averaged anomaly peak is not the authored three-dimensional amplitude, and is published as anomaly_peak_c instead',
    });
  }
  if (frontEstimate) {
    declined.push({
      kind: 'front',
      quantity: 'amplitude_c',
      reason:
        'the authored amplitude is a surface figure decaying with depth on a scale this estimator does not recover, so the depth-averaged step across the front differs from it by a factor nobody here can compute. The step that was measured is published as anomaly_step_c',
    });
  }
  if (thermoclineEstimate) {
    declined.push({
      kind: 'thermocline',
      quantity: 'temperature_drop_c',
      reason:
        'the authored drop is taken across a layer some tens of metres thick and the grid resolves hundreds, so the drop across a grid interval is a different quantity and the gradients they imply differ by that ratio. The drop that was measured is published as layer_drop_c beside the thickness_m it was taken over',
    });
  }
  return { eddy, moving, front: frontEstimate, thermocline: thermoclineEstimate, declined };
}

/**
 * The velocity every estimated feature is carried at: the kernel's own upper-layer
 * velocity, and not a second copy of it — a feature carried at a speed the field is not
 * carried at would be two forecasts in one message.
 *
 * **The upper layer for all four, and that is a stated limitation rather than an
 * oversight.** Choosing a layer needs the feature's depth, and no estimator here recovers
 * one: the blobs are found in a depth-averaged anomaly and the front in its gradient. The
 * first draft took a depth argument and every call site passed zero, which is the same
 * behaviour with a parameter in front of it pretending otherwise.
 */
function carryVelocity(kernel: ModelKernel, parameters: KernelParameters): { eastKmPerDay: number; northKmPerDay: number } {
  // The kernel is asked, never inferred. This function used to read
  // `parameters.twoLayer !== undefined` as "the two-layer kernel is configured", and the
  // runner sets that block whichever kernel is configured — so the two-layer branch was
  // taken always, and with `shift-advect-v1` selected the features drifted at 7 and 3
  // km/day while the field moved at 4 and 2. The unreachable branch was not a dead line;
  // it was the correct behaviour, never run.
  const declared = kernel.carryVelocity?.(parameters);
  if (declared) return declared;
  // A kernel that declares none is carried at the configured advection, which is what an
  // undeclared field does.
  return { eastKmPerDay: parameters.advectionEastKmPerDay, northKmPerDay: parameters.advectionNorthKmPerDay };
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

/**
 * One standard deviation on each quantity, for **one** feature.
 *
 * Per feature and not per step, which was the first shape and was wrong: a single block
 * computed from the eddy's own peak and radius was attached to the drifting feature and the
 * front as well. The drifting feature is authored weaker and smaller than the eddy, so the
 * uncertainty published beside its position was systematically derived from a different
 * feature's magnitudes — on a message whose whole purpose is that a forecast makes a
 * falsifiable claim, and in a module whose own comment names "a position published with a
 * few kilometres of uncertainty beside it" as the failure it exists against.
 */
export interface FeatureUncertainty {
  /** One standard deviation on a horizontal position, in km. */
  readonly positionKm: number;
  readonly radiusKm: number;
  /** One standard deviation on the anomaly magnitudes this module publishes. */
  readonly anomalyC: number;
  readonly bearingDegrees: number;
  readonly depthM: number;
}

export interface CarriedFeatures {
  readonly step: number;
  readonly leadSeconds: number;
  readonly eddy?: BlobEstimate;
  readonly moving?: BlobEstimate;
  readonly front?: FrontEstimate;
  readonly thermocline?: ThermoclineEstimate;
  /** Keyed by feature, because each is estimated from its own signal at its own scale. */
  readonly uncertainty: {
    readonly eddy: FeatureUncertainty;
    readonly moving: FeatureUncertainty;
    readonly front: FeatureUncertainty;
    readonly thermocline: FeatureUncertainty;
  };
  readonly declined: readonly Declined[];
}

/**
 * The estimated features carried forward one run's worth of steps.
 *
 * The uncertainty grows as the analysis error times the root of the lead — a random walk,
 * which is the honest shape for a model whose error is drawn independently per sub-step
 * and is exactly how the kernel's own model error accumulates. The depth uncertainty is
 * half the grid's own depth spacing — the nearest a level-pair midpoint can be wrong — and
 * does not grow: this kernel has no vertical velocity, so a widening claim about the
 * thermocline's depth would be a claim the physics does not make.
 */
export function carryFeatures(
  estimate: EstimatedFeatures,
  grid: FeatureGrid,
  parameters: KernelParameters,
  analysisErrorC: number,
  /** The kernel the field is being carried by, which is the one asked for the velocity. */
  kernel: ModelKernel,
): readonly CarriedFeatures[] {
  const velocity = carryVelocity(kernel, parameters);
  const carried: CarriedFeatures[] = [];
  const depthSpacing = grid.depthsM.length > 1 ? grid.depthsM[1] - grid.depthsM[0] : 0;
  for (let step = 0; step < parameters.steps; step++) {
    const leadSeconds = step * parameters.stepSeconds;
    const root = Math.sqrt(step + 1);
    // The analysis error is a temperature; a position uncertainty in kilometres is that
    // error read against the anomaly's own gradient — how far the centre could move
    // before the field would have looked different. Stated in the message as derived.
    /**
     * The uncertainty a feature of a given strength and scale carries at this lead.
     *
     * How far a centre could move before the field would have looked different: the
     * analysis error read against the feature's own peak, over its own radius. A weak,
     * small feature is therefore less well located than a strong, broad one — which is
     * true, and was not said while one block computed from the eddy was handed to all four.
     */
    const uncertaintyFor = (peakC: number, radiusKm: number): FeatureUncertainty => {
      const relativeError = analysisErrorC / Math.max(peakC, 1e-6);
      const positionKm = Math.min(radiusKm, relativeError * radiusKm) * root;
      return {
        positionKm,
        radiusKm: relativeError * radiusKm * root,
        anomalyC: analysisErrorC * root,
        // How far a direction could turn if its anchor moved by the position uncertainty
        // over the feature's own scale. `atan2` of two non-negative arguments cannot exceed
        // a quarter turn, so no clamp is reached and none is written.
        bearingDegrees: (Math.atan2(positionKm, Math.max(radiusKm, 1e-6)) * 180) / Math.PI,
        depthM: depthSpacing / 2,
      };
    };
    const cellKm = Math.max(grid.cellKmEast, grid.cellKmNorth);
    // A feature the estimator declined has no uncertainty of its own to compute one from,
    // so its block is built at the grid's own scale and is never published: `not_estimated`
    // carries the absence instead.
    const uncertainty = {
      eddy: uncertaintyFor(estimate.eddy?.anomalyPeakC ?? 1, estimate.eddy?.radiusKm ?? cellKm),
      moving: uncertaintyFor(estimate.moving?.anomalyPeakC ?? 1, estimate.moving?.radiusKm ?? cellKm),
      // The front has no radius; its scale is the width over which its own step is taken,
      // which the estimator does not recover, so the grid's cell is the honest stand-in and
      // it makes the bearing uncertainty a per-cell figure rather than an eddy-sized one.
      front: uncertaintyFor(estimate.front?.anomalyStepC ?? 1, cellKm),
      thermocline: uncertaintyFor(estimate.thermocline?.layerDropC ?? 1, cellKm),
    };
    const eddy = estimate.eddy
      ? {
          ...estimate.eddy,
          ...(() => {
            const moved = advance(
              estimate.eddy.centreLongitude,
              estimate.eddy.centreLatitude,
              velocity,
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
              velocity,
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
              velocity,
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
