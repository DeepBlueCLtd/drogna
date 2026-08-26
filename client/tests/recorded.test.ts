/**
 * The messages feature 001 actually publishes, put through the client's own path.
 *
 * The two JSON documents beside this file are not invented. They were produced by
 * `harness_core`'s own `HeartbeatPublisher` and `ClockSamplePublisher` — the code the
 * clock service runs — and recorded verbatim. The point of the test is the sentence the
 * brief for this feature insists on: the client adopts the shape feature 001 publishes
 * rather than a shape of its own devising. If the two ever diverge, this fails, and it
 * fails on the real bytes rather than on a paraphrase of them.
 *
 * A recorded message is not mocked traffic. Nothing in the built client can reach these
 * files, and no display is driven from them: they are inputs to a pure function, which
 * is what FR-023 permits in as many words.
 */
import { describe, expect, it } from "vitest";

import { interpret } from "../src/liveness/ingest";
import { emptyLiveness, receive } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { emptyClock, receiveClockSample } from "../src/transport/clock";

import { HEARING_CONNECTED, TOLERANCES } from "./heartbeats";
import recordedHeartbeat from "./recorded-heartbeat.json";
import recordedSample from "./recorded-clock-sample.json";

const ARRIVED = 1000;

function shellAfterTheClockSpoke(now: number) {
  const interpretation = interpret(recordedHeartbeat, ARRIVED, TOLERANCES);
  if (!interpretation.accepted) {
    throw new Error(`the clock's own heartbeat was refused: ${interpretation.reason}`);
  }
  return describeShell({
    liveness: receive(emptyLiveness, interpretation.evidence),
    clockState: receiveClockSample(emptyClock, recordedSample, ARRIVED),
    connection: "receiving",
    now,
    hearing: HEARING_CONNECTED,
    clockStaleAfterSeconds: 10,
  });
}

describe("the heartbeat feature 001 publishes", () => {
  it("passes the contract this client validates against", () => {
    expect(interpret(recordedHeartbeat, ARRIVED, TOLERANCES).accepted).toBe(true);
  });

  it("lights exactly one node, and it is the simulation clock", () => {
    const shell = shellAfterTheClockSpoke(ARRIVED + 1_000);
    const lit = shell.nodes.filter((node) => node.illumination === "lit");
    expect(lit.map((node) => node.componentId)).toEqual(["clock"]);
    expect(shell.litCount).toBe(1);
    expect(shell.unmapped).toEqual([]);
  });

  it("carries the reported status through to the display", () => {
    const clock = shellAfterTheClockSpoke(ARRIVED).nodes.find((node) => node.componentId === "clock");
    expect(clock?.reported?.status).toBe("ok");
    expect(clock?.reported?.tick).toBe(42);
  });

  it("declares no window of its own yet, so the receiver's tolerance applies", () => {
    const clock = shellAfterTheClockSpoke(ARRIVED).nodes.find((node) => node.componentId === "clock");
    expect(clock?.windowDeclared).toBe(false);
    expect(clock?.windowSeconds).toBe(TOLERANCES.defaultWindowSeconds);
  });

  it("goes dark once its window has passed, with no other input", () => {
    const shell = shellAfterTheClockSpoke(ARRIVED + 16_000);
    expect(shell.litCount).toBe(0);
  });
});

describe("the time sample feature 001 publishes", () => {
  it("passes the contract and reaches the display", () => {
    const shell = shellAfterTheClockSpoke(ARRIVED + 1_000);
    expect(shell.clock.display).toBe("running");
    expect(shell.clock.sample?.tick).toBe(42);
    expect(shell.clock.sample?.mode).toBe("accelerated");
    expect(shell.clock.discarded).toBe(0);
  });
});
