/**
 * The analytic form, version 1 (manifest.schema.json `generator.analytic_form_version`).
 *
 * Everything the generator stores is evaluated from these pure functions of
 * (longitude, latitude, depth, seconds-from-origin) and the jittered parameters the
 * ground-truth manifest records — which is what makes the manifest sufficient: a
 * reader holding it can reconstruct the field at any point without the field file
 * (Constitution IX). Any change that alters a value anywhere is an
 * analytic_form_version bump.
 *
 * The numerics are deliberately fake: plausible shapes, honest units, no claim to
 * physics beyond what the manifest states.
 */
import type {
  ManifestEddyParameters,
  ManifestFrontParameters,
  ManifestMovingParameters,
  ManifestThermoclineParameters,
} from '../../generated/types.js';

export const ANALYTIC_FORM_VERSION = 1;

export const KM_PER_DEGREE_LATITUDE = 111.32;

export interface BackgroundParameters {
  surface_temperature_c: number;
  deep_temperature_c: number;
  temperature_scale_depth_m: number;
  surface_salinity_psu: number;
  deep_salinity_psu: number;
  salinity_scale_depth_m: number;
}

/** Exponential relaxation from surface to deep value with depth. */
export function backgroundTemperature(p: BackgroundParameters, depthM: number): number {
  return (
    p.deep_temperature_c +
    (p.surface_temperature_c - p.deep_temperature_c) * Math.exp(-depthM / p.temperature_scale_depth_m)
  );
}

export function backgroundSalinity(p: BackgroundParameters, depthM: number): number {
  return (
    p.deep_salinity_psu +
    (p.surface_salinity_psu - p.deep_salinity_psu) * Math.exp(-depthM / p.salinity_scale_depth_m)
  );
}

/** Local-plane distance in km, exact affine map about a reference latitude. */
export function kmOffsets(
  longitude: number,
  latitude: number,
  originLongitude: number,
  originLatitude: number,
  referenceLatitude: number,
): { eastKm: number; northKm: number } {
  const eastKm =
    (longitude - originLongitude) * KM_PER_DEGREE_LATITUDE * Math.cos((referenceLatitude * Math.PI) / 180);
  const northKm = (latitude - originLatitude) * KM_PER_DEGREE_LATITUDE;
  return { eastKm, northKm };
}

function radialWeight(distanceKm: number, radiusKm: number): number {
  const r = distanceKm / radiusKm;
  return Math.exp(-r * r);
}

function depthWindow(depthM: number, centreM: number, halfThicknessM: number): number {
  const d = (depthM - centreM) / halfThicknessM;
  return Math.exp(-d * d);
}

/** Membership in [0,1]: shares the anomaly's geometry (manifest `timescale.membership`). */
export function eddyMembership(p: ManifestEddyParameters, longitude: number, latitude: number, depthM: number): number {
  const { eastKm, northKm } = kmOffsets(longitude, latitude, p.centre_longitude, p.centre_latitude, p.centre_latitude);
  return radialWeight(Math.hypot(eastKm, northKm), p.radius_km) * depthWindow(depthM, p.depth_centre_m, p.depth_half_thickness_m);
}

export function eddyAnomalyT(p: ManifestEddyParameters, longitude: number, latitude: number, depthM: number): number {
  return p.sign * p.strength_c * eddyMembership(p, longitude, latitude, depthM);
}

export function eddyAnomalyS(p: ManifestEddyParameters, longitude: number, latitude: number, depthM: number): number {
  return p.sign * p.salinity_strength_psu * eddyMembership(p, longitude, latitude, depthM);
}

/** Signed cross-front distance in km: positive on the warm side. */
export function frontSignedDistanceKm(p: ManifestFrontParameters, longitude: number, latitude: number): number {
  const { eastKm, northKm } = kmOffsets(longitude, latitude, p.anchor_longitude, p.anchor_latitude, p.anchor_latitude);
  const bearing = (p.bearing_degrees * Math.PI) / 180;
  // The front runs along the bearing; distance is the cross-track component.
  return eastKm * Math.cos(bearing) - northKm * Math.sin(bearing);
}

export function frontMembership(p: ManifestFrontParameters, longitude: number, latitude: number, depthM: number): number {
  const x = frontSignedDistanceKm(p, longitude, latitude) / p.sharpness_km;
  // Highest at the front itself, decaying away and with depth: sech² of the
  // cross-track distance, which is the tanh transition's own derivative shape.
  const sech = 1 / Math.cosh(x);
  return sech * sech * Math.exp(-depthM / p.depth_scale_m);
}

export function frontAnomalyT(p: ManifestFrontParameters, longitude: number, latitude: number, depthM: number): number {
  const x = frontSignedDistanceKm(p, longitude, latitude) / p.sharpness_km;
  return p.amplitude_c * Math.tanh(x) * Math.exp(-depthM / p.depth_scale_m);
}

export function frontAnomalyS(p: ManifestFrontParameters, longitude: number, latitude: number, depthM: number): number {
  const x = frontSignedDistanceKm(p, longitude, latitude) / p.sharpness_km;
  return p.salinity_amplitude_psu * Math.tanh(x) * Math.exp(-depthM / p.depth_scale_m);
}

export function thermoclineMembership(p: ManifestThermoclineParameters, depthM: number): number {
  const d = (depthM - p.depth_m) / p.thickness_m;
  const sech = 1 / Math.cosh(d);
  return sech * sech;
}

export function thermoclineAnomalyT(p: ManifestThermoclineParameters, depthM: number): number {
  // Half the drop above, half below: the full drop is realised across the layer.
  return (-p.temperature_drop_c / 2) * (1 + Math.tanh((depthM - p.depth_m) / p.thickness_m)) + p.temperature_drop_c / 2;
}

export function thermoclineAnomalyS(p: ManifestThermoclineParameters, depthM: number): number {
  return (p.salinity_rise_psu / 2) * (1 + Math.tanh((depthM - p.depth_m) / p.thickness_m)) - p.salinity_rise_psu / 2;
}

/** The moving feature's centre at a time: exact affine drift about reference_latitude. */
export function movingCentreAt(
  p: ManifestMovingParameters,
  secondsFromOrigin: number,
): { latitude: number; longitude: number } {
  const days = secondsFromOrigin / 86400;
  const latitude = p.centre_latitude + (p.drift_north_km_per_day * days) / KM_PER_DEGREE_LATITUDE;
  const longitude =
    p.centre_longitude +
    (p.drift_east_km_per_day * days) /
      (KM_PER_DEGREE_LATITUDE * Math.cos((p.reference_latitude * Math.PI) / 180));
  return { latitude, longitude };
}

export function movingMembership(
  p: ManifestMovingParameters,
  longitude: number,
  latitude: number,
  depthM: number,
  secondsFromOrigin: number,
): number {
  const centre = movingCentreAt(p, secondsFromOrigin);
  const { eastKm, northKm } = kmOffsets(longitude, latitude, centre.longitude, centre.latitude, p.reference_latitude);
  return radialWeight(Math.hypot(eastKm, northKm), p.radius_km) * depthWindow(depthM, p.depth_centre_m, p.depth_half_thickness_m);
}

export interface WorldParameters {
  background: BackgroundParameters;
  eddy: ManifestEddyParameters;
  front: ManifestFrontParameters;
  thermocline: ManifestThermoclineParameters;
  moving: ManifestMovingParameters;
}

/**
 * The composition rule (manifest `composition`): anomalies are additive on the
 * background. Stated once, evaluated everywhere.
 */
export const COMPOSITION_RULE = 'additive-anomalies';

export function temperatureAt(
  w: WorldParameters,
  longitude: number,
  latitude: number,
  depthM: number,
  secondsFromOrigin: number,
): number {
  return (
    backgroundTemperature(w.background, depthM) +
    eddyAnomalyT(w.eddy, longitude, latitude, depthM) +
    frontAnomalyT(w.front, longitude, latitude, depthM) +
    thermoclineAnomalyT(w.thermocline, depthM) +
    w.moving.sign * w.moving.strength_c * movingMembership(w.moving, longitude, latitude, depthM, secondsFromOrigin)
  );
}

export function salinityAt(
  w: WorldParameters,
  longitude: number,
  latitude: number,
  depthM: number,
  secondsFromOrigin: number,
): number {
  return (
    backgroundSalinity(w.background, depthM) +
    eddyAnomalyS(w.eddy, longitude, latitude, depthM) +
    frontAnomalyS(w.front, longitude, latitude, depthM) +
    thermoclineAnomalyS(w.thermocline, depthM) +
    w.moving.sign *
      w.moving.salinity_strength_psu *
      movingMembership(w.moving, longitude, latitude, depthM, secondsFromOrigin)
  );
}

export interface TimescaleParameters {
  background_seconds: number;
  feature_seconds: { eddy: number; front: number; thermocline: number; moving: number };
}

export const TAU_BLENDING_RULE = {
  name: 'max-membership-blend',
  version: 1,
  description:
    'tau(x) = background * (1 - w) + tau_f * w, where w is the largest membership among the four features at x and tau_f is that feature’s authored timescale. Where two features overlap, the stronger membership wins outright; the loser contributes nothing, which keeps the field reproducible from the parameters alone.',
} as const;

export const TAU_MEMBERSHIP_RULE = {
  rule: 'anomaly-geometry',
  description:
    'A feature’s membership at a location is the same normalised geometry its anomaly uses (radial Gaussian, sech² cross-front decayed by depth, sech² across the layer, drifting radial Gaussian), so the timescale and the anomaly it belongs to cannot drift apart; the moving feature’s tau advects with it.',
} as const;

export function tauAt(
  w: WorldParameters,
  tau: TimescaleParameters,
  longitude: number,
  latitude: number,
  depthM: number,
  secondsFromOrigin: number,
): number {
  const memberships: [number, number][] = [
    [eddyMembership(w.eddy, longitude, latitude, depthM), tau.feature_seconds.eddy],
    [frontMembership(w.front, longitude, latitude, depthM), tau.feature_seconds.front],
    [thermoclineMembership(w.thermocline, depthM), tau.feature_seconds.thermocline],
    [movingMembership(w.moving, longitude, latitude, depthM, secondsFromOrigin), tau.feature_seconds.moving],
  ];
  let bestWeight = 0;
  let bestTau = tau.background_seconds;
  for (const [weight, featureTau] of memberships) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestTau = featureTau;
    }
  }
  return tau.background_seconds * (1 - bestWeight) + bestTau * bestWeight;
}

// **Pressure and sound speed moved to `app/src/seam/ocean-relations.ts`** and are re-exported
// here so every existing caller keeps working. They are declared relations rather than the
// analytic ocean — functions of three numbers that read no field — and a manifest points a
// client at the implementation, so it has to be reachable from both sides of the seam.
// ADR-0005's "single implementation in drogna" is what the move preserves: feature 124's volume
// needs sound speed from served temperature and salinity, and the alternative was a second copy.
export {
  PRESSURE_RELATION,
  SOUND_SPEED,
  insideSoundSpeedValidity,
  pressureDbar,
  soundSpeedMs,
} from '../../seam/ocean-relations.js';
