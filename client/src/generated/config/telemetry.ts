// DO NOT EDIT.
// Generated from contracts/schemas/config.telemetry.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-16, the telemetry component. Every number that decides what gets reported is here, because the failure this component owns is silent degradation and a staleness window buried in source is a window nobody tunes. The common sections are referenced from config.common.schema.json rather than restated, and unknown keys are rejected so that a typo is a startup failure rather than a silent default. Every interval below is in seconds of simulation time; the only real-time interval this component has is heartbeat cadence, which lives in the common component section under ADR-0006.
 */
export interface DrognaTelemetryConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  telemetry: {
    /**
     * How often statistics and skill are published, in seconds of simulation time. In simulation time deliberately: under clock acceleration the residual arrival rate rises but the interval does not shorten, so what grows is the number of samples per message rather than the number of messages per second.
     */
    publication_interval_seconds: number;
    /**
     * The count below which a scope reports insufficient-samples and publishes no skill score at all. No default score, no zero, no carried-forward previous value (Constitution IX).
     */
    minimum_sample_count: number;
    /**
     * How long a statistic may go without a real update before it is published as stale, in seconds of simulation time. Simulation time so that a paused clock does not age a statistic that nothing has stopped feeding.
     */
    staleness_window_seconds: number;
    /**
     * A fixed grid of cells, so that the number of region-level scopes a run can hold is decided before it starts. A grid that grew a cell whenever a sample arrived somewhere new would make memory a function of where the platform went, which is the unbounded growth FR-003 forbids. A residual outside the grid is counted at scenario level and nowhere else.
     */
    regions: {
      /** Latitude of the grid's south-west corner, where row zero begins. */
      origin_latitude: number;
      /** Longitude of the grid's south-west corner, where column zero begins. */
      origin_longitude: number;
      /** Cell height in degrees of latitude. */
      cell_latitude_degrees: number;
      /** Cell width in degrees of longitude. */
      cell_longitude_degrees: number;
      /**
       * Number of cells northwards from the origin. Rows times columns is the hard bound on region-level scopes.
       */
      rows: number;
      /** Number of cells eastwards from the origin. */
      columns: number;
    };
    /**
     * Telemetry reads published forecast fields through the coverage read port, not through the query layer: it sits inside the boundary SRD 2.2 draws, and routing an internal consumer out through the external read path and back would claim a seam that is not there. The names below are the same ones the monitor is given, because both are reading one store.
     */
    coverage: {
      /** Root of the coverage store. */
      root_directory: string;
      /**
       * Name of the text file in the root holding one run identifier on one line (ADR-0011). Two identifiers means two runs claim to be current, and the reader reports no current forecast rather than choosing one.
       */
      current_pointer: string;
      /**
       * Name of the directory under the root holding the run directories. The pointer names a run, not a path.
       */
      runs_dirname: string;
      /** Name of the forecast field inside a run's directory. */
      forecast_file: string;
    };
  };
}
