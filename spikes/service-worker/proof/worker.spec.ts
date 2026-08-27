/**
 * Spike code. What a service worker can and cannot do for a backend-less preview.
 *
 * Every wait here is on a condition the page publishes — `window.drognaProbe`, written in
 * one go once the page has finished — and never on a timer. That is feature 016's FR-019
 * rule, and `scripts/check_no_fixed_sleep.py` is pointed at this directory by `run.sh` so
 * the rule is enforced rather than merely intended.
 */
import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

/** The record the page writes when it has finished. Shape is the page's, not a contract. */
interface Probe {
  base: string;
  supported: boolean;
  controlledAtLoad: boolean;
  scope?: string;
  workerState?: string;
  howControlled?: string;
  reason?: string;
  beforeRegistration: Answer;
  bootstrap?: Answer;
  afterControlling?: Answer;
  collection?: Answer;
  unknownCollection?: Answer;
  trajectory?: Answer;
  outsideExtent?: Answer;
  badCoords?: Answer;
  clock?: Answer;
  rate?: Answer;
}

interface Answer {
  status: number | null;
  servedBy: string | null;
  body: Record<string, unknown> | null;
  error?: string;
}

/** Wait for the page to say it has finished. A condition, not a duration. */
async function probeOf(page: Page): Promise<Probe> {
  await page.waitForFunction(() => "drognaProbe" in window);
  return (await page.evaluate(() => (window as unknown as { drognaProbe: Probe }).drognaProbe));
}

test.describe("a preview with its components in the page", () => {
  test("the worker's scope is the directory it was served from", async ({ page, baseURL }) => {
    await page.goto("/drogna/pr/17/");
    const probe = await probeOf(page);

    expect(probe.workerState).toBe("controlling");
    expect(probe.scope).toBe("/drogna/pr/17/");
    expect(new URL(baseURL ?? "").protocol).toBe("http:"); // 127.0.0.1 is a secure context
  });

  test("one preview's worker cannot answer for another, or for the site root", async ({
    page,
  }) => {
    await page.goto("/drogna/pr/17/");
    expect((await probeOf(page)).workerState).toBe("controlling");

    // A sibling preview, in the same origin and the same browsing context.
    await page.goto("/drogna/pr/18/");
    const sibling = await probeOf(page);
    expect(sibling.controlledAtLoad).toBe(false);
    expect(sibling.beforeRegistration.servedBy).toBeNull();
    expect(sibling.beforeRegistration.status).toBe(404);

    await page.goto("/drogna/");
    const root = await probeOf(page);
    expect(root.controlledAtLoad).toBe(false);
    expect(root.beforeRegistration.servedBy).toBeNull();
  });

  test("the first visit races, and waiting on the controller is what settles it", async ({
    page,
  }) => {
    await page.goto("/drogna/pr/17/");
    const probe = await probeOf(page);

    // The load that installed the worker was not controlled by it, and the request issued
    // before registration reached the server and got a 404. That is the race, and it is
    // not subtle: on a first visit there is a window in which the query layer is absent.
    expect(probe.controlledAtLoad).toBe(false);
    expect(probe.beforeRegistration.servedBy).toBeNull();
    expect(probe.beforeRegistration.status).toBe(404);

    // How the window closes is *not* asserted, deliberately. `clients.claim()` may have
    // set a controller before `navigator.serviceWorker.ready` resolved, or the page may
    // have had to wait for `controllerchange`; which of the two happens is a timing
    // detail rather than a guarantee of the specification. This run observed the first.
    // Asserting it would be asserting a coincidence — a test that passes on this machine
    // and fails on a slower one — so what is asserted is that both paths are handled and
    // that the page ends up controlled without any wait on a duration.
    expect(["claimed", "already-controlling"]).toContain(probe.howControlled);

    // Once controlled, the same request is answered by the worker.
    expect(probe.afterControlling?.servedBy).toBe("worker");
    expect(probe.afterControlling?.status).toBe(200);
  });

  test("a return visit is controlled from its very first request", async ({ page }) => {
    await page.goto("/drogna/pr/17/");
    expect((await probeOf(page)).workerState).toBe("controlling");

    await page.reload();
    const probe = await probeOf(page);
    expect(probe.controlledAtLoad).toBe(true);
    expect(probe.howControlled).toBe("already-controlling");
    expect(probe.beforeRegistration.servedBy).toBe("worker");
    expect(probe.beforeRegistration.status).toBe(200);
  });

  test("the bootstrap document comes from the origin, not from the worker", async ({ page }) => {
    await page.goto("/drogna/pr/17/");
    const probe = await probeOf(page);

    expect(probe.bootstrap?.status).toBe(200);
    expect(probe.bootstrap?.servedBy).toBeNull();
    expect(probe.bootstrap?.body).toHaveProperty("query");
  });

  test("the responses are real network responses, attributed to the worker", async ({ page }) => {
    const fromWorker: string[] = [];
    const seen: string[] = [];
    page.on("response", (response: Response) => {
      seen.push(new URL(response.url()).pathname);
      if (response.fromServiceWorker()) {
        fromWorker.push(new URL(response.url()).pathname);
      }
    });

    await page.goto("/drogna/pr/17/");
    await probeOf(page);

    // Playwright's own attribution, not the header the spike added for the page to read.
    expect(fromWorker).toContain("/drogna/pr/17/query/collections");
    expect(fromWorker).toContain("/drogna/pr/17/clock/snapshot");
    // The document and the script came from the server, and are visible as separate calls.
    expect(seen).toContain("/drogna/pr/17/app.js");
    expect(fromWorker).not.toContain("/drogna/pr/17/config.json");
  });

  test("it answers EDR shapes, and refuses rather than inventing one", async ({ page }) => {
    await page.goto("/drogna/pr/17/");
    const probe = await probeOf(page);

    expect(probe.collection?.status).toBe(200);
    expect(probe.trajectory?.status).toBe(200);
    expect(probe.trajectory?.body).toMatchObject({ type: "Coverage" });
    expect((probe.trajectory?.body as { domain: { domainType: string } }).domain.domainType).toBe(
      "Trajectory",
    );

    // A collection this preview does not carry is a 404, not an empty success.
    expect(probe.unknownCollection?.status).toBe(404);
    expect(probe.unknownCollection?.body).toMatchObject({ code: "NotFound" });

    // F7: a published slice has a fixed extent, and outside it the answer is an error.
    expect(probe.outsideExtent?.status).toBe(400);
    expect(probe.badCoords?.status).toBe(400);
  });

  test("the clock is reachable, and answers with the rate in force", async ({ page }) => {
    await page.goto("/drogna/pr/17/");
    const probe = await probeOf(page);

    expect(probe.clock?.status).toBe(200);
    expect(probe.clock?.body).toMatchObject({ mode: "paused", rate: 0 });

    // A rate request is a request. The answer is what is in force, not what was asked for.
    expect(probe.rate?.status).toBe(200);
    expect(probe.rate?.body).toMatchObject({ in_force: 0 });
  });
});

test.describe("a browser that will not run a worker", () => {
  test.use({ serviceWorkers: "block" });

  test("the page reports that it has no query layer rather than appearing to have one", async ({
    page,
  }) => {
    await page.goto("/drogna/pr/17/");
    const probe = await probeOf(page);

    expect(probe.workerState).toBe("unavailable");
    expect(probe.reason).toBeTruthy();
    // Crucially it did not hang waiting for a controller that was never coming.
    expect(probe.afterControlling).toBeUndefined();
  });
});
