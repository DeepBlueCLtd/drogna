/**
 * A burst is drawn as fewer marks and counted as the same number of messages.
 *
 * FR-008 rules out the two easy answers. Dropping the excess makes the display quieter
 * than the system; falling behind makes it later and later than the system, which is the
 * frozen-but-healthy failure the whole loop view exists to prevent. What is left is
 * coalescing, and the property that makes coalescing honest is arithmetic: the counts
 * carried by the transits drawn must sum to the number of messages that arrived.
 */
import { describe, expect, it } from "vitest";

import { emptyBuffers, record } from "../../src/data/buffers";
import { drawFrame, emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import { DIVERGENCE_TOPIC, HEARTBEAT_TOPIC, RUN_PUBLISHED_TOPIC, RUN_REQUEST_TOPIC } from "../../src/data/topics";
import { boundaryId } from "../../src/legibility/classification";
import { coalesce, coalescedWords, DEFAULT_COALESCING_THRESHOLD } from "../../src/loop/coalesce";

import { divergenceEvent, runPublished, runRequest, wire } from "../control";

function arrivals(topics: readonly string[]) {
  let buffers = emptyBuffers(topics.length + 1);
  const received = [];
  for (const topic of topics) {
    buffers = record(buffers, topic, "{}");
    received.push({ topic, payload: "{}", sequence: buffers.sequence });
  }
  return received;
}

describe("coalescing a burst", () => {
  it("leaves an ordinary batch alone, so one run reads one message at a time", () => {
    const frame = coalesce(arrivals([DIVERGENCE_TOPIC, RUN_REQUEST_TOPIC]));
    expect(frame.transits).toHaveLength(2);
    expect(frame.coalesced).toBe(0);
    expect(frame.transits.every((transit) => transit.count === 1)).toBe(true);
  });

  it("folds a burst on one boundary into one transit carrying the count", () => {
    const burst = arrivals(Array.from({ length: 20 }, () => DIVERGENCE_TOPIC));
    const frame = coalesce(burst);
    expect(frame.transits).toHaveLength(1);
    expect(frame.transits[0]?.count).toBe(20);
    expect(frame.transits[0]?.boundary).toBe(boundaryId("monitor", "scheduler"));
  });

  it("drops none of them: the counts drawn sum to the messages that arrived", () => {
    const burst = arrivals([
      ...Array.from({ length: 15 }, () => DIVERGENCE_TOPIC),
      ...Array.from({ length: 9 }, () => RUN_PUBLISHED_TOPIC),
    ]);
    const frame = coalesce(burst);
    const drawnFor = frame.transits.reduce((total, transit) => total + transit.count, 0);
    expect(drawnFor).toBe(burst.length);
    expect(frame.routable).toBe(burst.length);
    expect(frame.coalesced).toBe(burst.length - frame.transits.length);
  });

  it("keeps one transit per boundary, not one per burst", () => {
    const burst = arrivals([
      ...Array.from({ length: 10 }, () => DIVERGENCE_TOPIC),
      ...Array.from({ length: 10 }, () => RUN_REQUEST_TOPIC),
    ]);
    const frame = coalesce(burst);
    expect(frame.transits.map((transit) => transit.boundary)).toEqual([
      boundaryId("monitor", "scheduler"),
      boundaryId("scheduler", "model_runner"),
    ]);
  });

  it("spans the sequence numbers it stands for, so the batch is recoverable", () => {
    const burst = arrivals(Array.from({ length: 12 }, () => DIVERGENCE_TOPIC));
    const transit = coalesce(burst).transits[0];
    expect(transit?.firstSequence).toBe(1);
    expect(transit?.lastSequence).toBe(12);
  });

  it("counts the unrouted rather than pretending they did not arrive", () => {
    const frame = coalesce(arrivals([HEARTBEAT_TOPIC, HEARTBEAT_TOPIC, DIVERGENCE_TOPIC]));
    expect(frame.unrouted).toBe(2);
    expect(frame.routable).toBe(1);
  });

  it("says in words that a transit stands for several, and stays silent when it does not", () => {
    const burst = coalesce(arrivals(Array.from({ length: 9 }, () => DIVERGENCE_TOPIC)));
    expect(coalescedWords(burst.transits[0]!)).toContain("9");
    const single = coalesce(arrivals([DIVERGENCE_TOPIC]));
    expect(coalescedWords(single.transits[0]!)).toBeNull();
  });

  it("begins coalescing at the declared threshold and not before", () => {
    const below = coalesce(arrivals(Array.from({ length: DEFAULT_COALESCING_THRESHOLD - 1 }, () => DIVERGENCE_TOPIC)));
    expect(below.coalesced).toBe(0);
    const at = coalesce(arrivals(Array.from({ length: DEFAULT_COALESCING_THRESHOLD }, () => DIVERGENCE_TOPIC)));
    expect(at.coalesced).toBeGreaterThan(0);
  });
});

describe("a burst through the whole loop state", () => {
  it("bounds the buffer while drawing every message that arrived", () => {
    let state = emptyLoop(4, 8);
    for (let index = 0; index < 200; index += 1) {
      state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent()));
    }
    state = drawFrame(state);
    expect(state.buffers.byTopic.get(DIVERGENCE_TOPIC)?.entries).toHaveLength(4);
    expect(state.buffers.byTopic.get(DIVERGENCE_TOPIC)?.received).toBe(200);
    expect(state.lastFrame.transits[0]?.count).toBe(200);
    expect(state.lastFrame.transits).toHaveLength(1);
  });

  it("empties the pending queue on a frame, so nothing is drawn twice", () => {
    let state = receiveControl(emptyLoop(), RUN_REQUEST_TOPIC, wire(runRequest()));
    state = drawFrame(state);
    expect(state.pending).toEqual([]);
    expect(state.transitsDrawn).toBe(1);
    state = drawFrame(state);
    expect(state.transitsDrawn).toBe(1);
    expect(state.lastFrame.transits).toEqual([]);
  });

  it("draws nothing on a frame in which nothing arrived", () => {
    let state = receiveControl(emptyLoop(), RUN_PUBLISHED_TOPIC, wire(runPublished()));
    state = drawFrame(state);
    const quiet = drawFrame(state);
    expect(quiet.lastFrame.transits).toEqual([]);
    expect(quiet.transitsDrawn).toBe(1);
  });
});
