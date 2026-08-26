/**
 * The order in which the page comes up, separated so it can be tested.
 *
 * FR-019 is a sequencing requirement, and sequencing is exactly what is easy to get
 * right in review and wrong in a refactor. The shell has already rendered by the time
 * this runs; what it guarantees is the second half: a transport opens only after a
 * configuration document has been fetched *and* validated, and never after a failure of
 * either. There is no path here that opens a connection against an unvalidated document,
 * and none that lights anything at all — this module cannot reach the reducer.
 */
import type { ConfigOutcome, RuntimeConfig } from "./config/runtime";
import type { ControlSink, ControlSubscription } from "./transport/mqtt";

export type Opener = (config: RuntimeConfig, sink: ControlSink) => ControlSubscription;

export type Started =
  | { readonly started: true; readonly subscription: ControlSubscription }
  | { readonly started: false; readonly reason: string };

/** Fetch, validate, and only then connect. */
export async function startTransport(
  load: () => Promise<ConfigOutcome>,
  open: Opener,
  sink: ControlSink,
): Promise<Started> {
  const outcome = await load();
  if (!outcome.ok) {
    return { started: false, reason: outcome.reason };
  }
  return { started: true, subscription: open(outcome.config, sink) };
}
