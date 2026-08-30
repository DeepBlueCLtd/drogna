/**
 * The analysis kernel port (Constitution VI): a background field, the observations
 * taken since the last cycle, and the grid they live on go in; the analysed field,
 * what is now known about its error, and where every cell's value came from come out.
 *
 * A genuine port on the same grounds as the model kernel — optimal interpolation
 * below is one implementation, and a variational or ensemble scheme is another, both
 * of which produce exactly these three outputs from exactly these inputs. Nothing in
 * this file knows about the broker, the stores, the clock or a configuration
 * document: the component that will call it (feature 115's analyst) holds all of
 * that, and this is the maths alone so that the maths alone can be tested.
 *
 * Why the field must be corrected at all: until this feature the now-cast the model
 * runner initialised from was re-evaluated from the true ocean on a cadence, so no
 * measurement the platform took ever changed a field value. The loop still converged,
 * because truth leaked in on a timer. This is the step that makes the measurements
 * matter, and feature 115's spec records what was true before it.
 */
import { choleskyFactor as choleskyFactorOf, choleskyInverse as inverseOf } from './linalg.js';

export interface AnalysisAxis {
  readonly minimum: number;
  readonly spacing: number;
  readonly count: number;
}

export interface AnalysisGrid {
  readonly longitude: AnalysisAxis;
  readonly latitude: AnalysisAxis;
  readonly depth: AnalysisAxis;
  /** Kilometres per one cell step along each horizontal axis, at the domain's mid-latitude. */
  readonly cellKmEast: number;
  readonly cellKmNorth: number;
}

export interface AnalysisObservation {
  readonly longitude: number;
  readonly latitude: number;
  readonly depthM: number;
  readonly value: number;
  /**
   * R's diagonal for this observation: the instrument's declared measurement error.
   * It is the `noise_std` the sensors component draws its noise from, carried here
   * rather than restated — a second declaration of the same limit is free to drift
   * from the one the instrument obeys.
   */
  readonly errorStd: number;
}

export interface AnalysisState {
  /** [depth][lat][lon], C order — one instant, one variable. */
  readonly values: Float32Array;
  /** B's diagonal: the background error standard deviation, per cell. */
  readonly errorStd: Float32Array;
  /**
   * Where each cell's value came from: one array per source, each the same shape as
   * `values`, every cell's shares summing to one. The kernel does not name the
   * sources — it moves shares between them and credits one of them for measurement.
   */
  readonly shares: readonly Float32Array[];
}

export interface AnalysisParameters {
  /** Horizontal correlation length in kilometres. Zero means no horizontal correlation. */
  readonly correlationKmHorizontal: number;
  /** Vertical correlation length in metres. Zero means no vertical correlation. */
  readonly correlationMetresVertical: number;
  /** Which share the observations credit. Every other share is scaled by what is left. */
  readonly measurementShareIndex: number;
}

export interface AnalysedObservation {
  /** The cell the observation was attributed to. */
  readonly cellIndex: number;
  /** y − Hxᵇ: what the instrument said, less what the background expected there. */
  readonly innovation: number;
}

export interface AnalysisField {
  readonly values: Float32Array;
  /** The diagonal of Pᵃ = (I − KH)B, as a standard deviation. */
  readonly errorStd: Float32Array;
  readonly shares: readonly Float32Array[];
  /**
   * Σⱼ K_aj per cell: the total weight the observations carried into this cell, and
   * exactly the measurement share this cycle added. Reported rather than folded away
   * because it is not confined to [0, 1] — see the note on `optimalInterpolationKernel`
   * — and a consumer that draws it as a proportion must decide what to do about that.
   */
  readonly observationWeight: Float32Array;
  readonly observations: readonly AnalysedObservation[];
}

export interface AnalysisKernel {
  readonly name: string;
  analyse(
    background: AnalysisState,
    observations: readonly AnalysisObservation[],
    grid: AnalysisGrid,
    parameters: AnalysisParameters,
  ): AnalysisField;
}

/** The cell an observation is attributed to: the nearest, clamped to the domain. */
function nearestIndex(axis: AnalysisAxis, value: number): number {
  if (axis.count <= 1 || axis.spacing === 0) return 0;
  const raw = Math.round((value - axis.minimum) / axis.spacing);
  return Math.min(Math.max(raw, 0), axis.count - 1);
}

/**
 * ρ between two cells: Gaussian in the horizontal separation and in the vertical,
 * multiplied. A zero correlation length is not a degenerate case to be guarded
 * against but a statable model — no correlation along that axis — so it is the
 * Kronecker delta rather than a division by zero.
 */
function correlation(
  grid: AnalysisGrid,
  parameters: AnalysisParameters,
  aDepth: number,
  aLat: number,
  aLon: number,
  bDepth: number,
  bLat: number,
  bLon: number,
): number {
  const east = (aLon - bLon) * grid.cellKmEast;
  const north = (aLat - bLat) * grid.cellKmNorth;
  const down = (aDepth - bDepth) * grid.depth.spacing;
  let exponent = 0;
  if (parameters.correlationKmHorizontal > 0) {
    const length = parameters.correlationKmHorizontal;
    exponent += (east * east + north * north) / (length * length);
  } else if (east !== 0 || north !== 0) {
    return 0;
  }
  if (parameters.correlationMetresVertical > 0) {
    const length = parameters.correlationMetresVertical;
    exponent += (down * down) / (length * length);
  } else if (down !== 0) {
    return 0;
  }
  return Math.exp(-0.5 * exponent);
}

/**
 * optimal-interpolation-v1: xᵃ = xᵇ + K(y − Hxᵇ), with K = BHᵀ(HBHᵀ + R)⁻¹.
 *
 * Neither term of the gain is a number typed into this file. B is the run's own
 * published ensemble spread, per cell, times a correlation the configuration
 * declares; R is each instrument's declared error. H is nearest-neighbour selection —
 * an observation is attributed wholly to one cell — and that choice is load-bearing
 * beyond sampling: it makes every row of H sum to exactly one, which is what makes
 * the provenance shares below an identity rather than an approximation.
 *
 * Because H selects, xᵃ = (I − KH)xᵇ + Ky exactly, so each cell's analysed value is
 * a linear combination of its background and the observations whose weights sum to
 * one. The shares are read straight off that: every prior share is scaled by 1 − ω,
 * and ω is credited to measurement, where ω = Σⱼ K_aj.
 *
 * **ω is not confined to [0, 1].** Where the background error at a cell is much
 * larger than at the observed cell and the two are well correlated, the gain
 * extrapolates and ω exceeds one, which leaves the prior shares negative. That is
 * optimal interpolation behaving correctly — the estimate is not a weighted average
 * in general — and it is reported rather than clamped, because a share silently
 * clamped is a display telling a story the maths did not.
 */
export const optimalInterpolationKernel: AnalysisKernel = {
  name: 'optimal-interpolation-v1',
  analyse(background, observations, grid, parameters) {
    const { depth, latitude, longitude } = grid;
    const cells = depth.count * latitude.count * longitude.count;
    if (background.values.length !== cells) {
      throw new Error(`the background holds ${background.values.length} cells, which is not the grid's ${cells}`);
    }
    if (background.errorStd.length !== cells) {
      throw new Error(`the background error holds ${background.errorStd.length} cells, which is not the grid's ${cells}`);
    }
    if (!background.shares[parameters.measurementShareIndex]) {
      throw new Error(`share ${parameters.measurementShareIndex} is to carry measurement, and the background declares no such share`);
    }

    const values = Float32Array.from(background.values);
    const errorStd = Float32Array.from(background.errorStd);
    const shares = background.shares.map((share) => Float32Array.from(share));
    const observationWeight = new Float32Array(cells);

    // No observations is not a failure and not a special case in the maths: the gain
    // is empty, so the analysis is the background and every share is unmoved.
    if (observations.length === 0) {
      return { values, errorStd, shares, observationWeight, observations: [] };
    }

    const located = observations.map((observation) => {
      const depthIndex = nearestIndex(depth, observation.depthM);
      const latIndex = nearestIndex(latitude, observation.latitude);
      const lonIndex = nearestIndex(longitude, observation.longitude);
      const cellIndex = (depthIndex * latitude.count + latIndex) * longitude.count + lonIndex;
      return { observation, depthIndex, latIndex, lonIndex, cellIndex };
    });

    const order = located.length;
    const system = new Float64Array(order * order);
    const innovation = new Float64Array(order);
    for (let i = 0; i < order; i++) {
      const a = located[i];
      innovation[i] = a.observation.value - background.values[a.cellIndex];
      for (let j = 0; j < order; j++) {
        const b = located[j];
        const rho = correlation(grid, parameters, a.depthIndex, a.latIndex, a.lonIndex, b.depthIndex, b.latIndex, b.lonIndex);
        system[i * order + j] = background.errorStd[a.cellIndex] * background.errorStd[b.cellIndex] * rho;
      }
      system[i * order + i] += a.observation.errorStd * a.observation.errorStd;
    }

    const factor = choleskyFactorOf(system, order);
    const inverse = inverseOf(factor, order);
    // M⁻¹d gives the increment's coefficients; M⁻¹1 gives the gain's row sums, which
    // is what the provenance needs. Both come from the one factorisation.
    const weighted = new Float64Array(order);
    const unitWeighted = new Float64Array(order);
    for (let k = 0; k < order; k++) {
      let toInnovation = 0;
      let toUnit = 0;
      for (let j = 0; j < order; j++) {
        toInnovation += inverse[k * order + j] * innovation[j];
        toUnit += inverse[k * order + j];
      }
      weighted[k] = toInnovation;
      unitWeighted[k] = toUnit;
    }

    const covarianceRow = new Float64Array(order);
    for (let cell = 0; cell < cells; cell++) {
      const lonIndex = cell % longitude.count;
      const latIndex = Math.floor(cell / longitude.count) % latitude.count;
      const depthIndex = Math.floor(cell / (longitude.count * latitude.count));
      const cellStd = background.errorStd[cell];
      let increment = 0;
      let weight = 0;
      for (let k = 0; k < order; k++) {
        const b = located[k];
        const rho = correlation(grid, parameters, depthIndex, latIndex, lonIndex, b.depthIndex, b.latIndex, b.lonIndex);
        const covariance = cellStd * background.errorStd[b.cellIndex] * rho;
        covarianceRow[k] = covariance;
        increment += covariance * weighted[k];
        weight += covariance * unitWeighted[k];
      }
      values[cell] = background.values[cell] + increment;
      observationWeight[cell] = weight;

      // Pᵃ = (I − KH)B, on the diagonal: σ² less what the observations explained of
      // it. Clamped at zero against float error only — the quadratic form cannot
      // exceed σ² in exact arithmetic.
      let explained = 0;
      for (let k = 0; k < order; k++) {
        let row = 0;
        for (let j = 0; j < order; j++) row += inverse[k * order + j] * covarianceRow[j];
        explained += covarianceRow[k] * row;
      }
      errorStd[cell] = Math.sqrt(Math.max(cellStd * cellStd - explained, 0));

      for (let s = 0; s < shares.length; s++) {
        shares[s][cell] = (1 - weight) * background.shares[s][cell];
      }
      shares[parameters.measurementShareIndex][cell] += weight;
    }

    return {
      values,
      errorStd,
      shares,
      observationWeight,
      observations: located.map((entry, index) => ({ cellIndex: entry.cellIndex, innovation: innovation[index] })),
    };
  },
};
