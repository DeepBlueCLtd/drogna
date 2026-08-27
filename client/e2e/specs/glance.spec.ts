/**
 * The glance: one image of the client as it stands, and nothing else touched.
 *
 * This is the mechanism the SRD's delivery ordering points at when it calls the greyed-out
 * shell "the anchor for the Playwright loop". It is used many times a day and its whole
 * value is being immediate, so it has no gate, no retention rule and no comparison. What
 * it does have is one obligation the other two do not: it must leave the running system
 * exactly as it found it (FR-003).
 *
 * There is no clock write here, no scenario reset and no navigation that changes state.
 * The only interaction with the page is a `goto` and a series of reads. The rate in force
 * is read before and after and both are written into the report; a glance that found them
 * different has altered something it should not have, and it says so rather than quietly
 * handing over an image (FR-003, SC-002).
 *
 * The rate is also reported *alongside the image* because of FR-005. A pair capture
 * elsewhere may be holding the clock at zero while this glance is taken, and an image of a
 * stopped system presented as a live one is the most convincing wrong answer this
 * mechanism could give.
 */
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test } from "@playwright/test";

import { glanceArea } from "../glance.config";
import { loadCaptureConfig } from "../shared/config";
import { openClient, settled } from "../shared/readiness";
import { litCountWords, readClock, readRate } from "../shared/pages/shell";

const capture = loadCaptureConfig();

/**
 * The next free number in the session area.
 *
 * A counter over what is already there, not a timestamp. Constitution I is not in play
 * for test-harness setup, but a file name built from a host clock is a file name that
 * cannot be predicted, and a glance the author cannot find is a glance that did not
 * happen.
 */
function nextName(area: string): string {
  mkdirSync(area, { recursive: true });
  const taken = readdirSync(area)
    .map((entry) => /^glance-(\d+)\./.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
  const next = taken.length === 0 ? 1 : Math.max(...taken) + 1;
  return `glance-${String(next).padStart(4, "0")}`;
}

test("a glance shows the client as it stands and changes nothing", async ({ page }) => {
  await openClient(page, capture.client);
  const readiness = await settled(page, capture.client);

  const before = await readRate(page);
  const clock = await readClock(page);
  const lit = await litCountWords(page);

  const name = nextName(glanceArea);
  const image = join(glanceArea, `${name}.png`);
  await page.screenshot({ path: image });

  const after = await readRate(page);

  const report = {
    mechanism: "glance",
    image,
    // Both readings, so the report carries the evidence for its own claim rather than a
    // claim on its own. FR-005: a frozen system is never silently presented as a live one.
    rateBefore: before,
    rateAfter: after,
    clock,
    litCount: lit,
    framesWatched: readiness.framesWatched,
    address: capture.client.url,
  };
  writeFileSync(join(glanceArea, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (before.acknowledged !== after.acknowledged || before.pinned !== after.pinned) {
    throw new Error(
      `the rate in force changed across a glance: ${JSON.stringify(before)} became ` +
        `${JSON.stringify(after)}. A glance must not alter the running system (FR-003); ` +
        "either something in this path is writing to the clock, or another mechanism is " +
        "holding the clock while this glance was taken.",
    );
  }
});
