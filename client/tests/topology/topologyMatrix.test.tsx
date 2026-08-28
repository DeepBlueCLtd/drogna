/**
 * The matrix as rendered: forbidden visibly distinct, quiet honestly quiet, lit only by
 * arrivals, and the inspector reused rather than reimplemented.
 *
 * The rendering assertions are on the markup's own claims about itself — the data
 * attributes each row and cell publish — and the reuse assertion is structural: the
 * matrix's source imports the message inspector and contains no second implementation of
 * its panel, which is the form of "not a duplicate" that survives refactoring (spec 018
 * US3 scenario 4).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import type { LoopState } from "../../src/data/controlSubscription";
import { TopologyMatrix } from "../../src/topology/TopologyMatrix";

function render(loop: LoopState): string {
  return renderToStaticMarkup(<TopologyMatrix loop={loop} standardsUrl={undefined} />);
}

describe("an empty page's matrix", () => {
  const markup = render(emptyLoop());

  it("draws every declared topic row, quiet and unlit", () => {
    expect(markup).toContain('data-testid="topology-row-ctl/divergence"');
    expect(markup).toContain('data-testid="topology-row-obs/#"');
    expect(markup).not.toContain('data-lit="true"');
    expect(markup.match(/quiet since load/g)?.length).toBeGreaterThan(5);
  });

  it("renders the forbidden region distinctly, and says what it is", () => {
    expect(markup).toContain('data-testid="topology-cell-ctl/plan-sensors"');
    const sensorsOnPlan = markup.slice(
      markup.indexOf('data-testid="topology-cell-ctl/plan-sensors"') - 200,
      markup.indexOf('data-testid="topology-cell-ctl/plan-sensors"') + 200,
    );
    expect(sensorsOnPlan).toContain("topology-forbidden");
    expect(sensorsOnPlan).toContain('data-forbidden="true"');
    expect(markup).toContain("refused by the access control list");
    expect(markup).toContain("the broker\ndenies by default".replace("\n", " "));
  });

  it("says structure comes from the artefact and lighting from received traffic", () => {
    expect(markup).toContain("scripts/scan_topology.py");
    expect(markup).toContain("permissions");
    expect(markup).toContain("lights only when a message genuinely arrives");
  });

  it("shows no undeclared region while nothing undeclared has been heard", () => {
    expect(markup).not.toContain("topology-undeclared");
  });
});

describe("a matrix over received traffic", () => {
  it("lights exactly the row whose topic the arrival fell under", () => {
    const loop = receiveControl(emptyLoop(), "ctl/divergence", "{}");
    const markup = render(loop);
    const litRow = markup.slice(
      markup.indexOf('data-testid="topology-row-ctl/divergence"') - 120,
      markup.indexOf('data-testid="topology-heard-ctl/divergence"') + 120,
    );
    expect(litRow).toContain('data-lit="true"');
    expect(litRow).toContain("1 received");
    const planRow = markup.slice(
      markup.indexOf('data-testid="topology-row-ctl/plan"') - 120,
      markup.indexOf('data-testid="topology-heard-ctl/plan"') + 120,
    );
    expect(planRow).toContain('data-lit="false"');
    expect(planRow).toContain("quiet since load");
  });

  it("surfaces an undeclared arrival in its own visibly distinct region", () => {
    const loop = receiveControl(emptyLoop(), "ctl/nothing-declares-this", "{}");
    const markup = render(loop);
    expect(markup).toContain('data-testid="topology-undeclared-ctl/nothing-declares-this"');
    expect(markup).toContain("a topic the artefact does not declare");
  });
});

describe("the inspector it opens", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../src/topology/TopologyMatrix.tsx", import.meta.url)),
    "utf8",
  );

  it("is the existing message inspector, imported, not a second implementation", () => {
    expect(source).toContain('from "../inspector/MessageInspector"');
    expect(source).toContain("<MessageInspector");
    // The give-aways of a duplicate: nothing here re-renders the inspector's own panel.
    expect(source).not.toContain("The message that just passed");
    expect(source).not.toContain("SchemaPanel");
  });

  it("offers the selection, and states what selecting will open", () => {
    const markup = render(emptyLoop());
    expect(markup).toContain('data-testid="topology-unselected"');
    expect(markup).toContain("message inspector");
  });
});
