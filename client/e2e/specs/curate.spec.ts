/**
 * The curated capture: the one picture of the three that anybody else will ever see.
 *
 * Deliberate, by a person, after the feature works. It writes candidates and their
 * provenance records into a review area and commits nothing; a person looks at what came
 * out and moves the one they want into the published-screenshot location feature 015
 * defines. That move is the review gate, and it is a person's, which is why no step here
 * writes into `site/`.
 *
 * Three things this does that neither of the others does.
 *
 * **The viewport only.** `page.screenshot` photographs the page, not the window, so there
 * is no browser chrome, no address bar and no window title in the file — not because they
 * are cropped out afterwards but because they were never in it. `fullPage` is off: one
 * fixed viewport across the whole blog (FR-015), so sixteen features' worth of pictures
 * read as one publication rather than sixteen different shapes.
 *
 * **Masks over anything that could name a host.** The second line, after the first. The
 * client renders no deployment hostname today; the masks come from configuration so that
 * the day one appears it can be covered without a code change, and the check below fails
 * the capture if the host from the configured client address turns up in the page text
 * anyway (FR-017).
 *
 * **A size budget.** A curated image is committed and kept for ever. A candidate over
 * budget is refused here, before anyone can be tempted by it.
 *
 * The clock: pinned if `curated.pin_clock` says so, and the curator decides that on their
 * own grounds — a shot that can be taken again a year later from the same seed and the
 * same simulated instant. The pair pins for a different reason entirely, and that the two
 * agree is a coincidence of this configuration rather than shared behaviour.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test } from "@playwright/test";

import { provenance, scrub } from "../../../scripts/capture/curate/sidecar.mjs";
import { curatedReviewArea, curatedSettings } from "../curate.config";
import { loadCaptureConfig } from "../shared/config";
import { openClient, settled } from "../shared/readiness";
import {
  askForRate,
  litComponents,
  readClock,
  readRate,
  SPEED_CONTROL,
} from "../shared/pages/shell";

/** This entry point's own version, declared here and shared with no other mechanism. */
const CURATE_ENTRY_POINT_VERSION = "1.0.0";

const capture = loadCaptureConfig();

/**
 * The candidate's name, in feature 015's convention: `<feature-number>-<slug>.png`.
 *
 * Supplied by the person running the capture. There is no default, because a picture whose
 * name nobody chose is a picture nobody will find again.
 */
const slug = process.env["DROGNA_CURATE_NAME"] ?? "";
const caption = process.env["DROGNA_CURATE_CAPTION"] ?? "";

test("produce a curated candidate and its provenance record", async ({ page, browser }) => {
  if (!/^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `DROGNA_CURATE_NAME must be <feature-number>-<slug>, for example 003-shell-all-dark; ` +
        `it was ${JSON.stringify(slug)}. That is feature 015's naming convention for the ` +
        "published-screenshot location, and a candidate that does not follow it cannot be " +
        "moved there without being renamed by hand.",
    );
  }

  await openClient(page, capture.client);
  await settled(page, capture.client);

  const pinned = await pinIfAsked(page);

  const host = new URL(capture.client.url).hostname;
  const text = await page.evaluate(() => document.body.innerText);
  if (host !== "" && text.includes(host)) {
    throw new Error(
      `the page displays the deployment host ${host}, and a curated image is published. ` +
        "Add a selector covering it to curated.masked_selectors in the capture " +
        "configuration, or stop the client displaying it (FR-017, PR-01).",
    );
  }

  const clock = await readClock(page);
  const lit = await litComponents(page);

  mkdirSync(curatedReviewArea, { recursive: true });
  const imageName = `${slug}.png`;
  const image = join(curatedReviewArea, imageName);
  await page.screenshot({
    path: image,
    fullPage: false,
    mask: curatedSettings.masked_selectors.map((selector) => page.locator(selector)),
  });

  const size = statSync(image).size;
  if (size > curatedSettings.maximum_bytes) {
    throw new Error(
      `${imageName} is ${size} bytes, over the ${curatedSettings.maximum_bytes}-byte budget ` +
        "for a curated image. A repository keeps a committed picture for ever; this " +
        "refuses before anyone can commit one.",
    );
  }

  const record = provenance({
    imageName,
    seed: capture.scenario.seed,
    simTime: clock.simTime,
    viewport: capture.viewport,
    deviceScaleFactor: capture.viewport.deviceScaleFactor,
    entryPointVersion: CURATE_ENTRY_POINT_VERSION,
    browser: { name: capture.browser.name, version: browser.version() },
    clockPinned: pinned,
    litComponents: lit,
    caption,
  });
  writeFileSync(join(curatedReviewArea, `${slug}.provenance.json`), scrub(record), "utf8");
});

/**
 * Pin the clock if the curator asked for it, and record in words what happened.
 *
 * Three outcomes, and the record says which. Pinned; already pinned; or no clock has ever
 * reported a rate, in which case there is nothing to pin and simulated time is not
 * advancing either — the all-grey shell, which is a real state of a real system and the
 * one the earliest entries in this blog are pictures of. What is never allowed is the
 * fourth: a curator asked for a pin, a clock is running, and it did not take. That fails,
 * because a shot taken while the simulation was moving cannot be taken again.
 */
async function pinIfAsked(page: import("@playwright/test").Page): Promise<string> {
  if (!curatedSettings.pin_clock) {
    return "not pinned: this destination's curated captures are taken as the system stands";
  }
  const observed = await readRate(page);
  if (observed.acknowledged === null) {
    return "no clock answered: no ctl/clock sample had arrived, so there was no rate to pin and simulated time was not advancing";
  }
  if (observed.pinned) {
    return "already pinned at zero before this capture began";
  }
  await askForRate(page, 0);
  try {
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute("data-steady") === "true",
      SPEED_CONTROL,
      { timeout: capture.client.readinessTimeoutMs, polling: "raf" },
    );
  } catch {
    throw new Error(
      `the clock reported ${observed.acknowledged} in force and never acknowledged a rate ` +
        "of zero. A curated shot taken while the simulation is moving cannot be taken " +
        "again from its provenance record, which is the whole point of the record.",
    );
  }
  await settled(page, capture.client);
  return `pinned at zero; the clock reported ${observed.acknowledged} in force before`;
}
