/**
 * Wildcard filter matching, and SC-003's exactness claim.
 *
 * The role tables below are asserted against `contracts/topology.json` itself, through
 * the same build-time import the panel uses — never against a copy that could drift
 * from it. If the topology changes, these tests change with it or fail, which is the
 * point: the panel's answer to "who is connected to this topic" and the artefact's must
 * be the same answer.
 */
import { describe, expect, it } from "vitest";

import { coveringFilters, isCovered, topicMatches } from "../../src/topictree/match";
import { TOPOLOGY } from "../../src/topictree/topology";

describe("topicMatches", () => {
  // The same table `scripts/tests/test_topology_scan.py` holds against the scanner's
  // implementation, which is the only cross-language hold available for behaviour.
  const table: readonly (readonly [string, string, boolean])[] = [
    ["ctl/#", "ctl/divergence", true],
    ["ctl/#", "obs/thing/stream", false],
    ["obs/#", "obs/#", true],
    ["obs/#", "obs/platform-a/ds-temperature", true],
    ["obs/+/pressure", "obs/platform/pressure", true],
    ["obs/+/pressure", "obs/platform/depth/pressure", false],
    ["ctl/clock", "ctl/clocks", false],
    ["ctl/telemetry", "ctl/telemetry/ingest", false],
    ["ctl/clock", "ctl/clock", true],
    ["#", "anything/at/all", true],
  ];

  it.each(table)("%s against %s -> %s", (filter, topic, expected) => {
    expect(topicMatches(filter, topic)).toBe(expected);
  });
});

describe("the roles the panel names, against the artefact itself (SC-003)", () => {
  it("connects an observation topic to every covering role and no other", () => {
    const covering = coveringFilters("obs/platform-a/ds-temperature", TOPOLOGY.roles);
    const byRole = new Map(covering.map((entry) => [entry.role, entry]));

    // Exactly the roles whose declared filters match under broker semantics. The
    // expectation is written out so a topology change is a visible diff here, and the
    // values are checked against the document, not retyped from it.
    expect([...byRole.keys()].sort()).toEqual([
      "drogna_control",
      "drogna_ingest",
      "drogna_observer",
      "drogna_sensor",
    ]);
    expect(byRole.get("drogna_sensor")?.access).toBe("write");
    expect(byRole.get("drogna_observer")?.access).toBe("read");

    // No matching role is omitted and none invented: recompute from the document.
    for (const role of TOPOLOGY.roles) {
      const matches = role.rules.some((rule) =>
        topicMatches(rule.filter, "obs/platform-a/ds-temperature"),
      );
      expect(byRole.has(role.role)).toBe(matches);
    }
  });

  it("keeps the viewer out of the observation branch and in the control branch", () => {
    const observation = coveringFilters("obs/platform-a/ds-salinity", TOPOLOGY.roles);
    expect(observation.some((entry) => entry.role === "drogna_viewer")).toBe(false);

    const control = coveringFilters("ctl/heartbeat", TOPOLOGY.roles);
    expect(control.some((entry) => entry.role === "drogna_viewer")).toBe(true);
  });

  it("answers every artefact topic without omission, by construction", () => {
    for (const entry of TOPOLOGY.topics) {
      const covering = coveringFilters(entry.topic, TOPOLOGY.roles);
      for (const role of TOPOLOGY.roles) {
        const expected = role.rules.some((rule) => topicMatches(rule.filter, entry.topic));
        expect(covering.some((found) => found.role === role.role)).toBe(expected);
      }
    }
  });
});

describe("isCovered", () => {
  it("covers both namespaces under the declared filters and nothing outside them", () => {
    expect(isCovered("obs/anything/else", TOPOLOGY.roles)).toBe(true);
    expect(isCovered("ctl/anything", TOPOLOGY.roles)).toBe(true);
    expect(isCovered("weird/topic", TOPOLOGY.roles)).toBe(false);
  });
});
