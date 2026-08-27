/**
 * Classification changes appearance. Only liveness changes illumination.
 *
 * FR-018 and SC-007. The failure it guards against is subtle and attractive: a display
 * that knows a component is bespoke core, and lets that knowledge lean on the picture —
 * a brighter box, a default of "probably running", a legend entry that reads as presence.
 * Every one of those is Constitution VII's failure wearing a different coat, so the test
 * below removes the heartbeat from a bespoke component and asserts it greys out exactly
 * as a plumbing component does.
 *
 * FR-017's half is here too: each named item appears against the component that owns it,
 * spelled out rather than asserted.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMPONENTS_BY_ID } from "../../src/layout/components";
import { BespokeDetail } from "../../src/legibility/BespokeDetail";
import { CONCERN_WORDS, concernsFor } from "../../src/legibility/classification";
import type { Illumination } from "../../src/liveness/types";

function draw(componentId: string, illumination: Illumination): string {
  const component = COMPONENTS_BY_ID.get(componentId);
  if (component === undefined) {
    throw new Error(`${componentId} is not in the layout`);
  }
  return renderToStaticMarkup(
    <BespokeDetail
      componentId={component.id}
      name={component.name}
      kind={component.kind}
      illumination={illumination}
    />,
  );
}

describe("a bespoke component's detail", () => {
  it("names the logic that makes it bespoke, rather than asserting bespokeness", () => {
    const markup = draw("monitor", "lit");
    expect(markup).toContain(CONCERN_WORDS["residual-and-divergence-rules"]);
    expect(markup).toContain('data-kind="bespoke"');
  });

  it("names each item SRD §2.2 lists against the component that owns it", () => {
    const owners = [
      ["monitor", "residual-and-divergence-rules"],
      ["scheduler", "scheduling-policy"],
      ["sensors", "sound-speed-computation"],
      ["telemetry", "quality-flagging"],
      ["model_runner", "uncertainty-mathematics"],
      ["planner", "planning-mathematics"],
      ["ingest", "executable-data-dictionary"],
    ] as const;
    for (const [componentId, concern] of owners) {
      expect(concernsFor(componentId), componentId).toContain(concern);
      expect(draw(componentId, "dark"), componentId).toContain(`data-concern="${concern}"`);
    }
  });

  it("claims nothing novel for a component that is a standard part", () => {
    const markup = draw("broker", "lit");
    expect(markup).toContain('data-kind="plumbing"');
    expect(markup).toContain('data-testid="plumbing-note-broker"');
    expect(markup).toContain("Chosen, not invented");
  });
});

describe("classification against illumination", () => {
  it("greys a bespoke component out when its heartbeat stops, exactly as any other", () => {
    for (const componentId of ["monitor", "broker"]) {
      const lit = draw(componentId, "lit");
      const dark = draw(componentId, "dark");
      expect(lit, componentId).toContain('data-illumination="lit"');
      expect(dark, componentId).toContain('data-illumination="dark"');
      expect(dark, componentId).toContain("not heard from");
    }
  });

  it("keeps the classification identical whatever the illumination is", () => {
    const kinds = (["lit", "dark", "indeterminate", "self"] as const).map((illumination) => {
      const markup = draw("monitor", illumination);
      return /data-kind="(\w+)"/.exec(markup)?.[1];
    });
    expect(new Set(kinds)).toEqual(new Set(["bespoke"]));
  });

  it("keeps the illumination independent of the classification", () => {
    // Same illumination, two classifications: the illumination markers agree.
    const bespoke = /data-illumination="(\w+)"/.exec(draw("monitor", "dark"))?.[1];
    const plumbing = /data-illumination="(\w+)"/.exec(draw("broker", "dark"))?.[1];
    expect(bespoke).toBe(plumbing);
  });

  it("says in words that the classification is not the evidence", () => {
    expect(draw("monitor", "dark")).toContain("only a heartbeat says whether it");
  });

  it("takes the illumination as a prop, so there is nothing here to derive it from", () => {
    // The structural half: the component's only route to an illumination is the caller's.
    expect(BespokeDetail.length).toBe(1);
  });
});
