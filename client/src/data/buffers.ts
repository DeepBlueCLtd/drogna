/**
 * Bounded per-topic message buffers.
 *
 * A demonstration runs for an hour and the control namespace never stops talking, so a
 * buffer that grows with the session is a memory leak with a schedule. Each topic keeps at
 * most a configured depth and evicts the oldest first, which is the only eviction policy
 * that leaves the most recent message — the one the inspector shows — always present
 * (FR-006).
 *
 * The bound is per topic rather than global on purpose. A global bound would let a chatty
 * topic evict a quiet one, and the quiet topics here are the interesting ones: a single
 * `ctl/divergence` an hour is the message a viewer most wants to still be able to read.
 *
 * Nothing in this module can light a component. It holds what arrived, in arrival order,
 * and hands it back.
 */

/** One message as it arrived, before anything has decided what it means. */
export interface Received {
  readonly topic: string;
  /** The payload exactly as it came off the wire. */
  readonly payload: string;
  /**
   * Sequence number in arrival order across every topic, assigned by the buffer store.
   *
   * Ordering, not timing. It is what lets the display say which of two messages crossed
   * first without any clock being involved, host or simulated.
   */
  readonly sequence: number;
}

export interface TopicBuffer {
  readonly topic: string;
  /** Oldest first. Never longer than the configured depth. */
  readonly entries: readonly Received[];
  /** How many have been evicted from this topic since the page loaded. */
  readonly evicted: number;
  /** How many have arrived on this topic since the page loaded. */
  readonly received: number;
}

export interface Buffers {
  readonly depth: number;
  readonly byTopic: ReadonlyMap<string, TopicBuffer>;
  readonly sequence: number;
}

/**
 * How many messages a topic keeps when the configuration document says nothing.
 *
 * A display bound, not a location and not a claim about anything: it decides how far back
 * a viewer can read, and it can neither light a component nor draw a transit.
 */
export const DEFAULT_BUFFER_DEPTH = 64;

export function emptyBuffers(depth: number = DEFAULT_BUFFER_DEPTH): Buffers {
  return { depth: Math.max(1, Math.floor(depth)), byTopic: new Map(), sequence: 0 };
}

/** Fold one arrival into the buffers, evicting the oldest on that topic if it is full. */
export function record(buffers: Buffers, topic: string, payload: string): Buffers {
  const sequence = buffers.sequence + 1;
  const existing = buffers.byTopic.get(topic);
  const entry: Received = { topic, payload, sequence };
  const appended = existing === undefined ? [entry] : [...existing.entries, entry];
  const overflow = Math.max(0, appended.length - buffers.depth);
  const byTopic = new Map(buffers.byTopic);
  byTopic.set(topic, {
    topic,
    entries: overflow === 0 ? appended : appended.slice(overflow),
    evicted: (existing?.evicted ?? 0) + overflow,
    received: (existing?.received ?? 0) + 1,
  });
  return { depth: buffers.depth, byTopic, sequence };
}

/** The most recent message on a topic, or null if none has arrived. */
export function mostRecent(buffers: Buffers, topic: string): Received | null {
  const buffer = buffers.byTopic.get(topic);
  if (buffer === undefined || buffer.entries.length === 0) {
    return null;
  }
  return buffer.entries[buffer.entries.length - 1] ?? null;
}

/** How many messages are held in total, across every topic. */
export function heldCount(buffers: Buffers): number {
  let total = 0;
  for (const buffer of buffers.byTopic.values()) {
    total += buffer.entries.length;
  }
  return total;
}
