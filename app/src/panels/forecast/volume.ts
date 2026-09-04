/**
 * The volume's pure half: where the thermocline sits in each column of a served field
 * (feature 124, FR-120).
 *
 * **Why this is derived here at all, when the harness already publishes a thermocline.**
 * `forecast-features` carries one — `{ depth_m, thickness_m, layer_drop_c }` — and it is a
 * *domain mean*: "where the domain-mean profile falls fastest". One number for the whole grid
 * is a flat plane. FR-120 asks for a **surface** and says why in the requirement itself: the
 * thermocline domes, tilts and breaks, and shape is the answer a sonar user is asking for. A
 * plane drawn where a surface was promised would claim the field is flat, which is the one
 * thing the drawing exists to disprove.
 *
 * The shape is real and is in the served field: the seeded eddy and front perturb temperature
 * horizontally, so the depth at which a *column* falls fastest moves from column to column even
 * though the analytic thermocline term itself is horizontally uniform. Nothing here invents it —
 * every value comes from an area query the shell makes through the query layer, one per level,
 * as the Map's own volume already does.
 *
 * **The pick is the harness's own, not a second opinion about it.** `model-runner/features.ts`
 * defines the published estimate as the level pair whose temperature falls fastest, reported at
 * the midpoint of that pair, carrying the pair's separation as its thickness and declining when
 * the profile does not fall with depth anywhere. This applies that definition per column instead
 * of to the domain mean, and `thermoclineIn` below is the same arithmetic on one profile — which
 * is what lets `domainMeanProfile` hold the two together: run this pick over the mean profile and
 * it must reproduce the number the run published, or one of the two has drifted.
 *
 * Pure, and no DOM: the arithmetic is testable alone, as `rays.ts` is and for the same reason.
 */

/** One column's temperature profile, deepening. */
export interface Profile {
  readonly depthsM: readonly number[];
  readonly temperatureC: readonly number[];
}

/**
 * Where a profile falls fastest, at the resolution the grid can support.
 *
 * `undefined` where the profile does not fall with depth anywhere — the same refusal the
 * published estimator makes, and for the same reason: there is no thermocline to place, which is
 * a different fact from one at depth nought.
 */
export interface Thermocline {
  /** The midpoint of the steepest pair. Never finer than the pair's separation. */
  readonly depthM: number;
  /** The interval the drop was taken over: the resolution, carried with the estimate. */
  readonly thicknessM: number;
  /** The temperature drop across that interval. Positive by construction. */
  readonly dropC: number;
}

export function thermoclineIn(profile: Profile): Thermocline | undefined {
  const { depthsM, temperatureC } = profile;
  const levels = Math.min(depthsM.length, temperatureC.length);
  if (levels < 2) return undefined;
  let best = -1;
  let steepest = 0;
  for (let level = 0; level < levels - 1; level++) {
    const drop = temperatureC[level] - temperatureC[level + 1];
    const span = depthsM[level + 1] - depthsM[level];
    // A non-finite reading is not a gradient. Cells the field did not serve are skipped rather
    // than compared, because `NaN > steepest` is false and would silently pick the level before.
    if (!(span > 0) || !Number.isFinite(drop)) continue;
    const gradient = drop / span;
    if (gradient > steepest) {
      steepest = gradient;
      best = level;
    }
  }
  if (best < 0 || steepest <= 0) return undefined;
  return {
    depthM: (depthsM[best] + depthsM[best + 1]) / 2,
    thicknessM: depthsM[best + 1] - depthsM[best],
    dropC: temperatureC[best] - temperatureC[best + 1],
  };
}

/**
 * The field as the shell holds it: one served level per entry, each a grid of temperatures in
 * row-major order over the same latitudes and longitudes.
 */
export interface LevelField {
  readonly depthM: number;
  /** `latitudes.length * longitudes.length` values, row-major, as an EDR area range carries them. */
  readonly temperatureC: readonly number[];
}

/**
 * The thermocline in every column, in the same cell order the levels are given in.
 *
 * A cell whose profile does not fall is `undefined` rather than absent, so the surface stays
 * indexable by cell and a caller can draw the hole rather than closing over it.
 */
export function thermoclineSurface(levels: readonly LevelField[]): (Thermocline | undefined)[] {
  if (levels.length < 2) return [];
  // Every level must describe the same grid, or a "column" is a stack of different places. The
  // shortest wins rather than the first, so a truncated level cannot read past its own end.
  const cells = levels.reduce((fewest, level) => Math.min(fewest, level.temperatureC.length), Infinity);
  if (!Number.isFinite(cells) || cells <= 0) return [];
  const depthsM = levels.map((level) => level.depthM);
  const surface: (Thermocline | undefined)[] = [];
  for (let cell = 0; cell < cells; cell++) {
    surface.push(thermoclineIn({ depthsM, temperatureC: levels.map((level) => level.temperatureC[cell]) }));
  }
  return surface;
}

/**
 * How many of a level's own standard deviations a feature must clear at its centre to be drawn
 * there.
 *
 * **Measured against the shipped field rather than chosen.** The eddy's anomaly at its own centre
 * runs 2.06σ, 2.32σ, 0.18σ, 1.09σ, 0.03σ and −0.65σ down the six levels: it is unmistakable in
 * the top two and indistinguishable from the field's own wiggle below them, and the nearest thing
 * to a false positive is 1.09σ at 600 m. Two sigma separates those with room on both sides. The
 * *floor itself* is the level's spread rather than a temperature typed in here, because a fixed
 * threshold in degrees would be two different claims at the surface, where the field varies by
 * 1.13 °C, and at 800 m where it varies by 0.23 °C.
 */
export const FEATURE_SIGMAS = 2;

/** What a feature is doing at one level of the served field. */
export interface FeatureReach {
  readonly depthM: number;
  /** The anomaly at the feature's own cell, against that level's mean. */
  readonly anomalyC: number;
  /** The level's own standard deviation: the wiggle the anomaly has to beat. */
  readonly spreadC: number;
  /** Whether the feature is distinguishable from the field here. */
  readonly present: boolean;
}

/**
 * A published feature carried **down** the served field (FR-120's second half, T010).
 *
 * **The holding publishes no depth for these, which is why this exists.**
 * `forecast-features.schema.json` carries the eddy and the drifting feature as a centre, a radius
 * and an anomaly peak, and the front as an anchor, a bearing and a step. All horizontal: there is
 * no vertical extent anywhere in the document, and the estimator that writes it takes no manifest
 * on purpose, because reading the authored depth scales would be forecasting from the truth.
 *
 * So the dimension is read off the field the features are *in*, which is what T010 asks for in as
 * many words — "against the field they are in". At each level the feature's own cell is compared
 * with that level's mean, and it is drawn while that anomaly clears the level's own spread by
 * `FEATURE_SIGMAS`. On the shipped configuration the eddy reaches 200 m and stops, which is a
 * fact about a surface-intensified feature rather than a limit of the drawing.
 */
export function featureReach(levels: readonly LevelField[], cell: number): FeatureReach[] {
  return levels.map((level) => {
    // **The feature's own cell is left out of the field it is compared with.** It is "the field
    // they are in", not the field including them, and a feature that contributes to its own floor
    // is measured against a yardstick it moved: on a four-cell level a strong eddy raises the
    // spread enough that its own 2.25 °C anomaly cannot clear 2σ of 1.30 °C. One cell in 7,680
    // changes nothing measurable on the shipped grid — the calibration above is unaffected — but
    // the measure should not depend on the magnitude of the thing being measured at all.
    let sum = 0;
    let counted = 0;
    for (let index = 0; index < level.temperatureC.length; index++) {
      const value = level.temperatureC[index];
      if (index === cell || !Number.isFinite(value)) continue;
      sum += value;
      counted += 1;
    }
    const mean = counted > 0 ? sum / counted : Number.NaN;
    let squares = 0;
    for (let index = 0; index < level.temperatureC.length; index++) {
      const value = level.temperatureC[index];
      if (index === cell || !Number.isFinite(value)) continue;
      squares += (value - mean) ** 2;
    }
    const spreadC = counted > 0 ? Math.sqrt(squares / counted) : Number.NaN;
    const at = level.temperatureC[cell];
    const anomalyC = Number.isFinite(at) && Number.isFinite(mean) ? at - mean : Number.NaN;
    return {
      depthM: level.depthM,
      anomalyC,
      spreadC,
      // A level with no spread has nothing to stand out from: everything or nothing would clear
      // a floor of nought, and "everything" is the answer that draws a feature through water
      // that is uniform.
      present: Number.isFinite(anomalyC) && spreadC > 0 && Math.abs(anomalyC) >= FEATURE_SIGMAS * spreadC,
    };
  });
}

/**
 * The domain-mean profile of a served field, for holding this module against the run's own
 * published estimate.
 *
 * **The mean of the picks is not the pick of the mean**, and that is the whole reason this
 * exists. `thermoclineSurface` gives one depth per column and averaging those would *not*
 * reproduce `forecast-features`' number — argmax does not commute with the mean — so a test
 * asserting it did would be asserting something false and would be "fixed" by loosening its
 * bound until it passed. What does reproduce it exactly is the same pick applied to the same
 * input: the domain mean profile. That is the falsifiable tie between this file and
 * `model-runner/features.ts`.
 */
export function domainMeanProfile(levels: readonly LevelField[]): Profile {
  return {
    depthsM: levels.map((level) => level.depthM),
    temperatureC: levels.map((level) => {
      let sum = 0;
      let counted = 0;
      for (const value of level.temperatureC) {
        if (!Number.isFinite(value)) continue;
        sum += value;
        counted += 1;
      }
      return counted > 0 ? sum / counted : Number.NaN;
    }),
  };
}
