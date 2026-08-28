/**
 * The panel's state, and the honesty it owes about its own picture (022 FR-007).
 *
 * Four conditions under which what the panel shows is not what the system is, each a
 * distinct derivation and each stated in words rather than left to be inferred from
 * stillness: no validated configuration (the surface disables and says why, the shape
 * the shell's other surfaces already use), a severed feed (never presented as a quiet
 * system), a paused clock (stillness attributed to the clock, not the streams), and a
 * cold start (a refreshed page is a fresh listener that holds no history, not a system
 * that stopped — 022 FR-008).
 *
 * Everything here is pure: state and an instant in, words and flags out. The one clock
 * a stated figure reads is the simulation clock's sample; host instants decide only
 * what ADR-0006 lets them decide — how recently something really arrived.
 */
import type { ConnectionState } from "../liveness/types";
import type { ClockState } from "../transport/clock";

import type { ActivityState } from "./activity";
import type { Tier } from "./skeleton";

/** Everything the panel folds between frames. */
export interface PanelState {
  readonly connection: ConnectionState;
  readonly clock: ClockState;
  readonly activity: ActivityState;
  /** Heard topics the artefact does not row, each with its tier. */
  readonly grafts: ReadonlyMap<string, Tier>;
  /** Host instant the panel began listening, or null before the transport opened. */
  readonly listeningSince: number | null;
}

/** What the panel says about its own picture this frame. */
export interface Honesty {
  /** The surface is disabled, with the reason — no validated configuration. */
  readonly disabled: string | null;
  /** The feed is severed, and silence below says nothing about the system. */
  readonly disconnected: string | null;
  /** The clock reports no advance; stillness is the clock's, not the streams'. */
  readonly paused: string | null;
  /** Always present: what this session's picture is and is not. */
  readonly session: string;
}

export function describeHonesty(
  state: PanelState,
  configured: boolean,
  configurationFailure: string | null,
): Honesty {
  const disabled = configured
    ? null
    : "The topic tree is disabled: no validated configuration document, so no broker " +
      "route is known." +
      (configurationFailure === null ? "" : ` (${configurationFailure})`);
  const disconnected =
    configured && state.connection === "not-connected"
      ? "Not connected to the broker. The feed is severed: silence below says nothing " +
        "about the system."
      : null;
  const sample = state.clock.sample;
  const paused =
    sample !== null && (sample.rate === 0 || sample.mode === "paused")
      ? "The clock reports a rate of zero: simulation time is not advancing. Streams " +
        "paced by it are still, not stopped; in-flight decays complete in real time."
      : null;
  const session =
    state.listeningSince === null
      ? "The tree is cold: nothing has been heard yet."
      : "This tree shows only what this page has heard since it was opened. " +
        "Nothing is persisted and no history is claimed; a cold topic after a refresh " +
        "is a young listener, not a stopped system.";
  return { disabled, disconnected, paused, session };
}
