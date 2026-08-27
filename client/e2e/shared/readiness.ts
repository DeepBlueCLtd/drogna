/**
 * When the client is settled, and how a mechanism finds out.
 *
 * FR-019 forbids a fixed sleep anywhere in a capture path, and the reason is not tidiness.
 * A sleep is a host-clock dependency in a different hat: it passes on a fast machine,
 * fails on a slow one, and — worst of the three — succeeds on a slow one by capturing a
 * half-drawn page that nobody notices until the picture is on a blog. So every wait here
 * is on something the application itself produced.
 *
 * Three signals, in the order they can be relied on.
 *
 * 1. **The shell is in the document.** The client draws the whole component layout before
 *    it fetches anything (FR-019 in the client's own sense), so the diagram's presence
 *    says the page has run, not that it has heard anything.
 * 2. **The fonts have loaded.** `document.fonts.ready` is the browser telling us that no
 *    further reflow is coming from a font arriving late. This is the signal that answers
 *    the specification's edge case about a blog drifting in appearance because a shot was
 *    taken on a machine with different fonts: it cannot make two machines' fonts the
 *    same, but it stops a capture racing its own font loading on one machine.
 * 3. **The markup has stopped changing.** The client redraws on every animation frame and
 *    throttles to a frame budget, so "the page has stopped changing" is a statement about
 *    frames, and it is counted in frames. `stable_frames` consecutive frames rendering
 *    identical markup is the settled signal; `maximum_frames` bounds the watch. Neither
 *    reads a clock of any kind, which is the point — a bound expressed in seconds would be
 *    the sleep this module exists to avoid, wearing yet another hat.
 *
 * The third signal is what makes SC-003 reachable at all. Two captures of a page that is
 * still changing differ wherever it changed between them, and the difference under
 * evidence is lost in the noise.
 */
import type { Page } from "@playwright/test";

import type { CaptureClient } from "./config";
import { COMPONENT_DIAGRAM, SPEED_CONTROL } from "./pages/shell";

/** Raised when a readiness signal never arrived. Never a timeout with nothing to say. */
export class ReadinessError extends Error {}

/**
 * Reach the client, and say which address was tried when it cannot be reached.
 *
 * The address is the configuration's, and the message says so, because "connection
 * refused" tells an author nothing about which of the two destinations they were pointed
 * at when it happened.
 */
export async function openClient(page: Page, client: CaptureClient): Promise<void> {
  try {
    await page.goto(client.url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new ReadinessError(
      `the client could not be reached at ${client.url}: ${detail}. That address came ` +
        "from the capture configuration, not from a literal in this script; if it is " +
        "wrong, the configuration is where to change it.",
    );
  }
}

export interface SettleOutcome {
  /** How many frames were watched before the markup stopped changing. */
  readonly framesWatched: number;
  /** How many times the markup changed while being watched. */
  readonly changes: number;
}

/**
 * Wait for the client to be settled, or say plainly what never arrived.
 *
 * The diagnosis matters more than the wait. "The client never became ready" is true of a
 * broken build, an unreachable address, a page that throws on first render and a page
 * that is redrawing for ever, and those want four different next actions.
 */
export async function settled(page: Page, client: CaptureClient): Promise<SettleOutcome> {
  await inDocument(page, COMPONENT_DIAGRAM, client, "the component layout");
  await inDocument(page, SPEED_CONTROL, client, "the simulation speed control");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const outcome = await page.evaluate(
    async ({ stableFrames, maximumFrames }) => {
      const frame = (): Promise<void> =>
        new Promise((announce) => {
          requestAnimationFrame(() => {
            announce();
          });
        });
      const markup = (): string => document.body.innerHTML;

      let previous = markup();
      let stable = 0;
      let changes = 0;
      let watched = 0;
      while (stable < stableFrames) {
        if (watched >= maximumFrames) {
          return { settled: false, framesWatched: watched, changes, sample: previous.length };
        }
        await frame();
        watched += 1;
        const next = markup();
        if (next === previous) {
          stable += 1;
        } else {
          stable = 0;
          changes += 1;
          previous = next;
        }
      }
      return { settled: true, framesWatched: watched, changes, sample: previous.length };
    },
    { stableFrames: client.stableFrames, maximumFrames: client.maximumFrames },
  );

  if (!outcome.settled) {
    throw new ReadinessError(
      `the client at ${client.url} never settled: its markup changed ${outcome.changes} ` +
        `times in ${outcome.framesWatched} animation frames and never held still for ` +
        `${client.stableFrames} consecutive frames. Something on the page is redrawing ` +
        "with different content every frame; a capture taken now would differ from the " +
        "next one for reasons that have nothing to do with any change under evidence.",
    );
  }
  return { framesWatched: outcome.framesWatched, changes: outcome.changes };
}

async function inDocument(
  page: Page,
  selector: string,
  client: CaptureClient,
  what: string,
): Promise<void> {
  try {
    await page.waitForSelector(selector, {
      state: "attached",
      timeout: client.readinessTimeoutMs,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new ReadinessError(
      `${what} (${selector}) never appeared at ${client.url} within ` +
        `${client.readinessTimeoutMs}ms. The client is reachable or it is not, and this ` +
        `says which: ${detail}. If the address is wrong it comes from the capture ` +
        "configuration, not from this script.",
    );
  }
}
