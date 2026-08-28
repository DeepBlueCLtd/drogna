/**
 * The pair's own Playwright configuration.
 *
 * The differences from the glance's are the whole argument for not sharing one.
 *
 * - **No retries, for the opposite reason.** The glance does not retry because a second
 *   look is a different moment. The pair does not retry because a retry that succeeds
 *   after a failure is a comparability hazard, not a rescue: the successful half was taken
 *   after whatever the failure did to the running system, and the fingerprint cannot see
 *   the difference. A failed half must be a failed pair.
 * - **One worker, never more.** Two pair captures at once would each pin the clock and
 *   each restore what it believed the previous rate to be, and the second to finish would
 *   restore a rate the first invented. The concurrency guard in the spec is the real
 *   defence; this is the cheap one.
 * - **A long timeout.** The pair has no time target at all. Correctness of the comparison
 *   is the entire point, and pinning the clock and waiting for the pin to be acknowledged
 *   takes as long as the clock takes.
 * - **Traces on.** A pair that failed part way through left a clock pinned and a person
 *   wanting to know why. The glance can afford to say nothing; this cannot.
 */
import { defineConfig } from "@playwright/test";
import { join } from "node:path";

import { areaPath, e2eRoot, loadCaptureConfig } from "./shared/config";

/** The name this mechanism asks the configuration under. Its own, not a shared enum. */
export const MECHANISM = "pair";

/** The pair's own settings, declared here because they are nobody else's business. */
export interface PairSettings {
  readonly retention_days: number;
  readonly difference_threshold: number;
  readonly maximum_differing_pixels: number;
}

const capture = loadCaptureConfig();

export const pairSettings = capture.section<PairSettings>(MECHANISM);

export const pairArea = areaPath(capture.area(MECHANISM));

export default defineConfig({
  testDir: join(e2eRoot, "specs"),
  testMatch: ["pair.spec.ts", "determinism.spec.ts"],
  outputDir: join(pairArea, "runner"),
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
