/**
 * The glance's own Playwright configuration. Not a project inside a shared one.
 *
 * Three configuration files rather than one with three projects is the point of PR-10 in
 * its smallest form: a project is a shared entry point with a flag, and the moment the
 * three mechanisms share an entry point they begin sharing the timeout, the retry policy
 * and the output directory, which are three of the things that must differ.
 *
 * What differs here, and why:
 *
 * - **No retries.** A glance is a look at the system as it is. A retry would show a
 *   different moment and say nothing about which one you got.
 * - **The shortest workable timeout.** SC-001 asks for an image in under ten seconds
 *   against a running client, because a glance that is slow enough to think about is one
 *   nobody takes. The readiness timeout comes from the capture configuration and the test
 *   timeout is set from it, so the two cannot drift.
 * - **No web server.** The glance never starts the client. Acceptance scenario 4 of user
 *   story 1 is that a glance against nothing fails quickly and names the configured
 *   address, and a configuration that helpfully started a server would turn that honest
 *   failure into a picture of a client the author was not asking about.
 * - **Its own output directory**, under the session area, which is git-ignored and has no
 *   retention rule beyond the session (FR-004).
 */
import { defineConfig } from "@playwright/test";
import { join } from "node:path";

import { areaPath, e2eRoot, loadCaptureConfig } from "./shared/config";

/** The name this mechanism asks the configuration under. Its own, not a shared enum. */
const MECHANISM = "glance";

const capture = loadCaptureConfig();

/** Playwright's own scratch space for this mechanism, inside this mechanism's area. */
export const glanceArea = areaPath(capture.area(MECHANISM));

export default defineConfig({
  testDir: join(e2eRoot, "specs"),
  testMatch: ["glance.spec.ts", "unreachable.spec.ts"],
  outputDir: join(glanceArea, "runner"),
  retries: 0,
  workers: 1,
  fullyParallel: false,
  timeout: capture.client.readinessTimeoutMs * 2,
  expect: { timeout: capture.client.readinessTimeoutMs },
  reporter: [["list"]],
  use: {
    baseURL: capture.client.url,
    // The page is served through the boundary behind its clearance (issue #34, link 6),
    // so a glance presents the capture document's credential to load it at all. Presented
    // only when the document carries a secret: against the tracked document, which names
    // an identity and no secret, the challenge refuses the glance and the failure names
    // the document — which is this mechanism's honest "the client is not reachable".
    httpCredentials:
      capture.client.credentials.secret === ""
        ? undefined
        : {
            username: capture.client.credentials.user,
            password: capture.client.credentials.secret,
          },
    viewport: { width: capture.viewport.width, height: capture.viewport.height },
    deviceScaleFactor: capture.viewport.deviceScaleFactor,
    // A glance is a look, not an investigation: no trace, no video, no screenshot on
    // failure. The one image it produces is the one it was asked for.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
