/**
 * The hand-written routing table, checked against the enforced layer (018 T029).
 *
 * `loop/transitRouting.ts` names, per topic, the component that publishes it and the
 * components that read it. Those names cannot be *derived* from the topology artefact —
 * its permission layer is deliberately coarse and its `named_by` layer deliberately
 * direction-blind, and the routing file records why it therefore stays hand-written —
 * but every one of them can be *checked*: a publisher the access control list would
 * refuse to accept a publish from, or a consumer it would refuse a subscription to, is a
 * routing claim about traffic the broker would never carry. This test is what turned the
 * table from an unchecked list into a checked one.
 *
 * Watched failing against a routing table with the divergence publisher misnamed as the
 * `query` component (whose role may publish nothing but heartbeat); the permission
 * assertion named the topic and the component. Reverted.
 */
import { describe, expect, it } from "vitest";

import { ROUTES_BY_TOPIC } from "../../src/loop/transitRouting";
import { TOPOLOGY } from "../../src/topology/artefact";
import { filterMatches } from "../../src/topology/matrix";

function rules(component: string): readonly { access: string; filter: string }[] {
  const identity = TOPOLOGY.components.find((candidate) => candidate.id === component);
  expect(identity, `${component} holds no broker identity in the artefact`).toBeDefined();
  const role = TOPOLOGY.roles.find((candidate) => candidate.role === identity?.role);
  expect(role, `${identity?.role} is not in the access control list`).toBeDefined();
  return role?.rules ?? [];
}

function mayPublish(component: string, topic: string): boolean {
  return rules(component).some(
    (rule) => (rule.access === "write" || rule.access === "readwrite") && filterMatches(rule.filter, topic),
  );
}

function maySubscribe(component: string, topic: string): boolean {
  return rules(component).some(
    (rule) => (rule.access === "read" || rule.access === "readwrite") && filterMatches(rule.filter, topic),
  );
}

describe("every routing claim against the access control list", () => {
  it("names publishers the broker would accept a publish from", () => {
    for (const [topic, route] of ROUTES_BY_TOPIC) {
      expect(
        mayPublish(route.publisher, topic),
        `${route.publisher} is routed as ${topic}'s publisher and the list refuses it`,
      ).toBe(true);
    }
  });

  it("names consumers the broker would accept a subscription from", () => {
    for (const [topic, route] of ROUTES_BY_TOPIC) {
      for (const consumer of route.consumers) {
        expect(
          maySubscribe(consumer, topic),
          `${consumer} is routed as a reader of ${topic} and the list refuses it`,
        ).toBe(true);
      }
    }
  });

  it("routes only topics the artefact declares", () => {
    for (const topic of ROUTES_BY_TOPIC.keys()) {
      expect(
        TOPOLOGY.topics.some((entry) => entry.topic === topic),
        `${topic} is routed and the artefact does not declare it`,
      ).toBe(true);
    }
  });
});
