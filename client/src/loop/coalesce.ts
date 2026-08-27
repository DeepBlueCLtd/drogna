/**
 * What to draw when more arrived than there are frames to draw it in.
 *
 * Three things could be done with a burst, and two of them are lies. Dropping the excess
 * silently makes the display quieter than the system (FR-008 forbids it). Falling behind
 * and drawing them all eventually makes the display later and later than the system, which
 * is the frozen-but-healthy failure the loop view exists to prevent. What is left is
 * coalescing: one transit per boundary per frame, carrying the number of messages it
 * stands for, so the count on the screen and the count on the wire agree even when the
 * marks on the screen and the messages on the wire do not (SC-001).
 *
 * Below the threshold nothing is coalesced, because the ordinary case — four messages of
 * one run, seconds apart — is exactly the case a viewer wants to watch one at a time.
 *
 * There is no clock in this module, host or simulated. A frame is a batch of arrivals, and
 * a batch is delimited by the caller's render, not by a duration.
 */
import type { Received } from "../data/buffers";

import { routeFor } from "./transitRouting";

/** One crossing, as drawn. `count` above one means it stands for several. */
export interface Transit {
  readonly boundary: string;
  /** The topic of the most recent message this transit stands for. */
  readonly topic: string;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly count: number;
  /** Every topic folded into this transit, in first-seen order. */
  readonly topics: readonly string[];
}

export interface Coalesced {
  readonly transits: readonly Transit[];
  /** Messages received in this batch that were routable and so could be drawn. */
  readonly routable: number;
  /** How many of them were folded into another transit rather than drawn separately. */
  readonly coalesced: number;
  /** Messages that draw no transit at all: heartbeats, and anything unrouted. */
  readonly unrouted: number;
}

/**
 * How many arrivals in one batch before coalescing begins.
 *
 * A display bound. It changes how many marks are drawn and never how many messages are
 * counted, and it can neither light a component nor invent a crossing.
 */
export const DEFAULT_COALESCING_THRESHOLD = 8;

function merge(into: Transit, next: Received, topic: string): Transit {
  return {
    boundary: into.boundary,
    topic,
    firstSequence: Math.min(into.firstSequence, next.sequence),
    lastSequence: Math.max(into.lastSequence, next.sequence),
    count: into.count + 1,
    topics: into.topics.includes(topic) ? into.topics : [...into.topics, topic],
  };
}

/**
 * Turn one batch of arrivals into the transits to draw.
 *
 * Order is preserved: transits come back in the order their first message arrived, which
 * is what lets the four messages of a run be seen traversing the cycle in the order
 * AT-02 asserts them in.
 */
export function coalesce(
  arrivals: readonly Received[],
  threshold: number = DEFAULT_COALESCING_THRESHOLD,
): Coalesced {
  const drawn: Transit[] = [];
  const byBoundary = new Map<string, number>();
  let routable = 0;
  let unrouted = 0;
  const coalescing = arrivals.length >= Math.max(1, threshold);

  for (const arrival of arrivals) {
    const route = routeFor(arrival.topic);
    if (route === null) {
      unrouted += 1;
      continue;
    }
    routable += 1;
    const existing = coalescing ? byBoundary.get(route.boundary) : undefined;
    if (existing === undefined) {
      byBoundary.set(route.boundary, drawn.length);
      drawn.push({
        boundary: route.boundary,
        topic: arrival.topic,
        firstSequence: arrival.sequence,
        lastSequence: arrival.sequence,
        count: 1,
        topics: [arrival.topic],
      });
      continue;
    }
    drawn[existing] = merge(drawn[existing] as Transit, arrival, arrival.topic);
  }

  return {
    transits: drawn,
    routable,
    coalesced: routable - drawn.length,
    unrouted,
  };
}

/** The words the display uses to say a transit stands for more than one message. */
export function coalescedWords(transit: Transit): string | null {
  if (transit.count <= 1) {
    return null;
  }
  return `${transit.count} messages, drawn as one`;
}
