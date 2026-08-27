// DO NOT EDIT.
// Generated from contracts/schemas/clock.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The message published on ctl/clock at the clock's declared cadence (ADR-0009). Consumers, the browser included, receive simulation time by subscribing; the clock's HTTP interface exists only for setting the rate and for a component catching up at startup. The value of tick n is epoch + n * tick_interval and is unaffected by rate, so a rate change alters the pace of these messages and never their contents. A consumer keys its behaviour to the tick index and the simulation time, never to a count of messages received: in accelerated mode a slow consumer sees gaps, and that is normal.
 */
export interface DrognaSimulationTimeSample {
  /** The run this sample belongs to, matching the run manifest. */
  run_id: string;
  /**
   * Tick index. Strictly increasing within a run; gaps are possible for a slow subscriber and are never filled in by the consumer.
   */
  tick: number;
  /** Simulation time of this tick, ISO-8601 UTC with microsecond precision. */
  sim_time: string;
  /**
   * Byte-identical replay is claimed for lockstep only; the free-running modes reproduce drawn values but not interleaving.
   */
  mode: "realtime" | "accelerated" | "paused" | "lockstep";
  /**
   * Emission rate. Zero is a legitimate rate: it pins the clock for screenshot capture (FR-53) and stops simulated time without stopping anything else.
   */
  rate: number;
}
