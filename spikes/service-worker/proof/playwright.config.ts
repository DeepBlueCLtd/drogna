/**
 * Spike code: this spike's own Playwright configuration, not a project inside another.
 *
 * It starts no web server of its own — `run.sh` starts one, learns the port it was given
 * and passes it in — because the port cannot be known before the server has bound it, and
 * a configuration that guessed one would fail on a machine where something else had it.
 */
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const baseURL = process.env["SPIKE_BASE_URL"];
if (baseURL === undefined) {
  throw new Error("SPIKE_BASE_URL is not set; run this through spikes/service-worker/run.sh");
}

const results = process.env["SPIKE_RESULTS"];
if (results === undefined) {
  throw new Error("SPIKE_RESULTS is not set; run this through spikes/service-worker/run.sh");
}

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: ["*.spec.ts"],
  outputDir: `${results}/runner`,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    // The preview is one page; nothing here needs a trace or a video.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
