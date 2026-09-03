/**
 * Simulation time arithmetic. Tick values follow from epoch and interval alone
 * (clock.schema.json): sim_time(n) = epoch + n * tick_interval, formatted as
 * ISO-8601 UTC with microsecond precision. BigInt microseconds throughout, so no
 * floating-point error can make two components disagree about a timestamp.
 */

const MICROS_PER_MILLI = 1000n;

export function parseEpochMicros(isoUtc: string): bigint {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(isoUtc);
  if (!match) throw new Error(`epoch '${isoUtc}' is not ISO-8601 UTC with up to microsecond precision`);
  const millis = Date.parse(`${match[1]}Z`);
  const fraction = (match[2] ?? '').padEnd(6, '0');
  return BigInt(millis) * MICROS_PER_MILLI + BigInt(fraction);
}

export function formatMicros(totalMicros: bigint): string {
  const micros = ((totalMicros % 1000000n) + 1000000n) % 1000000n;
  const millis = (totalMicros - micros) / MICROS_PER_MILLI / 1000n * 1000n;
  const seconds = new Date(Number(millis)).toISOString().slice(0, 19);
  return `${seconds}.${micros.toString().padStart(6, '0')}Z`;
}

export function simTimeAtTick(epochMicros: bigint, tickIntervalUs: number, tick: number): string {
  return formatMicros(epochMicros + BigInt(tick) * BigInt(tickIntervalUs));
}

/**
 * An instant advanced by whole seconds of simulation time, at the precision the seam uses.
 *
 * Four components had written this arithmetic out by hand, and the copies were not the same:
 * the model runner truncates to whole seconds and appends `.000000`, while a fifth copy added
 * for feature 125 preserved milliseconds. They agree only because every simulated instant on
 * disk lands on a whole second, `tick_interval_us` being 1,000,000 — so a sub-second tick
 * interval would have made a *restatement* of a run's validity differ from the announcement it
 * was restating, and nothing would have caught it. Built on the BigInt microseconds this
 * module exists for, which is the guarantee its header already claims: no two components
 * disagreeing about a timestamp.
 */
export function isoPlusSeconds(iso: string, seconds: number): string {
  return formatMicros(parseEpochMicros(iso) + BigInt(Math.round(seconds * 1e6)));
}
