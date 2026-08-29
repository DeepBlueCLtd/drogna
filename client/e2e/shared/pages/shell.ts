/**
 * How to find things in the client. Application knowledge, and nothing else.
 *
 * This is the one module the three capture mechanisms share (FR-002), and it is narrow on
 * purpose. Knowing that the component layout is `[data-testid="component-diagram"]` is a
 * fact about C-18; deciding whether to pin the clock before photographing it is capture
 * policy, and policy is what must not be shared. Nothing below knows what a glance, a pair
 * or a curated shot is, and `separation.test.ts` fails if that ever stops being true.
 *
 * Everything here reads. There is one exception and it is deliberate: `askForRate` clicks
 * the speed control the client already offers under SRD FR-49. That is a viewer action a
 * viewer could take, taken through the interface a viewer would use, and it goes to the
 * clock service like any other request. There is no capture-only control surface, and
 * nothing here can light a component: illumination comes from heartbeats (Constitution
 * VII), and a capture tool with a way to fake one would make every picture it took
 * worthless.
 */
import type { Page } from "@playwright/test";

export const COMPONENT_DIAGRAM = '[data-testid="component-diagram"]';
export const SPEED_CONTROL = '[data-testid="speed-control"]';
export const LIT_COUNT = '[data-testid="lit-count"]';
export const CLOCK_STATE = '[data-testid="clock-state"]';
export const CLOCK_SIM_TIME = '[data-testid="clock-sim-time"]';
export const CLOCK_SAMPLE_RUN = '[data-testid="clock-sample-run"]';
export const CONNECTION_STATE = '[data-testid="connection-state"]';
export const CLOCK_TICK = '[data-testid="clock-tick"]';

/**
 * Everything that moves on its own while the system is running, and so is the only part of
 * the page that cannot be expected to hold still.
 *
 * A fact about the client rather than a capture policy, which is why it sits here. Two
 * kinds, established by watching a running stack rather than reasoned about: the figures
 * driven by simulation time, and the control loop's transit animation, which draws a mark
 * per message and redraws every frame for as long as anything is being published. Seven
 * elements of eighty-one, and they were changing on 892 frames out of 900.
 *
 * `readiness.ts` holds these aside when deciding whether the page has settled. The
 * question it needs answered is whether the page has stopped *changing*, and with an
 * unpinned clock that is not the same as whether the system has stopped *running* — a
 * glance must not pin (scripts/capture/README.md), so without this the third signal could
 * never arrive on a stack that was working. Under a pinned clock none of these move and the
 * list costs nothing, so the pair and the curated shot are unaffected.
 */
export const ALIVE_WHILE_RUNNING = [
  CLOCK_TICK,
  CLOCK_SIM_TIME,
  '[data-testid="cycle"]',
  '[data-testid="loop-counts"]',
  '[data-testid="transit-canvas"]',
  // One per edge the loop draws a transit along, named for the edge, so matched by prefix.
  '[data-testid^="transit-"]',
  // The topology matrix (018) counts every arrival on the page's subscription per topic
  // row, so its heard column advances with each clock sample and heartbeat, and its flash
  // attribute rides the same frame batch the transits do. Established the same way as the
  // rest of this list: a running stack, the glance refusing to settle, and the matrix the
  // only new thing moving.
  '[data-testid="topology-matrix"]',
  // The topic tree (022) is traffic-lit by design: while the simulation advances its
  // pulses decay, ripples fade and role connections dim on every frame, which is the
  // panel doing its job and not the page failing to settle, so it is held aside whole
  // like the transits above. The qualifier is load-bearing: under a pin the panel says
  // so — `data-animating="false"` — and then it must *not* be held aside, because the
  // thing a pinned capture has to wait for is exactly that panel reaching the picture
  // it will hold.
  '[data-testid="topic-tree"][data-animating="true"]',
];

/** The node for one component. Lit or not is read from it, never written to it. */
export function componentNode(id: string): string {
  return `[data-testid="component-node-${id}"]`;
}

/** The button that asks the clock for a rate. Asking is all a viewer can do (FR-012). */
export function rateButton(rate: number): string {
  return `[data-testid="rate-${rate}"]`;
}

/**
 * What the page says about the rate in force.
 *
 * Read from the speed control's data attributes rather than from its prose, because the
 * prose is written for a person. The same three facts are published on the page's global
 * scope as `drognaRate` by the client's own `captureReadiness` module; either surface
 * would do, and this one is chosen because it survives a page that has not yet run its
 * scripts to completion.
 */
export interface RateReading {
  /** The rate the clock reports in force, or null before any sample has arrived. */
  readonly acknowledged: number | null;
  /** True when the acknowledged rate is zero: simulated time stopped, deliberately. */
  readonly pinned: boolean;
  /** True while a requested rate has not yet been answered by a sample. */
  readonly awaiting: boolean;
  /** True when a rate is known, is zero, and no request is outstanding. */
  readonly steady: boolean;
}

export async function readRate(page: Page): Promise<RateReading> {
  const attributes = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (element === null) {
      return null;
    }
    return {
      acknowledged: element.getAttribute("data-acknowledged-rate"),
      pinned: element.getAttribute("data-pinned"),
      awaiting: element.getAttribute("data-awaiting"),
      steady: element.getAttribute("data-steady"),
    };
  }, SPEED_CONTROL);
  if (attributes === null) {
    throw new Error(
      `the speed control (${SPEED_CONTROL}) is not on the page, so no rate can be read ` +
        "from it. Either the client did not render or its rate control has moved.",
    );
  }
  const acknowledged = attributes.acknowledged;
  return {
    acknowledged: acknowledged === null || acknowledged === "" ? null : Number(acknowledged),
    pinned: attributes.pinned === "true",
    awaiting: attributes.awaiting === "true",
    steady: attributes.steady === "true",
  };
}

/** Ask the clock for a rate, through the control the client already offers to a viewer. */
export async function askForRate(page: Page, rate: number): Promise<void> {
  await page.click(rateButton(rate));
}

/**
 * Which components the page currently shows as lit, in the order the layout draws them.
 *
 * "Lit" is the client's own word, read off `data-illumination`. The capture mechanisms use
 * this to say what was lit before something and what is lit after it; none of them can
 * change it.
 */
export async function litComponents(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid^='component-node-']"))
      .filter((node) => node.getAttribute("data-illumination") === "lit")
      .map((node) => (node.getAttribute("data-testid") ?? "").replace("component-node-", "")),
  );
}

/** The simulation time and run identifier the clock panel is displaying, as it spells them. */
export interface ClockReading {
  readonly simTime: string;
  readonly runId: string;
  readonly display: string;
}

export async function readClock(page: Page): Promise<ClockReading> {
  return page.evaluate(
    ({ panel, simTime, runId }) => {
      const text = (selector: string): string =>
        document.querySelector(selector)?.textContent?.trim() ?? "";
      return {
        simTime: text(simTime),
        runId: text(runId),
        display: document.querySelector(panel)?.getAttribute("data-clock") ?? "",
      };
    },
    { panel: CLOCK_STATE, simTime: CLOCK_SIM_TIME, runId: CLOCK_SAMPLE_RUN },
  );
}

/** How many components the masthead says have been heard from, as the page says it. */
export async function litCountWords(page: Page): Promise<string> {
  return page.evaluate(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? "",
    LIT_COUNT,
  );
}
