#!/usr/bin/env node
/**
 * The glance: show the author what the client looks like right now.
 *
 *   HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs
 *
 * Touches nothing. Does not pin the clock, does not reset the scenario, does not navigate
 * anywhere that changes state, and starts no server: if the client is not running, this
 * fails within a few seconds and names the address it tried, which came from the capture
 * configuration rather than from anything in this file.
 *
 * The output goes to the session area, which is git-ignored and has no retention rule
 * beyond the session. Nothing here is reviewed and nothing here is durable. That is not an
 * omission — see `scripts/capture/README.md` for why a gated glance is not a glance.
 *
 * This file imports nothing from `scripts/capture/pair/` or `scripts/capture/curate/`, and
 * `client/e2e/tests/separation.test.ts` fails if it ever does.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const clientDirectory = join(repositoryRoot, "client");
const playwrightConfig = join(clientDirectory, "e2e", "glance.config.ts");

/**
 * The configuration document, read here as well as in the Playwright configuration.
 *
 * Deliberately read twice rather than shared. This entry point needs one fact — where its
 * own output area is — and a module that handed it to all three entry points would be the
 * beginning of the shared plumbing PR-10 forbids. Five lines of JSON reading in each of
 * three files is the cheaper thing to keep honest. Validation belongs to the Playwright
 * configuration, which runs before any browser starts.
 */
function area() {
  const named = process.env.HARNESS_CONFIG;
  if (!named) {
    fail(
      "HARNESS_CONFIG is not set. It must name a capture configuration document; the " +
        "repository ships one per destination under config/.",
    );
  }
  const location = resolve(repositoryRoot, named);
  if (!existsSync(location)) {
    fail(`no capture configuration at ${location}`);
  }
  const document = JSON.parse(readFileSync(location, "utf8"));
  return {
    directory: resolve(repositoryRoot, document.areas.glance),
    address: document.client.url,
  };
}

function fail(message) {
  process.stderr.write(`glance: ${message}\n`);
  process.exit(2);
}

const { directory, address } = area();

// Named explicitly, so that taking a glance takes a glance and does not also run the
// mechanism's own test of what happens when the client is not there.
const spec = join("e2e", "specs", "glance.spec.ts");
const run = spawnSync("pnpm", ["exec", "playwright", "test", "--config", playwrightConfig, spec], {
  cwd: clientDirectory,
  stdio: "inherit",
  env: process.env,
});

if (run.status !== 0) {
  process.stderr.write(
    `\nglance: no image was produced. The client address in the capture configuration is ` +
      `${address}; the Playwright output above says what happened when it was reached. ` +
      `Exit status ${run.status ?? "none"}${run.signal ? `, signal ${run.signal}` : ""}.\n`,
  );
  process.exit(run.status ?? 1);
}

const reports = readdirSync(directory)
  .filter((entry) => /^glance-\d+\.json$/.test(entry))
  .sort();
const latest = reports[reports.length - 1];
if (latest === undefined) {
  fail(`the run reported success but wrote no report into ${directory}`);
}

const report = JSON.parse(readFileSync(join(directory, latest), "utf8"));
const rate = report.rateAfter;

/**
 * The rate is printed beside the image, every time (FR-005).
 *
 * A pair capture elsewhere may be holding the clock at zero while this glance is taken. An
 * image of a stopped system handed over as if it were a live one is the most convincing
 * wrong answer this mechanism could give, so the answer always comes with the rate that
 * was in force when it was taken.
 */
const words =
  rate.acknowledged === null
    ? "no rate is known to be in force: no time sample had arrived when this was taken"
    : rate.pinned
      ? "the clock reports a rate of ZERO in force — simulated time is stopped, so this " +
        "image is of a pinned system, not a moving one"
      : `the clock reports a rate of ${rate.acknowledged} in force`;

process.stdout.write(`\n${report.image}\n  ${words}\n  ${report.litCount}\n`);
