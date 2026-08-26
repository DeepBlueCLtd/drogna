/**
 * A heartbeat that fails the contract lights nothing and leaves a mark.
 *
 * The counting matters as much as the refusing. A discard that left no trace would be
 * indistinguishable, from the page, from a component that never spoke — and the two mean
 * quite different things to whoever has to fix it.
 */
import { describe, expect, it } from "vitest";

import { decode, interpret } from "../src/liveness/ingest";
import { discard, emptyLiveness, receive } from "../src/liveness/reducer";

import { heartbeat, TOLERANCES } from "./heartbeats";

function fold(raw: unknown, receivedAt: number) {
  const interpretation = interpret(raw, receivedAt, TOLERANCES);
  return interpretation.accepted
    ? receive(emptyLiveness, interpretation.evidence)
    : discard(emptyLiveness, interpretation.reason);
}

describe("validation of an inbound heartbeat", () => {
  it("accepts the shape feature 001 publishes", () => {
    const interpretation = interpret(heartbeat(), 1000, TOLERANCES);
    expect(interpretation.accepted).toBe(true);
  });

  it("accepts a heartbeat carrying only the required fields", () => {
    const minimal = { component: "clock", sim_time: "2026-08-26T00:00:00.000000Z", status: "ok" };
    expect(interpret(minimal, 1000, TOLERANCES).accepted).toBe(true);
  });

  it("refuses a message with no component id, and lights nothing", () => {
    const state = fold({ sim_time: "2026-08-26T00:00:00.000000Z", status: "ok" }, 1000);
    expect(state.components.size).toBe(0);
    expect(state.discarded).toBe(1);
  });

  it("refuses a status the contract does not define", () => {
    const state = fold(heartbeat({ status: "fine" }), 1000);
    expect(state.components.size).toBe(0);
    expect(state.discarded).toBe(1);
  });

  it("refuses an unknown key rather than ignoring it", () => {
    const state = fold({ ...heartbeat(), lit: true }, 1000);
    expect(state.components.size).toBe(0);
    expect(state.discarded).toBe(1);
  });

  it("increments the count by exactly one per refused message", () => {
    let state = emptyLiveness;
    for (const reason of ["first", "second", "third"]) {
      state = discard(state, reason);
    }
    expect(state.discarded).toBe(3);
    expect(state.lastDiscardReason).toBe("third");
  });

  it("says why a message was refused", () => {
    const interpretation = interpret(heartbeat({ status: "fine" }), 1000, TOLERANCES);
    expect(interpretation.accepted).toBe(false);
    if (!interpretation.accepted) {
      expect(interpretation.reason.length).toBeGreaterThan(0);
    }
  });

  it("treats a payload that is not JSON as a refusal, not a crash", () => {
    const decoded = decode("{not json");
    expect("reason" in decoded).toBe(true);
  });
});
