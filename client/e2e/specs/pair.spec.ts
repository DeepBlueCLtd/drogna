/**
 * One half of a before/after pair, with the clock pinned for the duration of it.
 *
 * The pair is the only one of the three mechanisms that is a comparison, and comparison is
 * the only thing that needs FR-53's pin. A difference between two moments of a moving
 * system differs everywhere and says nothing; a difference between two moments of a
 * stopped one is the change under evidence and nothing else.
 *
 * The order of operations here is the requirement, not an implementation of it:
 *
 * 1. Read the rate in force, and which components are lit, *before* anything is asked of
 *    the clock. That reading is what the restore returns to and what the liveness check
 *    compares against.
 * 2. Ask for rate zero through the control the client already offers a viewer (SRD FR-49),
 *    and wait for the clock's own acknowledgement — not for a delay, and not for the
 *    request to have been sent. The client publishes the acknowledgement as
 *    `drognaRate.steady`; feature 012 put it there so that a capture waits for the pin
 *    rather than shooting and hoping.
 * 3. Check that every component lit before the pin is still lit (FR-008). Under ADR-0006
 *    it must be: heartbeat cadence and liveness windows are real time, so a rate of zero
 *    stops simulated time and stops nothing else. This is the regression test on that
 *    decision. If it ever fails, a component has reverted to a simulation-time cadence and
 *    the pair about to be captured would be an all-grey picture that looked like a pass.
 * 4. Capture.
 * 5. Restore the rate that was in force, on every path out of here, including the failing
 *    ones. A pair that crashed between pinning and restoring would leave the whole harness
 *    stopped for the next person who looked at it.
 *
 * Nothing here introduces traffic. There is no fixture mode and no demo mode, and a pinned
 * clock is not a mock: the components in the captured image are lit because heartbeats
 * from them arrived, which is the only reason anything is ever lit (Constitution VII).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test } from "@playwright/test";

import { fingerprint } from "../../../scripts/capture/pair/fingerprint.mjs";
import { restorationPlan } from "../../../scripts/capture/pair/restore.mjs";
import { pairArea } from "../pair.config";
import { loadCaptureConfig } from "../shared/config";
import { openClient, settled } from "../shared/readiness";
import {
  askForRate,
  litComponents,
  readClock,
  readRate,
  SPEED_CONTROL,
} from "../shared/pages/shell";

/**
 * The pair entry point's own version, declared here and nowhere else.
 *
 * Not imported from a shared module. A version constant shared between the three
 * mechanisms would be a fourth shared thing, and each entry point's version is a fact
 * about that entry point: a change to the pair's capture procedure must invalidate
 * comparisons against pairs taken before it, and must not invalidate a curated shot.
 */
const PAIR_ENTRY_POINT_VERSION = "1.0.0";

const capture = loadCaptureConfig();

/** Which half is being captured, and under what label. Both come from the entry point. */
const side = process.env["DROGNA_PAIR_SIDE"] ?? "before";
const label = process.env["DROGNA_PAIR_LABEL"] ?? "pair";

/**
 * Where captures are taken. Recorded on both halves and refused on if it differs, because
 * a pair with one half taken locally and one in CI is not a pair (FR-010).
 */
const environment = process.env["GITHUB_ACTIONS"] === "true" ? "github-actions" : "local";

const directory = join(pairArea, label);

/**
 * The guard against two pair captures at once.
 *
 * A lock file rather than a lock: two processes, possibly two shells, and the failure to
 * prevent is the second one restoring a rate the first invented. The file names the run it
 * belongs to, so a stale one after a crash can be read and removed by hand rather than
 * guessed at. It is deliberately not removed on a crash: a pin that was never released is
 * exactly the state a person needs to be told about.
 */
const lock = join(pairArea, "pin.lock");

function takeLock(): void {
  mkdirSync(pairArea, { recursive: true });
  if (existsSync(lock)) {
    const held = readFileSync(lock, "utf8");
    throw new Error(
      `another pair capture holds the clock pin: ${held.trim()}. A second capture would ` +
        "restore a rate it never observed, so this one refuses rather than guessing. If " +
        `no capture is running, the clock may still be pinned; check it and remove ${lock}.`,
    );
  }
  writeFileSync(lock, `${label}/${side} in ${environment}\n`, "utf8");
}

function releaseLock(): void {
  rmSync(lock, { force: true });
}

test(`capture the ${side} half of a pair with the clock pinned`, async ({ page, browser }) => {
  takeLock();
  await openClient(page, capture.client);
  await settled(page, capture.client);

  const rateBefore = await readRate(page);
  const litBefore = await litComponents(page);
  let pinned = false;

  try {
    await askForRate(page, 0);
    pinned = true;
    await waitForPin(page);

    const litUnderPin = await litComponents(page);
    const fallenDark = litBefore.filter((component) => !litUnderPin.includes(component));
    if (fallenDark.length > 0) {
      throw new Error(
        `pinning the clock put ${fallenDark.join(", ")} out of the liveness window. ` +
          "ADR-0006 decides that heartbeat cadence and liveness windows are real time and " +
          "that the simulation time a heartbeat carries is payload rather than schedule, " +
          "so a rate of zero must stop simulated time and stop nothing else. A component " +
          "that has reverted to a simulation-time cadence breaks that decision, and the " +
          "pair this capture was about to produce would have been an all-grey picture " +
          "that looked like a passing capture (FR-008, SC-007).",
      );
    }

    await settled(page, capture.client);
    const clock = await readClock(page);
    const image = join(directory, `${side}.png`);
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: image });

    const record = fingerprint({
      browser: {
        name: capture.browser.name,
        version: browser.version(),
        playwrightVersion: capture.browser.playwrightVersion,
        containerImage: capture.browser.containerImage,
      },
      viewport: capture.viewport,
      scenario: { seed: capture.scenario.seed, runId: clock.runId },
      capture: { environment, entryPointVersion: PAIR_ENTRY_POINT_VERSION, side },
      clock: { simTime: clock.simTime, runDisplay: clock.display },
      lit: litUnderPin,
    });
    // The image is named by its file name, not by its path. The fingerprint sits in the
    // same directory, so the directory is already known to anyone reading it, and a
    // fingerprint travels into a CI artefact where a host path would be noise at best.
    writeFileSync(
      join(directory, `${side}.fingerprint.json`),
      `${JSON.stringify({ ...record, image: `${side}.png` }, null, 2)}\n`,
      "utf8",
    );
  } finally {
    // Every path out of here, including the ones that threw. FR-007 and SC-006: the rate
    // is restored after every pair capture, including every injected failure.
    if (pinned) {
      await restore(page, rateBefore.acknowledged);
    }
    releaseLock();
  }
});

/**
 * Wait for the clock to say the pin has taken effect.
 *
 * On the client's own acknowledgement, published by `captureReadiness` as `drognaRate`.
 * Not on the request having been sent — a request is a request — and not on a delay.
 */
async function waitForPin(page: import("@playwright/test").Page): Promise<void> {
  try {
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute("data-steady") === "true",
      SPEED_CONTROL,
      { timeout: capture.client.readinessTimeoutMs, polling: "raf" },
    );
  } catch {
    const observed = await readRate(page);
    throw new Error(
      "the clock never acknowledged a rate of zero. The page reports " +
        `${JSON.stringify(observed)}. A rate change is a request and the rate in force ` +
        "arrives on ctl/clock; if nothing is arriving there, the clock is not running, " +
        "not reachable at the control route this destination configures, or not " +
        "publishing. Nothing was captured and the previous rate is being restored.",
    );
  }
}

/**
 * Put back the rate that was in force.
 *
 * What to put back is decided by `restorationPlan`, which is pure and has its own tests;
 * this is the part that talks to a browser. Keeping them apart is what lets the case that
 * matters — no rate was ever in force, so there is nothing to put back and inventing one
 * would be worse than leaving a pin a person can see — be exercised without a clock.
 */
async function restore(
  page: import("@playwright/test").Page,
  previous: number | null,
): Promise<void> {
  const plan = restorationPlan(previous);
  if (plan.action === "report") {
    process.stderr.write(`[pair] ${plan.reason}\n`);
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
