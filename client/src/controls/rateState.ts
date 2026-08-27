/**
 * The simulation rate: what was asked for, and what is actually in force.
 *
 * Those are two different things and the display shows the second (FR-012). A rate control
 * that showed the rate it had requested would report success it has no evidence for, and
 * would do it most convincingly in exactly the case where the clock refused or clamped the
 * request. So a request is recorded as a request, and the rate in force comes from the
 * clock's own samples on `ctl/clock` and from nowhere else.
 *
 * A request is resolved by a sample carrying a later tick than the one in force when the
 * request was made. Ticks are quantised and strictly increasing within a run (ADR-0009),
 * so this needs no clock of any kind, host or simulated, to decide which sample answers
 * which request.
 *
 * **Zero is a rate.** It is not an error, not a disconnection and not the absence of a
 * clock. Setting it stops simulated time and stops nothing else: heartbeats keep arriving,
 * liveness windows are real time (ADR-0006), and every component that was lit stays lit.
 * That is what makes a capture at rate zero worth taking (FR-53, SC-015).
 */
import type { ClockSample } from "../transport/clock";

export interface RateState {
  /** The rate the viewer asked for, or null if nothing has been asked. */
  readonly requested: number | null;
  /** The tick in force when the request went out, so a later sample can answer it. */
  readonly requestedAtTick: number | null;
  /** The rate the clock reports in force, or null before any sample has arrived. */
  readonly acknowledged: number | null;
  /** The mode the clock reports, as it spelt it. */
  readonly mode: string | null;
  /** A request that has gone out and has not yet been answered by a sample. */
  readonly awaitingAcknowledgement: boolean;
  /** The clock answered with a rate other than the one asked for. */
  readonly adjusted: boolean;
  /** Why a request could not be sent at all, where one could not. */
  readonly failure: string | null;
}

export const emptyRate: RateState = {
  requested: null,
  requestedAtTick: null,
  acknowledged: null,
  mode: null,
  awaitingAcknowledgement: false,
  adjusted: false,
  failure: null,
};

/**
 * The rates the control offers.
 *
 * Zero first, because it is the one a capture needs and the one an interface is most
 * likely to treat as an absence. These are display choices, not a claim about what the
 * clock will accept: a clamped request is shown as clamped rather than prevented, so that
 * what the clock does with a rate is visible instead of being guessed at here.
 */
export const OFFERED_RATES: readonly number[] = [0, 1, 5, 10, 60];

/** Record that a rate has been asked for. Records the asking; changes nothing in force. */
export function requestRate(state: RateState, rate: number, currentTick: number | null): RateState {
  return {
    ...state,
    requested: rate,
    requestedAtTick: currentTick,
    awaitingAcknowledgement: true,
    adjusted: false,
    failure: null,
  };
}

/** Record that the request could not be sent. The rate in force is untouched. */
export function requestFailed(state: RateState, reason: string): RateState {
  return { ...state, awaitingAcknowledgement: false, failure: reason };
}

/**
 * Fold in what the clock reports.
 *
 * This is the only thing that moves `acknowledged`. A sample that predates the request
 * cannot answer it, so a request stays outstanding until the clock has had a tick in which
 * to respond.
 */
export function acknowledgeRate(state: RateState, sample: ClockSample): RateState {
  const answers =
    state.awaitingAcknowledgement &&
    (state.requestedAtTick === null || sample.tick > state.requestedAtTick);
  if (!answers) {
    return { ...state, acknowledged: sample.rate, mode: sample.mode };
  }
  return {
    ...state,
    acknowledged: sample.rate,
    mode: sample.mode,
    awaitingAcknowledgement: false,
    adjusted: state.requested !== null && state.requested !== sample.rate,
  };
}

/** Whether the clock reports a rate of zero in force: simulated time stopped, on purpose. */
export function isPinned(state: RateState): boolean {
  return state.acknowledged === 0;
}

/**
 * What the display says about the rate, in words rather than by a number alone.
 *
 * Four sentences for four states, and the one that earns its place is the third. "Asked
 * for 60, the clock reports 10 in force" is the whole of FR-012: it neither hides the
 * request nor lets it stand in for the answer.
 */
export function rateWords(state: RateState): string {
  if (state.failure !== null) {
    return `The rate could not be changed: ${state.failure} The rate in force is unaffected.`;
  }
  if (state.acknowledged === null) {
    return "No time sample has arrived, so no rate is known to be in force.";
  }
  if (state.awaitingAcknowledgement) {
    return `Asked for ${state.requested}. The clock still reports ${state.acknowledged} in force; the display will change when the clock does.`;
  }
  if (state.adjusted) {
    return `Asked for ${state.requested}. The clock reports ${state.acknowledged} in force, so the request was adjusted.`;
  }
  if (state.acknowledged === 0) {
    return "Paused: the clock reports a rate of zero in force. Simulated time has stopped; the components have not, and every one that was lit is still lit.";
  }
  return `Running at ${state.acknowledged} times simulated to real. The clock reports this in force.`;
}
