/**
 * Structure from the artefact, lighting from received traffic, and no third source.
 *
 * SC-004's two halves, asserted separately. The structural claims the access control
 * list argues for at length — sensors confined to the observation branch, the query
 * layer permitted to say nothing but its own heartbeat, this page's identity permitted
 * to publish nowhere — are read out of the derived matrix, the same claims
 * `tests/unit/test_topology_artefact.py` reads out of the artefact itself, so the two
 * ends of the chain cannot quietly diverge. Lighting is asserted to be a fold over the
 * loop state's buffers, whose only entry is a received message.
 *
 * Watched failing: the filter matcher against a version that treated `#` as matching a
 * single level (obs/one/two stopped matching obs/#), and the undeclared case against a
 * version that dropped unmatched topics instead of returning them. Both reverted.
 */
import { describe, expect, it } from "vitest";

import { emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import { TOPOLOGY } from "../../src/topology/artefact";
import { filterMatches, matrixRows, matrixTraffic, trafficFor } from "../../src/topology/matrix";

const ROWS = matrixRows(TOPOLOGY);

function row(topic: string) {
  const found = ROWS.find((candidate) => candidate.topic.topic === topic);
  if (found === undefined) {
    throw new Error(`the artefact declares no ${topic}`);
  }
  return found;
}

function cell(topic: string, component: string) {
  const found = row(topic).cells.find((candidate) => candidate.component === component);
  if (found === undefined) {
    throw new Error(`the artefact knows no component ${component}`);
  }
  return found;
}

describe("the MQTT filter matcher", () => {
  it("matches the multi-level wildcard against any depth, including the parent", () => {
    expect(filterMatches("obs/#", "obs/site-a/temperature")).toBe(true);
    expect(filterMatches("obs/#", "obs/one/two/three")).toBe(true);
    expect(filterMatches("obs/#", "obs")).toBe(true);
    expect(filterMatches("obs/#", "ctl/clock")).toBe(false);
  });

  it("matches the single-level wildcard against exactly one level", () => {
    expect(filterMatches("ctl/+", "ctl/clock")).toBe(true);
    expect(filterMatches("ctl/+", "ctl/run/started")).toBe(false);
    expect(filterMatches("ctl/+", "ctl")).toBe(false);
  });

  it("matches a literal filter only against itself", () => {
    expect(filterMatches("ctl/heartbeat", "ctl/heartbeat")).toBe(true);
    expect(filterMatches("ctl/heartbeat", "ctl/heartbeats")).toBe(false);
    expect(filterMatches("ctl/heartbeat", "ctl/heartbeat/extra")).toBe(false);
  });
});

describe("the structure, read from the artefact alone", () => {
  it("derives one row per declared topic and one cell per declared component", () => {
    expect(ROWS.length).toBe(TOPOLOGY.topics.length);
    for (const entry of ROWS) {
      expect(entry.cells.length).toBe(TOPOLOGY.components.length);
    }
  });

  it("confines the sensors to the observation branch on the publish side (ADR-0012)", () => {
    expect(cell("obs/#", "sensors").mayPublish).toBe(true);
    for (const topic of ["ctl/divergence", "ctl/run-request", "ctl/plan", "ctl/telemetry"]) {
      expect(cell(topic, "sensors").forbidden, topic).toBe(true);
    }
    // The two control topics the role is granted: its own heartbeat, and the clock.
    expect(cell("ctl/heartbeat", "sensors").mayPublish).toBe(true);
    expect(cell("ctl/clock", "sensors").maySubscribe).toBe(true);
  });

  it("permits the query layer nothing but its own heartbeat", () => {
    for (const entry of ROWS) {
      const queryCell = entry.cells.find((candidate) => candidate.component === "query");
      expect(queryCell?.mayPublish, entry.topic.topic).toBe(entry.topic.topic === "ctl/heartbeat");
      expect(queryCell?.maySubscribe, entry.topic.topic).toBe(false);
    }
  });

  it("permits this page to publish nowhere: the viewer identity is subscribe-only", () => {
    for (const entry of ROWS) {
      expect(cell(entry.topic.topic, "client").mayPublish, entry.topic.topic).toBe(false);
    }
  });

  it("marks the components whose own source names a topic, from named_by alone", () => {
    expect(cell("ctl/divergence", "monitor").namesIt).toBe(true);
    expect(cell("ctl/divergence", "scheduler").namesIt).toBe(true);
    expect(cell("ctl/divergence", "planner").namesIt).toBe(false);
  });
});

describe("lighting, from received traffic alone", () => {
  it("lights nothing at all over an empty loop state", () => {
    const traffic = matrixTraffic(TOPOLOGY, emptyLoop().buffers);
    expect(traffic.byRowTopic.size).toBe(0);
    expect(traffic.undeclared).toEqual([]);
    for (const entry of ROWS) {
      expect(trafficFor(traffic, entry.topic.topic).received).toBe(0);
    }
  });

  it("lights exactly the row a received message's topic falls under, with the count", () => {
    let state = emptyLoop();
    state = receiveControl(state, "ctl/divergence", "{}");
    state = receiveControl(state, "ctl/divergence", "{}");
    const traffic = matrixTraffic(TOPOLOGY, state.buffers);
    expect(trafficFor(traffic, "ctl/divergence").received).toBe(2);
    expect(trafficFor(traffic, "ctl/divergence").lastTopic).toBe("ctl/divergence");
    expect(trafficFor(traffic, "ctl/plan").received).toBe(0);
  });

  it("folds concrete observation topics under the branch filter's row", () => {
    const state = receiveControl(emptyLoop(), "obs/site-a/temperature", "{}");
    const traffic = matrixTraffic(TOPOLOGY, state.buffers);
    expect(trafficFor(traffic, "obs/#").received).toBe(1);
    expect(trafficFor(traffic, "obs/#").topics).toEqual(["obs/site-a/temperature"]);
    expect(traffic.undeclared).toEqual([]);
  });

  it("lights heartbeat traffic too: buffered on arrival even though it draws no transit", () => {
    const state = receiveControl(emptyLoop(), "ctl/heartbeat", "{}");
    expect(trafficFor(matrixTraffic(TOPOLOGY, state.buffers), "ctl/heartbeat").received).toBe(1);
  });

  it("surfaces traffic on an undeclared topic rather than dropping it (FR-012)", () => {
    const state = receiveControl(emptyLoop(), "ctl/nothing-declares-this", "{}");
    const traffic = matrixTraffic(TOPOLOGY, state.buffers);
    expect(traffic.undeclared).toEqual([{ topic: "ctl/nothing-declares-this", received: 1 }]);
    for (const entry of ROWS) {
      expect(trafficFor(traffic, entry.topic.topic).received).toBe(0);
    }
  });
});
