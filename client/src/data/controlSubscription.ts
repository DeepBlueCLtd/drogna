/**
 * The control namespace, folded into the state the loop display draws from.
 *
 * A pure reducer, in the shape feature 003 established for liveness: messages in, state
 * out, and the caller decides when to draw. Every arrival is folded in whether or not a
 * frame was drawn for it, so a high clock rate costs frames and never truth.
 *
 * Two rules are structural here rather than asserted in a comment. Nothing enters this
 * state except through {@link receiveControl}, whose arguments are a topic and the bytes
 * that arrived — there is no parameter a configuration document, a component list or a
 * prepared state could come in through. And the reducer cannot reach the liveness state at
 * all, so nothing it does can light a component (Constitution VII, FR-003, FR-010).
 *
 * The distinction the loop view needs from this module is **stopped** against **idle**. A
 * page that has lost the broker and a page connected to a system with nothing to say look
 * identical if you only draw what arrived, and they mean opposite things: one is a broken
 * display, the other is a true report. So the connection state is carried here beside the
 * traffic, and the status is computed from both (FR-007).
 */
import { inspect } from "../inspector/validation";
import { coalesce, DEFAULT_COALESCING_THRESHOLD } from "../loop/coalesce";
import type { Coalesced } from "../loop/coalesce";
import { phaseFor, routeFor } from "../loop/transitRouting";
import type { CyclePhase } from "../loop/transitRouting";
import type { ConnectionState } from "../liveness/types";

import { emptyBuffers, record } from "./buffers";
import type { Buffers, Received } from "./buffers";
import { HEARTBEAT_TOPIC } from "./topics";

/** How the loop itself is shown. Stopped is not a quiet kind of turning. */
export type LoopStatus = "stopped-disconnected" | "idle-connected" | "turning";

export interface LoopState {
  readonly buffers: Buffers;
  /** Arrivals not yet drawn. Emptied by {@link drawFrame}. */
  readonly pending: readonly Received[];
  /** What the last drawn frame contained, including how much it coalesced. */
  readonly lastFrame: Coalesced;
  /** The most recent message on each boundary: what the inspector shows. */
  readonly lastByBoundary: ReadonlyMap<string, Received>;
  /** The phase the last valid run message made active, or null before any arrived. */
  readonly phase: CyclePhase | null;
  /** The run identifier the active phase belongs to. */
  readonly runId: string | null;
  /** The phases reached for {@link runId}, in the order they arrived. */
  readonly reached: readonly CyclePhase[];
  readonly messagesReceived: number;
  readonly heartbeatsReceived: number;
  readonly transitsDrawn: number;
  /** Run messages refused by their schema. Counted, because a silent refusal is a lie. */
  readonly refused: number;
  readonly lastRefusal: string | null;
  readonly coalescingThreshold: number;
}

const NO_FRAME: Coalesced = { transits: [], routable: 0, coalesced: 0, unrouted: 0 };

export function emptyLoop(
  bufferDepth?: number,
  coalescingThreshold: number = DEFAULT_COALESCING_THRESHOLD,
): LoopState {
  return {
    buffers: emptyBuffers(bufferDepth),
    pending: [],
    lastFrame: NO_FRAME,
    lastByBoundary: new Map(),
    phase: null,
    runId: null,
    reached: [],
    messagesReceived: 0,
    heartbeatsReceived: 0,
    transitsDrawn: 0,
    refused: 0,
    lastRefusal: null,
    coalescingThreshold,
  };
}

interface PhaseAdvance {
  readonly phase: CyclePhase | null;
  readonly runId: string | null;
  readonly reached: readonly CyclePhase[];
  readonly refused: number;
  readonly lastRefusal: string | null;
}

/**
 * Whether this arrival advances the cycle, and to where.
 *
 * Only a message that its schema accepts moves the phase. A refused message still drew a
 * transit — it genuinely crossed the boundary, and hiding it would be the worse error —
 * but it is not allowed to make a claim about where the loop has got to, because the
 * contract has just said it does not mean what it appears to mean.
 *
 * A run identifier that differs from the one in force starts the sequence again rather
 * than appending to it. AT-02 asserts one identifier across all four messages; a display
 * that quietly merged two runs' phases would hide exactly the failure that assertion is
 * there to catch.
 */
function advance(state: LoopState, topic: string, payload: string): PhaseAdvance {
  const phase = phaseFor(topic);
  const unchanged: PhaseAdvance = {
    phase: state.phase,
    runId: state.runId,
    reached: state.reached,
    refused: state.refused,
    lastRefusal: state.lastRefusal,
  };
  if (phase === null) {
    return unchanged;
  }
  const inspected = inspect(topic, payload);
  if (inspected.validation === "invalid") {
    return { ...unchanged, refused: state.refused + 1, lastRefusal: inspected.detail };
  }
  const runId = inspected.runId;
  const sameRun = runId !== null && runId === state.runId;
  const reached = sameRun && !state.reached.includes(phase) ? [...state.reached, phase] : [phase];
  return { phase, runId, reached, refused: state.refused, lastRefusal: state.lastRefusal };
}

/** Fold one received control message into the loop's state. The only way in. */
export function receiveControl(state: LoopState, topic: string, payload: string): LoopState {
  const buffers = record(state.buffers, topic, payload);
  const entry: Received = { topic, payload, sequence: buffers.sequence };

  if (topic === HEARTBEAT_TOPIC) {
    // Heartbeats light boxes, which is the shell's business and not the loop's. They are
    // counted here so the page can say how much of what it hears is cadence.
    return {
      ...state,
      buffers,
      messagesReceived: state.messagesReceived + 1,
      heartbeatsReceived: state.heartbeatsReceived + 1,
    };
  }

  const route = routeFor(topic);
  const lastByBoundary =
    route === null ? state.lastByBoundary : new Map(state.lastByBoundary).set(route.boundary, entry);

  return {
    ...state,
    buffers,
    pending: [...state.pending, entry],
    lastByBoundary,
    messagesReceived: state.messagesReceived + 1,
    ...advance(state, topic, payload),
  };
}

/**
 * Turn everything that has arrived since the last frame into transits to draw.
 *
 * Called by the render path. Returns the new state with `pending` emptied, so no arrival
 * is drawn twice and none is dropped: what was pending is either in `lastFrame` or folded
 * into one of its transits with the count to say so.
 */
export function drawFrame(state: LoopState): LoopState {
  if (state.pending.length === 0) {
    return state.lastFrame === NO_FRAME ? state : { ...state, lastFrame: NO_FRAME };
  }
  const frame = coalesce(state.pending, state.coalescingThreshold);
  return {
    ...state,
    pending: [],
    lastFrame: frame,
    transitsDrawn: state.transitsDrawn + frame.transits.length,
  };
}

/** How the loop is shown, from what has arrived and whether the page can still hear. */
export function loopStatus(state: LoopState, connection: ConnectionState): LoopStatus {
  if (connection === "not-connected") {
    return "stopped-disconnected";
  }
  return state.phase === null ? "idle-connected" : "turning";
}

/** The most recent message that crossed a boundary, or null if none has. */
export function messageOn(state: LoopState, boundary: string): Received | null {
  return state.lastByBoundary.get(boundary) ?? null;
}
