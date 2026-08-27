#!/usr/bin/env node
/**
 * The pair: two captures of the same view either side of a change, and the difference.
 *
 *   HARNESS_CONFIG=config/local/capture.json node scripts/capture/pair/run.mjs before [label]
 *   ... make the change ...
 *   HARNESS_CONFIG=config/local/capture.json node scripts/capture/pair/run.mjs after  [label]
 *   HARNESS_CONFIG=config/local/capture.json node scripts/capture/pair/run.mjs diff   [label]
 *
 * Three commands rather than one, because the change happens between the first two and
 * nothing here can know when it is finished. The label separates concurrent lines of work
 * within a branch; the areas are branch-scoped and git-ignored, and a pair's life is the
 * life of the branch (FR-012).
 *
 * The clock is pinned to zero for the duration of each capture and restored afterwards,
 * including when the capture fails part way through. That happens inside the Playwright
 * spec, where the browser is, and not here: this file starts a capture and reports what it
 * produced.
 *
 * `diff` refuses before it draws. If the two halves were taken in different browsers, at
 * different sizes, at different scale factors, from different seeds or one locally and one
 * in CI, no difference image is produced at all and the field that differs is named. A
 * difference that looks like evidence and is not is worse than no difference.
 *
 * This file imports nothing from `scripts/capture/glance/` or `scripts/capture/curate/`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareOnDisk } from "./diff.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const clientDirectory = join(repositoryRoot, "client");
const playwrightConfig = join(clientDirectory, "e2e", "pair.config.ts");

const SIDES = ["before", "after"];
const USAGE = "usage: run.mjs <before|after|diff> [label]";

function fail(message) {
  process.stderr.write(`pair: ${message}\n`);
  process.exit(2);
}

/** This entry point's own reading of the configuration; see the note in glance/run.mjs. */
function settings() {
  const named = process.env.HARNESS_CONFIG;
  if (!named) {
    fail("HARNESS_CONFIG is not set; it must name a capture configuration document.");
  }
  const location = resolve(repositoryRoot, named);
  if (!existsSync(location)) {
    fail(`no capture configuration at ${location}`);
  }
  const document = JSON.parse(readFileSync(location, "utf8"));
  return {
    directory: resolve(repositoryRoot, document.areas.pair),
    address: document.client.url,
    threshold: document.pair.difference_threshold,
    maximumDifferingPixels: document.pair.maximum_differing_pixels,
    retentionDays: document.pair.retention_days,
  };
}

const [command, label = "pair"] = process.argv.slice(2);
if (command === undefined) {
  fail(USAGE);
}

const { directory, address, threshold, maximumDifferingPixels, retentionDays } = settings();
const pairDirectory = join(directory, label);

if (SIDES.includes(command)) {
  // Named explicitly, so that capturing a half runs the capture and not the mechanism's
  // own determinism specs, which live under the same Playwright configuration because they
  // are the pair's tests and belong to the pair.
  const spec = join("e2e", "specs", "pair.spec.ts");
  const run = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", playwrightConfig, spec],
    {
      cwd: clientDirectory,
      stdio: "inherit",
      env: { ...process.env, DROGNA_PAIR_SIDE: command, DROGNA_PAIR_LABEL: label },
    },
  );
  if (run.status !== 0) {
    process.stderr.write(
      `\npair: the ${command} half was not captured. The client address in the capture ` +
        `configuration is ${address}. Exit status ${run.status ?? "none"}` +
        `${run.signal ? `, signal ${run.signal}` : ""}. If the failure happened after the ` +
        "clock was pinned, the spec restored the previous rate on its way out; the " +
        "Playwright output above says which step failed.\n",
    );
    process.exit(run.status ?? 1);
  }
  process.stdout.write(`\n${join(pairDirectory, `${command}.png`)}\n`);
  process.exit(0);
}

if (command !== "diff") {
  fail(`${command} is not a pair command. ${USAGE}`);
}

for (const side of SIDES) {
  for (const suffix of ["png", "fingerprint.json"]) {
    const required = join(pairDirectory, `${side}.${suffix}`);
    if (!existsSync(required)) {
      fail(
        `${required} is missing, so there is no pair to compare. Capture both halves ` +
          `first: run.mjs before ${label}, then run.mjs after ${label}.`,
      );
    }
  }
}

const outcome = compareOnDisk({
  directory: pairDirectory,
  threshold,
  maximumDifferingPixels,
});

if (outcome.refused) {
  process.stderr.write(`\npair: ${outcome.message}\n`);
  process.exit(1);
}

const box = outcome.box;
const where =
  box === null
    ? "nowhere: the two halves are identical"
    : `within ${box.width}x${box.height} device pixels at (${box.x}, ${box.y})`;

process.stdout.write(
  `\n${join(pairDirectory, "difference.png")}\n` +
    `  ${outcome.differingPixels} of ${outcome.totalPixels} pixels differ, ${where}\n` +
    `  ${outcome.empty ? "EMPTY" : "NOT EMPTY"} against a budget of ${maximumDifferingPixels}\n` +
    `  this pair is a branch artefact and is kept for ${retentionDays} days in CI; ` +
    "nothing here is committed\n",
);
// A non-empty difference is the ordinary outcome of a pair captured across a change, so
// it is not a failure here. What is a failure is a refusal, and that exited above.
process.exit(0);
