/**
 * The crossing history is bounded, browsable, and has exactly one way in.
 *
 * FR-009's three promises — a stated bound, order preserved, truncation declared — plus
 * the structural half of Constitution VII for the read path: an empty state draws
 * nothing, and there is no parameter a prepared history could arrive through. The re-ask
 * gate's two bounds (FR-010) are held here too: the stated minimum interval, and never
 * while one is in flight.
 *
 * Watched failing: the eviction assertion against a version that sliced from the wrong
 * end (it reported the newest crossing evicted), and the gate assertion against a version
 * that compared the interval with <= (an instant exactly on the bound was refused).
 * Both mutations were reverted once each was caught.
 */
import { describe, expect, it } from "vitest";

import { beginReAsk, DEFAULT_CROSSING_DEPTH, emptyReadPath, latestCrossing, reAskGate, reAskSettled, recordCrossing } from "../../src/readpath/crossings";
import type { ObservedCrossing, ReadPathState } from "../../src/readpath/crossings";

function crossing(overrides: Partial<ObservedCrossing> = {}): ObservedCrossing {
  return {
    kind: "trajectory",
    requestLine: "GET http://query.invalid/released/u/trajectory?coords=x",
    outcome: "answered",
    status: 200,
    declaredType: "application/prs.coverage+json",
    bodyBytes: 120,
    simTime: "2026-08-26T00:10:00Z",
    excerpt: "{}",
    excerptDroppedBytes: 0,
    failure: null,
    ...overrides,
  };
}

describe("the empty state", () => {
  it("holds no crossing, whatever is asked of it", () => {
    const state = emptyReadPath();
    expect(state.crossings).toEqual([]);
    expect(latestCrossing(state)).toBeNull();
    expect(state.recorded).toBe(0);
    expect(state.evicted).toBe(0);
    expect(state.depth).toBe(DEFAULT_CROSSING_DEPTH);
  });

  it("takes a recorded read as its only route to a crossing", () => {
    // Two formal parameters: the state, and the crossing observed from a real request.
    // No parameter a configuration document or a prepared history could enter through.
    expect(recordCrossing.length).toBe(2);
    expect(emptyReadPath.length).toBeLessThanOrEqual(1);
  });
});

describe("the bound", () => {
  it("retains at most the configured depth, evicting the oldest first", () => {
    let state: ReadPathState = emptyReadPath(3);
    for (let index = 0; index < 5; index += 1) {
      state = recordCrossing(state, crossing({ requestLine: `GET number-${index}` }));
    }
    expect(state.crossings).toHaveLength(3);
    expect(state.crossings.map((entry) => entry.requestLine)).toEqual([
      "GET number-2",
      "GET number-3",
      "GET number-4",
    ]);
    expect(state.evicted).toBe(2);
    expect(state.recorded).toBe(5);
    expect(latestCrossing(state)?.requestLine).toBe("GET number-4");
  });

  it("keeps arrival order through sequence numbers, so browsing backwards is honest", () => {
    let state = emptyReadPath();
    state = recordCrossing(state, crossing());
    state = recordCrossing(state, crossing({ outcome: "failed", status: null }));
    const sequences = state.crossings.map((entry) => entry.sequence);
    expect(sequences).toEqual([1, 2]);
  });

  it("refuses a depth below one rather than holding nothing silently", () => {
    const state = recordCrossing(emptyReadPath(0), crossing());
    expect(state.crossings).toHaveLength(1);
  });
});

describe("the re-ask gate", () => {
  it("refuses while a re-asked read is in flight, so no queue builds", () => {
    const state = beginReAsk(emptyReadPath(), "field", 1_000);
    const gate = reAskGate(state, 1_000_000);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.because).toContain("in flight");
    }
    expect(reAskGate(reAskSettled(state), 1_000_000).allowed).toBe(true);
  });

  it("refuses a second press inside the stated minimum interval, and allows on it", () => {
    const state = reAskSettled(beginReAsk(emptyReadPath(), "field", 1_000));
    expect(reAskGate(state, 1_001, 10_000).allowed).toBe(false);
    const refused = reAskGate(state, 10_999, 10_000);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.because).toContain("10 seconds");
    }
    expect(reAskGate(state, 11_000, 10_000).allowed).toBe(true);
  });

  it("allows the first press: a page that never asked has nothing to be limited by", () => {
    expect(reAskGate(emptyReadPath(), 0).allowed).toBe(true);
  });
});
