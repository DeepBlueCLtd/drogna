// DO NOT EDIT.
// Generated from contracts/schemas/offload-receipt.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The destination's statement of what it received: which destination it is, which bundle it holds, the digest it computed over the bytes that arrived, how many bytes those were, and the simulation instant of receipt. It is the only thing that can make a bundle eligible for eviction, and it is worth having only because the destination computes the digest itself — a receipt that echoed back the digest it was sent would prove that a request was sent and nothing else. Every field here is required: a receipt missing any of them does not verify, so eviction cannot follow from a partial answer.
 */
export interface DrognaOffloadReceipt {
  /**
   * Which destination is speaking. A receipt from a destination this component was not configured to send to is refused rather than believed.
   */
  destination_id: string;
  /**
   * Which bundle the destination is acknowledging. A receipt naming a bundle that was never sent is refused: an acknowledgement is not permission.
   */
  bundle_id: string;
  /**
   * The digest the destination computed over the bytes it received. Compared against a digest recomputed locally from the file on disk at verification time, never against the digest the transfer request declared.
   */
  digest: string;
  /**
   * How many bytes the destination received. Checked as well as the digest: a destination acknowledging a different length has not received what was sent, whatever it says it hashed.
   */
  byte_count: number;
  /**
   * Simulation instant of receipt, ISO-8601 UTC with microsecond precision. It may be earlier than the instant of the transfer under accelerated replay, which is a property of the clock and not a fault.
   */
  sim_time: string;
  /**
   * The tick index the destination had observed when it composed the receipt. Optional: the destination is a stub within the deployment and may hold no clock port of its own.
   */
  tick?: number;
  /** Bumped when the shape changes in a way a reader must notice. */
  schema_version?: number;
}
