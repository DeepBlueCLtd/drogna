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
