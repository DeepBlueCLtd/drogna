/**
 * Every curated image in the repository, checked against the convention it is published
 * under (FR-014 to FR-017, SC-009).
 *
 * These are the only capture outputs anybody outside the project will ever see and the
 * only ones the repository keeps for ever, so the checks are over the committed files
 * rather than over the mechanism that produced them. A convention enforced only at the
 * point of capture is a convention that lasts until somebody adds a picture by hand.
 *
 * **One fixed viewport and device scale factor.** Asserted by dimensions: an image whose
 * pixel size is exactly the configured viewport times the configured scale factor was
 * taken through that window at that scale, and — because `page.screenshot` photographs the
 * page rather than the window — could not have contained browser chrome, an address bar or
 * a window title, which would have made it larger in at least one dimension. That is what
 * makes FR-017 checkable at all from a file: chrome is not something a test can see, but
 * the size a chrome-free viewport capture must have is exact.
 *
 * **A provenance record beside each.** With no path, no hostname and no user name in it,
 * which `provenance.test.ts` checks the writer for and this checks the committed files for.
 *
 * **No exceptions.** There was one: `shell-all-dark.png`, taken by hand before this feature
 * existed — full-page, at a different size, with no provenance record, because one cannot
 * honestly be written for a shot nobody recorded. It was carried here as a named list of
 * one rather than as a filter by shape, so that removing it would be the fix and adding to
 * it would need an argument. It has since been re-taken through the curated mechanism as
 * `003-shell-all-dark.png`, with a record, and the list is gone rather than empty: every
 * image in the published location is now held to every check below, and an image without a
 * provenance record fails the second test whatever it is called.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { leaks } from "../../../scripts/capture/curate/sidecar.mjs";
import { loadCaptureConfigFrom } from "../shared/config";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const capture = loadCaptureConfigFrom(join("config", "local", ["capture", "json"].join(".")), {
  // The page sits behind the proxy's clearance; these tests are about the curated
  // mechanism, so the credential the loader insists on is a stand-in.
  HARNESS_PROXY_SECRET: "secret-for-the-capture",
});
const published = join(repositoryRoot, capture.area("published"));

/** A PNG's pixel dimensions, from its IHDR chunk. Twenty-four bytes, no dependency. */
function dimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG: it begins ${signature}`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const images = readdirSync(published).filter((entry) => entry.endsWith(".png"));

describe("the published-screenshot location", () => {
  it("holds at least one curated image, so these checks have something to check", () => {
    expect(images.length).toBeGreaterThan(0);
  });

  it("holds no image without a provenance record", () => {
    const unprovenanced = images.filter(
      (name) => !readdirSync(published).includes(`${name.replace(/\.png$/, "")}.provenance.json`),
    );
    expect(
      unprovenanced.sort(),
      "an image in the published-screenshot location has no provenance record. Either it " +
        "was produced by the curated mechanism, in which case its record was left behind, " +
        "or it was added by hand, in which case nobody can take it again (FR-016).",
    ).toEqual([]);
  });

  it("names each curated image <feature-number>-<slug>.png", () => {
    for (const name of images) {
      expect(name, `${name} does not follow feature 015's naming convention`).toMatch(
        /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.png$/,
      );
    }
  });
});

describe("every curated image", () => {
  it("has the same dimensions as every other, at the configured viewport and scale", () => {
    const expected = {
      width: capture.viewport.width * capture.viewport.deviceScaleFactor,
      height: capture.viewport.height * capture.viewport.deviceScaleFactor,
    };
    for (const name of images) {
      expect(
        dimensions(join(published, name)),
        `${name} is not ${expected.width}x${expected.height}. One fixed viewport and one ` +
          "device scale factor across the whole blog (FR-015): sixteen features' worth of " +
          "pictures at sixteen sizes is a scrapbook rather than a publication. A size " +
          "larger than the viewport in either dimension would also mean the capture " +
          "included something outside the page — chrome, an address bar, a window title " +
          "(FR-017).",
      ).toEqual(expected);
    }
  });

  it("is within the size budget a repository can keep for ever", () => {
    const budget = capture.section<{ maximum_bytes: number }>("curated").maximum_bytes;
    for (const name of images) {
      expect(readFileSync(join(published, name)).length, `${name}`).toBeLessThanOrEqual(budget);
    }
  });

  it("has a provenance record that records the same viewport and scale factor it was taken at", () => {
    for (const name of images) {
      const record = JSON.parse(
        readFileSync(join(published, `${name.replace(/\.png$/, "")}.provenance.json`), "utf8"),
      ) as Record<string, unknown>;
      expect(record["image"]).toBe(name);
      expect(record["viewport"]).toEqual({
        width: capture.viewport.width,
        height: capture.viewport.height,
      });
      expect(record["deviceScaleFactor"]).toBe(capture.viewport.deviceScaleFactor);
      expect(record["seed"]).toBe(capture.scenario.seed);
      expect(typeof record["entryPointVersion"]).toBe("string");
    }
  });

  it("has a provenance record containing no path, hostname or user name", () => {
    for (const name of images) {
      const path = join(published, `${name.replace(/\.png$/, "")}.provenance.json`);
      const record = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      expect(leaks(record), `${name}'s provenance record`).toEqual([]);
    }
  });
});
