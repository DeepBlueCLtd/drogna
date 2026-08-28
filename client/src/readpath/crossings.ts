/**
 * The read path's crossings: what this browser genuinely asked, and what came back.
 *
 * One read produces **one crossing**, presented on all three edges of the read path. The
 * browser witnesses exactly one hop — the proxy answering it — so the crossing records
 * what was witnessed, and the two server-side edges present the same crossing through an
 * inference stated in words (`edges.ts` holds the wording). Recording three diverging
 * accounts of hops the browser never saw would be inventing traffic, which is the one
 * thing Constitution VII forbids outright.
 *
 * A pure reducer in the shape `data/buffers.ts` established: crossings in, state out, the
 * caller decides when to draw. The only way in is {@link recordCrossing}, whose argument
 * is the record of a request that was actually issued — there is no parameter a prepared
 * history, a configuration document or a component list could arrive through, and nothing
 * here can light a component or draw a transit.
 *
 * The history is bounded the way the topic buffers are bounded: a configured depth,
 * oldest evicted first, evictions counted, and the bound stated on the display rather
 * than left to be discovered (FR-009). A read that fails is recorded like any other,
 * marked failed, carrying the refusal or error the client actually received — a failure
 * is a crossing too, and suppressing it would be the display lying by omission.
 */

/** The kinds of read this client makes. There are two, and the re-ask reuses them. */
export type ReadKind = "trajectory" | "field";

/** What each kind is, in words the display shows beside a crossing. */
export const READ_KIND_WORDS: Readonly<Record<ReadKind, string>> = {
  trajectory:
    "a trajectory query: the conditions along the recommended route, each vertex at its own arrival time",
  field: "a cube query: one run's uncertainty field, at the extent the announcement stated",
};

/** How a read ended, as witnessed at the browser-facing edge. */
export type CrossingOutcome = "answered" | "refused" | "failed";

/** One read recorded against the read path. Everything shown about it comes from here. */
export interface Crossing {
  readonly kind: ReadKind;
  /** Arrival order across every crossing, assigned by the state. Ordering, not timing. */
  readonly sequence: number;
  /** The request line the client composed, method and URL. */
  readonly requestLine: string;
  readonly outcome: CrossingOutcome;
  /** The HTTP status the proxy answered, or null where the request did not complete. */
  readonly status: number | null;
  /** The content type the response declared, or null where none was declared. */
  readonly declaredType: string | null;
  /** Size of the response body in bytes, or null where no response arrived. */
  readonly bodyBytes: number | null;
  /** The simulation time the response carried, or null where none was recognised. */
  readonly simTime: string | null;
  /** A bounded excerpt of the response body, or null where no body arrived. */
  readonly excerpt: string | null;
  /** How many bytes the excerpt dropped. Zero means the excerpt is the whole body. */
  readonly excerptDroppedBytes: number;
  /** The error or refusal the client actually received, or null where there was none. */
  readonly failure: string | null;
}

/** A crossing as delivered by the observer, before the state assigns its sequence. */
export type ObservedCrossing = Omit<Crossing, "sequence">;

export interface ReadPathState {
  /** How many crossings are retained. The display states this bound (FR-009). */
  readonly depth: number;
  /** Oldest first. Never longer than {@link depth}. */
  readonly crossings: readonly Crossing[];
  /** How many crossings have been evicted since the page loaded. */
  readonly evicted: number;
  /** How many reads have been recorded since the page loaded, evicted or not. */
  readonly recorded: number;
  readonly sequence: number;
  /** The kind of read the re-ask control has in flight, or null. Disables the control. */
  readonly askInFlight: ReadKind | null;
  /** Host instant of the last re-ask press, for the minimum interval. Null before any. */
  readonly lastAskedAt: number | null;
}

/**
 * How many crossings are retained when the configuration document says nothing.
 *
 * The same figure, for the same reason, as the topic buffers' default: a display bound
 * that decides how far back a viewer can read and can claim nothing about anything.
 */
export const DEFAULT_CROSSING_DEPTH = 64;

/**
 * The least host time between two re-ask presses, in milliseconds, stated on the control.
 *
 * A politeness bound on a user gesture, measured on the same injected host instant the
 * frame throttle already uses. It schedules nothing: the control's disabled state is
 * recomputed each frame from this constant and the instant of the last press.
 */
export const RE_ASK_MINIMUM_INTERVAL_MS = 10_000;

export function emptyReadPath(depth: number = DEFAULT_CROSSING_DEPTH): ReadPathState {
  return {
    depth: Math.max(1, Math.floor(depth)),
    crossings: [],
    evicted: 0,
    recorded: 0,
    sequence: 0,
    askInFlight: null,
    lastAskedAt: null,
  };
}

/** Fold one observed crossing into the history, evicting the oldest if it is full. */
export function recordCrossing(state: ReadPathState, observed: ObservedCrossing): ReadPathState {
  const sequence = state.sequence + 1;
  const appended = [...state.crossings, { ...observed, sequence }];
  const overflow = Math.max(0, appended.length - state.depth);
  return {
    ...state,
    crossings: overflow === 0 ? appended : appended.slice(overflow),
    evicted: state.evicted + overflow,
    recorded: state.recorded + 1,
    sequence,
  };
}

/** The most recent crossing, or null if no read has happened since the page loaded. */
export function latestCrossing(state: ReadPathState): Crossing | null {
  return state.crossings[state.crossings.length - 1] ?? null;
}

/** Mark a re-ask as pressed and in flight, at the given host instant. */
export function beginReAsk(state: ReadPathState, kind: ReadKind, instant: number): ReadPathState {
  return { ...state, askInFlight: kind, lastAskedAt: instant };
}

/** The re-ask's request completed, however it ended. The crossing records how. */
export function reAskSettled(state: ReadPathState): ReadPathState {
  return state.askInFlight === null ? state : { ...state, askInFlight: null };
}

/** Whether the re-ask control may act now, and if not, the reason it is disabled. */
export type ReAskGate = { readonly allowed: true } | { readonly allowed: false; readonly because: string };

/**
 * The two bounds the spec puts on the control, applied in words (FR-010).
 *
 * In flight beats the interval: a control that queued presses would turn one gesture into
 * several requests, so it is disabled until the crossing completes and no queue builds.
 */
export function reAskGate(
  state: ReadPathState,
  instant: number,
  minimumIntervalMs: number = RE_ASK_MINIMUM_INTERVAL_MS,
): ReAskGate {
  if (state.askInFlight !== null) {
    return { allowed: false, because: "a re-asked read is in flight; its crossing completes before another can be asked" };
  }
  if (state.lastAskedAt !== null && instant - state.lastAskedAt < minimumIntervalMs) {
    return {
      allowed: false,
      because: `at most one re-ask per ${Math.round(minimumIntervalMs / 1000)} seconds; the last was pressed too recently`,
    };
  }
  return { allowed: true };
}
