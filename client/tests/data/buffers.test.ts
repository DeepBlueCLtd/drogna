/**
 * The bound holds, and the message the inspector shows is always the one it kept.
 *
 * FR-006 asks for a bounded per-topic buffer with oldest-first eviction. The property
 * worth testing is not that the code evicts — that is one line — but that the two things
 * a viewer depends on survive eviction: the most recent message is never the one thrown
 * away, and the count of what arrived is not lost when the messages themselves are.
 */
import { describe, expect, it } from "vitest";

import { emptyBuffers, heldCount, mostRecent, record } from "../../src/data/buffers";
import { CLOCK_TOPIC, DIVERGENCE_TOPIC, HEARTBEAT_TOPIC } from "../../src/data/topics";

describe("a bounded topic buffer", () => {
  it("keeps at most its configured depth however long the stream runs", () => {
    let buffers = emptyBuffers(4);
    for (let index = 0; index < 10_000; index += 1) {
      buffers = record(buffers, HEARTBEAT_TOPIC, `{"n":${index}}`);
    }
    expect(buffers.byTopic.get(HEARTBEAT_TOPIC)?.entries).toHaveLength(4);
    expect(heldCount(buffers)).toBe(4);
  });

  it("evicts the oldest first, so the newest is the one that survives", () => {
    let buffers = emptyBuffers(3);
    for (const n of [1, 2, 3, 4, 5]) {
      buffers = record(buffers, CLOCK_TOPIC, `{"n":${n}}`);
    }
    const kept = buffers.byTopic.get(CLOCK_TOPIC);
    expect(kept?.entries.map((entry) => entry.payload)).toEqual([`{"n":3}`, `{"n":4}`, `{"n":5}`]);
    expect(mostRecent(buffers, CLOCK_TOPIC)?.payload).toBe(`{"n":5}`);
  });

  it("counts what arrived and what was evicted, so the display can say so", () => {
    let buffers = emptyBuffers(2);
    for (const n of [1, 2, 3, 4, 5]) {
      buffers = record(buffers, CLOCK_TOPIC, `{"n":${n}}`);
    }
    const kept = buffers.byTopic.get(CLOCK_TOPIC);
    expect(kept?.received).toBe(5);
    expect(kept?.evicted).toBe(3);
  });

  it("bounds each topic separately, so a chatty topic cannot evict a quiet one", () => {
    let buffers = emptyBuffers(2);
    buffers = record(buffers, DIVERGENCE_TOPIC, `{"rare":true}`);
    for (let index = 0; index < 500; index += 1) {
      buffers = record(buffers, HEARTBEAT_TOPIC, `{"n":${index}}`);
    }
    expect(mostRecent(buffers, DIVERGENCE_TOPIC)?.payload).toBe(`{"rare":true}`);
    expect(heldCount(buffers)).toBe(3);
  });

  it("numbers arrivals across every topic, so order is recoverable without a clock", () => {
    let buffers = emptyBuffers(8);
    buffers = record(buffers, DIVERGENCE_TOPIC, "{}");
    buffers = record(buffers, HEARTBEAT_TOPIC, "{}");
    buffers = record(buffers, DIVERGENCE_TOPIC, "{}");
    expect(mostRecent(buffers, HEARTBEAT_TOPIC)?.sequence).toBe(2);
    expect(mostRecent(buffers, DIVERGENCE_TOPIC)?.sequence).toBe(3);
  });

  it("reports nothing for a topic that has never spoken", () => {
    expect(mostRecent(emptyBuffers(4), DIVERGENCE_TOPIC)).toBeNull();
  });

  it("refuses a depth of zero rather than keeping nothing at all", () => {
    let buffers = emptyBuffers(0);
    buffers = record(buffers, CLOCK_TOPIC, `{"n":1}`);
    expect(mostRecent(buffers, CLOCK_TOPIC)?.payload).toBe(`{"n":1}`);
  });
});
