/**
 * The curated capture's own Playwright configuration.
 *
 * This is the only one of the three whose output is durable, public and reviewed, and the
 * configuration says so in the two places it can.
 *
 * - **The viewport and device scale factor come from the capture configuration and are
 *   fixed for the whole blog** (FR-015). Every other mechanism could in principle be run
 *   at a different size without anyone being misled; the blog cannot, because sixteen
 *   features' worth of pictures at sixteen sizes is a scrapbook rather than a
 *   publication. The same values reach the dimension test, which is what stops the fixing
 *   from being merely intended.
 * - **No web server, and nothing is started.** A curated shot is of a system a person
 *   decided was working. Starting one here would make the picture a picture of this
 *   configuration file.
 *
 * The clock: the curated mechanism pins at the curator's discretion, from
 * `curated.pin_clock` in the configuration, and it decides that for itself on its own
 * grounds — a shot that can be taken again a year later. That it reaches the same
 * conclusion as the pair for a different reason is precisely why the two are not one
 * mechanism with a flag.
 */
import { defineConfig } from "@playwright/test";
import { join } from "node:path";

import { areaPath, e2eRoot, loadCaptureConfig } from "./shared/config";

/** The names this mechanism asks the configuration under. Its own, not a shared enum. */
export const MECHANISM = "curated";
const REVIEW_AREA = "curated_review";

/** The curated mechanism's own settings, declared here because they are nobody else's. */
export interface CuratedSettings {
  readonly maximum_bytes: number;
  readonly pin_clock: boolean;
  readonly masked_selectors: readonly string[];
}

const capture = loadCaptureConfig();

export const curatedSettings = capture.section<CuratedSettings>(MECHANISM);
export const publishedArea = capture.area("published");

export const curatedReviewArea = areaPath(capture.area(REVIEW_AREA));

export default defineConfig({
  testDir: join(e2eRoot, "specs"),
  testMatch: ["curate.spec.ts"],
  outputDir: join(curatedReviewArea, "runner"),
  retries: 0,
  workers: 1,
  fullyParallel: false,
  timeout: capture.client.readinessTimeoutMs * 6,
  expect: { timeout: capture.client.readinessTimeoutMs },
  reporter: [["list"]],
  use: {
    baseURL: capture.client.url,
    // With the page behind the proxy's clearance, the browser presents the credential
    // the configuration resolved; absent a declaration, nothing is presented.
    httpCredentials: capture.client.httpCredentials,
    viewport: { width: capture.viewport.width, height: capture.viewport.height },
    deviceScaleFactor: capture.viewport.deviceScaleFactor,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "off",
  },
});
