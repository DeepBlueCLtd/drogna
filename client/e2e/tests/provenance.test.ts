/**
 * A provenance record says enough to take the shot again and leaks nothing (FR-016).
 *
 * Two obligations pulling opposite ways, which is why the record is assembled from a fixed
 * list of fields and then checked against the shapes that leak. Both halves are tested
 * here: that the record carries what a person needs a year later, and that every kind of
 * material that must not reach a public file is caught and refused rather than redacted.
 *
 * Refused rather than redacted, because a record that had to be redacted is a record whose
 * author did not know what was in it, and the next one will carry something the redactor
 * has not been taught about.
 */
import { describe, expect, it } from "vitest";

import { PROVENANCE_FIELDS, leaks, provenance, scrub } from "../../../scripts/capture/curate/sidecar.mjs";

function record(overrides: Record<string, unknown> = {}) {
  const assembled = provenance({
    imageName: "016-three-mechanisms-one-browser.png",
    seed: 20260826,
    simTime: "2026-01-01T00:00:10.000000Z",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    entryPointVersion: "1.0.0",
    browser: { name: "chromium", version: "141.0.7390.37" },
    clockPinned: "pinned at zero",
    litComponents: ["clock"],
    caption: "The component shell, every box dark.",
  }) as Record<string, unknown>;
  return { ...assembled, ...overrides };
}

describe("a provenance record", () => {
  it("gives the seed, the simulation time, the viewport, the scale factor and the version", () => {
    const written = JSON.parse(scrub(record())) as Record<string, unknown>;
    expect(written["seed"]).toBe(20260826);
    expect(written["simTime"]).toBe("2026-01-01T00:00:10.000000Z");
    expect(written["viewport"]).toEqual({ width: 1440, height: 900 });
    expect(written["deviceScaleFactor"]).toBe(2);
    expect(written["entryPointVersion"]).toBe("1.0.0");
  });

  it("names the image by file name alone, never by a path", () => {
    const written = JSON.parse(scrub(record())) as Record<string, string>;
    expect(written["image"]).not.toContain("/");
  });

  it("records which components were genuinely alive, and nothing that could have arranged it", () => {
    const written = JSON.parse(scrub(record())) as Record<string, unknown>;
    expect(written["litComponents"]).toEqual(["clock"]);
  });

  it("carries only declared fields", () => {
    expect(Object.keys(record()).sort()).toEqual([...PROVENANCE_FIELDS].sort());
  });
});

describe("the control: material that must never reach a public file", () => {
  const forbidden: readonly (readonly [string, Record<string, unknown>])[] = [
    ["an absolute filesystem path", { caption: "taken from /home/someone/drogna" }],
    ["a home directory", { caption: "taken from ~/drogna" }],
    ["a URL", { caption: "captured at https://drogna.invalid" }],
    ["a host and port", { caption: "captured at localhost:8080" }],
    ["an IP address", { caption: "captured at 192.168.1.24" }],
    ["a user name from an environment", { caption: "USER=someone" }],
    ["an undeclared field", { hostname: "some-laptop" }],
  ];

  for (const [what, overrides] of forbidden) {
    it(`is caught: ${what}`, () => {
      const found = leaks(record(overrides));
      expect(
        found.length,
        `${what} passed the leak check. A provenance record sits beside a published image ` +
          "and is exactly the kind of file that carries one of these quietly.",
      ).toBeGreaterThan(0);
      expect(() => scrub(record(overrides))).toThrow(/must not be published/);
    });
  }

  it("does not fire on a clean record, so the check is not simply always refusing", () => {
    expect(leaks(record())).toEqual([]);
    expect(() => scrub(record())).not.toThrow();
  });
});
