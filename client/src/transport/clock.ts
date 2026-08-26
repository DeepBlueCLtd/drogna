/**
 * Simulation time, as received.
 *
 * Time arrives on `ctl/clock` by subscription (ADR-0009). There is one transport for
 * control traffic and this is a consumer of it, not a second one: the client holds the
 * clock's samples exactly as they arrive and never interpolates between them. What the
 * page shows is the last sample the clock actually reached, so the display cannot claim
 * a simulation time the clock has not (ADR-0007's render-path exemption is not taken
 * here; this feature draws no animation that would need it).
 *
 * The distinction the display exists to make: **paused** is a state the clock reports —
 * a rate of zero, which FR-53 pins for capture and which is entirely legitimate — and
 * **stale** is the absence of any state. They look alike to a casual glance and mean
 * opposite things, so they are computed separately here and rendered differently.
 */
import { rejectionReason, validateClockSample } from "../contracts/schemas";
import type { Illumination } from "../liveness/types";
import { ageSeconds } from "../liveness/window";

/** One time sample, as the clock published it. */
export interface ClockSample {
  readonly runId: string;
  readonly tick: number;
  readonly simTime: string;
  readonly mode: string;
  readonly rate: number;
  readonly receivedAt: number;
}

export interface ClockState {
  readonly sample: ClockSample | null;
  readonly discarded: number;
  readonly lastDiscardReason: string | null;
}

export const emptyClock: ClockState = { sample: null, discarded: 0, lastDiscardReason: null };

/** Fold one raw sample into the clock state, refusing anything off-contract. */
export function receiveClockSample(
  state: ClockState,
  raw: unknown,
  receivedAt: number,
): ClockState {
  if (!validateClockSample(raw)) {
    return {
      ...state,
      discarded: state.discarded + 1,
      lastDiscardReason: rejectionReason(validateClockSample),
    };
  }
  const message = raw as Record<string, unknown>;
  const sample: ClockSample = {
    runId: message["run_id"] as string,
    tick: message["tick"] as number,
    simTime: message["sim_time"] as string,
    mode: message["mode"] as string,
    rate: message["rate"] as number,
    receivedAt,
  };
  // A sample that arrives out of order is not allowed to wind the display back.
  if (state.sample !== null && sample.tick < state.sample.tick) {
    return state;
  }
  return { ...state, sample };
}

/** What the page says about the clock. Four states, deliberately not two. */
export type ClockDisplay = "unheard" | "running" | "paused" | "stale";

export interface ClockView {
  readonly display: ClockDisplay;
  readonly sample: ClockSample | null;
  readonly sinceSampleSeconds: number | null;
  readonly discarded: number;
  readonly lastDiscardReason: string | null;
}

/**
 * Decide how the clock is shown.
 *
 * The clock's own liveness comes from its heartbeat, by the same path as every other
 * component's, and it is what separates paused from stale: a rate of zero reported by a
 * clock that is still heartbeating is paused, while the same last sample from a clock
 * that has gone quiet is the absence of a clock, whatever its final sample said.
 */
export function describeClock(
  state: ClockState,
  now: number,
  staleAfterSeconds: number,
  clockLiveness: Illumination,
): ClockView {
  const since = state.sample === null ? null : ageSeconds(state.sample.receivedAt, now);
  const base = {
    sample: state.sample,
    sinceSampleSeconds: since,
    discarded: state.discarded,
    lastDiscardReason: state.lastDiscardReason,
  };
  if (state.sample === null) {
    return { ...base, display: "unheard" };
  }
  if (clockLiveness !== "lit") {
    return { ...base, display: "stale" };
  }
  if (state.sample.rate === 0 || state.sample.mode === "paused") {
    // Emission stops at a rate of zero, so the age of the last sample says nothing.
    return { ...base, display: "paused" };
  }
  if (since !== null && since > staleAfterSeconds) {
    return { ...base, display: "stale" };
  }
  return { ...base, display: "running" };
}
