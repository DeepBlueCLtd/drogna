/**
 * The readiness check observes the page without changing it.
 *
 * This guards a fault that cost a whole CI round and surfaced three files from its cause.
 * `settled()` decides the page has stopped changing by comparing its markup between
 * animation frames, with the elements that move on their own held aside. It used to do
 * that by blanking each held-aside element's `innerHTML` on the live page and putting it
 * back afterwards — a mutation of a running application's DOM, taken in order to observe
 * it.
 *
 * React owns that DOM. Emptying a subtree it rendered and re-inserting a *string* of the
 * same shape leaves its fibres pointing at nodes that are no longer in the document, so
 * every later render writes into detached nodes or throws while removing a child that has
 * already gone. On the shell's four small text spans that never surfaced. On feature 022's
 * topic tree — keyed children, conditional branches, an SVG — it broke the client outright:
 * the page stopped updating, and what the pair check reported was the *speed control*
 * never acknowledging a pin.
 *
 * The property is therefore structural and this test is a source reading, in the manner of
 * `client/tests/no-mock.test.ts`: the only way to check that something does not happen is
 * to look. A measurement taken from a copy cannot disturb what it measures, whatever the
 * page is built with.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const readiness = readFileSync(
  fileURLToPath(new URL("../shared/readiness.ts", import.meta.url)),
  "utf8",
);

/** The body of `markup()`, which is the function that does the observing. */
function markupBody(): string {
  const opened = readiness.indexOf("const markup = ()");
  expect(opened, "readiness.ts no longer defines markup()").toBeGreaterThan(-1);
  const closed = readiness.indexOf("\n      };", opened);
  expect(closed, "markup() no longer ends where this test expects").toBeGreaterThan(opened);
  return readiness.slice(opened, closed);
}

describe("the settle check's markup reading", () => {
  it("takes its copy before touching anything", () => {
    expect(markupBody()).toMatch(/cloneNode\(\s*true\s*\)/);
  });

  it("never writes to the live document", () => {
    const body = markupBody();
    // Blanking held-aside content is fine — on the copy. What must never appear is a
    // write reached through `document`, which is the page the client is rendering into.
    const writesToLiveDocument = /document\s*\.\s*querySelector(All)?\([^)]*\)[\s\S]{0,80}?\.innerHTML\s*=/;
    expect(writesToLiveDocument.test(body), body).toBe(false);
    expect(/\bdocument\.body\.innerHTML\s*=/.test(body)).toBe(false);
  });

  it("still holds the moving elements aside, or it would never settle", () => {
    // The other half of the property: measuring from a copy is only correct if the copy
    // is still stripped of what moves on its own, or a running stack could never settle.
    expect(markupBody()).toMatch(/for \(const selector of advancing\)/);
    expect(markupBody()).toMatch(/innerHTML = ""/);
  });
});
