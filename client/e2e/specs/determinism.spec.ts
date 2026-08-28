/**
 * The load-bearing test: two captures of an unchanging view are identical, three times
 * running — and are not identical the moment anything on the page varies frame to frame.
 *
 * This is FR-011 and SC-003, and it is the property every other claim the pair mechanism
 * makes is built on. If a no-change pair produces a non-empty difference, then a pair
 * captured across a real change produces a difference containing the real change *and*
 * whatever noise made the no-change pair non-empty, and there is no way to tell the two
 * apart by looking. A comparison whose no-change answer is not empty has no business being
 * trusted with a change.
 *
 * **This test carries its own control, and the control is the point.** A capture-comparison
 * test that has only ever passed is indistinguishable from one that compares nothing:
 * `expect(a).toEqual(a)` passes too. So the second half of this file deliberately puts a
 * host-derived elapsed display on the page — a counter that ticks every animation frame —
 * and asserts that the comparison catches it, names a bounding box around it, and refuses
 * to call it empty. Then the perturbation is removed and the empty property is asserted
 * again, so the failure is demonstrably caused by the perturbation rather than by
 * something the perturbation happened to coincide with.
 *
 * The perturbation is chosen rather than invented. A host-derived elapsed figure on the
 * shell is exactly what feature 012 removed, for exactly this reason: while it was
 * rendered, a pinned state differed frame to frame and its own SC-009 — two captures of a
 * pinned state are identical — was unsatisfiable. This test is the standing evidence that
 * it is satisfiable now, and the standing guard against it being put back.
 *
 * Nothing here is a mock. Nothing is lit that was not lit, no traffic is introduced, and
 * the perturbation is applied to the comparison's *input* rather than to the client: it
 * lives in this file, is applied through the browser after the page has loaded, and is
 * gone when the page reloads. The built client contains no path that could produce it,
 * which `client/tests/no-mock.test.ts` asserts by reading the source.
 *
 * On the clock. The pair pins the rate to zero for the duration of a capture (FR-007), and
 * this spec pins where a clock answers. Where none does — no clock service running, so no
 * `ctl/clock` sample has ever arrived — simulated time is not advancing either, and the
 * property under test is unchanged. Which of the two happened is recorded in the report and
 * printed, so a run that proved the property under a pin and a run that proved it with no
 * clock at all are never confused for one another.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { compare } from "../../../scripts/capture/pair/diff.mjs";
import { fingerprint } from "../../../scripts/capture/pair/fingerprint.mjs";
import { restorationPlan } from "../../../scripts/capture/pair/restore.mjs";
import { pairArea, pairSettings } from "../pair.config";
import { loadCaptureConfig } from "../shared/config";
import { openClient, settled } from "../shared/readiness";
import { askForRate, litComponents, readClock, readRate, SPEED_CONTROL } from "../shared/pages/shell";

const capture = loadCaptureConfig();
const area = join(pairArea, "determinism");

/** The element the control adds. Named so a failure message can say what it was. */
const PERTURBATION_ID = "capture-determinism-control";

interface Half {
  readonly image: Buffer;
  readonly record: ReturnType<typeof fingerprint>;
}

/** One capture through the same steps the pair mechanism uses, minus the pin. */
async function half(page: Page, side: string, version: string): Promise<Half> {
  await settled(page, capture.client);
  const clock = await readClock(page);
  const lit = await litComponents(page);
  const image = await page.screenshot();
  return {
    image,
    record: fingerprint({
      browser: {
        name: capture.browser.name,
        version,
        playwrightVersion: capture.browser.playwrightVersion,
        containerImage: capture.browser.containerImage,
      },
      viewport: capture.viewport,
      scenario: { seed: capture.scenario.seed, runId: clock.runId },
      capture: { environment: "determinism", entryPointVersion: "1.0.0", side },
      clock: { simTime: clock.simTime, runDisplay: clock.display },
      lit,
    }),
  };
}

function difference(before: Half, after: Half) {
  return compare({
    before: before.image,
    after: after.image,
    beforeFingerprint: before.record,
    afterFingerprint: after.record,
    threshold: pairSettings.difference_threshold,
  });
}

test("a pair captured across no change is empty, three consecutive times", async ({
  page,
  browser,
}) => {
  await openClient(page, capture.client);
  await settled(page, capture.client);

  const rateBefore = await readRate(page);
  const pinned = await pinIfAClockAnswers(page);
  try {
    await captureNoChangeRuns(page, browser.version(), pinned);
  } finally {
    // FR-007's discipline, borrowed from the pair spec: the previous rate goes back on
    // every path out, including the failing ones. Samples are not retained, so a clock
    // left pinned is invisible to every page loaded after this one — the next spec, and
    // the pair capture itself, would find an unheard clock and refuse.
    await restore(page, rateBefore.acknowledged);
  }
});

async function captureNoChangeRuns(
  page: Page,
  version: string,
  pinned: string,
): Promise<void> {
  const runs: number[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const before = await half(page, `no-change-${attempt}-before`, version);
    const after = await half(page, `no-change-${attempt}-after`, version);
    const outcome = difference(before, after);
    expect(outcome.refused, JSON.stringify(outcome.reasons ?? [])).toBe(false);
    runs.push(outcome.differingPixels);
    expect(
      outcome.differingPixels,
      `run ${attempt} of 3: ${outcome.differingPixels} pixels differ between two captures ` +
        "of a view that did not change, and the budget is " +
        `${pairSettings.maximum_differing_pixels}. Something on this page varies frame to ` +
        `frame; the difference is ${JSON.stringify(outcome.box)} in device pixels. Until ` +
        "that is gone, no difference this mechanism produces is evidence of anything.",
    ).toBeLessThanOrEqual(pairSettings.maximum_differing_pixels);
  }

  mkdirSync(area, { recursive: true });
  writeFileSync(
    join(area, "no-change.json"),
    `${JSON.stringify({ pinned, differingPixelsPerRun: runs }, null, 2)}\n`,
    "utf8",
  );

  // The last two captures are left on disk under the names the pair's own entry point
  // reads, so that `run.mjs diff determinism` can be run against a genuine pair of real
  // captures. Without it the on-disk half of the mechanism — reading two halves and their
  // fingerprints, refusing or drawing, writing the summary — would only ever be exercised
  // through its in-memory core, and the two are not the same code.
  const before = await half(page, "before", version);
  const after = await half(page, "after", version);
  for (const [side, taken] of [
    ["before", before],
    ["after", after],
  ] as const) {
    writeFileSync(join(area, `${side}.png`), taken.image);
    writeFileSync(
      join(area, `${side}.fingerprint.json`),
      `${JSON.stringify(taken.record, null, 2)}\n`,
      "utf8",
    );
  }
}

test("the comparison catches a display that varies frame to frame", async ({ page, browser }) => {
  await openClient(page, capture.client);
  await settled(page, capture.client);

  // Pinned for the same reason the first test pins: against a running stack the clock
  // display moves on its own, and this test's claim is that the *perturbation* is what
  // the comparison catches and names a box around. Unpinned, the box would honestly
  // cover the clock as well, and the assertion that it is confined to the perturbation
  // would fail on a working comparison.
  const rateBefore = await readRate(page);
  const pinned = await pinIfAClockAnswers(page);
  try {
    await proveTheComparisonCatchesTheControl(page, browser.version(), pinned);
  } finally {
    // As in the first test: the pin goes back out on every path, so nothing after this
    // spec — the pair capture included — inherits a silently stopped clock.
    await restore(page, rateBefore.acknowledged);
  }
});

async function proveTheComparisonCatchesTheControl(
  page: Page,
  version: string,
  pinned: string,
): Promise<void> {
  // The control. A host-derived elapsed figure, redrawn every animation frame, of the kind
  // feature 012 removed from the shell because rendering one made a pinned state differ
  // frame to frame. It is added here, to this browser, after the page has loaded; it is in
  // no build of the client and cannot be reached from one.
  await page.evaluate((id) => {
    const element = document.createElement("p");
    element.id = id;
    element.setAttribute(
      "style",
      "position:fixed;top:0;left:0;z-index:9999;font:16px monospace;background:#fff;color:#000",
    );
    document.body.appendChild(element);
    const start = performance.now(); // harness:allow-wallclock the control's whole purpose is to be a host-clock display, so that the comparison can be shown to catch one
    const tick = (): void => {
      element.textContent = `elapsed ${(performance.now() - start).toFixed(3)}ms`; // harness:allow-wallclock as above; this element exists only inside this test's browser
      requestAnimationFrame(tick);
    };
    tick();
  }, PERTURBATION_ID);

  const before = await halfWithoutSettling(page, "perturbed-before", version);
  const after = await halfWithoutSettling(page, "perturbed-after", version);
  const outcome = difference(before, after);

  expect(outcome.refused, JSON.stringify(outcome.reasons ?? [])).toBe(false);
  expect(
    outcome.differingPixels,
    "the comparison did not notice a display that changes every animation frame. That " +
      "means it is not comparing what it claims to compare, and every empty difference " +
      "it has ever reported is worth nothing.",
  ).toBeGreaterThan(pairSettings.maximum_differing_pixels);

  // And it says where. A pixel count alone cannot tell one changed element from noise
  // scattered over the page, which is what SC-004's "confined to that component" needs.
  const box = outcome.box;
  expect(box, "a non-empty difference must have a bounding box").not.toBeNull();
  const perturbation = await page.locator(`#${PERTURBATION_ID}`).boundingBox();
  expect(perturbation).not.toBeNull();
  const scale = capture.viewport.deviceScaleFactor;
  expect(box!.x).toBeGreaterThanOrEqual(Math.floor(perturbation!.x * scale));
  expect(box!.y).toBeGreaterThanOrEqual(Math.floor(perturbation!.y * scale));
  expect(box!.width).toBeLessThanOrEqual(Math.ceil(perturbation!.width * scale) + scale);
  expect(box!.height).toBeLessThanOrEqual(Math.ceil(perturbation!.height * scale) + scale);

  // Restore. The property must hold again once the perturbation is gone, so that the
  // failure above is demonstrably caused by it rather than by something it coincided with.
  await page.reload();
  await settled(page, capture.client);
  expect(await page.locator(`#${PERTURBATION_ID}`).count()).toBe(0);
  const restoredBefore = await half(page, "restored-before", version);
  const restoredAfter = await half(page, "restored-after", version);
  const restored = difference(restoredBefore, restoredAfter);
  expect(restored.refused).toBe(false);
  expect(
    restored.differingPixels,
    "with the perturbation removed the difference must be empty again; if it is not, the " +
      "test above proved nothing about the perturbation.",
  ).toBeLessThanOrEqual(pairSettings.maximum_differing_pixels);

  mkdirSync(area, { recursive: true });
  writeFileSync(
    join(area, "control.json"),
    `${JSON.stringify(
      {
        pinned,
        perturbedDifferingPixels: outcome.differingPixels,
        perturbedBox: outcome.box,
        restoredDifferingPixels: restored.differingPixels,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/**
 * The perturbed captures deliberately do not wait for the page to settle.
 *
 * Waiting for markup to hold still is exactly what the perturbation makes impossible — the
 * readiness signal would time out and report that the page never settled, which is a
 * different (and also correct) failure. What is under test here is the comparison, so the
 * two captures are taken without it.
 */
async function halfWithoutSettling(page: Page, side: string, version: string): Promise<Half> {
  const clock = await readClock(page);
  const lit = await litComponents(page);
  const image = await page.screenshot();
  return {
    image,
    record: fingerprint({
      browser: {
        name: capture.browser.name,
        version,
        playwrightVersion: capture.browser.playwrightVersion,
        containerImage: capture.browser.containerImage,
      },
      viewport: capture.viewport,
      scenario: { seed: capture.scenario.seed, runId: clock.runId },
      capture: { environment: "determinism", entryPointVersion: "1.0.0", side },
      clock: { simTime: clock.simTime, runDisplay: clock.display },
      lit,
    }),
  };
}

/**
 * Pin the clock where one is answering, and say which happened.
 *
 * Never a silent skip. A clock that is running and unpinned would make this test fail, and
 * that is the correct outcome: the property is that a *pinned* state is identical across
 * captures. Where no sample has ever arrived there is no clock to pin and simulated time is
 * not advancing either, so the property is tested against the state the system is actually
 * in — which is the all-grey shell the specification's own edge case describes.
 */
/**
 * Put back the rate that was in force, deciding what by `restorationPlan` — the pair
 * spec's own discipline (FR-007), applied here because these specs pin the same clock.
 * A clock left pinned outlives the spec: samples are not retained, so every page loaded
 * afterwards finds an unheard clock, and the pair capture would refuse on a stack that
 * is working.
 */
async function restore(page: Page, previous: number | null): Promise<void> {
  const plan = restorationPlan(previous);
  if (plan.action === "report") {
    process.stderr.write(`[determinism] ${plan.reason}\n`);
    return;
  }
  if (plan.action === "none") {
    return;
  }
  await askForRate(page, plan.rate);
  await page.waitForFunction(
    ({ selector, rate }) =>
      document.querySelector(selector)?.getAttribute("data-acknowledged-rate") === String(rate),
    { selector: SPEED_CONTROL, rate: plan.rate },
    { timeout: capture.client.readinessTimeoutMs, polling: "raf" },
  );
}

async function pinIfAClockAnswers(page: Page): Promise<string> {
  const observed = await readRate(page);
  if (observed.acknowledged === null) {
    return "no clock answered: no ctl/clock sample has arrived, so simulated time is not advancing and there is no rate to pin";
  }
  if (observed.pinned) {
    return "the clock was already pinned at zero when this test began";
  }
  await askForRate(page, 0);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute("data-steady") === "true",
    SPEED_CONTROL,
    { timeout: capture.client.readinessTimeoutMs, polling: "raf" },
  );
  return `the clock acknowledged a rate of zero; it was at ${observed.acknowledged} before`;
}
