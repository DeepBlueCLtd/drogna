import { describe, expect, it } from 'vitest';
import {
  backgroundTemperature,
  eddyAnomalyT,
  frontAnomalyT,
  frontSignedDistanceKm,
  movingCentreAt,
  tauAt,
  temperatureAt,
  thermoclineAnomalyT,
  thermoclineDepthAt,
  type WorldParameters,
} from './analytic.js';

const world: WorldParameters = {
  background: {
    surface_temperature_c: 17.5,
    deep_temperature_c: 4.5,
    temperature_scale_depth_m: 350,
    surface_salinity_psu: 35.4,
    deep_salinity_psu: 34.9,
    salinity_scale_depth_m: 300,
  },
  eddy: {
    centre_latitude: 46,
    centre_longitude: -11,
    radius_km: 60,
    strength_c: 2.5,
    salinity_strength_psu: 0.15,
    sign: 1,
    depth_centre_m: 150,
    depth_half_thickness_m: 220,
  },
  front: {
    anchor_latitude: 47,
    anchor_longitude: -9.5,
    bearing_degrees: 40,
    sharpness_km: 30,
    amplitude_c: 1.2,
    salinity_amplitude_psu: -0.2,
    depth_scale_m: 250,
  },
  thermocline: { depth_m: 80, thickness_m: 30, temperature_drop_c: 4, salinity_rise_psu: 0.1, displacement_m_per_c: 20 },
  moving: {
    centre_latitude: 45,
    centre_longitude: -12.5,
    radius_km: 40,
    strength_c: 1.5,
    salinity_strength_psu: 0.1,
    sign: -1,
    depth_centre_m: 100,
    depth_half_thickness_m: 160,
    drift_east_km_per_day: 8,
    drift_north_km_per_day: 5,
    reference_latitude: 45,
  },
};

const tau = {
  background_seconds: 864000,
  feature_seconds: { eddy: 432000, front: 172800, thermocline: 1209600, moving: 86400 },
};

describe('the analytic form (v2)', () => {
  it('background cools and freshens towards the deep, monotonically', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const depth of [0, 50, 100, 200, 400, 800, 1000]) {
      const t = backgroundTemperature(world.background, depth);
      expect(t).toBeLessThan(previous);
      previous = t;
    }
    expect(backgroundTemperature(world.background, 0)).toBeCloseTo(17.5, 6);
  });

  it('the eddy anomaly peaks at its centre and dies within a few radii', () => {
    const centre = eddyAnomalyT(world.eddy, -11, 46, 150);
    expect(centre).toBeCloseTo(2.5, 6);
    expect(eddyAnomalyT(world.eddy, -11.2, 46, 150)).toBeLessThan(centre);
    expect(Math.abs(eddyAnomalyT(world.eddy, -8, 44, 150))).toBeLessThan(0.01);
  });

  it('the front changes sign across its line and is antisymmetric', () => {
    // Two points straddling the anchor perpendicular to the bearing.
    const warm = frontAnomalyT(world.front, -9.0, 46.7, 0);
    const cold = frontAnomalyT(world.front, -10.0, 47.3, 0);
    expect(Math.sign(warm)).not.toBe(Math.sign(cold));
    expect(frontSignedDistanceKm(world.front, -9.5, 47)).toBeCloseTo(0, 6);
  });

  it('the thermocline realises its full drop across the layer', () => {
    const above = thermoclineAnomalyT(world.thermocline, 0, world.thermocline.depth_m);
    const below = thermoclineAnomalyT(world.thermocline, 400, world.thermocline.depth_m);
    // Within the tanh tails: the surface sits 2.7 thicknesses above the layer.
    expect(above - below).toBeCloseTo(4, 1);
  });

  it('the layer follows the features that displace it (analytic form 2)', () => {
    /*
     * Far from the eddy and the drifting feature the layer sits where it was authored: form 2
     * reduces to form 1 wherever nothing local is acting, which is what makes the displacement a
     * perturbation of the authored depth rather than a different depth scale.
     *
     * **The far field is quiet only because the front is not a displacement term**, which is
     * this assertion's other job. An earlier version included it, and this test failed here at
     * 63.9 m against 80 — the front's own saturated −1.2 °C times the coefficient, reaching the
     * corner of the domain. A `tanh` never decays, so there is no "far" from a front, and the
     * measurement in `thermoclineDepthAt`'s note is what that cost the drifting feature's
     * recovery. Put the front back and this line fails first and cheapest.
     */
    const far = thermoclineDepthAt(world, -13.9, 44.1, 0);
    expect(far).toBeCloseTo(world.thermocline.depth_m, 1);

    // The eddy is warm-cored (sign +1), so it presses the layer down beneath it.
    const underEddy = thermoclineDepthAt(world, world.eddy.centre_longitude, world.eddy.centre_latitude, 0);
    expect(underEddy).toBeGreaterThan(far + 10);

    // The moving feature is cold-cored (sign -1), so it domes the layer, and it takes the dome
    // with it: the dome is under the centre at each time, not under the initial centre.
    const start = movingCentreAt(world.moving, 0);
    const later = movingCentreAt(world.moving, 5 * 86400);
    expect(thermoclineDepthAt(world, start.longitude, start.latitude, 0)).toBeLessThan(far - 10);
    expect(thermoclineDepthAt(world, later.longitude, later.latitude, 5 * 86400)).toBeLessThan(far - 10);
    expect(thermoclineDepthAt(world, start.longitude, start.latitude, 5 * 86400)).toBeGreaterThan(
      thermoclineDepthAt(world, later.longitude, later.latitude, 5 * 86400),
    );
  });

  it('a zero displacement coefficient reproduces the flat layer of analytic form 1', () => {
    // The version bump's own boundary, so "form 2 is a superset of form 1" is a checked claim
    // rather than a sentence in a comment.
    const flat: WorldParameters = { ...world, thermocline: { ...world.thermocline, displacement_m_per_c: 0 } };
    for (const [lon, lat] of [[-13.9, 44.1], [world.eddy.centre_longitude, world.eddy.centre_latitude], [-9.5, 47]]) {
      expect(thermoclineDepthAt(flat, lon, lat, 0)).toBe(flat.thermocline.depth_m);
    }
  });

  it('the moving feature advects as an exact affine map', () => {
    const day = movingCentreAt(world.moving, 86400);
    expect(day.latitude).toBeCloseTo(45 + 5 / 111.32, 6);
    expect(day.longitude).toBeCloseTo(-12.5 + 8 / (111.32 * Math.cos((45 * Math.PI) / 180)), 6);
    // And the anomaly follows it: colder at the new centre than at the old one.
    const atNew = temperatureAt(world, day.longitude, day.latitude, 100, 86400);
    const atOld = temperatureAt(world, -12.5, 45, 100, 86400);
    expect(atNew).toBeLessThan(atOld);
  });

  it('tau is the feature value inside a feature and the background far away', () => {
    expect(tauAt(world, tau, -11, 46, 150, 0)).toBeCloseTo(432000, 0);
    expect(tauAt(world, tau, -8.05, 44.05, 950, 0)).toBeCloseTo(864000, -3);
    // The moving feature carries its tau with it (ADR-0002).
    const centreLater = movingCentreAt(world.moving, 10 * 86400);
    expect(tauAt(world, tau, centreLater.longitude, centreLater.latitude, 100, 10 * 86400)).toBeCloseTo(86400, 0);
  });
});
