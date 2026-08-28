/**
 * FR-007: the conditions under which the panel's picture is not the system's, each
 * stated in words, each distinct. Silence on the wire and silence in the feed must
 * never look the same; stillness is attributed to the clock when the clock owns it; a
 * refreshed page is a young listener, not a stopped system (FR-008).
 */
import { describe, expect, it } from "vitest";

import type { ClockSample, ClockState } from "../../src/transport/clock";
import { PULSE_DECAY_MS, decayPhase, emptyActivity, recordArrival } from "../../src/topictree/activity";
import { describeHonesty } from "../../src/topictree/state";
import type { PanelState } from "../../src/topictree/state";

const NO_CLOCK: ClockState = { sample: null, discarded: 0, lastDiscardReason: null };

function clockAt(rate: number, mode = "accelerated"): ClockState {
  const sample: ClockSample = {
    runId: "run-0001",
    tick: 100,
    simTime: "2026-09-01T00:00:00.000000Z",
    mode,
    rate,
    receivedAt: 5000,
  };
  return { sample, discarded: 0, lastDiscardReason: null };
}

function panel(overrides: Partial<PanelState>): PanelState {
  return {
    connection: "receiving",
    clock: clockAt(600),
    activity: emptyActivity,
    grafts: new Map(),
    listeningSince: 1000,
    ...overrides,
  };
}

describe("the absent route", () => {
  it("disables the surface with a statement when no configuration validated", () => {
    const honesty = describeHonesty(panel({}), false, "configuration document unavailable");
    expect(honesty.disabled).toContain("disabled");
    expect(honesty.disabled).toContain("configuration document unavailable");
  });

  it("does not also claim a disconnection it cannot know about", () => {
    const honesty = describeHonesty(panel({ connection: "not-connected" }), false, null);
    expect(honesty.disabled).not.toBe(null);
    expect(honesty.disconnected).toBe(null);
  });
});

describe("the severed feed (US2 acceptance 4)", () => {
  it("states the disconnection rather than presenting a quiet system", () => {
    const honesty = describeHonesty(panel({ connection: "not-connected" }), true, null);
    expect(honesty.disconnected).toContain("severed");
    expect(honesty.disconnected).toContain("says nothing about the system");
  });

  it("says nothing of the kind while receiving", () => {
    expect(describeHonesty(panel({}), true, null).disconnected).toBe(null);
  });
});

describe("the paused clock (US2 acceptance 3)", () => {
  it("states the pause at a rate of zero, attributing stillness to the clock", () => {
    const honesty = describeHonesty(panel({ clock: clockAt(0) }), true, null);
    expect(honesty.paused).toContain("rate of zero");
    expect(honesty.paused).not.toContain("idle");
  });

  it("states the pause when the mode says paused whatever the rate field", () => {
    const honesty = describeHonesty(panel({ clock: clockAt(600, "paused") }), true, null);
    expect(honesty.paused).not.toBe(null);
  });

  it("claims no pause while the clock advances, and none before any clock", () => {
    expect(describeHonesty(panel({}), true, null).paused).toBe(null);
    expect(describeHonesty(panel({ clock: NO_CLOCK }), true, null).paused).toBe(null);
  });

  it("lets in-flight decays complete in wall time while paused", () => {
    // The decay reads host instants only, so a stopped simulation clock cannot freeze
    // it: the pulse fades exactly as it would running.
    let state = emptyActivity;
    state = recordArrival(state, {
      topic: "ctl/heartbeat",
      payload: "{}",
      receivedAt: 0,
      simTime: "2026-09-01T00:00:00.000000Z",
    });
    expect(decayPhase(state.get("ctl/heartbeat"), PULSE_DECAY_MS / 2)).toBeCloseTo(0.5);
    expect(decayPhase(state.get("ctl/heartbeat"), 2 * PULSE_DECAY_MS)).toBe(0);
  });
});

describe("the cold start (FR-008)", () => {
  it("claims no history once listening, and says the tree is one session's hearing", () => {
    const honesty = describeHonesty(panel({}), true, null);
    expect(honesty.session).toContain("since it was opened");
    expect(honesty.session).toContain("Nothing is persisted");
  });

  it("says the tree is cold before the transport has opened", () => {
    const honesty = describeHonesty(panel({ listeningSince: null }), true, null);
    expect(honesty.session).toContain("cold");
  });
});
