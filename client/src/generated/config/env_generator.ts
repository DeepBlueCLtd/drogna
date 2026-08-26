// DO NOT EDIT.
// Generated from contracts/schemas/config.env_generator.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-02, the synthetic environment generator. Every value that shapes the generated world arrives here and is echoed into the ground-truth manifest, so a field is reproducible from configuration and seed alone. The common sections are referenced from config.common.schema.json rather than restated. Unknown keys are rejected: a typo in a key is a startup failure, never a silent default.
 */
export interface DrognaEnvironmentGeneratorConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  env_generator: {
    /**
     * Latitude, longitude and depth are given as extent and count so that spacing is exact rather than accumulated. Time is given as an offset from the simulation instant of generation, a step and a count, because the generator has no origin of its own: its time origin is the clock's.
     */
    grid: {
      latitude: SpatialAxis;
      longitude: SpatialAxis;
      depth: SpatialAxis;
      time: {
        /** Offset of the first time step from the simulation instant of generation, in seconds. */
        start_offset_seconds: number;
        /** Spacing of the time axis, in seconds of simulation time. */
        step_seconds: number;
        /** Number of time steps. At least two, or a drifting feature has nowhere to drift to. */
        count: number;
      };
    };
    /**
     * Width of the stored data variables. Recorded in the manifest and used to derive the evaluator's agreement tolerance, because byte-identity does not survive a silent change of precision.
     */
    stored_dtype: "float32" | "float64";
    /**
     * The base state on which every feature is composed: exponential relaxation from a surface value to a deep value with depth, for temperature and for salinity independently.
     */
    background: {
      surface_temperature_c: number;
      deep_temperature_c: number;
      temperature_scale_depth_m: number;
      surface_salinity_psu: number;
      deep_salinity_psu: number;
      salinity_scale_depth_m: number;
    };
    /**
     * Pressure is derived from depth rather than generated independently. An independent pressure would be unphysical and would make the sound speed derivation meaningless.
     */
    pressure: {
      /**
       * The named relation. A second relation is a new name and a generator version bump, never a changed coefficient under the same name.
       */
      relation: "linear-hydrostatic";
      dbar_per_metre: number;
      surface_dbar: number;
    };
    /**
     * Exactly four kinds, because SRD FR-03 names exactly four. Each carries its own decorrelation timescale, which is authored here and evaluated as a field.
     */
    features: {
      eddy: {
        id: FeatureId;
        centre_latitude: number;
        centre_longitude: number;
        radius_km: number;
        strength_c: number;
        salinity_strength_psu: number;
        /** Minus one for a cold core, plus one for a warm core. */
        sign: -1 | 1;
        depth_centre_m: number;
        depth_half_thickness_m: number;
        timescale_seconds: TimescaleSeconds;
        /**
         * Amplitudes of the authored jitter drawn through the RNG port, in the order the keys are listed here. The jittered values are what the manifest records, so the manifest stays sufficient on its own.
         */
        jitter: {
          centre_km: number;
          radius_fraction: number;
          strength_fraction: number;
          timescale_fraction: number;
        };
      };
      front: {
        id: FeatureId;
        anchor_latitude: number;
        anchor_longitude: number;
        bearing_degrees: number;
        /**
         * Half-width of the transition. The manifest records its ratio to the horizontal grid spacing, so an under-resolved front's recovery error can be interpreted rather than merely reported.
         */
        sharpness_km: number;
        amplitude_c: number;
        salinity_amplitude_psu: number;
        depth_scale_m: number;
        timescale_seconds: TimescaleSeconds;
        jitter: {
          anchor_km: number;
          bearing_degrees: number;
          sharpness_fraction: number;
          amplitude_fraction: number;
          timescale_fraction: number;
        };
      };
      thermocline: {
        id: FeatureId;
        depth_m: number;
        thickness_m: number;
        temperature_drop_c: number;
        salinity_rise_psu: number;
        timescale_seconds: TimescaleSeconds;
        jitter: {
          depth_m: number;
          thickness_fraction: number;
          drop_fraction: number;
          timescale_fraction: number;
        };
      };
      moving: {
        id: FeatureId;
        centre_latitude: number;
        centre_longitude: number;
        radius_km: number;
        strength_c: number;
        salinity_strength_psu: number;
        sign: -1 | 1;
        depth_centre_m: number;
        depth_half_thickness_m: number;
        /**
         * Eastward component of the drift velocity. Its position at any time is analytic, so it need not be stepped through the field.
         */
        drift_east_km_per_day: number;
        drift_north_km_per_day: number;
        timescale_seconds: TimescaleSeconds;
        jitter: {
          centre_km: number;
          radius_fraction: number;
          strength_fraction: number;
          drift_fraction: number;
          timescale_fraction: number;
        };
      };
    };
    /**
     * ADR-0002: the timescale is a field, authored per feature over a domain-wide background and evaluated per location. Quiet water has a timescale because FR-08 requires quiet water to be left alone, and the planner scores every cell.
     */
    timescale: {
      /**
       * The timescale of water no feature overlaps. Ground truth, and recorded in the manifest.
       */
      background_seconds: TimescaleSeconds;
      /**
       * How a feature's timescale combines with the background. Named rather than assumed, because ADR-0002 leaves the choice open and two features may overlap.
       */
      blending_rule: "additive-rate-blend-normalised";
      /**
       * Smallest permitted ratio of any authored timescale to the time step. A timescale the time axis cannot express would silently mislead the revisit cadence of FR-08, so the generator refuses rather than writing it.
       */
      floor_ratio: number;
    };
    /**
     * The composed field is checked against these before anything is written. An unphysical world written quietly is worse than a refusal.
     */
    bounds: {
      temperature_c: Bound;
      salinity_psu: Bound;
      pressure_dbar: Bound;
    };
    /**
     * Names come from configuration and are echoed into the manifest, so the coverage store's cataloguing convention can be applied without the generator knowing it.
     */
    output: {
      directory: string;
      field_file: string;
      manifest_file: string;
    };
    rng: {
      /**
       * The named stream every draw in this component comes from, through harness_core.rng.rng_for.
       */
      stream: string;
    };
  };
}

/**
 * An axis given as extent and count. Spacing is derived, so it is exact rather than accumulated.
 */
export interface SpatialAxis {
  minimum: number;
  maximum: number;
  count: number;
}

export interface Bound {
  minimum: number;
  maximum: number;
}

/**
 * Stable identifier for this feature, quoted by a recovery error so a figure can be attributed.
 */
export type FeatureId = string;

/** A decorrelation timescale in seconds of simulation time. */
export type TimescaleSeconds = number;
