/**
 * The comparator itself, with the controls that stop it being a vacuous assertion.
 *
 * `client/e2e/specs/determinism.spec.ts` proves the property against the real client in a
 * real browser, which is the demonstration that matters. This file proves the same
 * comparator can tell the two answers apart at all, without a browser, in milliseconds, so
 * the property is checked on every `pnpm test` rather than only when a client is running.
 *
 * Both halves are here on purpose. A test that only ever feeds identical images to a
 * comparator and asserts "empty" would pass if `compare` returned zero unconditionally,
 * which is exactly the bug that would make every difference this mechanism ever produced
 * worthless. So every empty assertion below is paired with a one-pixel change that must be
 * caught, and located.
 */
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { compare } from "../../../scripts/capture/pair/diff.mjs";
import { fingerprint } from "../../../scripts/capture/pair/fingerprint.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as { PNG: new (options: { width: number; height: number }) => PngImage };

interface PngImage {
  width: number;
  height: number;
  data: Buffer;
}

const WIDTH = 24;
const HEIGHT = 16;

function image(paint?: (put: (x: number, y: number, value: number) => void) => void): Buffer {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 20;
    png.data[index + 1] = 20;
    png.data[index + 2] = 24;
    png.data[index + 3] = 255;
  }
  paint?.((x, y, value) => {
    const offset = (y * WIDTH + x) * 4;
    png.data[offset] = value;
    png.data[offset + 1] = value;
    png.data[offset + 2] = value;
  });
  return (PNG as unknown as { sync: { write(png: PngImage): Buffer } }).sync.write(png);
}

function half(overrides: Record<string, unknown> = {}) {
  const record = fingerprint({
    browser: { name: "chromium", version: "141", playwrightVersion: "1.56.1", containerImage: "" },
    viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    scenario: { seed: 1, runId: "run" },
    capture: { environment: "test", entryPointVersion: "1.0.0", side: "before" },
    clock: { simTime: "t", runDisplay: "paused" },
    lit: [],
  }) as Record<string, unknown>;
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split(".");
    let node = record;
    for (const key of keys.slice(0, -1)) {
      node = node[key] as Record<string, unknown>;
    }
    node[keys[keys.length - 1] as string] = value;
  }
  return record;
}

const threshold = 0.05;

describe("a pair captured across no change", () => {
  it("is empty", () => {
    const outcome = compare({
      before: image(),
      after: image(),
      beforeFingerprint: half(),
      afterFingerprint: half(),
      threshold,
    });
    expect(outcome.refused).toBe(false);
    expect(outcome.differingPixels).toBe(0);
    expect(outcome.box).toBeNull();
  });

  it("is empty on three consecutive comparisons of freshly encoded images (FR-011)", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = compare({
        before: image(),
        after: image(),
        beforeFingerprint: half(),
        afterFingerprint: half(),
        threshold,
      });
      expect(outcome.differingPixels, `attempt ${attempt + 1}`).toBe(0);
    }
  });
});

describe("the control: a pair captured across a change", () => {
  it("is not empty, and the bounding box is on the change", () => {
    const outcome = compare({
      before: image(),
      after: image((put) => {
        put(7, 5, 255);
      }),
      beforeFingerprint: half(),
      afterFingerprint: half(),
      threshold,
    });
    expect(
      outcome.differingPixels,
      "one pixel was changed and the comparator reported none. It is not comparing, and " +
        "every empty difference it has reported is worth nothing.",
    ).toBe(1);
    expect(outcome.box).toEqual({ x: 7, y: 5, width: 1, height: 1 });
  });

  it("confines the bounding box to the changed region, not the whole image (SC-004)", () => {
    const outcome = compare({
      before: image(),
      after: image((put) => {
        for (let y = 4; y < 8; y += 1) {
          for (let x = 10; x < 15; x += 1) {
            put(x, y, 255);
          }
        }
      }),
      beforeFingerprint: half(),
      afterFingerprint: half(),
      threshold,
    });
    expect(outcome.differingPixels).toBe(20);
    expect(outcome.box).toEqual({ x: 10, y: 4, width: 5, height: 4 });
  });
});

describe("a pair that must not be compared at all", () => {
  it("is refused before any image is produced, and no image comes back", () => {
    const outcome = compare({
      before: image(),
      after: image(),
      beforeFingerprint: half(),
      afterFingerprint: half({ "viewport.deviceScaleFactor": 2 }),
      threshold,
    });
    expect(outcome.refused).toBe(true);
    expect(outcome.image).toBeUndefined();
    expect(outcome.message).toContain("viewport.deviceScaleFactor");
  });

  it("is refused when the two halves are different sizes, naming both", () => {
    const small = new PNG({ width: 8, height: 8 });
    const outcome = compare({
      before: image(),
      after: (PNG as unknown as { sync: { write(png: PngImage): Buffer } }).sync.write(small),
      beforeFingerprint: half(),
      afterFingerprint: half(),
      threshold,
    });
    expect(outcome.refused).toBe(true);
    expect(outcome.message).toContain("24x16");
    expect(outcome.message).toContain("8x8");
  });
});
