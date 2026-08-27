/**
 * Sense, decide, act, publish — traversed in that order, by the messages themselves.
 *
 * The four control messages of a run map onto SRD §2's four phases one for one, and the
 * cycle view's only input is which of them arrived. Nothing here infers a phase from
 * another phase: FR-003 forbids concluding that a message was sent because a later one
 * was, and the test for that is the one below where the request is never published and
 * `decide` is never reached.
 *
 * A message the contract refuses draws its transit and does not move the phase. A payload
 * the schema has just said is not what it appears to be has no business asserting where
 * the loop has got to.
 */
import { describe, expect, it } from "vitest";

import { emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import { DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC, RUN_REQUEST_TOPIC, RUN_STARTED_TOPIC, RUN_TOPICS } from "../../src/data/topics";
import { CYCLE_PHASES, PHASE_WORDS, phaseFor } from "../../src/loop/transitRouting";

import { divergenceEvent, runPublished, runRequest, runStarted, wire } from "../control";

describe("the cycle", () => {
  it("maps each of the four run messages onto one phase, in order", () => {
    expect(RUN_TOPICS.map(phaseFor)).toEqual(CYCLE_PHASES);
  });

  it("becomes active phase by phase as the messages arrive", () => {
    let state = emptyLoop();
    const reached: (string | null)[] = [state.phase];
    state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent()));
    reached.push(state.phase);
    state = receiveControl(state, RUN_REQUEST_TOPIC, wire(runRequest()));
    reached.push(state.phase);
    state = receiveControl(state, RUN_STARTED_TOPIC, wire(runStarted()));
    reached.push(state.phase);
    state = receiveControl(state, RUN_PUBLISHED_TOPIC, wire(runPublished()));
    reached.push(state.phase);
    expect(reached).toEqual([null, "sense", "decide", "act", "publish"]);
  });

  it("accumulates the phases reached for one run identifier", () => {
    let state = emptyLoop();
    state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent()));
    state = receiveControl(state, RUN_REQUEST_TOPIC, wire(runRequest()));
    state = receiveControl(state, RUN_STARTED_TOPIC, wire(runStarted()));
    state = receiveControl(state, RUN_PUBLISHED_TOPIC, wire(runPublished()));
    expect(state.reached).toEqual(["sense", "decide", "act", "publish"]);
    expect(state.runId).toBe("run-0007");
  });

  it("starts the sequence again when the run identifier changes", () => {
    let state = emptyLoop();
    state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent()));
    state = receiveControl(state, RUN_REQUEST_TOPIC, wire(runRequest()));
    state = receiveControl(state, RUN_STARTED_TOPIC, wire(runStarted({ run_id: "run-0008" })));
    expect(state.runId).toBe("run-0008");
    expect(state.reached).toEqual(["act"]);
  });

  it("never infers a phase from a later message", () => {
    // The request is not published. `decide` is never reached, even though `act` is.
    let state = emptyLoop();
    state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent()));
    state = receiveControl(state, RUN_STARTED_TOPIC, wire(runStarted()));
    expect(state.reached).not.toContain("decide");
  });

  it("draws a refused message and refuses to let it move the phase", () => {
    let state = receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent()));
    const before = state.phase;
    state = receiveControl(state, RUN_REQUEST_TOPIC, wire({ component: "scheduler" }));
    expect(state.phase).toBe(before);
    expect(state.refused).toBe(1);
    expect(state.lastRefusal).not.toBeNull();
    expect(state.pending).toHaveLength(2);
  });

  it("leaves the phase alone for a message on a topic that marks none", () => {
    let state = receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent()));
    state = receiveControl(state, "ctl/clock", wire({ tick: 1 }));
    expect(state.phase).toBe("sense");
    expect(state.refused).toBe(0);
  });

  it("says what each phase means, so the picture does not assume the reader knows", () => {
    for (const phase of CYCLE_PHASES) {
      expect(PHASE_WORDS[phase].length, phase).toBeGreaterThan(30);
    }
  });
});
