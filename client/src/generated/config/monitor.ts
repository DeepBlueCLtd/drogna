// DO NOT EDIT.
// Generated from contracts/schemas/config.monitor.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-11, the divergence monitor. Every number that decides whether the harness spends a model run is here, because over-sensitivity is the failure this component owns and a threshold buried in source is a threshold nobody tunes. The common sections are referenced from config.common.schema.json rather than restated, and unknown keys are rejected so that a typo is a startup failure rather than a silent default.
 */
export interface DrognaMonitorConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  monitor: {
    /**
     * Bounded in both simulation-time span and sample count, so it cannot grow with the length of the scenario. Eviction is by simulation time; the count bound is what holds the memory footprint at a high clock rate.
     */
    window: {
      /** How far back the window reaches, in seconds of simulation time. */
      span_seconds: number;
      /** Hard bound on samples held. The oldest is evicted when it is reached. */
      maximum_samples: number;
      /**
       * Bound on observations accepted but not yet paired into a scoreable sample. Beyond it the oldest are shed and counted, because falling behind unboundedly at a high clock rate is worse than a reported drop.
       */
      maximum_pending: number;
    };
    /**
     * The residual is defined on sound speed, derived from the observed temperature, salinity and pressure by the single implementation in harness_core (ADR-0005). There is no threshold on temperature here, and there is not meant to be.
     */
    residual: {
      /**
       * Residual magnitude above which a sample counts towards persistence, in metres per second. Of the order of 1.5 to 2 m/s, which is roughly half a degree Celsius at the scenario's nominal conditions.
       */
      threshold_m_per_s: number;
    };
    /**
     * Either rule may be satisfied. Both counts are at least two, because a single sample above threshold is an outlier and raising a run for it is the failure this component owns.
     */
    persistence: {
      /**
       * Radius within which samples count as neighbours, in metres. A radius and not a spatial index: indexing belongs to the planner, and coupling the monitor to it would buy nothing.
       */
      neighbourhood_radius_m: number;
      /**
       * Distinct samples above threshold inside one neighbourhood that satisfy the spatial rule.
       */
      spatial_sample_count: number;
      /** Consecutive samples above threshold that satisfy the temporal rule. */
      temporal_sample_count: number;
      /**
       * Simulation-time span those consecutive samples must cover, in seconds. Without it a burst arriving in one instant would satisfy a rule about persistence over time.
       */
      temporal_span_seconds: number;
    };
    /**
     * On start or restart the monitor has no window. It either observes a span of simulation time or issues exactly one catch-up query against the observation store, and publishes no divergence until that completes.
     */
    warmup: {
      /**
       * span: wait out the declared simulation-time span. catchup: one query to the observation store, and no further query for the life of the process.
       */
      mode: "span" | "catchup";
      /**
       * The warm-up span in seconds of simulation time, and in catchup mode the span the single query covers.
       */
      span_seconds: number;
      /**
       * Bound on the rows the single catch-up query returns, so a restart cannot pull the store into memory.
       */
      catchup_sample_limit?: number;
    };
    /**
     * The monitor samples the forecast through the coverage read port, not through the query layer: it sits inside the boundary, and routing an internal consumer out through the external read path and back would claim a seam that is not there.
     */
    coverage: {
      /** Root of the coverage store. */
      root_directory: string;
      /**
       * Name of the text file in the root holding one run identifier on one line (ADR-0011). Two identifiers means two runs claim to be current, and the reader reports no current forecast rather than choosing one.
       */
      current_pointer: string;
      /**
       * Name of the directory under the root holding the run directories. The pointer names a run, not a path, so the reader needs this to find it.
       */
      runs_dirname: string;
      /** Name of the forecast field inside a run's directory. */
      forecast_file: string;
    };
  };
}
