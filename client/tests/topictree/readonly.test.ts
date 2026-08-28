/**
 * SC-005: no path by which the topic tree can publish.
 *
 * The panel's transport narrows an interface with no publish member, its role holds no
 * write rule (asserted at a running broker in tests/integration/test_topic_isolation.py),
 * and this test holds the third leg: no publish call in the panel's own source. The
 * whole client is already swept by no-mock.test.ts; this one is scoped to the panel so
 * a failure names the feature that broke its own promise.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TREE_FILTERS } from "../../src/topictree/transport";

const panelRoot = fileURLToPath(new URL("../../src/topictree", import.meta.url));

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sources(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe("the topic tree's source", () => {
  const files = sources(panelRoot);

  it("has source to read", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("never publishes on the broker", () => {
    for (const path of files) {
      expect(/\.publish\s*\(/.test(readFileSync(path, "utf8")), `${path} publishes`).toBe(false);
    }
  });

  it("reaches no network beyond the one subscription", () => {
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      expect(/\bfetch\s*\(/.test(text), `${path} fetches`).toBe(false);
      expect(/new\s+WebSocket\s*\(/.test(text), `${path} opens its own socket`).toBe(false);
    }
  });
});

describe("the subscription", () => {
  it("listens to the two namespaces, whole, and to nothing else", () => {
    expect([...TREE_FILTERS]).toEqual(["obs/#", "ctl/#"]);
  });
});
