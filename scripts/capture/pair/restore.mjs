/**
 * What to put the clock back to, decided separately from the putting back.
 *
 * FR-007 asks that the previous rate be restored after every pair capture, *including on
 * failure*. The restoring itself is three lines in a `finally` in the pair spec, where the
 * browser is. The decision is here, on its own, because it is the part with cases in it and
 * the part a test can exercise without a running clock — and a restore path that has never
 * been exercised is exactly the path that leaves the whole harness stopped for the next
 * person who looks at it.
 *
 * Three cases, and the third is the one worth arguing about.
 *
 * - A rate was in force and it was not zero: ask for it again.
 * - A rate was in force and it *was* zero: the clock was already pinned when the capture
 *   began. Restoring means leaving it as it was found, so nothing is asked for. Asking for
 *   zero again would be harmless and would also be a request this mechanism cannot justify.
 * - No rate was ever in force — no sample had arrived, so the page never knew one. There is
 *   nothing to put back and inventing a rate would be worse than leaving a pin a person can
 *   see. So this reports rather than guesses, and says what state the clock is in.
 *
 * Pure. No browser, no clock, no filesystem.
 */

/** What the pair should do about the rate, and why, in words a person can act on. */
export function restorationPlan(previous) {
  if (previous === null || previous === undefined) {
    return {
      action: "report",
      rate: null,
      reason:
        "no rate was in force before the pin, so none is being restored. The clock is " +
        "pinned at zero and a person should set it back deliberately.",
    };
  }
  if (previous === 0) {
    return {
      action: "none",
      rate: 0,
      reason:
        "the clock was already pinned at zero when this capture began, so restoring it " +
        "means leaving it exactly as it was found.",
    };
  }
  return {
    action: "ask",
    rate: previous,
    reason: `the clock reported ${previous} in force before the pin; asking for it again.`,
  };
}
