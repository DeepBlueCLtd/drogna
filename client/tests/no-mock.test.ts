/**
 * There is no way to light a node without a heartbeat.
 *
 * Constitution VII, promoted to non-negotiable and extended to forbid mocked traffic
 * outright: no demo mode, no fixture mode, no populate-for-the-screenshot path, no query
 * parameter and no build flag. This test reads the client's own source and says so,
 * which is a blunt instrument and the right one — the property being defended is the
 * absence of a thing, and the only way to check an absence is to look.
 *
 * The test directory is excluded from the scan on purpose. Feeding constructed values to
 * a pure function is testing a function, and FR-023 says so explicitly; what must not
 * exist is a path in the built client that does it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { emptyLiveness, receive } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { emptyClock } from "../src/transport/clock";

import { HEARING_CONNECTED, HEARING_DEAF } from "./heartbeats";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const generated = join(sourceRoot, "generated");

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (path.startsWith(generated)) {
      continue; // written by feature 006's generator chain, never by hand
    }
    if (statSync(path).isDirectory()) {
      found.push(...sources(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

const files = sources(sourceRoot);

const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["a demo mode", /\bdemo[\s_-]?mode\b/i],
  ["a fixture", /\bfixtures?\b/i],
  ["a mock", /\bmock\w*/i],
  ["a stub", /\bstubbed?\b/i],
  ["a query parameter", /URLSearchParams|location\.search/],
  ["a build flag", /import\.meta\.env\.\w+/],
  ["a seeded liveness state", /\bseed(ed)?[\s_-]?(state|components|liveness)\b/i],
];

describe("the client's source", () => {
  it("has source to read", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("contains nothing that could light a node without a heartbeat", () => {
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      for (const [what, pattern] of FORBIDDEN) {
        expect(pattern.test(text), `${path} contains ${what}`).toBe(false);
      }
    }
  });

  it("never publishes on the broker", () => {
    for (const path of files) {
      expect(/\.publish\s*\(/.test(readFileSync(path, "utf8")), `${path} publishes`).toBe(false);
    }
  });
});

describe("the built bundle", () => {
  it("carries none of it either, where a build is present", async () => {
    const { existsSync } = await import("node:fs");
    const assets = fileURLToPath(new URL("../dist/assets", import.meta.url));
    if (!existsSync(assets)) {
      // The build is not a precondition of the unit tests; when one exists it is read.
      return;
    }
    for (const entry of readdirSync(assets).filter((name) => name.endsWith(".js"))) {
      const text = readFileSync(join(assets, entry), "utf8");
      expect(/\bdemo[\s_-]?mode\b/i.test(text), `${entry} contains a demo mode`).toBe(false);
    }
  });
});

describe("the liveness computation", () => {
  it("lights nothing at all when nothing has been heard, whatever else is true", () => {
    for (const hearing of [HEARING_CONNECTED, HEARING_DEAF]) {
      for (const staleAfter of [0.001, 10, 10_000]) {
        const shell = describeShell({
          liveness: emptyLiveness,
          clockState: emptyClock,
          connection: "receiving",
          now: 1_000_000,
          hearing,
          clockStaleAfterSeconds: staleAfter,
        });
        expect(shell.litCount).toBe(0);
      }
    }
  });

  it("takes evidence as its only route to a lit component", () => {
    // `receive` accepts evidence and nothing else: there is no parameter a configuration
    // document, a flag or a component list could be passed through. The count of its
    // formal parameters is a crude proxy for that, and the compiler is the real one.
    expect(receive.length).toBe(2);
    expect(emptyLiveness.components.size).toBe(0);
  });
});
