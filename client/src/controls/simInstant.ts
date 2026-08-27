/**
 * Reading and writing the simulation instant the contracts carry.
 *
 * Every drogna control message spells simulation time as ISO-8601 UTC with microsecond
 * precision. `Date` cannot hold microseconds, so the client parses to integer microseconds
 * since the epoch and formats back from them. Nothing here reads a clock of any kind: both
 * functions are total on their arguments, which is what lets simulation time be tested
 * without any time passing.
 *
 * Microseconds since 1970 is about 1.8 × 10^15, comfortably inside the range a JavaScript
 * number represents exactly, so the round trip is lossless for any instant this harness
 * will see. The bound is stated rather than assumed because a silent loss of the last two
 * digits of a microsecond field would be invisible and wrong.
 */

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/;

const MICROS_PER_SECOND = 1_000_000;
const MICROS_PER_MILLISECOND = 1000;

/** Microseconds since the epoch, or null if the text is not an instant this understands. */
export function microsFromIso(iso: string): number | null {
  const match = ISO_PATTERN.exec(iso.trim());
  if (match === null) {
    return null;
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  const milliseconds = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (Number.isNaN(milliseconds)) {
    return null;
  }
  const micros = fraction === undefined ? 0 : Number(fraction.padEnd(6, "0"));
  return milliseconds * MICROS_PER_MILLISECOND + micros;
}

/** The contract's spelling of an instant, from microseconds since the epoch. */
export function isoFromMicros(micros: number): string {
  const whole = Math.floor(micros / MICROS_PER_SECOND);
  const remainder = micros - whole * MICROS_PER_SECOND;
  const stamp = new Date(whole * 1000).toISOString().slice(0, 19);
  return `${stamp}.${String(Math.round(remainder)).padStart(6, "0")}Z`;
}

/** Seconds of simulation time between two instants, for a display that states a span. */
export function simSecondsBetween(fromIso: string, toIso: string): number | null {
  const from = microsFromIso(fromIso);
  const to = microsFromIso(toIso);
  if (from === null || to === null) {
    return null;
  }
  return (to - from) / MICROS_PER_SECOND;
}
