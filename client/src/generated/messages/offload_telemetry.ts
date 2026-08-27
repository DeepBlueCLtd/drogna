// DO NOT EDIT.
// Generated from contracts/schemas/offload-telemetry.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * What the offload packager (C-17) reports about itself on ctl/telemetry: how many bundles sit in each ledger state, how many verifications have been refused and why the most recent one was, and how full the staging area is against the bound the retention policy holds it to. The counts are the state machine's own tally rather than a second one kept beside it, so a state that stops moving is visible here without anyone reading a ledger file. Verification failures are carried as a count and a reason because a count alone says something is wrong and a reason says which of the six ways it is wrong. This document describes one component's report; a general telemetry envelope, if the telemetry feature decides it wants one, is that feature's to define and this shape is what it will find in use.
 */
export interface DrognaOffloadTelemetry {
  /** The component reporting, matching config /component/id. */
  component: string;
  /** The scenario run this report belongs to, as carried on every clock sample. */
  scenario_run_id: string;
  /**
   * Simulation time at which the report was composed, ISO-8601 UTC with microsecond precision. Every interval in this component except the heartbeat is measured in simulation time; the heartbeat is real time by ADR-0006.
   */
  sim_time: string;
  /** The tick index the packager had observed when it composed the report. */
  tick: number;
  /**
   * One count per state the ledger admits. The states move forward only, so a run's bundles migrate rightwards through these counts and a bundle that stops moving is a bundle whose side effect did not complete.
   */
  bundles: {
    /** Written to the staging area and not yet transferred. */
    staged: number;
    /** Sent and revealed at the destination, awaiting a receipt that verifies. */
    transferred: number;
    /**
     * A receipt has matched a digest recomputed from the file on disk. Eligible for eviction, which is not the same as due for it.
     */
    verified: number;
    /**
     * The retention policy has asked for this bundle's space and the delete has not been confirmed. A bundle sitting here across a restart is re-verified, never deleted on the strength of the record.
     */
    evictable: number;
    /**
     * Deleted locally, after a digest recomputed immediately before the delete matched the verified one.
     */
    evicted: number;
    /**
     * A step did not complete. The local bytes are present in every case: no failure path deletes anything.
     */
    failed: number;
  };
  /**
   * Refusals are reported rather than swallowed (FR-016). A refusal never changes a local file, so this count rising is a statement about the destination and not about the staging area.
   */
  verification: {
    /** Receipts refused this run, across every reason. */
    refused: number;
    /** Receipts accepted this run. */
    verified: number;
    /**
     * Why the most recent refusal was refused, in the words the verifier used. Absent when nothing has been refused.
     */
    last_refusal?: string;
  };
  /**
   * Bytes held against the bytes the retention policy permits. At or over the bound with nothing eligible for eviction, the packager stops producing bundles and says so here rather than making room.
   */
  staging: {
    /** What the staging area holds now, partial files included. */
    bytes: number;
    /** The configured bound the retention policy holds it to. */
    bound_bytes: number;
    /** True when the staging area is at or over its bound. */
    at_bound: boolean;
    /**
     * Whether the packager is still writing new bundles. False when the staging area is at its bound and nothing is eligible for eviction: eviction stays gated on a receipt, so the correct behaviour is to stop producing and report.
     */
    producing: boolean;
  };
}
