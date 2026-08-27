/**
 * A capture against nothing fails quickly and names the address it tried.
 *
 * User story 1's fourth acceptance scenario, and it is about a message rather than a
 * failure. Every mechanism here fails when the client is not running — that is not in
 * doubt. What is in doubt, and what this pins, is whether the failure tells the author
 * anything: "net::ERR_CONNECTION_REFUSED" is true of both destinations and of a typo, and
 * the one thing an author needs to know is which address was tried and where it came from.
 *
 * The port is one that was open a moment ago and is now closed, so it is free and nothing
 * can be listening on it. A port picked out of the air might be in use by something else on
 * a busy machine, and this test would then pass while proving nothing.
 *
 * This lives under the glance's Playwright configuration because the glance is the
 * mechanism whose whole value is being immediate: a glance that hangs for a minute against
 * a dead address is a glance nobody uses again.
 */
import { createServer } from "node:net";

import { expect, test } from "@playwright/test";

import { openClient, ReadinessError } from "../shared/readiness";
import { loadCaptureConfig } from "../shared/config";

const capture = loadCaptureConfig();

/** A port that was bound and released, so it is free and nothing is listening on it. */
async function closedPort(): Promise<number> {
  return new Promise((announce, refuse) => {
    const server = createServer();
    server.on("error", refuse);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        refuse(new Error("the operating system gave no port to release"));
        return;
      }
      const port = address.port;
      server.close(() => {
        announce(port);
      });
    });
  });
}

test("a capture against an unreachable client names the configured address", async ({ page }) => {
  const port = await closedPort();
  const address = `${new URL(capture.client.url).protocol}//127.0.0.1:${port}`;

  let raised: unknown = null;
  try {
    await openClient(page, { ...capture.client, url: address });
  } catch (error) {
    raised = error;
  }

  expect(
    raised,
    "reaching a client that is not there succeeded, so this test proves nothing about " +
      "what happens when it fails.",
  ).toBeInstanceOf(ReadinessError);
  const message = (raised as Error).message;
  expect(message).toContain(address);
  expect(message).toContain("came ");
  expect(message).toContain("capture configuration");
});
