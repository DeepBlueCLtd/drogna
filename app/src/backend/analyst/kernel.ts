/**
 * The analysis kernel port (Constitution VI): a background field, the observations
 * taken since the last cycle, and the grid they live on go in; the analysed field,
 * what is now known about its error, and where every cell's value came from come out.
 *
 * A genuine port on the same grounds as the model kernel — optimal interpolation
 * below is one implementation, and a variational or ensemble scheme is another, both
 * of which produce exactly these three outputs from exactly these inputs. Nothing in
 * this file knows about the broker, the stores, the clock or a configuration
 * document: the component that will call it (feature 116's analyst) holds all of
 * that, and this is the maths alone so that the maths alone can be tested.
 *
 * Why the field must be corrected at all: until this feature the now-cast the model
 * runner initialised from was re-evaluated from the true ocean on a cadence, so no
 * measurement the platform took ever changed a field value. The loop still converged,
 * because truth leaked in on a timer. This is the step that makes the measurements
 * matter, and feature 116's spec records what was true before it.
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
  /**
   * Which instrument made it, as the caller names it — a datastream. The kernel keeps
   * no vocabulary of its own for this; it uses the key to group observations into
   * sources (feature 124, FR-01): every observation sharing a key and an attributed
   * cell is one source, because under nearest-neighbour H they share that cell's
   * covariance row exactly and their gains sum without approximation.
   */
  readonly sourceKey: string;
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
  /**
   * The Gaspari–Cohn half-width in kilometres. The taper reaches exactly zero at
   * twice this, so 2 × `horizontalKm` is the distance beyond which a measurement
   * informs nothing at all — a fact about the model, not a small number.
   */
  readonly horizontalKm: number;
  /** The Gaspari–Cohn half-width in metres, down. Support ends at twice this. */
  readonly verticalM: number;
  /** Which share the observations credit. Every other share is scaled by what is left. */
  readonly measurementShareIndex: number;
}

export interface AnalysedObservation {
  /** The cell the observation was attributed to. */
  readonly cellIndex: number;
  /** y − Hxᵇ: what the instrument said, less what the background expected there. */
  readonly innovation: number;
  /**
   * How far the observation was moved to reach the cell it was attributed to. Every
   * observation is moved a little — H is nearest-neighbour, so half a cell is normal
   * and unremarkable. What matters is the second field.
   */
  readonly displacementKm: number;
  /**
   * True when the observation fell outside the grid and was clamped to its edge. It
   * is still assimilated: the domain edge is where the harness stopped authoring a
   * field, not where the ocean stops, so throwing the measurement away would discard
   * a real reading over a bookkeeping boundary. But a reading relocated tens of
   * kilometres is a thing the lineage has to carry, so the analyst records the count
   * and the worst displacement in the manifest rather than letting it pass silently.
   */
  readonly clamped: boolean;
}

/**
 * A source (feature 124, FR-01): one instrument at the cell its observations were
 * attributed to. Not an observation, and the reason is size, measured: a cycle
 * assimilates 1,080–1,572 observations on the shipped configuration and each reaches
 * ~1,200 cells, so per-observation columns are ~9 MB a cycle against a store of ~9 MB.
 * Grouping by attributed cell loses nothing the columns carry — H is a selection, so
 * every observation attributed to one cell has the same covariance row, the same
 * separation to every other cell and (per datastream) the same declared error — and
 * the sum of their gains is the source's contribution by linearity.
 */
export interface AnalysisSource {
  readonly sourceKey: string;
  /** The cell the source's observations were attributed to. */
  readonly cellIndex: number;
  readonly observationCount: number;
  /** R's diagonal, shared by every observation of the source. */
  readonly errorStd: number;
  /** B's diagonal at the attributed cell: the other number the gain was made from. */
  readonly backgroundErrorStd: number;
  /** The mean of y − Hxᵇ over the source's observations. */
  readonly meanInnovation: number;
  /** Where the instrument was, on average, when it made them. */
  readonly longitude: number;
  readonly latitude: number;
  readonly depthM: number;
}

/**
 * What each source contributed to each cell it reached (feature 124, FR-01, FR-02):
 * the columns of K the kernel has always computed and until this feature discarded.
 *
 * **The support bounds the covariance, not the gain.** K = BHᵀ(HBHᵀ + R)⁻¹, and the
 * inverse couples every observation in a connected cluster, so an observation beyond
 * a cell's reach still moves the cell — through its correlation with one within
 * reach. That coupling is real (it is how two nearby casts share one innovation rather
 * than counting it twice) and it belongs to no position a ray could be drawn from, so
 * it is carried per cell as one figure, the remainder, and never as a dense column
 * set. The identity that holds exactly, in the arithmetic this was computed in:
 *
 *   Σ (in-support sources' contributions) + remainder = ω = observationWeight[cell]
 *
 * Sparse, by compressed rows: `cells` lists every cell some source reaches, ascending,
 * and the entries for `cells[i]` are `offsets[i]` to `offsets[i + 1]`. A cell no source
 * reaches has no row, and its ω is exactly zero — the taper made that a fact.
 */
export interface AnalysisContributions {
  readonly sources: readonly AnalysisSource[];
  readonly cells: Uint32Array;
  /** ω at `cells[i]`: the same number `observationWeight` holds there. */
  readonly weight: Float32Array;
  /** ω less the in-support sources' sum at `cells[i]`. */
  readonly remainder: Float32Array;
  /**
   * B's diagonal at `cells[i]`: the background's error the gain weighed each source's
   * declared error against (FR-04's second number). Carried here because the spread
   * it was read from is a different holding, named by a different announcement.
   */
  readonly backgroundErrorStd: Float32Array;
  readonly offsets: Uint32Array;
  /** Per entry: an index into `sources`. */
  readonly entrySource: Uint32Array;
  /** Per entry: Σⱼ K_aj over the source's observations. */
  readonly entryContribution: Float32Array;
  /** Per entry: the separation the taper was evaluated on, source cell to this cell. */
  readonly entryHorizontalKm: Float32Array;
  readonly entryVerticalM: Float32Array;
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
  readonly contributions: AnalysisContributions;
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

/**
 * The cell an observation is attributed to: the nearest, clamped to the domain, and
 * saying whether the clamp did any work.
 */
function nearestIndex(axis: AnalysisAxis, value: number): { index: number; clamped: boolean } {
  if (axis.count <= 1 || axis.spacing === 0) return { index: 0, clamped: false };
  const raw = Math.round((value - axis.minimum) / axis.spacing);
  const index = Math.min(Math.max(raw, 0), axis.count - 1);
  return { index, clamped: index !== raw };
}

/**
 * The Gaspari–Cohn taper (Gaspari & Cohn 1999, eq. 4.10): the fifth-order piecewise
 * polynomial that approximates a Gaussian, reaches exactly zero at twice its
 * half-width, and — the property the whole choice rests on — stays positive definite
 * while doing so.
 *
 * Why not simply cut a Gaussian off at a radius: a truncated covariance is not
 * positive definite, so the system the analysis solves would stop being one any
 * covariance could produce, and the factorisation would either refuse or return
 * something meaningless. Gaspari–Cohn is the standard answer to exactly that.
 *
 * Compact support here is therefore a claim about physics — beyond this distance a
 * measurement informs nothing — and never a computational shortcut. At this
 * observation count a cutoff buys no speed whatsoever; what it buys is the ability
 * to say a cell owes a measurement nothing, as a fact rather than a small number.
 */
export function gaspariCohn(normalisedDistance: number): number {
  const z = Math.abs(normalisedDistance);
  if (z >= 2) return 0;
  if (z <= 1) {
    return ((((-0.25 * z + 0.5) * z + 0.625) * z - 5 / 3) * z * z) + 1;
  }
  return ((((z / 12 - 0.5) * z + 0.625) * z + 5 / 3) * z - 5) * z + 4 - 2 / (3 * z);
}

/**
 * ρ between two cells: Gaspari–Cohn of the separation, each axis normalised by its
 * own half-width and combined in that scaled space, which keeps the taper compactly
 * supported in every direction.
 *
 * A zero half-width is not a degenerate case to guard against but a statable model —
 * no correlation along that axis — so it is the Kronecker delta rather than a
 * division by zero.
 */
/**
 * The separation between two cells, in the units the half-widths are declared in.
 * One function, because the taper is evaluated on it and the contributions holding
 * states it (FR-04): two arithmetics would be two opinions about one distance.
 */
function separation(
  grid: AnalysisGrid,
  aDepth: number,
  aLat: number,
  aLon: number,
  bDepth: number,
  bLat: number,
  bLon: number,
): { east: number; north: number; down: number } {
  return {
    east: (aLon - bLon) * grid.cellKmEast,
    north: (aLat - bLat) * grid.cellKmNorth,
    down: (aDepth - bDepth) * grid.depth.spacing,
  };
}

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
  const { east, north, down } = separation(grid, aDepth, aLat, aLon, bDepth, bLat, bLon);
  let scaled = 0;
  if (parameters.horizontalKm > 0) {
    scaled += (east * east + north * north) / (parameters.horizontalKm * parameters.horizontalKm);
  } else if (east !== 0 || north !== 0) {
    return 0;
  }
  if (parameters.verticalM > 0) {
    scaled += (down * down) / (parameters.verticalM * parameters.verticalM);
  } else if (down !== 0) {
    return 0;
  }
  return gaspariCohn(Math.sqrt(scaled));
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
      return { values, errorStd, shares, observationWeight, observations: [], contributions: emptyContributions() };
    }

    const located = observations.map((observation) => {
      const depthAt = nearestIndex(depth, observation.depthM);
      const latAt = nearestIndex(latitude, observation.latitude);
      const lonAt = nearestIndex(longitude, observation.longitude);
      const depthIndex = depthAt.index;
      const latIndex = latAt.index;
      const lonIndex = lonAt.index;
      const cellIndex = (depthIndex * latitude.count + latIndex) * longitude.count + lonIndex;
      // The horizontal distance from where the instrument was to the cell centre it
      // was attributed to, in the same kilometres the covariance is measured in.
      const eastKm = ((longitude.minimum + lonIndex * longitude.spacing - observation.longitude) / (longitude.spacing || 1)) * grid.cellKmEast;
      const northKm = ((latitude.minimum + latIndex * latitude.spacing - observation.latitude) / (latitude.spacing || 1)) * grid.cellKmNorth;
      return {
        observation,
        depthIndex,
        latIndex,
        lonIndex,
        cellIndex,
        displacementKm: Math.hypot(eastKm, northKm),
        clamped: depthAt.clamped || latAt.clamped || lonAt.clamped,
      };
    });

    const order = located.length;

    // The sources: one per (instrument, attributed cell), in first-seen order, which
    // is the observations' own order and so deterministic. Each observation knows its
    // source's index; the per-cell loop below sums gains into it.
    const sourceIndexByKey = new Map<string, number>();
    const sourceOfObservation = new Int32Array(order);
    const sourceRows: {
      sourceKey: string;
      cellIndex: number;
      count: number;
      errorStd: number;
      backgroundErrorStd: number;
      innovationSum: number;
      longitudeSum: number;
      latitudeSum: number;
      depthSum: number;
      depthIndex: number;
      latIndex: number;
      lonIndex: number;
    }[] = [];
    for (let i = 0; i < order; i++) {
      const entry = located[i];
      const key = `${entry.observation.sourceKey}\u0000${entry.cellIndex}`;
      let index = sourceIndexByKey.get(key);
      if (index === undefined) {
        index = sourceRows.length;
        sourceIndexByKey.set(key, index);
        sourceRows.push({
          sourceKey: entry.observation.sourceKey,
          cellIndex: entry.cellIndex,
          count: 0,
          errorStd: entry.observation.errorStd,
          backgroundErrorStd: background.errorStd[entry.cellIndex],
          innovationSum: 0,
          longitudeSum: 0,
          latitudeSum: 0,
          depthSum: 0,
          depthIndex: entry.depthIndex,
          latIndex: entry.latIndex,
          lonIndex: entry.lonIndex,
        });
      } else if (sourceRows[index].errorStd !== entry.observation.errorStd) {
        // One datastream declares one error; two values under one key would make the
        // source's "declared error" a number nobody declared.
        throw new Error(
          `source '${entry.observation.sourceKey}' declares error ${sourceRows[index].errorStd} and ${entry.observation.errorStd}; one instrument has one declared error`,
        );
      }
      sourceOfObservation[i] = index;
      const row = sourceRows[index];
      row.count += 1;
      row.longitudeSum += entry.observation.longitude;
      row.latitudeSum += entry.observation.latitude;
      row.depthSum += entry.observation.depthM;
    }

    const system = new Float64Array(order * order);
    const innovation = new Float64Array(order);
    for (let i = 0; i < order; i++) {
      const a = located[i];
      innovation[i] = a.observation.value - background.values[a.cellIndex];
      sourceRows[sourceOfObservation[i]].innovationSum += innovation[i];
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
    /** Indices of the observations that reach the cell being analysed, reused per cell. */
    const reaching = new Int32Array(order);

    // The contributions, accumulated per cell as the gain's columns fall out of the
    // error reduction below. `perSource` is a scratch row over the sources; `touched`
    // lists which of them this cell's reaching observations belong to.
    const perSource = new Float64Array(sourceRows.length);
    const touched = new Int32Array(sourceRows.length);
    const contributionCells: number[] = [];
    const contributionWeight: number[] = [];
    const contributionRemainder: number[] = [];
    const contributionBackgroundErrorStd: number[] = [];
    const contributionOffsets: number[] = [0];
    const entrySource: number[] = [];
    const entryContribution: number[] = [];
    const entryHorizontalKm: number[] = [];
    const entryVerticalM: number[] = [];

    for (let cell = 0; cell < cells; cell++) {
      const lonIndex = cell % longitude.count;
      const latIndex = Math.floor(cell / longitude.count) % latitude.count;
      const depthIndex = Math.floor(cell / (longitude.count * latitude.count));
      const cellStd = background.errorStd[cell];
      let increment = 0;
      let weight = 0;
      // Which observations can reach this cell at all. The taper is compactly
      // supported, so beyond it the covariance is exactly zero and every term it
      // enters contributes exactly nothing — dropping them is an identity, not an
      // approximation. It is also what makes the analysis affordable on a real grid:
      // the error reduction below is quadratic in the observations considered, and at
      // 46,080 cells against a cycle's ~180 observations that is 1.5 billion products
      // per variable if the zeros are multiplied out, against a few million if they
      // are not.
      let reach = 0;
      for (let k = 0; k < order; k++) {
        const b = located[k];
        const rho = correlation(grid, parameters, depthIndex, latIndex, lonIndex, b.depthIndex, b.latIndex, b.lonIndex);
        if (rho === 0) {
          covarianceRow[k] = 0;
          continue;
        }
        const covariance = cellStd * background.errorStd[b.cellIndex] * rho;
        covarianceRow[k] = covariance;
        reaching[reach] = k;
        reach += 1;
        increment += covariance * weighted[k];
        weight += covariance * unitWeighted[k];
      }
      values[cell] = background.values[cell] + increment;
      observationWeight[cell] = weight;

      // Pᵃ = (I − KH)B, on the diagonal: σ² less what the observations explained of
      // it. Clamped at zero against float error only — the quadratic form cannot
      // exceed σ² in exact arithmetic.
      let explained = 0;
      let touchedCount = 0;
      for (let ki = 0; ki < reach; ki++) {
        const k = reaching[ki];
        // `row` is K_ak itself: Σⱼ M⁻¹_kj · cov_aj over the observations that reach
        // this cell — exact, because cov_aj is identically zero for the rest. The gain
        // was always here; until feature 124 it was folded into `explained` and lost.
        let row = 0;
        for (let ji = 0; ji < reach; ji++) {
          const j = reaching[ji];
          row += inverse[k * order + j] * covarianceRow[j];
        }
        explained += covarianceRow[k] * row;
        const source = sourceOfObservation[k];
        if (perSource[source] === 0) touched[touchedCount++] = source;
        perSource[source] += row;
      }
      errorStd[cell] = Math.sqrt(Math.max(cellStd * cellStd - explained, 0));

      if (reach > 0) {
        // Rows of the sparse holding, in source order so a column's entries are stable
        // across cells and cycles rather than in whichever order the observations
        // happened to reach.
        const sorted = touched.subarray(0, touchedCount).slice().sort();
        let inSupport = 0;
        for (const source of sorted) {
          const contribution = perSource[source];
          inSupport += contribution;
          const origin = sourceRows[source];
          const { east, north, down } = separation(grid, depthIndex, latIndex, lonIndex, origin.depthIndex, origin.latIndex, origin.lonIndex);
          entrySource.push(source);
          entryContribution.push(contribution);
          entryHorizontalKm.push(Math.hypot(east, north));
          entryVerticalM.push(Math.abs(down));
          perSource[source] = 0;
        }
        contributionCells.push(cell);
        contributionWeight.push(weight);
        // What observations beyond this cell's reach contributed, through the inverse's
        // coupling with those within it. Not attributable to a position; stated as one
        // figure, and the identity Σ sources + remainder = ω holds by construction.
        contributionRemainder.push(weight - inSupport);
        contributionBackgroundErrorStd.push(cellStd);
        contributionOffsets.push(entrySource.length);
      }

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
      observations: located.map((entry, index) => ({
        cellIndex: entry.cellIndex,
        innovation: innovation[index],
        displacementKm: entry.displacementKm,
        clamped: entry.clamped,
      })),
      contributions: {
        sources: sourceRows.map((row) => ({
          sourceKey: row.sourceKey,
          cellIndex: row.cellIndex,
          observationCount: row.count,
          errorStd: row.errorStd,
          backgroundErrorStd: row.backgroundErrorStd,
          meanInnovation: row.innovationSum / row.count,
          longitude: row.longitudeSum / row.count,
          latitude: row.latitudeSum / row.count,
          depthM: row.depthSum / row.count,
        })),
        cells: Uint32Array.from(contributionCells),
        weight: Float32Array.from(contributionWeight),
        remainder: Float32Array.from(contributionRemainder),
        backgroundErrorStd: Float32Array.from(contributionBackgroundErrorStd),
        offsets: Uint32Array.from(contributionOffsets),
        entrySource: Uint32Array.from(entrySource),
        entryContribution: Float32Array.from(entryContribution),
        entryHorizontalKm: Float32Array.from(entryHorizontalKm),
        entryVerticalM: Float32Array.from(entryVerticalM),
      },
    };
  },
};

/** No observations: no sources, no rows, and every ω exactly zero. */
function emptyContributions(): AnalysisContributions {
  return {
    sources: [],
    cells: new Uint32Array(0),
    weight: new Float32Array(0),
    remainder: new Float32Array(0),
    backgroundErrorStd: new Float32Array(0),
    offsets: Uint32Array.from([0]),
    entrySource: new Uint32Array(0),
    entryContribution: new Float32Array(0),
    entryHorizontalKm: new Float32Array(0),
    entryVerticalM: new Float32Array(0),
  };
}

/**
 * The step between analyses: what the forecast does to the provenance.
 *
 * A forecast propagates the state and adds error of its own. That added variance came
 * from the model, not from any observation and not from the archive, so crediting it
 * to a *model* share is not bookkeeping tidiness — it is the only entry that makes the
 * shares continue to mean what they claim. Every prior share is scaled by the fraction
 * of the forecast variance it is responsible for, σ²ₐ/σ²_f, and the remainder is the
 * model's.
 *
 * The consequence is the one the provenance figure needs: a measurement's share decays
 * as its forecast ages. A cell sampled an hour ago is mostly measurement; the same cell
 * a week later, advected and re-forecast a dozen times with nothing new measured in it,
 * has drifted back to being mostly model. Without this step a cell measured once stays
 * measurement-coloured for ever, however stale, and the provenance saturates — which is
 * what it did, measurably, before this existed.
 *
 * This is deliberately not part of `analyse`. The analysis and the forecast are
 * different steps run by different components, and folding the second into the first
 * would let a caller apply one without the other.
 */
export function propagateShares(
  shares: readonly Float32Array[],
  analysisErrorStd: Float32Array,
  forecastErrorStd: Float32Array,
  modelShareIndex: number,
): Float32Array[] {
  if (!shares[modelShareIndex]) {
    throw new Error(`share ${modelShareIndex} is to carry model error, and the state declares no such share`);
  }
  const propagated = shares.map((share) => Float32Array.from(share));
  for (let cell = 0; cell < analysisErrorStd.length; cell++) {
    const analysed = analysisErrorStd[cell] * analysisErrorStd[cell];
    const forecast = forecastErrorStd[cell] * forecastErrorStd[cell];
    // A forecast that claims less error than the analysis it grew from is not a
    // dilution to be applied backwards — it is a caller fault, and inherited is
    // capped at one rather than amplifying a share above what it was.
    const inherited = forecast > 0 ? Math.min(analysed / forecast, 1) : 1;
    for (let s = 0; s < propagated.length; s++) propagated[s][cell] *= inherited;
    propagated[modelShareIndex][cell] += 1 - inherited;
  }
  return propagated;
}
