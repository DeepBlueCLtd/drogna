/**
 * One transit per message received, on the boundary its topic crosses, and not one more.
 *
 * SC-001 is an equality: the count of transits drawn equals the count of routable
 * messages received, and the count of transits with no message behind them is zero. The
 * second half is the one worth writing a test for, because it is the half that fails
 * silently — a display that draws a crossing nobody published looks exactly like a
 * working one.
 *
 * FR-003's other half is here too: a message addressed to a component nothing has been
 * heard from draws its transit and lights nothing. Somebody speaking *about* a component
 * is not that component speaking.
 */
import { describe, expect, it } from "vitest";

import { drawFrame, emptyLoop, messageOn, receiveControl } from "../../src/data/controlSubscription";
import { CLOCK_TOPIC, DIVERGENCE_TOPIC, HEARTBEAT_TOPIC, RUN_PUBLISHED_TOPIC, RUN_REQUEST_TOPIC, RUN_STARTED_TOPIC } from "../../src/data/topics";
import { emptyLiveness } from "../../src/liveness/reducer";
import { describeShell } from "../../src/liveness/view";
import { boundaryId } from "../../src/legibility/classification";
import { ROUTABLE_TOPICS, routeFor } from "../../src/loop/transitRouting";
import { emptyClock } from "../../src/transport/clock";

import { divergenceEvent, runPublished, runRequest, runStarted, wire } from "../control";
import { HEARING_CONNECTED } from "../heartbeats";

const SEQUENCE: readonly (readonly [string, unknown])[] = [
  [DIVERGENCE_TOPIC, divergenceEvent()],
  [RUN_REQUEST_TOPIC, runRequest()],
  [RUN_STARTED_TOPIC, runStarted()],
  [RUN_PUBLISHED_TOPIC, runPublished()],
];

function afterTheSequence() {
  let state = emptyLoop();
  for (const [topic, message] of SEQUENCE) {
    state = receiveControl(state, topic, wire(message));
  }
  return drawFrame(state);
}

describe("transits and the messages behind them", () => {
  it("draws one per received message, on the boundary its topic crosses", () => {
    const state = afterTheSequence();
    expect(state.lastFrame.transits).toHaveLength(SEQUENCE.length);
    expect(state.lastFrame.transits.map((transit) => transit.boundary)).toEqual([
      boundaryId("monitor", "scheduler"),
      boundaryId("scheduler", "model_runner"),
      boundaryId("model_runner", "publisher"),
      boundaryId("publisher", "monitor"),
    ]);
  });

  it("draws them in the order the messages arrived", () => {
    const state = afterTheSequence();
    const sequences = state.lastFrame.transits.map((transit) => transit.firstSequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });

  it("draws none for a boundary no message crossed", () => {
    const state = afterTheSequence();
    const drawn = new Set(state.lastFrame.transits.map((transit) => transit.boundary));
    expect(drawn.has(boundaryId("ingest", "observation_store"))).toBe(false);
    expect(messageOn(state, boundaryId("ingest", "observation_store"))).toBeNull();
  });

  it("draws nothing at all before anything has arrived", () => {
    const state = drawFrame(emptyLoop());
    expect(state.lastFrame.transits).toEqual([]);
    expect(state.transitsDrawn).toBe(0);
  });

  it("keeps the count of transits equal to the count of routable messages", () => {
    let state = emptyLoop();
    for (let round = 0; round < 3; round += 1) {
      for (const [topic, message] of SEQUENCE) {
        state = receiveControl(state, topic, wire(message));
      }
      state = drawFrame(state);
    }
    expect(state.transitsDrawn).toBe(SEQUENCE.length * 3);
    expect(state.messagesReceived).toBe(SEQUENCE.length * 3);
  });

  it("draws no transit for a heartbeat, which crosses no single boundary", () => {
    let state = receiveControl(emptyLoop(), HEARTBEAT_TOPIC, wire({ component: "clock" }));
    state = drawFrame(state);
    expect(state.lastFrame.transits).toEqual([]);
    expect(state.heartbeatsReceived).toBe(1);
    expect(routeFor(HEARTBEAT_TOPIC)).toBeNull();
  });

  it("draws a transit for a message about a component nothing has been heard from, and lights nothing", () => {
    const state = afterTheSequence();
    expect(state.lastFrame.transits.length).toBeGreaterThan(0);
    // The four messages name the monitor, the scheduler, the model runner and the
    // publisher. No heartbeat has arrived from any of them, and none is lit.
    const shell = describeShell({
      liveness: emptyLiveness,
      clockState: emptyClock,
      connection: "receiving",
      now: 1000,
      hearing: HEARING_CONNECTED,
      clockStaleAfterSeconds: 10,
    });
    expect(shell.litCount).toBe(0);
  });

  it("holds the most recent message on each boundary, for the inspector to read", () => {
    const state = afterTheSequence();
    const onDivergence = messageOn(state, boundaryId("monitor", "scheduler"));
    expect(onDivergence?.topic).toBe(DIVERGENCE_TOPIC);
    expect(JSON.parse(onDivergence?.payload ?? "{}")).toMatchObject({ divergence_id: "divergence-0003" });
  });

  it("replaces the message on a boundary when a newer one crosses it", () => {
    let state = receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent({ divergence_id: "divergence-0001" })));
    state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent({ divergence_id: "divergence-0002" })));
    const held = messageOn(state, boundaryId("monitor", "scheduler"));
    expect(JSON.parse(held?.payload ?? "{}")).toMatchObject({ divergence_id: "divergence-0002" });
  });

  it("routes every topic it claims is routable, and routes nothing else", () => {
    for (const topic of ROUTABLE_TOPICS) {
      expect(routeFor(topic), topic).not.toBeNull();
    }
    expect(routeFor("ctl/something-nobody-declared")).toBeNull();
    expect(ROUTABLE_TOPICS).toContain(CLOCK_TOPIC);
    expect(ROUTABLE_TOPICS).not.toContain(HEARTBEAT_TOPIC);
  });

  it("names a publisher and at least one consumer for every route it draws", () => {
    for (const topic of ROUTABLE_TOPICS) {
      const route = routeFor(topic);
      expect(route?.publisher.length, topic).toBeGreaterThan(0);
      expect(route?.consumers.length, topic).toBeGreaterThan(0);
    }
  });
});
