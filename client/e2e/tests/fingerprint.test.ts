/**
 * Every incomparable-pair case is refused, and the refusal names the field (SC-005).
 *
 * This is the cheapest test in the feature and the one that stops the most expensive
 * mistake. A pair whose halves were taken in different browsers, at different sizes, at
 * different device scale factors, from different seeds, or one locally and one in CI,
 * produces a difference that looks exactly like the change under evidence. Nobody looking
 * at the picture can tell. The only defence is to refuse before the picture exists, and the
 * only way to know the refusal works is to hand it every case one at a time.
 *
 * No browser, no filesystem, no clock. That is what makes exercising all of them cheap
 * enough to actually do.
 */
import { describe, expect, it } from "vitest";

import {
  COMPARABILITY_FIELDS,
  comparable,
  fingerprint,
  incomparabilities,
  refusalMessage,
} from "../../../scripts/capture/pair/fingerprint.mjs";

function half(overrides: Record<string, unknown> = {}) {
  const record = fingerprint({
    browser: {
      name: "chromium",
      version: "141.0.7390.37",
      playwrightVersion: "1.56.1",
      containerImage: "",
    },
    viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    scenario: { seed: 20260826, runId: "local-001" },
    capture: { environment: "local", entryPointVersion: "1.0.0", side: "before" },
    clock: { simTime: "2026-01-01T00:00:10.000000Z", runDisplay: "paused" },
    lit: ["clock"],
  });
  return applyOverrides(record, overrides);
}

/** Set a dotted path on a copy of a record, so a test can name exactly one difference. */
function applyOverrides(record: unknown, overrides: Record<string, unknown>): unknown {
  const copy = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split(".");
    let node = copy;
    for (const key of keys.slice(0, -1)) {
      node = node[key] as Record<string, unknown>;
    }
    node[keys[keys.length - 1] as string] = value;
  }
  return copy;
}

describe("two halves taken in the same conditions", () => {
  it("are comparable, so the refusal is not simply always refusing", () => {
    expect(incomparabilities(half(), half({ "capture.side": "after" }))).toEqual([]);
    expect(comparable(half(), half({ "capture.side": "after" }))).toBe(true);
    expect(refusalMessage(half(), half())).toBeNull();
  });
});

describe("an incomparable pair", () => {
  const cases: readonly (readonly [string, string, unknown])[] = [
    ["a different browser version", "browser.version", "142.0.7444.12"],
    ["a different Playwright pin", "browser.playwrightVersion", "1.57.0"],
    ["a different container image", "browser.containerImage", "mcr.microsoft.com/playwright:x"],
    ["a different viewport width", "viewport.width", 1280],
    ["a different viewport height", "viewport.height", 720],
    ["a different device scale factor", "viewport.deviceScaleFactor", 1],
    ["a different scenario seed", "scenario.seed", 1],
    ["a different run", "scenario.runId", "local-002"],
    ["one half captured in CI", "capture.environment", "github-actions"],
    ["a different capture entry point", "capture.entryPointVersion", "2.0.0"],
  ];

  for (const [what, field, value] of cases) {
    it(`is refused for ${what}, and the refusal names ${field}`, () => {
      const before = half();
      const after = half({ [field]: value });
      const reasons = incomparabilities(before, after);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain(field);
      expect(comparable(before, after)).toBe(false);
      const message = refusalMessage(before, after);
      expect(message).not.toBeNull();
      expect(message).toContain(field);
      expect(message).toContain("looks like");
    });
  }

  it("names every field that differs, not only the first", () => {
    const reasons = incomparabilities(
      half(),
      half({ "viewport.width": 1280, "scenario.seed": 7 }),
    );
    expect(reasons).toHaveLength(2);
  });

  it("covers every comparability field with a case, so none is silently unexercised", () => {
    const exercised = new Set(cases.map(([, field]) => field));
    // `browser.name` is the one field with a single permitted value in the schema, so
    // there is no second value to differ into. It stays in the list because a schema can
    // be widened and this check would then demand a case for it.
    const missing = COMPARABILITY_FIELDS.filter(
      (field: string) => !exercised.has(field) && field !== "browser.name",
    );
    expect(missing).toEqual([]);
  });
});

describe("what is recorded but never refused on", () => {
  it("does not refuse a pair whose halves are at different simulated times", () => {
    // FR-007 makes the pair restore the previous rate after each capture, so the
    // simulation runs between the halves and simulated time necessarily differs. Refusing
    // on it would refuse every pair this mechanism can produce; it is recorded instead.
    const later = half({ "clock.simTime": "2026-01-01T00:00:20.000000Z" });
    expect(incomparabilities(half(), later)).toEqual([]);
  });

  it("does not refuse a pair whose halves differ in what is lit", () => {
    // Which components are lit is the change under evidence as often as not: the
    // canonical first pair is the simulation clock going from grey to lit. A mechanism
    // that refused on it could never evidence the one transition it was built for.
    const lit = half({ lit: ["clock", "broker"] });
    expect(incomparabilities(half(), lit)).toEqual([]);
  });
});
