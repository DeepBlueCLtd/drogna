/**
 * There is no path in this client that draws a transit from anything but a received message.
 *
 * Feature 003's `no-mock` test defends the same property for illumination and this
 * defends it for transits, because feature 012 adds the second thing a display can claim.
 * A transit says "this message crossed this boundary". Drawing one from a seeded list, a
 * timer, or a convenience path added during development would be a claim about traffic
 * that did not happen, which is Constitution VII's failure in the shape this feature
 * makes available.
 *
 * The structural argument is stronger than the scan and is checked first: every route into
 * the loop state takes a topic and the bytes that arrived, and there is no parameter a
 * prepared state, a component list or a configuration document could enter through. The
 * scan then covers what structure cannot — a module that built arrivals for itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { emptyBuffers, record } from "../../src/data/buffers";
import { drawFrame, emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import { announceRun, emptyOverlay } from "../../src/uncertainty/overlay";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));
const generated = join(sourceRoot, "generated");

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (path.startsWith(generated)) {
      continue;
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

describe("the only way in", () => {
  it("takes a topic and the bytes that arrived, and nothing else", () => {
    expect(receiveControl.length).toBe(3);
    expect(record.length).toBe(3);
    expect(announceRun.length).toBe(2);
  });

  it("draws nothing from an empty state, whatever is asked of it", () => {
    const drawn = drawFrame(emptyLoop());
    expect(drawn.lastFrame.transits).toEqual([]);
    expect(drawn.transitsDrawn).toBe(0);
    expect(drawn.messagesReceived).toBe(0);
    expect(emptyBuffers().byTopic.size).toBe(0);
    expect(emptyOverlay.runId).toBeNull();
  });

  it("draws nothing however many frames pass without an arrival", () => {
    let state = emptyLoop();
    for (let frame = 0; frame < 10_000; frame += 1) {
      state = drawFrame(state);
    }
    expect(state.transitsDrawn).toBe(0);
  });
});

describe("the source, read for what is not there", () => {
  const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
    ["a seeded transit or route", /\bseed(ed)?[\s_-]?(transits?|routes?|traffic|messages?)\b/i],
    ["a sample or example payload", /\b(sample|example)[\s_-]?(payload|message|traffic)\b/i],
    ["a placeholder", /\bplaceholder\b/i],
    ["a synthesised arrival", /\bsynthesi[sz]ed?[\s_-]?(traffic|arrivals?|messages?)\b/i],
    ["a timer that could invent an arrival", /\bsetInterval\s*\(/],
    ["a delayed arrival", /\bsetTimeout\s*\(/],
    ["a random draw", /Math\.random\s*\(/],
  ];

  it("has source to read", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("contains no path that could draw a transit nobody published", () => {
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      for (const [what, pattern] of FORBIDDEN) {
        expect(pattern.test(text), `${path} contains ${what}`).toBe(false);
      }
    }
  });

  it("never publishes on the broker, so nothing it draws could be its own", () => {
    for (const path of files) {
      expect(/\.publish\s*\(/.test(readFileSync(path, "utf8")), `${path} publishes`).toBe(false);
    }
  });

  it("keeps the classification out of everything that decides what is lit", () => {
    // FR-018's structural half, stated as a direction rather than as a separation. The
    // page assembles both, as a page must; what must not happen is the classification
    // becoming an input to the liveness computation. So: nothing under `liveness/`, and
    // nothing that draws a box's illumination, may import the classification — and the
    // classification may not import the liveness state.
    const decidesIllumination = files.filter(
      (path) => /[\\/]liveness[\\/]/.test(path) || /ComponentDiagram\.tsx$/.test(path),
    );
    expect(decidesIllumination.length).toBeGreaterThan(3);
    for (const path of decidesIllumination) {
      const text = readFileSync(path, "utf8");
      expect(
        /from "[^"]*legibility\/classification"/.test(text),
        `${path} reads the classification while deciding what is lit`,
      ).toBe(false);
    }
    const classification = readFileSync(join(sourceRoot, "legibility", "classification.ts"), "utf8");
    expect(/from "[^"]*liveness\//.test(classification)).toBe(false);
  });
});

describe("a message about a component nothing has been heard from", () => {
  it("is drawn as a transit and lights nothing", () => {
    // The message names the monitor and the scheduler. Neither has heartbeated, and the
    // loop state has no route to the liveness state at all — which is the point.
    const state = drawFrame(
      receiveControl(emptyLoop(), "ctl/divergence", JSON.stringify({ nothing: "valid" })),
    );
    expect(state.lastFrame.transits).toHaveLength(1);
    expect(Object.keys(state)).not.toContain("liveness");
    expect(Object.keys(state)).not.toContain("components");
  });
});
