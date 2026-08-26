// DO NOT EDIT.
// Generated from contracts/schemas/config.clock.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, ClockMode, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-01, the simulation clock. It carries the common sections like every other component, and adds the run's clock itself: the simulation epoch and tick interval from which every tick value follows, the mode and rate the run starts in, the bounds a rate request from the browser is checked against, and where the run manifest is written. Note which section says what. The common clock section describes the interface this service publishes — the endpoint and routes its clients are configured to reach — while the clock_service section below is the clock it serves; where the two name a mode, the clock_service one is authoritative because this component sets the mode rather than expecting it.
 */
export interface DrognaClockConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  /**
   * Named clock_service rather than clock because the common clock section already holds that name and means the opposite thing: how a component reaches the clock, not how the clock runs.
   */
  clock_service: {
    /**
     * Where the HTTP interface listens. Distinct from the common clock section's endpoint, which is where clients reach it: inside a container network the two differ, and pretending otherwise would put a deployment topology in source.
     */
    bind: {
      /** Interface to bind. */
      host: string;
      /** Port to bind. */
      port: number;
    };
    /**
     * The run's simulation epoch, ISO-8601 UTC with microsecond precision. Tick n is epoch + n * tick_interval_us, so this value and the next one fix every tick value in the run.
     */
    epoch: string;
    /**
     * Simulation microseconds between ticks, in exact integers. A rate change alters how quickly ticks are emitted and never what they say.
     */
    tick_interval_us: number;
    /** The mode the run starts in. Byte-identical replay is claimed for lockstep only. */
    default_mode: ClockMode;
    /**
     * The rate the run starts at. Zero starts the clock pinned, which is legitimate: it stops simulated time and stops nothing else (ADR-0006, FR-53).
     */
    default_rate: number;
    /**
     * What a rate request from the browser is checked against. A request outside these is refused with a readable error and the current state is unchanged.
     */
    rate_bounds: {
      /** Least permitted rate. Zero, so that a capture can pin the clock. */
      minimum: number;
      /** Greatest permitted rate. */
      maximum: number;
    };
    /**
     * Host seconds the lockstep barrier waits for an outstanding acknowledgement before the stall is reported. It never skips the tick: a participant that dies stalls the clock rather than being outrun, which is the correct failure for a replay mode (ADR-0009).
     */
    lockstep_deadline_seconds?: number;
    /**
     * How long the service waits between attempts when nothing is due — pinned, paused, or held at the lockstep barrier. Host seconds, because it is a poll interval and not a measurement of anything; the heartbeat still goes out on its own real-time cadence while the clock is held.
     */
    idle_poll_seconds: number;
    /**
     * How long, in host seconds, one of this component's heartbeats should be taken as evidence that it is alive. Published in the heartbeat itself, because only the sender knows its own cadence and the receiver holds no table of expected intervals (ADR-0006).
     */
    liveness_window_seconds: number;
    /**
     * Who this run is and what code it is running. The clock holds the run's identity because it is the component that must exist before any other.
     */
    run: {
      /**
       * The run id, recorded in the manifest and carried on every tick. Deterministic: it comes from here, never from entropy or a host clock. A resumed run takes its id from the manifest instead.
       */
      id: string;
      /**
       * Commit identifier, or a build identifier where there is no commit. A replay claims byte-identical output only against the same revision.
       */
      code_revision: string;
      /**
       * True when the code was run from a working tree, in which case the revision does not identify it and the replay claim does not hold.
       */
      code_dirty?: boolean;
    };
    /**
     * Where the run manifest is written. If a manifest is already there when the service starts, the run is resumed from it rather than restarted: a clock that silently rewound time would be worse than one that refused to start.
     */
    manifest: {
      /** Directory holding the manifest. */
      directory: string;
      /** File name of the manifest within it. */
      file: string;
    };
  };
}
