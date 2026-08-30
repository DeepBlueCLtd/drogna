/**
 * Turning the lockstep clock in a test, letting the worker's event loop breathe.
 *
 * The loop is what these tests are: thousands of ticks driven by hand rather than
 * waited for, so that a test drives simulation time instead of racing it. Run as one
 * uninterrupted statement, that loop also blocks the vitest worker's event loop — and
 * the worker owes the main process a reply to `onTaskUpdate` whose deadline is 60
 * seconds, hard-coded in vitest's own rpc chunk (`DEFAULT_TIMEOUT = 6e4`) and reachable
 * from no configuration file. Once a file's tests block for longer than that in total,
 * every test passes and the run still exits non-zero on
 * `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`.
 *
 * That is not hypothetical. Widening the now-cast grid took the two heaviest files from
 * ~43 s and ~37 s to ~67 s and ~62 s, and CI went red on a run whose own summary read
 * "38 passed, 252 passed, 2 errors". It was watched happening again on purpose, by
 * inflating one drive until the file took 83 s, and watched stopping when these yields
 * went in.
 *
 * Yielding costs nothing the tests care about: simulation time advances on `tickOnce`
 * and on nothing else, so a pause between two ticks is not a pause the run can see. It
 * does let the components' own heartbeat timers fire mid-drive, which is what they do
 * in the shell anyway.
 *
 * Not usable under `vi.useFakeTimers()`, which is why the files that fake time drive
 * their clocks directly; none of them is near the deadline.
 *
 * The yield is `setImmediate` and not `setTimeout(…, 0)` on purpose. The wall-clock gate
 * lists `setTimeout` because a timer is armed against host time, and it is right to: a
 * harness that waits on the host has stopped being deterministic. `setImmediate` arms no
 * timer and reads no clock — it runs the continuation in the loop's check phase, after
 * the poll phase has delivered the worker's pending port messages, which is exactly and
 * only what is wanted here. Simulation time still comes from `tickOnce` and nowhere else.
 * A Node-only primitive in a Node-only helper, imported by tests that run in the node
 * environment.
 */

/** Ticks between yields: about half a second of blocked time at the shipped grid. */
const YIELD_EVERY = 250;

export interface TickableClock {
  tickOnce(): void;
}

/** Advance the clock `ticks` times, releasing the event loop as it goes. */
export async function driveTicks(clock: TickableClock, ticks: number): Promise<void> {
  for (let tick = 0; tick < ticks; tick++) {
    clock.tickOnce();
    if (tick % YIELD_EVERY === YIELD_EVERY - 1) await new Promise((resolve) => setImmediate(resolve));
  }
}
