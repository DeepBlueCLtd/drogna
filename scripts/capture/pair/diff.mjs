/**
 * The difference between two halves of a pair — after the refusal, never before it.
 *
 * The first act of this module is to refuse. Producing a picture and then mentioning that
 * the two halves might not be comparable gets the order exactly wrong: the picture is what
 * a person acts on, and by the time they have looked at it the caveat has been read as
 * boilerplate. So `compare` returns a refusal and no image, or an image and no refusal.
 *
 * A no-change pair must produce an empty difference, on repeated runs (FR-011, SC-003).
 * That is the property everything else here rests on, and it is only reachable because the
 * client renders nothing that varies frame to frame at a pinned rate — feature 012 removed
 * the host-derived elapsed displays that made it unreachable, and `shared/readiness.ts`
 * waits for the markup to hold still. A comparison whose no-change answer is not empty has
 * no business being trusted with a change.
 *
 * The bounding box is what lets "the difference is confined to that component" be a test
 * rather than a look (SC-004). Without it the only assertion available is a pixel count,
 * and a pixel count cannot tell one changed box from a hundred changed pixels scattered
 * over the page.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

// The pixel libraries are the client package's, because the constitution fixes pnpm for
// the client and a second node package in the repository would be a second lockfile to
// keep honest. Anchoring the resolution at the client's manifest is what lets a script
// outside `client/` use them without one.
const require = createRequire(new URL("../../../client/package.json", import.meta.url));
const { default: pixelmatch } = require("pixelmatch");
const { PNG } = require("pngjs");

import { incomparabilities, refusalMessage } from "./fingerprint.mjs";

/**
 * Compare two halves.
 *
 * Returns either `{ refused: true, reasons, message }` or `{ refused: false, ... }` with
 * the counts, the bounding box of what differed and the difference image's pixels.
 */
export function compare({ before, after, beforeFingerprint, afterFingerprint, threshold }) {
  const reasons = incomparabilities(beforeFingerprint, afterFingerprint);
  if (reasons.length > 0) {
    return {
      refused: true,
      reasons,
      message: refusalMessage(beforeFingerprint, afterFingerprint),
    };
  }

  const left = PNG.sync.read(before);
  const right = PNG.sync.read(after);
  if (left.width !== right.width || left.height !== right.height) {
    const detail = `${left.width}x${left.height} before, ${right.width}x${right.height} after`;
    return {
      refused: true,
      reasons: [`image dimensions: ${detail}`],
      message:
        "these two halves are different sizes, so no difference will be produced from " +
        `them: ${detail}. Two machines with different device scale factors is the usual ` +
        "cause, and the fingerprint records the scale factor precisely so that this is a " +
        "refusal rather than a difference that looks like evidence.",
    };
  }

  const difference = new PNG({ width: left.width, height: left.height });
  const differingPixels = pixelmatch(
    left.data,
    right.data,
    difference.data,
    left.width,
    left.height,
    { threshold, includeAA: false },
  );

  return {
    refused: false,
    differingPixels,
    totalPixels: left.width * left.height,
    width: left.width,
    height: left.height,
    box: boundingBox(left, right),
    image: PNG.sync.write(difference),
  };
}

/**
 * The smallest rectangle containing every pixel that differs, in device pixels.
 *
 * Computed from the two originals rather than from pixelmatch's output image, because that
 * output paints unchanged pixels as a faded copy of the original and a bounding box drawn
 * over it would be the whole page every time.
 */
function boundingBox(left, right) {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const offset = (y * left.width + x) * 4;
      const same =
        left.data[offset] === right.data[offset] &&
        left.data[offset + 1] === right.data[offset + 1] &&
        left.data[offset + 2] === right.data[offset + 2] &&
        left.data[offset + 3] === right.data[offset + 3];
      if (same) {
        continue;
      }
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }
  if (minimumX === Number.POSITIVE_INFINITY) {
    return null;
  }
  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
  };
}

/** Read a pair from disk, compare it, and write the difference beside it. */
export function compareOnDisk({ directory, threshold, maximumDifferingPixels }) {
  const read = (name) => readFileSync(`${directory}/${name}`);
  const readJson = (name) => JSON.parse(readFileSync(`${directory}/${name}`, "utf8"));

  const outcome = compare({
    before: read("before.png"),
    after: read("after.png"),
    beforeFingerprint: readJson("before.fingerprint.json"),
    afterFingerprint: readJson("after.fingerprint.json"),
    threshold,
  });

  if (outcome.refused) {
    const summary = { refused: true, reasons: outcome.reasons };
    writeFileSync(`${directory}/difference.json`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return outcome;
  }

  writeFileSync(`${directory}/difference.png`, outcome.image);
  const summary = {
    refused: false,
    differingPixels: outcome.differingPixels,
    totalPixels: outcome.totalPixels,
    empty: outcome.differingPixels <= maximumDifferingPixels,
    maximumDifferingPixels,
    box: outcome.box,
  };
  writeFileSync(`${directory}/difference.json`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return { ...outcome, empty: summary.empty };
}
