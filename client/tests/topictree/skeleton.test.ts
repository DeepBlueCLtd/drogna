/**
 * The declared skeleton: whole, cold, and derived (022 FR-001, FR-006).
 *
 * The construction tests run against `contracts/topology.json` itself, imported the way
 * the panel imports it, so the skeleton asserted here is the skeleton a visitor sees
 * and it cannot drift from the artefact. The tier tests use small constructed documents
 * where a state the running topology cannot produce (an uncovered topic) has to be
 * exercised anyway — feeding constructed values to a pure function is testing a
 * function.
 */
import { describe, expect, it } from "vitest";

import type { DrognaBrokerTopology } from "../../src/generated/messages/topology";
import { buildSkeleton, classify, withGrafts } from "../../src/topictree/skeleton";
import type { TreeNode } from "../../src/topictree/skeleton";
import { TOPOLOGY } from "../../src/topictree/topology";

function paths(node: TreeNode): string[] {
  return [node.path, ...node.children.flatMap(paths)];
}

function find(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) {
    return node;
  }
  for (const child of node.children) {
    const found = find(child, path);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

describe("the skeleton, from the artefact itself", () => {
  const skeleton = buildSkeleton(TOPOLOGY);

  it("draws every concrete declared topic before anything has spoken", () => {
    const drawn = new Set(paths(skeleton.root));
    for (const entry of TOPOLOGY.topics) {
      if (entry.topic.includes("#") || entry.topic.includes("+")) {
        continue;
      }
      expect(drawn.has(entry.topic), `${entry.topic} missing from the cold skeleton`).toBe(true);
    }
  });

  it("draws the configured observation leaves the derivation expanded", () => {
    // The concrete obs/<thing>/<datastream> rows come from the deployed sensor
    // configuration through the scanner (022 FR-001); the tree must show them cold.
    const observation = find(skeleton.root, "obs");
    expect(observation).not.toBeNull();
    expect(observation?.declaresBranch).toBe(true);
    const leaves = TOPOLOGY.topics.filter(
      (entry) => entry.namespace === "obs" && !entry.topic.includes("#"),
    );
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      const node = find(skeleton.root, leaf.topic);
      expect(node, `${leaf.topic} not drawn`).not.toBeNull();
      expect(node?.tier).toBe("declared");
      expect(node?.schema).toBe(leaf.schema);
    }
  });

  it("gives every declared role a column entry with its filters and components", () => {
    expect(skeleton.roles.map((role) => role.role)).toEqual(
      TOPOLOGY.roles.map((role) => role.role),
    );
    const observer = skeleton.roles.find((role) => role.role === "drogna_observer");
    expect(observer?.rules).toEqual([
      { access: "read", filter: "obs/#" },
      { access: "read", filter: "ctl/#" },
    ]);
    const viewer = skeleton.roles.find((role) => role.role === "drogna_viewer");
    // The artefact records which components authenticate as which role; the column
    // repeats it, and the client now authenticates as the observer (ADR-0027).
    expect(observer?.components).toContain("client");
    expect(viewer?.components).not.toContain("client");
  });

  it("lends a branch declaration's master to topics under it, stated as inherited", () => {
    const clock = find(skeleton.root, "ctl/clock");
    expect(clock?.schema).toBe("contracts/schemas/clock.schema.json");
    expect(clock?.schemaInherited).toBe(false);

    const configured = find(skeleton.root, "obs/platform-a/ds-temperature");
    // The row carries its own master (the branch's), so nothing is inherited here;
    // inheritance is for grafted topics, asserted below.
    expect(configured?.schema).toBe("contracts/schemas/observation.schema.json");
  });
});

/** A minimal document for the states the live topology cannot produce. */
const NARROW: DrognaBrokerTopology = {
  generator: "scripts/scan_topology.py",
  roles: [
    {
      role: "probe_reader",
      rules: [{ access: "read", filter: "obs/#" }],
    },
  ],
  components: [],
  topics: [
    {
      topic: "obs/#",
      namespace: "obs",
      schema: "contracts/schemas/observation.schema.json",
      publishers: [],
      subscribers: [],
      named_by: [],
    },
    {
      topic: "obs/rig/ds-known",
      namespace: "obs",
      schema: "contracts/schemas/observation.schema.json",
      publishers: [],
      subscribers: [],
      named_by: [],
    },
  ],
};

describe("the three tiers (FR-006)", () => {
  const skeleton = buildSkeleton(NARROW);

  it("calls a rowed topic declared", () => {
    expect(classify("obs/rig/ds-known", skeleton, NARROW)).toBe("declared");
  });

  it("calls a covered but unrowed topic observed-under-declaration", () => {
    expect(classify("obs/rig/ds-unnamed", skeleton, NARROW)).toBe("observed-under-declaration");
  });

  it("calls an uncovered topic undeclared", () => {
    expect(classify("rogue/topic", skeleton, NARROW)).toBe("undeclared");
  });

  it("grafts a heard topic where its segments place it, marked with its tier", () => {
    const grafted = withGrafts(
      skeleton.root,
      new Map([
        ["obs/rig/ds-unnamed", "observed-under-declaration"],
        ["rogue/topic", "undeclared"],
      ]),
    );
    const observed = find(grafted, "obs/rig/ds-unnamed");
    expect(observed?.tier).toBe("observed-under-declaration");
    // The graft inherits the covering branch's master, stated as inherited.
    expect(observed?.schema).toBe("contracts/schemas/observation.schema.json");
    expect(observed?.schemaInherited).toBe(true);
    const rogue = find(grafted, "rogue/topic");
    expect(rogue?.tier).toBe("undeclared");
    // A graft never rewrites the declared structure.
    expect(find(grafted, "obs/rig/ds-known")?.tier).toBe("declared");
  });

  it("changes nothing when nothing was grafted", () => {
    expect(withGrafts(skeleton.root, new Map())).toBe(skeleton.root);
  });
});
