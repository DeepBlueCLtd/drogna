/**
 * How a rate change reaches the clock, and why it does not go over the broker.
 *
 * ADR-0008 makes the browser's broker identity subscribe-only: it publishes on no topic,
 * and `transport/mqtt.ts` contains no call that could. A rate change is therefore a
 * request to the clock service's own control surface, at a location named in the
 * configuration document and nowhere in this source (Constitution IV, FR-031).
 *
 * The request is a request. This module returns whether the ask was delivered and never
 * what rate is in force: the rate in force arrives on `ctl/clock` and is folded in by
 * `rateState`. Keeping the two apart in separate modules is what makes FR-012 hard to
 * break by accident — there is no value here a display could mistake for an
 * acknowledgement, because the response body is deliberately discarded.
 *
 * Where the configuration document names no control route, the requester declines in
 * words. That is the honest failure: the control renders, the rate in force is still
 * displayed from `ctl/clock`, and a viewer is told why the control cannot act rather than
 * watching it silently do nothing.
 */
import type { RuntimeConfig } from "../config/runtime";

/** The outcome of asking. Never an acknowledgement: an acknowledgement is a sample. */
export type RateRequestOutcome =
  | { readonly sent: true }
  | { readonly sent: false; readonly reason: string };

/**
 * The port a rate change goes out through.
 *
 * A port rather than a call, so the client's one outbound surface is nameable,
 * injectable and countable. `tests/controls/interpolationDoesNotEscape` counts on this
 * being the only way a value can leave the page (SC-014).
 */
export type RateRequester = (rate: number) => Promise<RateRequestOutcome>;

/** The shape of a POST, narrowed to what this module uses, so a test can supply one. */
export type CommandSender = (
  url: string,
  body: string,
) => Promise<{ readonly ok: boolean; readonly status: number }>;

export const NO_CONTROL_SURFACE =
  "the configuration document names no clock control route, so there is nowhere to send it.";

/** The clock's own spelling of a rate change (`harness_clock`'s control interface). */
const SET_RATE = "set_rate";

/** What a rate change looks like on the wire. The clock decides what to do with it. */
export function rateCommand(rate: number): string {
  return JSON.stringify({ operation: SET_RATE, rate });
}

function post(url: string, body: string): Promise<{ ok: boolean; status: number }> {
  return globalThis.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

/**
 * The requester a configuration document supports, or null where it names no route.
 *
 * Null rather than a requester that quietly fails, so a caller has to decide what to say
 * about it. `unavailableRequester` is the decision the speed control makes: render, and
 * explain.
 */
export function rateRequesterFor(
  config: RuntimeConfig | null,
  send: CommandSender = post,
): RateRequester | null {
  const url = config?.clock.controlUrl;
  if (url === undefined) {
    return null;
  }
  return async (rate: number): Promise<RateRequestOutcome> => {
    try {
      const response = await send(url, rateCommand(rate));
      // The body is not read. What the clock did with the request arrives on ctl/clock,
      // and reading it here would give the display a second, earlier answer to show.
      return response.ok
        ? { sent: true }
        : { sent: false, reason: `the clock refused the request (status ${response.status}).` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { sent: false, reason: `the clock could not be reached: ${detail}.` };
    }
  };
}

/** A requester that always declines, for a page with nowhere to send a request. */
export const unavailableRequester: RateRequester = async () => ({
  sent: false,
  reason: NO_CONTROL_SURFACE,
});
