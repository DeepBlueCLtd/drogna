/**
 * No capture mechanism can synthesise traffic or light a component.
 *
 * Constitution VII, extended to forbid mocked traffic outright, lands squarely on this
 * feature: populating a screenshot is exactly what it rules out, and a capture tool is
 * where the temptation is strongest, because the tool sits between the browser and the
 * network with everything it would need. Playwright hands you the means in one line —
 * `page.route` intercepts a request and answers it with whatever you like,
 * `addInitScript` puts code into the page before anything else runs, `setContent`
 * replaces the document altogether. Any of those could make a screenshot look busy, and
 * an image produced that way would assert the existence of something that does not
 * exist.
 *
 * So this reads the capture paths and says the means are not there. That is a blunt
 * instrument and the right one: the property is an absence, and the only way to check an
 * absence is to look. It is the same argument, over a different tree, as
 * `client/tests/no-mock.test.ts` makes about the client's own source.
 *
 * What a capture *may* do to the running system is one thing, and one thing only: ask the
 * clock for a rate through the control the client already offers a viewer under SRD FR-49.
 * That is a viewer action taken through a viewer's interface, it goes to the clock service
 * like any other request, and it cannot light anything. Everything else here reads.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { codeLines } from "./support/code";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const capturePaths = [
  join(repositoryRoot, "client", "e2e"),
  join(repositoryRoot, "scripts", "capture"),
];

/**
 * Two exclusions, and both are the same idea.
 *
 * The fixture tree contains no capture path: it is three files that exist to be rejected
 * by the separation test, and nothing in it runs. This file is the hunter rather than the
 * quarry — it necessarily spells out every construct it forbids, including in the control
 * below — and scanning it would find itself. That is the same exclusion the repository's
 * own constitution gates make for the same reason.
 */
const NOT_A_CAPTURE_PATH = [
  join(repositoryRoot, "client", "e2e", "tests", "fixtures"),
  join(repositoryRoot, "client", "e2e", "tests", "noSynthesisedTraffic.test.ts"),
];

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (NOT_A_CAPTURE_PATH.includes(path)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      found.push(...sources(path));
    } else if (/\.(mjs|ts|tsx)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * The means of synthesising traffic, and of asserting liveness directly.
 *
 * Named as the things they are rather than as a general prohibition on network code: each
 * one is a specific way to put something on the page that did not come from the running
 * system.
 */
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["intercepting a request and answering it", /\bpage\s*\.\s*route\s*\(/],
  ["fulfilling an intercepted request", /\.\s*fulfill\s*\(/],
  ["injecting code before the page runs", /\baddInitScript\s*\(/],
  ["replacing the document", /\bsetContent\s*\(/],
  ["a broker connection", /\bfrom\s+["']mqtt["']|\brequire\(["']mqtt["']\)/],
  ["publishing on a topic", /\bpublish\s*\(/],
  ["a message on the heartbeat topic", /ctl\/heartbeat|HEARTBEAT_TOPIC/],
  ["writing illumination onto the page", /data-illumination["']?\s*[,)]?\s*,\s*["']/],
  ["a demo mode", /\bdemo[\s_-]?mode\b/i],
  ["a fixture mode", /\bfixture[\s_-]?mode\b/i],
];

describe("the capture paths", () => {
  const files = capturePaths.flatMap((path) => sources(path));

  it("has source to read", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const [what, pattern] of FORBIDDEN) {
    it(`contains no way of ${what}`, () => {
      const offending = files
        .flatMap((path) =>
          codeLines(readFileSync(path, "utf8")).map(
            (line, index) => [path, index + 1, line] as const,
          ),
        )
        .filter(([, , line]) => pattern.test(line))
        .map(([path, number, line]) => `${relative(repositoryRoot, path)}:${number}: ${line.trim()}`);
      expect(
        offending,
        `a capture mechanism has a way of ${what}. Nothing in a captured image may have ` +
          "been put there by the capture: an image showing a lit component is evidence " +
          "that the component was alive, and it has to stay that way to be worth taking " +
          "(Constitution VII, FR-018).",
      ).toEqual([]);
    });
  }

  it("would notice: the patterns match the things they name", () => {
    // The control. Each pattern is handed a line it must catch, because a regular
    // expression that has stopped matching looks exactly like a clean tree.
    const samples: readonly string[] = [
      "await page.route('**/ctl/**', handler);",
      "await request.fulfill({ body });",
      "await page.addInitScript(() => {});",
      "await page.setContent('<main>lit</main>');",
      'import mqtt from "mqtt";',
      "client.publish(topic, payload);",
      "client.subscribe(['ctl/heartbeat']);",
      'node.setAttribute("data-illumination", "lit");',
      "if (demoMode) {",
      "const fixtureMode = true;",
    ];
    expect(samples).toHaveLength(FORBIDDEN.length);
    FORBIDDEN.forEach(([what, pattern], index) => {
      expect(pattern.test(samples[index] as string), `${what} was not caught`).toBe(true);
    });
  });
});

/**
 * The glance alters nothing, checked by reading rather than by trusting.
 *
 * FR-003 is the glance's whole character: it shows the system as it stands, including a
 * runaway loop the author is trying to see, and pinning the clock would change the very
 * thing being looked at. The glance spec asserts at run time that the rate in force was
 * the same before and after; this asserts at build time that the means of changing it is
 * not even in scope — `askForRate` is the one function in the shared library that writes
 * anything to the running system, and the glance does not import it.
 */
describe("the glance", () => {
  const glancePaths = [
    join(repositoryRoot, "client", "e2e", "specs", "glance.spec.ts"),
    join(repositoryRoot, "client", "e2e", "glance.config.ts"),
    join(repositoryRoot, "scripts", "capture", "glance", "run.mjs"),
  ];

  it("does not reach for the one function that writes to the running system", () => {
    for (const path of glancePaths) {
      const source = codeLines(readFileSync(path, "utf8")).join("\n");
      expect(
        source,
        `${relative(repositoryRoot, path)} names askForRate. A glance must not pin the ` +
          "clock, reset the scenario or navigate anywhere that changes state: it exists " +
          "to show the system as it is (FR-003).",
      ).not.toMatch(/\baskForRate\b/);
    }
  });

  it("names the shared library's writing function, so the check above is not misspelt", () => {
    // The control: if `askForRate` were renamed, the assertion above would pass over a
    // glance that pinned the clock. This fails instead.
    const shell = readFileSync(
      join(repositoryRoot, "client", "e2e", "shared", "pages", "shell.ts"),
      "utf8",
    );
    expect(shell).toMatch(/export async function askForRate\b/);
  });
});
