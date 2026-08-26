/**
 * Arrival order and simulation order are not the same thing.
 *
 * What is displayed for a component is keyed to the greatest simulation time it has
 * reported, so a message that overtook another cannot make the display go backwards.
 * What is *believed* is keyed to arrival, because liveness is a fact about the host
 * (ADR-0006). Both rules are here together because they are easy to confuse.
 */
import { describe, expect, it } from "vitest";

import { interpret } from "../src/liveness/ingest";
import { emptyLiveness, receive } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { emptyClock, receiveClockSample } from "../src/transport/clock";

import { clockSample, heartbeat, HEARING_CONNECTED, TOLERANCES } from "./heartbeats";

function fold(state = emptyLiveness, fields: Parameters<typeof heartbeat>[0], receivedAt: number) {
  const interpretation = interpret(heartbeat(fields), receivedAt, TOLERANCES);
  if (!interpretation.accepted) {
    throw new Error(interpretation.reason);
  }
  return receive(state, interpretation.evidence);
}

describe("heartbeats arriving out of order", () => {
  it("reports the greatest simulation time, not the most recent arrival", () => {
    let state = fold(emptyLiveness, { tick: 9, sim_time: "2026-08-26T00:00:09.000000Z" }, 1000);
    state = fold(state, { tick: 4, sim_time: "2026-08-26T00:00:04.000000Z" }, 1100);
    expect(state.components.get("clock")?.reported.tick).toBe(9);
  });

  it("still measures liveness from the most recent arrival", () => {
    let state = fold(emptyLiveness, { tick: 9 }, 1000);
    state = fold(state, { tick: 4 }, 5000);
    expect(state.components.get("clock")?.latest.receivedAt).toBe(5000);
  });
});

describe("a heartbeat ahead of the ticks the client has seen", () => {
  function shell(heartbeatTick: number, clockTick: number) {
    const liveness = fold(emptyLiveness, { component: "monitor", tick: heartbeatTick }, 1000);
    const clockState = receiveClockSample(emptyClock, clockSample({ tick: clockTick }), 1000);
    return describeShell({
      liveness,
      clockState,
      connection: "receiving",
      now: 1000,
      hearing: HEARING_CONNECTED,
      clockStaleAfterSeconds: 10,
    });
  }

  it("treats one tick ahead as current, because the sample stream lags", () => {
    const view = shell(11, 10).nodes.find((node) => node.componentId === "monitor");
    expect(view?.aheadOfClock).toBe(false);
  });

  it("flags a heartbeat further ahead than that", () => {
    const view = shell(14, 10).nodes.find((node) => node.componentId === "monitor");
    expect(view?.aheadOfClock).toBe(true);
  });
});
