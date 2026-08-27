// DO NOT EDIT.
// Generated from contracts/schemas/ingest-telemetry.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * What the ingest client (C-05) reports about itself on ctl/telemetry: queue depth against its bound, the rate it is writing at, how many messages it has refused as invalid, and any loss the broker reported. It exists so that degradation is visible without anyone reading a log file — the backpressure indicator appears here within one telemetry interval of the queue reaching its bound, and clears here when the backlog drains. The telemetry component (C-16) and the client consume it. This document describes one component's report; a general telemetry envelope, if the telemetry feature decides it wants one, is that feature's to define and this shape is what it will find in use.
 */
export interface DrognaIngestTelemetry {
  /** The component reporting, matching config /component/id. */
  component: string;
  /** The scenario run this report belongs to, as carried on every clock sample. */
  scenario_run_id: string;
  /**
   * Simulation time at which the report was composed, ISO-8601 UTC with microsecond precision. The telemetry interval is measured in simulation time like every interval in this component except the heartbeat, which is real time by ADR-0006.
   */
  sim_time: string;
  /** The tick index the client had observed when it composed the report. */
  tick: number;
  /**
   * Depth against bound. At the bound the client stops acknowledging rather than discarding, so a depth equal to the bound is backpressure and not loss.
   */
  queue: {
    /** Messages held now. */
    depth: number;
    /** The configured limit. */
    bound: number;
    /**
     * The backpressure indicator. True when the queue is full now, and true when it filled at any point during the interval just ended — a loop that takes and writes within one turn is rarely caught full by an instantaneous sample, and an indicator that only reported the instant would say a system under sustained backpressure was comfortable. It clears when an interval passes with room to spare throughout.
     */
    at_bound: boolean;
    /**
     * The deepest the queue has been this run. Never above the bound, and that is the claim SC-006 tests.
     */
    high_water: number;
    /**
     * How many times the queue has reached its bound this run. Not a count of losses: reaching the bound stops the client taking more, and what it has not taken it has not acknowledged, so the broker still holds it. This is the figure the indicator is derived from, and it is carried so a reader can tell one long stall from a hundred short ones.
     */
    filled: number;
  };
  write: {
    /** Transactions committed this run. */
    batches: number;
    /** Observations written this run. */
    stored: number;
    /**
     * Redeliveries that found their row already there and changed nothing. Counted rather than absorbed in silence: a rising number says the broker is redelivering.
     */
    duplicates: number;
    /**
     * Observations stored per second of simulation time since the previous report. A rate in simulation time rather than host time, because that is the time the rest of this component runs on.
     */
    rate_per_simulation_second: number;
  };
  /**
   * Messages that failed validation. Never written, always counted, kept up to the configured bound so they can be inspected.
   */
  rejections: {
    /** Every rejection this run, kept or not. */
    count: number;
    /** How many are still held for inspection. */
    retained: number;
    /**
     * Rejections that fell off the end of the retention. Reported rather than silently forgotten, which is what reaching the bound means.
     */
    discarded: number;
  };
  broker: {
    /** Messages delivered to this client this run. */
    received: number;
    /**
     * Messages the broker reported dropping. A burst larger than the broker's retention for the in-flight window loses messages before this component sees them; the loss is counted and reported rather than found later as a hole in the data.
     */
    lost: number;
  };
}
