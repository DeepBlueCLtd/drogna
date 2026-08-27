#!/usr/bin/env node
/**
 * The curated capture: a picture worth publishing, produced for a person to look at.
 *
 *   HARNESS_CONFIG=config/local/capture.json \
 *     node scripts/capture/curate/run.mjs 016-three-mechanisms "alt text for the blog"
 *
 * Writes a candidate and its provenance record into the review area and commits nothing.
 * Committing is a person's act and it is the review gate (PR-01): the author looks at what
 * came out, decides it is worth publishing, and moves it into the published-screenshot
 * location feature 015 defines. Nothing in this repository moves it for them, and a
 * workflow that did would have turned an author's judgement into a default.
 *
 * This file imports nothing from `scripts/capture/glance/` or `scripts/capture/pair/`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const clientDirectory = join(repositoryRoot, "client");
const playwrightConfig = join(clientDirectory, "e2e", "curate.config.ts");

function fail(message) {
  process.stderr.write(`curate: ${message}\n`);
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
    review: resolve(repositoryRoot, document.areas.curated_review),
    published: document.areas.published,
    address: document.client.url,
  };
}

const [name, caption = ""] = process.argv.slice(2);
if (!name) {
  fail("usage: run.mjs <feature-number>-<slug> [caption]");
}

const { review, published, address } = settings();

const run = spawnSync("pnpm", ["exec", "playwright", "test", "--config", playwrightConfig], {
  cwd: clientDirectory,
  stdio: "inherit",
  env: { ...process.env, DROGNA_CURATE_NAME: name, DROGNA_CURATE_CAPTION: caption },
});

if (run.status !== 0) {
  process.stderr.write(
    `\ncurate: no candidate was produced. The client address in the capture configuration ` +
      `is ${address}. Exit status ${run.status ?? "none"}` +
      `${run.signal ? `, signal ${run.signal}` : ""}.\n`,
  );
  process.exit(run.status ?? 1);
}

const image = join(review, `${name}.png`);
const record = join(review, `${name}.provenance.json`);
for (const produced of [image, record]) {
  if (!existsSync(produced)) {
    fail(`the run reported success but ${produced} is not there`);
  }
}

process.stdout.write(
  `\n${image}\n  ${statSync(image).size} bytes\n${record}\n` +
    `\nNothing has been committed. Look at the candidate. If it is worth publishing, move ` +
    `both files into ${published}/ and commit them there; that move is the review gate, ` +
    `and it is yours.\n`,
);
