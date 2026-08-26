// DO NOT EDIT.
// Generated from contracts/schemas/heartbeat.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The message every long-lived component publishes on ctl/heartbeat at its declared interval, and the only thing that lights a component in the client (FR-45, FR-52, Constitution VII). The shape was settled by feature 001, which publishes the first one; this document is the neutral master and adopts that shape unchanged, extending it only with the two optional declarations FR-012 asks for. Note what is absent: no host timestamp. Cadence and liveness windows are real time by ADR-0006, but the sender does not tell the receiver what time the sender thinks it is; the receiver measures arrival against its own real time, and the simulation time carried here is payload, not schedule.
 */
export interface DrognaComponentHeartbeat {
  /** The component id, matching config /component/id. */
  component: string;
  /** Simulation time of the heartbeat, ISO-8601 UTC with microsecond precision. */
  sim_time: string;
  /**
   * The tick index the component had observed when it published. Present wherever the component holds a tick.
   */
  tick?: number | null;
  /**
   * degraded and stalled are how a component says it is alive but not working, rather than going quiet and being read as dead.
   */
  status: "starting" | "ok" | "degraded" | "stalled" | "stopping";
  /** The run this component is part of, matching the run manifest. */
  run_id?: string | null;
  /**
   * SHA-256 of the configuration the component was started from. This is how a participant's digest reaches the run manifest: never the configuration itself.
   */
  config_digest?: string | null;
  /**
   * The interval, in host seconds, at which this component says it heartbeats (ADR-0006). Optional: a component that does not declare one is judged against the receiver's default tolerance, which is a tolerance and not a list of components.
   */
  heartbeat_interval_seconds?: number;
  /**
   * How long, in host seconds, this heartbeat should be taken as evidence that its sender is alive. Declared by the sender because only the sender knows its own cadence; the receiver holds no table of expected intervals. Optional, as above.
   */
  liveness_window_seconds?: number;
  /** One line for a human. Never a substitute for status. */
  detail?: string;
}
