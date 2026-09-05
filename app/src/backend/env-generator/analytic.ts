/**
 * The analytic form, version 2 (manifest.schema.json `generator.analytic_form_version`).
 *
 * **Version 2 gives the thermocline a shape.** In form 1 `thermoclineAnomalyT` took only a depth:
 * the layer sat at one depth everywhere and no resolution could make it dome, because there was
 * nothing to resolve. FR-120 asks for a surface and says why — "the thermocline domes, tilts and
 * breaks, and shape is the answer a sonar user is asking for" — so form 1 could not satisfy the
 * requirement by any drawing, at any grid spacing (issue #113, measured: 7,680 of 7,680 columns
 * picked one depth at every spacing from 200 m down to 10 m). Form 2 displaces the layer where a
 * feature warms or cools the water at it, which is what a mesoscale feature does to an isopycnal,
 * and the surface acquires the shape the requirement was asking to see.
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

export const ANALYTIC_FORM_VERSION = 2;

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

/**
 * How far the features push the layer at one place, and therefore where the layer is there.
 *
 * **Why the anomalies are evaluated at the layer's nominal depth rather than at the depth being
 * asked about.** A layer's depth is a property of the place, not of the depth you happen to be
 * sampling: if this read the anomaly at `depthM` the layer would sit somewhere different for every
 * sample taken through the same column, which is not a surface at all. `depth_m` is the one depth
 * every column shares, so it is the one that can be asked at.
 *
 * That also keeps this out of a loop. The displacement depends on the eddy, front and moving terms
 * and those depend on position and time — but never on the thermocline, so nothing here reads what
 * it is about to write.
 *
 * The sign is the ocean's: warm water above an isopycnal presses it down, cool water lets it rise.
 * `displacement_m_per_c` is positive, so a warm-core eddy deepens the layer beneath it and a cold
 * one domes it — the doming FR-120 names.
 *
 * **The front is deliberately not one of the terms, and this is the interesting decision here.**
 * The obvious form was "every anomaly displaces the layer", and the front's anomaly is a `tanh`:
 * it *saturates* rather than decaying, so as a displacement it does not tilt the layer near the
 * front, it holds one half of the domain permanently deep and the other permanently shallow, out
 * to the edges. The eddy and the drifting feature use radial Gaussians that fall to nothing, which
 * is what a local displacement has to do.
 *
 * That is an argument from shape, and the measurement agrees with it. Recovering the drifting
 * feature's centre, error in km against its own 40 km radius — every figure below printed by
 * `features.test.ts` itself, over the seeds that file actually runs, so the table reproduces by
 * being the test's own output rather than a probe's:
 *
 * | terms, at the shipped 20 m/°C | 1234 | 1180001 | 1180002 | 1180003 | 1180004 |
 * |---|---|---|---|---|---|
 * | none (analytic form 1) | 3.1 | 9.7 | 20.5 | 7.0 | *declined* |
 * | eddy, front and moving | 3.1 | 8.8 | 17.6 | 5.4 | *declined* |
 * | eddy and moving (shipped) | **2.4** | **8.3** | **14.5** | **4.7** | **3.6** |
 *
 * Dropping the front is better on every seed, and on 1180004 — `returning`'s own — it is the
 * difference between a position and a refusal: with the front in the displacement the estimator
 * declines there exactly as form 1 does, because a global cold half and warm half at the layer's
 * depth is a blob the size of the domain and it drowns a 40 km one. The front's own horizontal
 * step is already in the field through `frontAnomalyT`; stepping the layer with it as well was
 * double-counting the one feature that needs no help being seen.
 *
 * **And the coefficient is 20 because that is where the front's *anchor* still lands.** With the
 * front excluded, 30 and 40 m/°C both recover the drifting feature better still (1.9 km on
 * 1180004) — and both put seed 1180003's front anchor outside its 30 km bound. The layer's shape
 * and the front's position are read off the same horizontal structure, so buying more of one
 * spends the other. That is the tension ADR-0044's last section is about, met here in miniature.
 */
/*
 * **Nothing clamps the result to the water column, and that is a bound this does not have.**
 * `depth_m` is jittered and both feature strengths are, so a large enough coefficient could in
 * principle place the layer above the surface or below the domain; the arithmetic would not fail,
 * it would publish a layer nobody can sample. At the shipped 20 m/°C the layer spans 59 to 131 m
 * against a 0–1000 m domain, which is not close — the reason no clamp is added is that a clamp
 * would hide the configuration error rather than report it, and the honest place for that check
 * is a bound on the *configuration*, which nothing currently has.
 */
export function thermoclineDepthAt(
  w: WorldParameters,
  longitude: number,
  latitude: number,
  secondsFromOrigin: number,
): number {
  const nominal = w.thermocline.depth_m;
  const anomalyC =
    eddyAnomalyT(w.eddy, longitude, latitude, nominal) +
    w.moving.sign * w.moving.strength_c * movingMembership(w.moving, longitude, latitude, nominal, secondsFromOrigin);
  return nominal + w.thermocline.displacement_m_per_c * anomalyC;
}

/**
 * The three terms below take the layer's depth *at this place* as an argument rather than reading
 * `p.depth_m`. It is deliberately not defaulted: a caller that forgets it would silently get the
 * flat form 1 field back, which is the fault this version exists to fix, and a default is how that
 * would happen quietly.
 */
export function thermoclineMembership(
  p: ManifestThermoclineParameters,
  depthM: number,
  layerDepthM: number,
): number {
  const d = (depthM - layerDepthM) / p.thickness_m;
  const sech = 1 / Math.cosh(d);
  return sech * sech;
}

export function thermoclineAnomalyT(
  p: ManifestThermoclineParameters,
  depthM: number,
  layerDepthM: number,
): number {
  // Half the drop above, half below: the full drop is realised across the layer.
  return (-p.temperature_drop_c / 2) * (1 + Math.tanh((depthM - layerDepthM) / p.thickness_m)) + p.temperature_drop_c / 2;
}

export function thermoclineAnomalyS(
  p: ManifestThermoclineParameters,
  depthM: number,
  layerDepthM: number,
): number {
  return (p.salinity_rise_psu / 2) * (1 + Math.tanh((depthM - layerDepthM) / p.thickness_m)) - p.salinity_rise_psu / 2;
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
    thermoclineAnomalyT(w.thermocline, depthM, thermoclineDepthAt(w, longitude, latitude, secondsFromOrigin)) +
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
    thermoclineAnomalyS(w.thermocline, depthM, thermoclineDepthAt(w, longitude, latitude, secondsFromOrigin)) +
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
    'A feature’s membership at a location is the same normalised geometry its anomaly uses (radial Gaussian, sech² cross-front decayed by depth, sech² across the layer about the layer’s displaced depth, drifting radial Gaussian), so the timescale and the anomaly it belongs to cannot drift apart; the moving feature’s tau advects with it and the thermocline’s domes with it.',
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
    // The layer's membership follows the layer. TAU_MEMBERSHIP_RULE says a feature's membership is
    // the same geometry its anomaly uses, so the displaced layer has to displace its tau with it or
    // the two would drift apart exactly where the shape is.
    [
      thermoclineMembership(w.thermocline, depthM, thermoclineDepthAt(w, longitude, latitude, secondsFromOrigin)),
      tau.feature_seconds.thermocline,
    ],
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

// **Pressure and sound speed live in `app/src/seam/ocean-relations.ts`.** They are declared
// relations rather than the analytic ocean — functions of three numbers that read no field — and
// a manifest points a client at the implementation, so it has to be reachable from both sides of
// the seam. ADR-0005's "single implementation in drogna" is what the move preserves: feature 124's
// volume needs sound speed from served temperature and salinity, and the alternative was a second
// copy.
//
// They were re-exported from here for a while, so the eight backend call sites would not have to
// change. That cost the move most of its point: every consumer still read `from
// '../env-generator/analytic.js'`, so a reader of `monitor.ts` or `sensors.ts` saw the relation
// attributed to the analytic-ocean module that the file above says it is not, and `grep
// ocean-relations` found no backend consumer of a relation the whole backend uses. Eight one-line
// edits buy a tree where the owner is visible at the point of use, which is what the move was for.
