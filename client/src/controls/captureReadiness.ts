/**
 * The acknowledged rate, readable from outside the React tree.
 *
 * FR-53 has two halves. One is that a rate of zero pins the clock, which `rateState` holds.
 * The other is that something outside the page can tell the pin has taken effect, so a
 * capture waits for it rather than shooting and hoping. Without that, a before-and-after
 * pair differs wherever the simulation happened to be between the two shots, and the
 * difference under evidence is lost in the noise of a running system.
 *
 * Two surfaces, because a capture tool might reasonably use either. The state is written
 * onto the page's global scope under one stable name, and it is also rendered as data
 * attributes by `SpeedControl`. Both carry the same three facts: the rate the clock
 * reports in force, whether that rate is zero, and whether a request is still outstanding.
 *
 * What this is not: a way to set anything. Nothing reads back out of here into the client,
 * and a capture tool that wrote to it would change nothing. It reports, and that is all.
 * The capture path itself is feature 016's and none of it is built here.
 */
import { isPinned } from "./rateState";
import type { RateState } from "./rateState";

/** The name the readiness record is published under on the page's global scope. */
export const CAPTURE_READINESS_KEY = "drognaRate";

export interface CaptureReadiness {
  /** The rate the clock reports in force, or null before any sample has arrived. */
  readonly acknowledgedRate: number | null;
  /** True when the acknowledged rate is zero: simulated time stopped, deliberately. */
  readonly pinned: boolean;
  /** True while a requested rate has not yet been answered by a sample. */
  readonly awaitingAcknowledgement: boolean;
  /** True when the clock answered with a rate other than the one requested. */
  readonly adjusted: boolean;
  /**
   * True when the display is safe to capture: a rate is known, it is zero, and no request
   * is outstanding. A capture that waits for this waits for exactly the right thing.
   */
  readonly steady: boolean;
}

/** The readiness record for a rate state. Pure: the same state gives the same record. */
export function captureReadiness(state: RateState): CaptureReadiness {
  const pinned = isPinned(state);
  return {
    acknowledgedRate: state.acknowledged,
    pinned,
    awaitingAcknowledgement: state.awaitingAcknowledgement,
    adjusted: state.adjusted,
    steady: pinned && !state.awaitingAcknowledgement,
  };
}

/** Where the record is written. Narrowed to what this module uses, so a test can pass one. */
export type ReadinessHost = Record<string, unknown>;

/** Write the readiness record where a capture tool can read it. */
export function exposeCaptureReadiness(
  state: RateState,
  host: ReadinessHost = globalThis as unknown as ReadinessHost,
): CaptureReadiness {
  const readiness = captureReadiness(state);
  host[CAPTURE_READINESS_KEY] = readiness;
  return readiness;
}

/** The record a capture tool would read, or null if the page has not written one yet. */
export function readCaptureReadiness(
  host: ReadinessHost = globalThis as unknown as ReadinessHost,
): CaptureReadiness | null {
  const value = host[CAPTURE_READINESS_KEY];
  return value === undefined ? null : (value as CaptureReadiness);
}
