/**
 * The clock is put back after every pair capture, including the ones that failed
 * (FR-007, SC-006).
 *
 * A pair that crashed between pinning the clock and restoring it leaves the whole harness
 * stopped for the next person who looks at it, and they have no way of knowing why. That is
 * the failure this guards, and it is guarded in two places, because the property has two
 * halves and they are checkable by different means.
 *
 * **What to put back** is a decision with cases in it, and it is a pure function with a
 * test per case here. The case that matters is the third: no rate was ever in force,
 * because no clock sample had arrived, so there is nothing to put back. Inventing one would
 * be worse than leaving a pin a person can see, and it must say so rather than guess.
 *
 * **That it is put back at all, on every path out** is a structural property of the pair
 * spec, and it is asserted by reading the spec. A blunt check, and the alternative — driving
 * a browser through an injected failure at each of four steps — needs a running clock to
 * fail *after*, which is precisely the thing that is not always available. Reading the
 * source is what can be done every time, and it catches the change that would actually
 * cause the bug: somebody moving the restore out of the `finally`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { restorationPlan } from "../../../scripts/capture/pair/restore.mjs";
import { codeLines } from "./support/code";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("what to put the clock back to", () => {
  it("asks for the rate that was in force", () => {
    const plan = restorationPlan(10);
    expect(plan.action).toBe("ask");
    expect(plan.rate).toBe(10);
    expect(plan.reason).toContain("10");
  });

  it("leaves an already-pinned clock exactly as it was found", () => {
    const plan = restorationPlan(0);
    expect(plan.action).toBe("none");
    expect(plan.reason).toContain("already pinned");
  });

  it("reports rather than guesses when no rate was ever in force", () => {
    for (const nothing of [null, undefined]) {
      const plan = restorationPlan(nothing);
      expect(plan.action).toBe("report");
      expect(plan.rate).toBeNull();
      expect(
        plan.reason,
        "a restore that invented a rate would put the harness into a state nobody chose, " +
          "and would do it silently.",
      ).toContain("pinned at zero");
    }
  });

  it("never returns a plan without a reason", () => {
    for (const previous of [null, 0, 1, 60]) {
      expect(restorationPlan(previous).reason.length).toBeGreaterThan(20);
    }
  });
});

describe("that the clock is put back on every path out", () => {
  const spec = codeLines(
    readFileSync(join(repositoryRoot, "client", "e2e", "specs", "pair.spec.ts"), "utf8"),
  );

  it("restores inside a finally, not after the last successful step", () => {
    const finallyAt = spec.findIndex((line) => /\bfinally\s*\{/.test(line));
    const restoreAt = spec.findIndex((line) => /await restore\(/.test(line));
    expect(finallyAt, "the pair capture has no finally block").toBeGreaterThan(-1);
    expect(restoreAt, "the pair capture never calls restore").toBeGreaterThan(-1);
    expect(
      restoreAt,
      "the restore is not inside the finally, so a capture that failed part way through " +
        "leaves the clock pinned and the whole harness stopped for whoever looks next " +
        "(FR-007, SC-006).",
    ).toBeGreaterThan(finallyAt);
  });

  it("releases the concurrency lock inside the same finally", () => {
    const finallyAt = spec.findIndex((line) => /\bfinally\s*\{/.test(line));
    const releaseAt = spec.findIndex((line) => /^\s+releaseLock\(\);/.test(line));
    expect(releaseAt).toBeGreaterThan(finallyAt);
  });

  it("reads the rate in force before it asks for anything", () => {
    const readAt = spec.findIndex((line) => /const rateBefore = await readRate\(/.test(line));
    const askAt = spec.findIndex((line) => /await askForRate\(page, 0\)/.test(line));
    expect(readAt).toBeGreaterThan(-1);
    expect(
      readAt,
      "the rate is read after the pin is requested, so the restore would put back the " +
        "rate the pin produced rather than the one that was there.",
    ).toBeLessThan(askAt);
  });
});
