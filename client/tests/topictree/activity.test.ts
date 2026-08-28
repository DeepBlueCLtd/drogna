/**
 * The activity model: arrivals in, every drawn reading out (022 FR-003, FR-008).
 *
 * Pure functions throughout — state and an instant in, phases and figures out — which
 * is what lets pulse, ripple, crossover and the stated rates be proved without a broker
 * or a browser (FR-011). The crossover assertions hold a relationship between the
 * module's own quantities, never a rate typed into the test: the bound is derived from
 * the display's decay duration, and an edit that tuned it would move both sides.
 */
import { describe, expect, it } from "vitest";

import {
  PINNED_GLOW,
  PULSE_DECAY_MS,
  RING_DEPTH,
  aggregate,
  branchGlow,
  connectionGlow,
  decayPhase,
  emptyActivity,
  filterPhase,
  meanInterArrivalMs,
  nodeGlow,
  reading,
  recordArrival,
  ripplePhase,
  simRatePerSecond,
  simTimeOfPayload,
  stampFor,
} from "../../src/topictree/activity";
import type { ActivityState, Arrival } from "../../src/topictree/activity";

function arrive(
  state: ActivityState,
  topic: string,
  receivedAt: number,
  simTime: string | null = null,
  payload = "{}",
): ActivityState {
  const arrival: Arrival = { topic, payload, receivedAt, simTime };
  return recordArrival(state, arrival);
}

describe("folding arrivals", () => {
  it("counts every arrival and keeps the last, with the ring bounded", () => {
    let state = emptyActivity;
    for (let index = 0; index < RING_DEPTH + 10; index += 1) {
      state = arrive(state, "obs/a/b", index * 10);
    }
    const activity = state.get("obs/a/b");
    expect(activity?.count).toBe(RING_DEPTH + 10);
    expect(activity?.recent.length).toBe(RING_DEPTH);
    expect(activity?.last.receivedAt).toBe((RING_DEPTH + 9) * 10);
  });

  it("keeps topics apart", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/a/b", 100);
    state = arrive(state, "ctl/clock", 200);
    expect(state.get("obs/a/b")?.count).toBe(1);
    expect(state.get("ctl/clock")?.count).toBe(1);
    expect(state.get("obs/a/c")).toBeUndefined();
  });
});

describe("the stated stamp (retained messages stay honest)", () => {
  it("prefers the payload's own simulation time over the clock's", () => {
    const retained = JSON.stringify({ sim_time: "2026-09-01T00:00:00.000000Z" });
    expect(stampFor(retained, "2026-09-01T06:00:00.000000Z")).toBe("2026-09-01T00:00:00.000000Z");
  });

  it("falls back to the latest clock sample where the payload carries none", () => {
    expect(stampFor("{}", "2026-09-01T06:00:00.000000Z")).toBe("2026-09-01T06:00:00.000000Z");
  });

  it("states nothing rather than inventing a stamp", () => {
    expect(stampFor("{}", null)).toBe(null);
    expect(stampFor("not json", null)).toBe(null);
  });

  it("treats payload content as opaque beyond the one stamp field", () => {
    expect(simTimeOfPayload("not json at all")).toBe(null);
    expect(simTimeOfPayload('{"sim_time": 42}')).toBe(null);
    expect(simTimeOfPayload("[1,2,3]")).toBe(null);
  });
});

describe("pulse and decay", () => {
  it("is silent where nothing arrived, full at arrival, gone after the decay", () => {
    let state = emptyActivity;
    expect(decayPhase(state.get("obs/a/b"), 1000)).toBe(0);
    state = arrive(state, "obs/a/b", 1000);
    const activity = state.get("obs/a/b");
    expect(decayPhase(activity, 1000)).toBe(1);
    expect(decayPhase(activity, 1000 + PULSE_DECAY_MS / 2)).toBeCloseTo(0.5);
    expect(decayPhase(activity, 1000 + PULSE_DECAY_MS)).toBe(0);
    expect(decayPhase(activity, 1000 + 10 * PULSE_DECAY_MS)).toBe(0);
  });
});

describe("the ripple (an ancestor sees what a wildcard under it would see)", () => {
  it("carries a leaf's arrival up through its ancestors and nowhere else", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/platform-a/ds-temperature", 5000);
    expect(ripplePhase(state, "obs/platform-a/ds-temperature", 5000)).toBe(1);
    expect(ripplePhase(state, "obs/platform-a", 5000)).toBe(1);
    expect(ripplePhase(state, "obs", 5000)).toBe(1);
    expect(ripplePhase(state, "", 5000)).toBe(1);
    expect(ripplePhase(state, "ctl", 5000)).toBe(0);
    expect(ripplePhase(state, "obs/platform-b", 5000)).toBe(0);
  });

  it("does not mistake a sibling prefix for an ancestor", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/platform-ab/ds-x", 5000);
    expect(ripplePhase(state, "obs/platform-a", 5000)).toBe(0);
  });

  it("aggregates counts for a collapsed subtree's summary", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/a/one", 100);
    state = arrive(state, "obs/a/two", 200);
    state = arrive(state, "ctl/clock", 300);
    expect(aggregate(state, "obs").count).toBe(2);
    expect(aggregate(state, "obs").lastReceivedAt).toBe(200);
    expect(aggregate(state, "").count).toBe(3);
  });
});

describe("the role connections (US1 acceptance 1 and 3)", () => {
  it("lights exactly the filters that match an arrival", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/platform-a/ds-temperature", 700);
    expect(filterPhase(state, "obs/#", 700)).toBe(1);
    expect(filterPhase(state, "ctl/#", 700)).toBe(0);
    expect(filterPhase(state, "ctl/clock", 700)).toBe(0);
    expect(filterPhase(state, "obs/+/ds-temperature", 700)).toBe(1);
  });

  it("decays a connection the same way a pulse decays", () => {
    let state = emptyActivity;
    state = arrive(state, "ctl/heartbeat", 0);
    expect(filterPhase(state, "ctl/#", PULSE_DECAY_MS)).toBe(0);
    expect(filterPhase(state, "ctl/#", PULSE_DECAY_MS / 2)).toBeCloseTo(0.5);
  });
});

describe("the rate-adaptive crossover (022 FR-003; the bound is derived, not typed)", () => {
  function streamAtInterval(intervalMs: number): ActivityState {
    let state = emptyActivity;
    for (let index = 0; index < 10; index += 1) {
      state = arrive(state, "obs/a/b", index * intervalMs);
    }
    return state;
  }

  it("reads individually while arrivals are slower than the pulse's own decay", () => {
    const slow = streamAtInterval(PULSE_DECAY_MS * 2);
    expect(meanInterArrivalMs(slow.get("obs/a/b"))).toBeCloseTo(PULSE_DECAY_MS * 2);
    expect(reading(slow.get("obs/a/b"))).toBe("pulse");
  });

  it("crosses to sustained exactly where pulses would blur", () => {
    // The relationship, not a number: a stream arriving faster than its pulses fade is
    // sustained, one arriving slower is not, and the boundary is the module's own
    // decay duration — tuning PULSE_DECAY_MS moves both sides of this test with it.
    const blurred = streamAtInterval(PULSE_DECAY_MS);
    expect(reading(blurred.get("obs/a/b"))).toBe("sustained");
    const distinct = streamAtInterval(PULSE_DECAY_MS + 1);
    expect(reading(distinct.get("obs/a/b"))).toBe("pulse");
  });

  it("reads a single arrival as a pulse, having no interval to measure", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/a/b", 100);
    expect(meanInterArrivalMs(state.get("obs/a/b"))).toBe(null);
    expect(reading(state.get("obs/a/b"))).toBe("pulse");
  });
});

describe("the pinned display (012 FR-53's rule, kept by this surface)", () => {
  // The capture rule is system-wide: two captures of a pinned state are identical.
  // Heartbeats keep their real-time cadence at a rate of zero (ADR-0006), so while the
  // simulation is not advancing the panel draws steady marks, never fresh pulses.
  const PIN = 10_000;

  it("holds a spoken topic at the steady mark, identically at any two instants", () => {
    let state = emptyActivity;
    state = arrive(state, "ctl/heartbeat", PIN + 500); // arrived during the pin
    const activity = state.get("ctl/heartbeat");
    const early = nodeGlow(activity, PIN + 501, PIN);
    const late = nodeGlow(activity, PIN + 500 + 10 * PULSE_DECAY_MS, PIN);
    expect(early).toBe(PINNED_GLOW);
    expect(late).toBe(early);
  });

  it("lets a decay already in flight complete in wall time, down to the floor", () => {
    let state = emptyActivity;
    state = arrive(state, "ctl/heartbeat", PIN - 100); // arrived before the pin
    const activity = state.get("ctl/heartbeat");
    expect(nodeGlow(activity, PIN - 100, PIN)).toBe(1);
    const mid = nodeGlow(activity, PIN - 100 + PULSE_DECAY_MS / 2, PIN);
    expect(mid).toBeCloseTo(0.5);
    expect(nodeGlow(activity, PIN + 10 * PULSE_DECAY_MS, PIN)).toBe(PINNED_GLOW);
  });

  it("shows a never-spoken topic cold, pinned or not", () => {
    expect(nodeGlow(undefined, PIN + 5, PIN)).toBe(0);
    expect(branchGlow(emptyActivity, "obs", PIN + 5, PIN)).toBe(0);
    expect(connectionGlow(emptyActivity, "obs/#", PIN + 5, PIN)).toBe(0);
  });

  it("pins branches and role connections by the same rule", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/a/b", PIN + 200);
    const later = PIN + 200 + 5 * PULSE_DECAY_MS;
    expect(branchGlow(state, "obs", later, PIN)).toBe(PINNED_GLOW);
    expect(connectionGlow(state, "obs/#", later, PIN)).toBe(PINNED_GLOW);
    expect(connectionGlow(state, "ctl/#", later, PIN)).toBe(0);
  });

  it("animates exactly as before while the simulation advances", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/a/b", 1000);
    const activity = state.get("obs/a/b");
    expect(nodeGlow(activity, 1000, null)).toBe(decayPhase(activity, 1000));
    expect(nodeGlow(activity, 1000 + 2 * PULSE_DECAY_MS, null)).toBe(0);
    expect(branchGlow(state, "obs", 1000, null)).toBe(ripplePhase(state, "obs", 1000));
    expect(connectionGlow(state, "obs/#", 1000, null)).toBe(filterPhase(state, "obs/#", 1000));
  });
});

describe("the stated rate is simulation time (022 SC-004)", () => {
  function stamped(intervals: readonly string[]): ActivityState {
    let state = emptyActivity;
    intervals.forEach((simTime, index) => {
      state = arrive(state, "obs/a/b", index * 10, simTime);
    });
    return state;
  }

  it("states arrivals per simulation second whatever the wall pacing was", () => {
    // Four arrivals spanning 30 simulation seconds: 0.1 per simulation second. The
    // receivedAt instants above are 10ms apart — a high acceleration — and must not
    // appear anywhere in the figure.
    const state = stamped([
      "2026-09-01T00:00:00.000000Z",
      "2026-09-01T00:00:10.000000Z",
      "2026-09-01T00:00:20.000000Z",
      "2026-09-01T00:00:30.000000Z",
    ]);
    expect(simRatePerSecond(state.get("obs/a/b"))).toBeCloseTo(0.1);
  });

  it("is unchanged by the acceleration factor", () => {
    // The same simulation stamps arriving at 10ms and at 1000ms of wall time apart
    // state the same rate: acceleration changes pacing, never the stated figure.
    const stamps = [
      "2026-09-01T00:00:00.000000Z",
      "2026-09-01T00:01:00.000000Z",
      "2026-09-01T00:02:00.000000Z",
    ];
    let fast = emptyActivity;
    let slow = emptyActivity;
    stamps.forEach((simTime, index) => {
      fast = arrive(fast, "obs/a/b", index * 10, simTime);
      slow = arrive(slow, "obs/a/b", index * 1000, simTime);
    });
    expect(simRatePerSecond(fast.get("obs/a/b"))).toBe(simRatePerSecond(slow.get("obs/a/b")));
  });

  it("states no rate over a stopped clock rather than dividing by it", () => {
    const paused = stamped([
      "2026-09-01T00:00:00.000000Z",
      "2026-09-01T00:00:00.000000Z",
      "2026-09-01T00:00:00.000000Z",
    ]);
    expect(simRatePerSecond(paused.get("obs/a/b"))).toBe(null);
  });

  it("states no rate before arrivals carry simulation stamps", () => {
    let state = emptyActivity;
    state = arrive(state, "obs/a/b", 0, null);
    state = arrive(state, "obs/a/b", 10, null);
    expect(simRatePerSecond(state.get("obs/a/b"))).toBe(null);
  });
});
