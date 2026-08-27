/**
 * An hour of demonstration does not grow the page.
 *
 * SC-004 asks for a memory footprint stable to within ten per cent over an hour at the
 * maximum supported rate. A browser test cannot weigh the heap honestly, and a test that
 * pretended to would be worse than none. What it can do is hold the thing the footprint is
 * a consequence of: the count of objects the client retains. Every one of them is bounded
 * — the buffers by their configured depth, the boundary index by the number of boundaries
 * in the layout, the pending queue by the frame it is drained on — and none of them grows
 * with the length of the session.
 *
 * So the assertion is that the retained counts after a long stream equal the retained
 * counts after a short one. If a buffer ever stops evicting, or the boundary index starts
 * keeping history, this fails on the count rather than on a heap figure nobody can
 * reproduce.
 */
import { describe, expect, it } from "vitest";

import { heldCount } from "../../src/data/buffers";
import { drawFrame, emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import { CLOCK_TOPIC, HEARTBEAT_TOPIC, RUN_TOPICS } from "../../src/data/topics";
import { announceRun, emptyOverlay, fieldRead } from "../../src/uncertainty/overlay";

import { divergenceEvent, runPublished, runRequest, runStarted, wire } from "../control";

const DEPTH = 32;
const CYCLE = [
  [RUN_TOPICS[0]!, wire(divergenceEvent())],
  [RUN_TOPICS[1]!, wire(runRequest())],
  [RUN_TOPICS[2]!, wire(runStarted())],
  [RUN_TOPICS[3]!, wire(runPublished())],
  [HEARTBEAT_TOPIC, wire({ component: "clock", sim_time: "2026-08-26T00:00:00.000000Z", status: "ok" })],
  [CLOCK_TOPIC, wire({ run_id: "run-0001", tick: 1, sim_time: "2026-08-26T00:00:01.000000Z", mode: "accelerated", rate: 60 })],
] as const;

/** Run the reducer for a number of cycles, drawing a frame every four arrivals. */
function afterCycles(cycles: number) {
  let state = emptyLoop(DEPTH, 8);
  let arrivals = 0;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const [topic, payload] of CYCLE) {
      state = receiveControl(state, topic, payload);
      arrivals += 1;
      if (arrivals % 4 === 0) {
        state = drawFrame(state);
      }
    }
  }
  return drawFrame(state);
}

/** What the client is holding on to, counted. */
function retained(state: ReturnType<typeof afterCycles>) {
  return {
    held: heldCount(state.buffers),
    topics: state.buffers.byTopic.size,
    boundaries: state.lastByBoundary.size,
    pending: state.pending.length,
    lastFrame: state.lastFrame.transits.length,
    reached: state.reached.length,
  };
}

describe("a long session", () => {
  it("retains the same number of objects after ten thousand cycles as after one thousand", () => {
    // Both figures are taken past the point where the buffers have filled, because before
    // that the count is still rising towards its bound and would say nothing about
    // whether it has one.
    const early = retained(afterCycles(1_000));
    const late = retained(afterCycles(10_000));
    expect(late).toEqual(early);
    expect(late.held).toBe(DEPTH * CYCLE.length);
  });

  it("keeps every per-topic buffer at its configured depth, never above", () => {
    const state = afterCycles(5_000);
    for (const buffer of state.buffers.byTopic.values()) {
      expect(buffer.entries.length, buffer.topic).toBeLessThanOrEqual(DEPTH);
    }
    expect(heldCount(state.buffers)).toBeLessThanOrEqual(DEPTH * CYCLE.length);
  });

  it("counts what it received even though it kept only a bounded part of it", () => {
    const state = afterCycles(5_000);
    expect(state.messagesReceived).toBe(5_000 * CYCLE.length);
    const divergence = state.buffers.byTopic.get(RUN_TOPICS[0]!);
    expect(divergence?.received).toBe(5_000);
    expect(divergence?.evicted).toBe(5_000 - DEPTH);
  });

  it("holds one message per boundary, not a history of them", () => {
    const state = afterCycles(5_000);
    // Four run topics and two more that route: the clock and nothing else here.
    expect(state.lastByBoundary.size).toBeLessThanOrEqual(CYCLE.length);
  });

  it("empties the pending queue every frame, so a burst is not retained", () => {
    expect(afterCycles(10_000).pending).toEqual([]);
  });

  it("keeps the overlay to one run however many are announced", () => {
    let overlay = emptyOverlay;
    for (let index = 0; index < 10_000; index += 1) {
      overlay = fieldRead(announceRun(overlay, runPublished({ run_id: `run-${index}` })));
    }
    expect(Object.keys(overlay)).toHaveLength(Object.keys(emptyOverlay).length);
    expect(overlay.runId).toBe("run-9999");
    expect(overlay.announcements).toBe(10_000);
  });
});
