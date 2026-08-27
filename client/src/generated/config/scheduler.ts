// DO NOT EDIT.
// Generated from contracts/schemas/config.scheduler.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-12, the run scheduler. Thrashing is the failure this component owns, so the two numbers that prevent it — the minimum interval between runs and the timeout after which an outstanding request is abandoned — are configuration rather than constants, and both are measured in simulation time. The common sections are referenced from config.common.schema.json rather than restated.
 */
export interface DrognaSchedulerConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  scheduler: {
    /**
     * Least simulation time between successive run requests. A divergence arriving inside it is declined with a recorded reason, not dropped.
     */
    minimum_interval_seconds: number;
    /**
     * Simulation time after which a request that has produced no publication is abandoned, so that a run which never completes cannot block the loop for ever.
     */
    outstanding_timeout_seconds: number;
    /**
     * Members to ask each run for. The scheduler owns this number rather than the runner, so that one request carries one answer and two components cannot disagree about how large a run was.
     */
    ensemble_size: number;
    /**
     * Offset from the divergence's simulation time to the instant the run initialises from. Zero initialises at the divergence.
     */
    initialisation_offset_seconds: number;
  };
}
