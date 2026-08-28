/**
 * The picture is the loop.
 *
 * SRD 2 asks for a flow chart with a loop in it rather than a structural diagram,
 * because the architecture's interesting property is temporal. A test can hold the loop
 * closed even though it cannot judge whether the drawing reads well, and it can hold the
 * bespoke-or-plumbing claim honest against SRD 2.2 — which matters more, because that
 * claim is about how little of this system is novel.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMPONENTS, COMPONENTS_BY_ID, EDGES } from "../src/layout/components";
import { ComponentDiagram } from "../src/layout/ComponentDiagram";
import { boxFor } from "../src/layout/geometry";
import { emptyLiveness } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { emptyClock } from "../src/transport/clock";

import { HEARING_CONNECTED } from "./heartbeats";

const views = describeShell({
  liveness: emptyLiveness,
  clockState: emptyClock,
  connection: "not-connected",
  now: 1000,
  hearing: HEARING_CONNECTED,
  clockStaleAfterSeconds: 10,
}).nodes;

describe("the control loop", () => {
  it("is drawn as a closed cycle through monitor, scheduler, model runner and publisher", () => {
    const loop = EDGES.filter((edge) => edge.loop === true);
    expect(loop).toHaveLength(4);
    const cycle: string[] = ["monitor"];
    for (let step = 0; step < loop.length; step += 1) {
      const current = cycle[cycle.length - 1];
      const next = loop.find((edge) => edge.from === current);
      expect(next, `no loop edge leaves ${current}`).toBeDefined();
      cycle.push(next!.to);
    }
    expect(cycle).toEqual(["monitor", "scheduler", "model_runner", "publisher", "monitor"]);
  });

  it("indicates direction, so the cycle reads as a cycle", () => {
    const markup = renderToStaticMarkup(<ComponentDiagram views={views} />);
    expect(markup).toContain('marker-end="url(#arrow)"');
    expect(markup).toContain('class="edge loop"');
  });
});

describe("bespoke and plumbing", () => {
  it("claims nothing as bespoke that is a broker, a store, a proxy or the query layer", () => {
    const plumbing = ["broker", "observation_store", "feature_store", "coverage_store", "advisory_store", "query_layer", "proxy"];
    for (const id of plumbing) {
      expect(COMPONENTS_BY_ID.get(id)?.kind).toBe("plumbing");
    }
  });

  it("marks the components that hold the mathematics and the rules", () => {
    const bespoke = ["monitor", "scheduler", "model_runner", "planner", "telemetry", "env_generator"];
    for (const id of bespoke) {
      expect(COMPONENTS_BY_ID.get(id)?.kind).toBe("bespoke");
    }
  });

  it("states the convention in words, in a legend", () => {
    const markup = renderToStaticMarkup(<ComponentDiagram views={views} />);
    expect(markup).toContain('data-testid="legend"');
    expect(markup).toContain("Bespoke:");
    expect(markup).toContain("Plumbing:");
  });
});

describe("the drawing itself", () => {
  it("joins components that exist in the layout", () => {
    for (const edge of EDGES) {
      expect(COMPONENTS_BY_ID.has(edge.from), `${edge.from} is not in the layout`).toBe(true);
      expect(COMPONENTS_BY_ID.has(edge.to), `${edge.to} is not in the layout`).toBe(true);
    }
  });

  it("gives every component its own cell, so no two boxes overlap", () => {
    const cells = COMPONENTS.map((node) => `${node.column},${node.row}`);
    expect(new Set(cells).size).toBe(COMPONENTS.length);
  });

  it("places every box inside the canvas", () => {
    for (const node of COMPONENTS) {
      const box = boxFor(node);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every component a unique id and an SRD reference", () => {
    expect(new Set(COMPONENTS.map((node) => node.id)).size).toBe(COMPONENTS.length);
    expect(new Set(COMPONENTS.map((node) => node.reference)).size).toBe(COMPONENTS.length);
  });
});
