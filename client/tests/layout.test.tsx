/**
 * The shell with nothing running.
 *
 * This is what a viewer sees on the first day and what SC-001 measures: the complete
 * layout, every box dark, the caption saying what the drawing is. The one box that is
 * not dark is the client's own, which is lit by its own presence and labelled as such,
 * because the page cannot hear itself over the broker and pretending otherwise would be
 * theatre.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CLIENT_COMPONENT_ID, COMPONENTS } from "../src/layout/components";
import { ComponentDiagram } from "../src/layout/ComponentDiagram";
import { emptyLiveness } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { emptyClock } from "../src/transport/clock";
import { HONESTY_STATEMENT } from "../src/ui/HonestyBanner";

import { HEARING_CONNECTED } from "./heartbeats";

const shell = describeShell({
  liveness: emptyLiveness,
  clockState: emptyClock,
  connection: "not-connected",
  now: 1000,
  hearing: HEARING_CONNECTED,
  clockStaleAfterSeconds: 10,
});

const markup = renderToStaticMarkup(<ComponentDiagram views={shell.nodes} />);

describe("the layout with nothing heard from", () => {
  it("draws every component in the SRD's component table", () => {
    expect(COMPONENTS).toHaveLength(18);
    for (const component of COMPONENTS) {
      expect(markup).toContain(`data-testid="component-node-${component.id}"`);
    }
  });

  it("carries a stable test identifier on every node and every status region", () => {
    const identifiers = [...markup.matchAll(/data-testid="component-node-([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(identifiers).size).toBe(COMPONENTS.length);
  });

  it("draws every component dark except the page's own box", () => {
    for (const view of shell.nodes) {
      const expected = view.componentId === CLIENT_COMPONENT_ID ? "self" : "dark";
      expect(view.illumination).toBe(expected);
    }
    expect(shell.litCount).toBe(0);
  });

  it("says what a dark box means, in the drawing itself", () => {
    expect(markup).toContain('data-testid="layout-disclaimer"');
    expect(markup).toContain("drawing of the intended architecture");
    expect(markup).toContain("not heard from");
  });

  it("distinguishes the states by words as well as by colour", () => {
    // A greyscale screenshot keeps the words and the marks; it does not keep the fill.
    expect(markup).toContain("heard from");
    expect(markup).toContain("○");
    expect(markup).toContain("this page");
  });

  it("keeps the honesty statement in the served document, not only in the bundle", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const document = await readFile(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
    const flattened = document.replace(/\s+/g, " ");
    expect(flattened).toContain(HONESTY_STATEMENT);
    // Before the mount point, so it is read whether or not the bundle ever loads.
    expect(flattened.indexOf(HONESTY_STATEMENT)).toBeLessThan(flattened.indexOf('id="root"'));
  });
});
