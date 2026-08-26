/**
 * The reducer: pure, and reachable by heartbeats only.
 *
 * The strongest guarantee here is one the tests cannot show directly, because it is
 * enforced by the compiler: `receive` takes evidence adapted from a validated heartbeat
 * and nothing else, so a configuration document cannot be passed to it at all. What is
 * shown here is that the state it produces depends on nothing but what was fed in, and
 * that folding the same heartbeat twice does not invent a second component.
 */
import { describe, expect, it } from "vitest";

import { interpret } from "../src/liveness/ingest";
import { discard, emptyLiveness, laterInSimulation, receive } from "../src/liveness/reducer";
import type { Evidence } from "../src/liveness/types";

import { heartbeat, TOLERANCES } from "./heartbeats";

function evidenceFrom(fields: Parameters<typeof heartbeat>[0], receivedAt: number): Evidence {
  const interpretation = interpret(heartbeat(fields), receivedAt, TOLERANCES);
  if (!interpretation.accepted) {
    throw new Error(`the fixture message was refused: ${interpretation.reason}`);
  }
  return interpretation.evidence;
}

describe("the liveness reducer", () => {
  it("starts knowing nothing", () => {
    expect(emptyLiveness.components.size).toBe(0);
    expect(emptyLiveness.discarded).toBe(0);
  });

  it("knows a component only once a heartbeat from it has arrived", () => {
    const state = receive(emptyLiveness, evidenceFrom({ component: "clock" }, 1000));
    expect([...state.components.keys()]).toEqual(["clock"]);
    expect(state.components.get("clock")?.heard).toBe(1);
  });

  it("does not mutate the state it is given", () => {
    const before = receive(emptyLiveness, evidenceFrom({ component: "clock" }, 1000));
    const after = receive(before, evidenceFrom({ component: "monitor" }, 2000));
    expect(before.components.size).toBe(1);
    expect(after.components.size).toBe(2);
  });

  it("counts a folded heartbeat rather than duplicating the component", () => {
    let state = receive(emptyLiveness, evidenceFrom({ tick: 1 }, 1000));
    state = receive(state, evidenceFrom({ tick: 2 }, 2000));
    expect(state.components.size).toBe(1);
    expect(state.components.get("clock")?.heard).toBe(2);
  });

  it("gives the same answer for the same inputs, whatever else exists", () => {
    const first = receive(emptyLiveness, evidenceFrom({}, 1000));
    const second = receive(emptyLiveness, evidenceFrom({}, 1000));
    expect(second.components.get("clock")).toEqual(first.components.get("clock"));
  });

  it("counts a discard without lighting anything", () => {
    const state = discard(emptyLiveness, "the message was refused");
    expect(state.discarded).toBe(1);
    expect(state.lastDiscardReason).toBe("the message was refused");
    expect(state.components.size).toBe(0);
  });

  it("prefers the greater tick when deciding what is later in simulation", () => {
    const early = evidenceFrom({ tick: 4 }, 1000);
    const late = evidenceFrom({ tick: 9 }, 900);
    expect(laterInSimulation(early, late)).toBe(late);
    expect(laterInSimulation(late, early)).toBe(late);
  });

  it("falls back to simulation time when a tick is absent", () => {
    const early = evidenceFrom({ tick: null, sim_time: "2026-08-26T00:00:01.000000Z" }, 1000);
    const late = evidenceFrom({ tick: null, sim_time: "2026-08-26T00:00:09.000000Z" }, 900);
    expect(laterInSimulation(early, late)).toBe(late);
  });

  it("records two publishers of one id as two identities", () => {
    let state = receive(emptyLiveness, evidenceFrom({ run_id: "run-0001" }, 1000));
    state = receive(state, evidenceFrom({ run_id: "run-0002" }, 1100));
    expect(state.components.get("clock")?.identities).toHaveLength(2);
  });
});
