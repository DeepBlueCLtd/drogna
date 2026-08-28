/**
 * Activity: the single model from which pulse, ripple, heat and flow all read.
 *
 * Arrivals fold in as they come (a burst costs frames, never truth); everything drawn is
 * a pure function of this state and an instant, computed at view time and never stored.
 * Two clocks live here and they are kept strictly apart (022 FR-003):
 *
 * - **Stated figures** — last-seen, rate — are simulation time. Each arrival is stamped
 *   with the payload's own `sim_time` where its JSON carries one (which is what keeps a
 *   retained message honest: its time, not connection time), else the latest received
 *   clock sample's time, else nothing — and "nothing" is stated, never invented
 *   (Constitution VII applied to a display).
 * - **Display dynamics** — decay, ripple, the crossover — are wall time, through the
 *   host instants stamped at receipt. That is the boundary the two existing exemptions
 *   already draw (ADR-0006's receipt windows, ADR-0007's render-path smoothing), and no
 *   value derived from an instant leaves the render path or becomes a figure.
 *
 * Nothing is persisted and nothing replayed: this state is one session's hearing and
 * claims no more (022 FR-008).
 */
import { topicMatches } from "./match";

/** One message's landing, as folded into the model. */
export interface Arrival {
  readonly topic: string;
  /** The payload, held opaque for the detail view. Never interpreted here. */
  readonly payload: string;
  /** Host instant of receipt. Display clock only. */
  readonly receivedAt: number;
  /** Simulation-time stamp, or null before the clock was ever heard. */
  readonly simTime: string | null;
}

/** What one topic has said this session. */
export interface TopicActivity {
  /** Recent arrivals, oldest first, bounded to RING_DEPTH. */
  readonly recent: readonly { readonly receivedAt: number; readonly simTime: string | null }[];
  readonly count: number;
  readonly last: Arrival;
}

export type ActivityState = ReadonlyMap<string, TopicActivity>;

export const emptyActivity: ActivityState = new Map();

/** How many arrivals each topic's window keeps. Rates read over this ring. */
export const RING_DEPTH = 32;

/**
 * How long one pulse takes to decay to nothing, in wall milliseconds. A display tuning,
 * and also the derivation base of the crossover below: events read individually exactly
 * while they arrive slower than they fade.
 */
export const PULSE_DECAY_MS = 1500;

/**
 * The one field the model reads out of a payload: a `sim_time` the governing contracts
 * put there. Anything else about the payload stays opaque, and a payload that is not
 * JSON, or carries none, yields null rather than a guess.
 */
export function simTimeOfPayload(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const stamp = (parsed as Record<string, unknown>)["sim_time"];
      if (typeof stamp === "string") {
        return stamp;
      }
    }
  } catch {
    // Opaque content. The detail view says so; the model invents nothing.
  }
  return null;
}

/**
 * The stated stamp for one arrival: the payload's own simulation time where it carries
 * one — which is what keeps a retained message honest, its time and never the
 * connection's — else the latest received clock sample's, else nothing. Nothing is the
 * honest answer before the clock was ever heard, and the display states it as such.
 */
export function stampFor(payload: string, clockSimTime: string | null): string | null {
  return simTimeOfPayload(payload) ?? clockSimTime;
}

/** Fold one arrival into the state. The only way a topic gains activity. */
export function recordArrival(state: ActivityState, arrival: Arrival): ActivityState {
  const next = new Map(state);
  const known = next.get(arrival.topic);
  const stamp = { receivedAt: arrival.receivedAt, simTime: arrival.simTime };
  next.set(arrival.topic, {
    recent: [...(known?.recent ?? []), stamp].slice(-RING_DEPTH),
    count: (known?.count ?? 0) + 1,
    last: arrival,
  });
  return next;
}

/**
 * Where one topic's pulse stands: 1 at arrival, falling to 0 over the decay, 0 where
 * nothing has ever arrived. Wall time, render path only.
 */
export function decayPhase(activity: TopicActivity | undefined, now: number): number {
  if (activity === undefined) {
    return 0;
  }
  const elapsed = now - activity.last.receivedAt;
  if (elapsed <= 0) {
    return 1;
  }
  return Math.max(0, 1 - elapsed / PULSE_DECAY_MS);
}

/**
 * A branch's activity is what a wildcard subscription under it would have seen: the
 * aggregate of its descendants'. This is the ripple — every ancestor of a pulsing leaf
 * shows it — and it is also what a collapsed subtree's summary node carries.
 */
export function aggregate(
  state: ActivityState,
  path: string,
): { readonly lastReceivedAt: number | null; readonly count: number } {
  const prefix = path === "" ? "" : `${path}/`;
  let lastReceivedAt: number | null = null;
  let count = 0;
  for (const [topic, activity] of state) {
    if (topic !== path && !topic.startsWith(prefix)) {
      continue;
    }
    count += activity.count;
    if (lastReceivedAt === null || activity.last.receivedAt > lastReceivedAt) {
      lastReceivedAt = activity.last.receivedAt;
    }
  }
  return { lastReceivedAt, count };
}

/** The ripple's phase for a branch, from the aggregate. Wall time, render path only. */
export function ripplePhase(state: ActivityState, path: string, now: number): number {
  const { lastReceivedAt } = aggregate(state, path);
  if (lastReceivedAt === null) {
    return 0;
  }
  const elapsed = now - lastReceivedAt;
  return elapsed <= 0 ? 1 : Math.max(0, 1 - elapsed / PULSE_DECAY_MS);
}

/**
 * The mean interval between recent arrivals, in wall milliseconds, over the ring —
 * or null with fewer than two arrivals, when no interval exists to measure.
 */
export function meanInterArrivalMs(activity: TopicActivity | undefined): number | null {
  if (activity === undefined || activity.recent.length < 2) {
    return null;
  }
  const first = activity.recent[0];
  const last = activity.recent[activity.recent.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  return (last.receivedAt - first.receivedAt) / (activity.recent.length - 1);
}

/**
 * The rate-adaptive reading (022 FR-003): discrete pulses while arrivals are slower
 * than the pulse's own decay, sustained intensity once they would blur — a new pulse
 * landing before the last has faded. The bound is derived from the display's own decay
 * duration and the model's own measured interval; there is no tuned constant and no
 * user-selected mode, and the tests assert the relationship, not a number.
 */
export function reading(activity: TopicActivity | undefined): "pulse" | "sustained" {
  const interval = meanInterArrivalMs(activity);
  return interval !== null && interval <= PULSE_DECAY_MS ? "sustained" : "pulse";
}

/**
 * Sustained intensity for a node, 0..1: how full the recent window is relative to the
 * pulse-blur rate. At the crossover boundary it is ~1 pulse per decay; it saturates as
 * rate rises. Wall time, render path only.
 */
export function intensity(activity: TopicActivity | undefined, now: number): number {
  const interval = meanInterArrivalMs(activity);
  if (activity === undefined || interval === null || interval <= 0) {
    return decayPhase(activity, now);
  }
  if (interval > PULSE_DECAY_MS) {
    return decayPhase(activity, now);
  }
  // A stream that has gone quiet cools visibly whatever its history said.
  const sinceLast = now - activity.last.receivedAt;
  const cooling = Math.max(0, 1 - sinceLast / (2 * PULSE_DECAY_MS));
  return Math.min(1, PULSE_DECAY_MS / interval / 4 + 0.5) * cooling;
}

/**
 * How freshly anything covered by a declared filter has arrived: the phase of a role's
 * connection. A role whose filters match nothing that arrived stays at 0 — nothing
 * about it changes (022 US1 acceptance 3). Wall time, render path only.
 */
export function filterPhase(state: ActivityState, filter: string, now: number): number {
  let last: number | null = null;
  for (const [topic, activity] of state) {
    if (!topicMatches(filter, topic)) {
      continue;
    }
    if (last === null || activity.last.receivedAt > last) {
      last = activity.last.receivedAt;
    }
  }
  if (last === null) {
    return 0;
  }
  const elapsed = now - last;
  return elapsed <= 0 ? 1 : Math.max(0, 1 - elapsed / PULSE_DECAY_MS);
}

/**
 * The steady mark a spoken topic holds while the display is pinned. Distinct from cold
 * (zero) and from a live pulse's peak, so a pinned page still shows what has spoken.
 */
export const PINNED_GLOW = 0.35;

/**
 * Glow while the simulation is not advancing — a paused clock, or no clock heard yet.
 *
 * The capture rule is system-wide and this panel is not exempt from it: two captures of
 * a pinned state must be identical (012 FR-53, SC-009; the pair mechanism's whole
 * evidential value), and heartbeats keep arriving in real time at a rate of zero by
 * design (ADR-0006). So while pinned, a decay already in flight completes in wall time
 * down to the steady floor — the spec's own paused scenario — and an arrival *during*
 * the pin is counted, kept and shown as the steady mark rather than a fresh pulse.
 * Truth is untouched: the model folds every arrival; only the animation is keyed to
 * whether the simulation says it is advancing, and the panel states the pin in words.
 */
export function pinnedPhase(
  lastReceivedAt: number | null,
  count: number,
  now: number,
  pinnedSince: number,
): number {
  if (count === 0 || lastReceivedAt === null) {
    return 0;
  }
  if (lastReceivedAt < pinnedSince) {
    const elapsed = now - lastReceivedAt;
    const decay = elapsed <= 0 ? 1 : Math.max(0, 1 - elapsed / PULSE_DECAY_MS);
    return Math.max(decay, PINNED_GLOW);
  }
  return PINNED_GLOW;
}

/**
 * A node's drawn glow: the live pulse-or-sustained reading while the simulation
 * advances, the steady pinned phase while it does not. `pinnedSince` is the host
 * instant the display was pinned at, or null while animation is live.
 */
export function nodeGlow(
  activity: TopicActivity | undefined,
  now: number,
  pinnedSince: number | null,
): number {
  if (activity === undefined) {
    return 0;
  }
  if (pinnedSince !== null) {
    return pinnedPhase(activity.last.receivedAt, activity.count, now, pinnedSince);
  }
  return reading(activity) === "sustained" ? intensity(activity, now) : decayPhase(activity, now);
}

/** A branch's drawn glow: the aggregate's, under the same live-or-pinned rule. */
export function branchGlow(
  state: ActivityState,
  path: string,
  now: number,
  pinnedSince: number | null,
): number {
  if (pinnedSince !== null) {
    const { lastReceivedAt, count } = aggregate(state, path);
    return pinnedPhase(lastReceivedAt, count, now, pinnedSince);
  }
  return ripplePhase(state, path, now);
}

/** A role connection's drawn glow, under the same rule. */
export function connectionGlow(
  state: ActivityState,
  filter: string,
  now: number,
  pinnedSince: number | null,
): number {
  if (pinnedSince === null) {
    return filterPhase(state, filter, now);
  }
  let lastReceivedAt: number | null = null;
  let count = 0;
  for (const [topic, activity] of state) {
    if (!topicMatches(filter, topic)) {
      continue;
    }
    count += activity.count;
    if (lastReceivedAt === null || activity.last.receivedAt > lastReceivedAt) {
      lastReceivedAt = activity.last.receivedAt;
    }
  }
  return pinnedPhase(lastReceivedAt, count, now, pinnedSince);
}

const MILLISECONDS = 1000;

/**
 * The stated rate: arrivals per simulation second, measured over the ring's
 * simulation-time span. Null where fewer than two sim-stamped arrivals exist, or where
 * the span is zero — a paused clock accumulates arrivals at one instant, and a rate
 * over no elapsed time is stated as unavailable rather than invented (022 SC-004).
 */
export function simRatePerSecond(activity: TopicActivity | undefined): number | null {
  if (activity === undefined) {
    return null;
  }
  const stamped = activity.recent.filter((entry) => entry.simTime !== null);
  if (stamped.length < 2) {
    return null;
  }
  const first = stamped[0];
  const last = stamped[stamped.length - 1];
  if (first?.simTime == null || last?.simTime == null) {
    return null;
  }
  const spanMs = Date.parse(last.simTime) - Date.parse(first.simTime);
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return null;
  }
  return (stamped.length - 1) / (spanMs / MILLISECONDS);
}
