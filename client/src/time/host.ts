/**
 * Host time, in one place, for the one purpose the constitution permits.
 *
 * Constitution I forbids reading the host clock for any operational purpose, and
 * ADR-0006 carves out the single exception this module exists to serve: heartbeat
 * cadence and liveness windows are real time. If a liveness window were measured in
 * simulation time then a clock rate of zero — which FR-53 requires for screenshot
 * capture — would stop every window from ever being satisfied, and a running system
 * would grey out during exactly the capture meant to show it running.
 *
 * What is read here is an elapsed duration since the page loaded, not a date. Nothing
 * derived from it is timestamped onto anything, published, queried or asserted; it is
 * compared against a window and then discarded. Simulation time, which is what the page
 * displays and what every message carries, comes from the clock service.
 *
 * Every other module takes the instant as an argument, so that liveness is a pure
 * function of evidence and elapsed time and can be tested without waiting for either.
 */

/** Milliseconds of host time since the page was loaded. Monotonic, and not a date. */
export function hostInstant(): number {
  // harness:allow-wallclock ADR-0006, heartbeat cadence and liveness windows are real time
  return performance.now();
}

/** Seconds elapsed between two host instants. */
export function elapsedSeconds(from: number, to: number): number {
  return (to - from) / 1000;
}
