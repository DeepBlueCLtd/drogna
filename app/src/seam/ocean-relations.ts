/**
 * The declared physical relations both halves of the harness may evaluate: pressure from depth,
 * and sound speed from temperature, salinity and depth.
 *
 * **Why these sit in the seam rather than in the backend that used to own them.** ADR-0005 says
 * sound speed is *derived at the point of use, never stored*, and that there is exactly one
 * implementation in drogna — a residual computed anywhere cites it. Both halves of that rule
 * point here. A holding's manifest declares the method, the validity window and the path to the
 * implementation, and that manifest crosses the wire: a client reading it is told "Mackenzie 1981,
 * valid over this range, implemented there". The declaration is part of what the seam carries, so
 * the thing it points at has to be reachable from both sides of the seam or the rule cannot hold.
 *
 * It moved because feature 124's volume needed it. An analysis holding carries temperature and
 * salinity — sound speed is derived from the pair — so a parameter control offering sound speed
 * had three ways to get it: a second implementation in the panel, which ADR-0005 forbids in as
 * many words; the query layer serving it derived, which is a backend change; or this. Nothing
 * about the arithmetic changed in the move, and `ocean-relations.test.ts` holds the coefficients
 * against the values the previous implementation produced.
 *
 * Every consumer imports from here. `analytic.ts` re-exported these for a while so the backend's
 * call sites would not have to change, and that made the move invisible exactly where it matters
 * — a reader of `monitor.ts` saw the relation attributed to the analytic ocean. The eight edits
 * were cheaper than the misattribution.
 *
 * **These are relations, not the ocean.** Nothing here reads a field, a holding or a manifest, and
 * nothing here knows what the true ocean is: they are functions of three numbers. The analytic
 * true ocean stays in `backend/env-generator/analytic.ts`, where a front's shape and an eddy's
 * anomaly belong, and where the seam must not reach.
 */

export const PRESSURE_RELATION = {
  name: 'linear-depth',
  expression: 'pressure_dbar = surface_dbar + dbar_per_metre * depth_m',
  dbar_per_metre: 1.0075,
  surface_dbar: 0,
} as const;

export function pressureDbar(depthM: number): number {
  return PRESSURE_RELATION.surface_dbar + PRESSURE_RELATION.dbar_per_metre * depthM;
}

export const SOUND_SPEED = {
  method: 'Mackenzie 1981 nine-term equation',
  // The path a manifest hands a reader. It names this file now; it named
  // `backend/env-generator/analytic.ts#soundSpeedMs` until the relation moved to where both
  // halves can reach it, and a string that outlives the thing it points at is a manifest telling
  // a client to look somewhere there is nothing.
  implementation: 'app/src/seam/ocean-relations.ts#soundSpeedMs',
  validity: {
    min_temperature_c: 2,
    max_temperature_c: 30,
    min_salinity_psu: 25,
    max_salinity_psu: 40,
    min_depth_m: 0,
    max_depth_m: 8000,
  },
} as const;

/**
 * ADR-0005: sound speed is derived at the point of use, never stored, and this is
 * the single implementation in drogna — a residual computed anywhere cites it.
 */
export function soundSpeedMs(temperatureC: number, salinityPsu: number, depthM: number): number {
  const t = temperatureC;
  const s = salinityPsu;
  const d = depthM;
  return (
    1448.96 +
    4.591 * t -
    5.304e-2 * t * t +
    2.374e-4 * t * t * t +
    1.34 * (s - 35) +
    1.63e-2 * d +
    1.675e-7 * d * d -
    1.025e-2 * t * (s - 35) -
    7.139e-13 * t * d * d * d
  );
}

export function insideSoundSpeedValidity(temperatureC: number, salinityPsu: number, depthM: number): boolean {
  const v = SOUND_SPEED.validity;
  return (
    temperatureC >= v.min_temperature_c &&
    temperatureC <= v.max_temperature_c &&
    salinityPsu >= v.min_salinity_psu &&
    salinityPsu <= v.max_salinity_psu &&
    depthM >= v.min_depth_m &&
    depthM <= v.max_depth_m
  );
}
