/**
 * Paused and stale mean opposite things.
 *
 * Paused is a state the clock reported: a rate of zero, which screenshot capture pins on
 * purpose (FR-53). Stale is the absence of any state. They look alike on a still page,
 * so the page must say which it is, and this is the test that it does.
 */
import { describe, expect, it } from "vitest";

import { interpret } from "../src/liveness/ingest";
import { emptyLiveness, receive } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { describeClock, emptyClock, receiveClockSample } from "../src/transport/clock";

import { clockSample, heartbeat, HEARING_CONNECTED, TOLERANCES } from "./heartbeats";

function heardFromClock(receivedAt: number) {
  const interpretation = interpret(
    heartbeat({ component: "clock", liveness_window_seconds: 10 }),
    receivedAt,
    TOLERANCES,
  );
  if (!interpretation.accepted) {
    throw new Error(interpretation.reason);
  }
  return receive(emptyLiveness, interpretation.evidence);
}

describe("the clock as the page shows it", () => {
  it("is unheard before any sample arrives", () => {
    expect(describeClock(emptyClock, 1000, 10, "dark").display).toBe("unheard");
  });

  it("is running while samples keep arriving", () => {
    const state = receiveClockSample(emptyClock, clockSample(), 1000);
    expect(describeClock(state, 1000 + 1_000, 10, "lit").display).toBe("running");
  });

  it("is paused at a rate of zero, however long ago the last sample was", () => {
    const state = receiveClockSample(emptyClock, clockSample({ rate: 0, mode: "paused" }), 1000);
    const view = describeClock(state, 1000 + 600_000, 10, "lit");
    expect(view.display).toBe("paused");
    expect(view.sample?.rate).toBe(0);
  });

  it("is stale when samples stop while the clock is still heartbeating", () => {
    const state = receiveClockSample(emptyClock, clockSample(), 1000);
    expect(describeClock(state, 1000 + 30_000, 10, "lit").display).toBe("stale");
  });

  it("is stale, not paused, once the clock is no longer heard from", () => {
    const state = receiveClockSample(emptyClock, clockSample({ rate: 0, mode: "paused" }), 1000);
    expect(describeClock(state, 1000 + 30_000, 10, "dark").display).toBe("stale");
  });

  it("refuses a sample that fails the contract and counts it", () => {
    const state = receiveClockSample(emptyClock, { tick: 1 }, 1000);
    expect(state.sample).toBeNull();
    expect(state.discarded).toBe(1);
  });

  it("does not let a late sample wind the display back", () => {
    let state = receiveClockSample(emptyClock, clockSample({ tick: 9 }), 1000);
    state = receiveClockSample(state, clockSample({ tick: 4 }), 1100);
    expect(state.sample?.tick).toBe(9);
  });
});

describe("a rate pinned to zero", () => {
  it("decays nothing, because liveness is measured in real time", () => {
    const liveness = heardFromClock(1000);
    const clockState = receiveClockSample(emptyClock, clockSample({ rate: 0, mode: "paused" }), 1000);
    const shell = describeShell({
      liveness,
      clockState,
      connection: "receiving",
      now: 1000 + 5_000,
      hearing: HEARING_CONNECTED,
      clockStaleAfterSeconds: 10,
    });
    const clockNode = shell.nodes.find((node) => node.componentId === "clock");
    expect(clockNode?.illumination).toBe("lit");
    expect(shell.clock.display).toBe("paused");
  });

  it("gives the same page for the same inputs, which is what a capture pair needs", () => {
    const inputs = {
      liveness: heardFromClock(1000),
      clockState: receiveClockSample(emptyClock, clockSample({ rate: 0, mode: "paused" }), 1000),
      connection: "receiving" as const,
      now: 1000 + 2_000,
      hearing: HEARING_CONNECTED,
      clockStaleAfterSeconds: 10,
    };
    expect(describeShell(inputs)).toEqual(describeShell(inputs));
  });
});
