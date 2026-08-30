/**
 * The timeline's axis (feature 115, FR-69).
 *
 * The problem this file exists for is stated in one line of the requirement: *the archive
 * spans twenty years and an instance spans hours*. On a linear axis the archive is the
 * whole width and every forecast the store has ever published is a hairline at the right
 * edge — which is the store's real shape and is completely unreadable. On an axis that
 * gave each era its own scale, two bars at the same horizontal position would be at
 * different instants, which is worse than unreadable: it is wrong.
 *
 * So: one axis, one mapping, non-linear, and **the panel says which mapping it is using**
 * rather than letting a reader infer it from tick spacing. The mapping is elapsed time
 * *backwards from the newest edge*, compressed logarithmically. Something an hour old and
 * something twenty years old are both on the axis, in the right order, at distances that
 * are readable — and the axis is labelled with the instants it actually falls on, so a
 * reader converts by reading rather than by trusting the shape.
 *
 * Nothing here reads a clock. The axis is built from the intervals the holdings state, so
 * a store with nothing in it has no axis, which is the correct answer rather than an
 * empty one.
 */
import { simInstant } from './interval.js';

export interface TimeScale {
  /** The oldest and newest instants the axis covers, as POSIX milliseconds. */
  readonly earliestMillis: number;
  readonly latestMillis: number;
  /** Where an instant falls, from 0 (left edge) to 1 (right edge). Clamped. */
  place(millis: number): number;
  /** What the axis is doing, said rather than left to be inferred from tick spacing. */
  readonly description: string;
  /** Instants worth labelling, left to right. */
  readonly ticks: readonly { millis: number; instant: string; place: number }[];
}

/**
 * How hard the axis compresses. Elapsed time is mapped through `log1p(elapsed / UNIT)`,
 * so the unit is the elapsed span below which the axis is effectively linear. One minute:
 * below that everything in this harness is simultaneous anyway, and above it the
 * compression is gentle enough that an instance's six hours is still about a fifth of the
 * width against an archive's twenty years.
 */
const LINEAR_BELOW_MILLIS = 60_000;

/**
 * The axis over a set of intervals. `undefined` when there is nothing to draw: an axis
 * over an empty store would be a picture of a store that has nothing in it, which is a
 * claim the shell is not entitled to make without having been told (Constitution VII).
 */
export function timeScaleFor(
  intervals: readonly { startMillis: number; endMillis: number }[],
): TimeScale | undefined {
  if (intervals.length === 0) return undefined;
  const earliestMillis = Math.min(...intervals.map((interval) => interval.startMillis));
  const latestMillis = Math.max(...intervals.map((interval) => interval.endMillis));
  if (!Number.isFinite(earliestMillis) || !Number.isFinite(latestMillis)) return undefined;

  const span = latestMillis - earliestMillis;
  // A store holding one instant is a real state and gets a real axis: everything at the
  // right edge, which is where it is.
  const compress = (millis: number) => Math.log1p(Math.max(0, millis) / LINEAR_BELOW_MILLIS);
  const full = compress(span);
  const place = (millis: number): number => {
    if (span <= 0) return 1;
    const elapsedFromEnd = latestMillis - millis;
    if (elapsedFromEnd <= 0) return 1;
    if (elapsedFromEnd >= span) return 0;
    return 1 - compress(elapsedFromEnd) / full;
  };

  return {
    earliestMillis,
    latestMillis,
    place,
    description:
      span <= 0
        ? 'one instant: everything the store holds covers the same moment'
        : `logarithmic in elapsed simulation time back from the newest step — ${describeAxisSpan(span)} across the width, so an instance's hours and the archive's years are both readable`,
    ticks: axisTicks(earliestMillis, latestMillis, place),
  };
}

/** The span in a reader's words. Kept here rather than shared: it labels an axis. */
function describeAxisSpan(millis: number): string {
  const years = millis / (365 * 24 * 3600 * 1000);
  if (years >= 1) return `${Math.round(years * 10) / 10} years`;
  const days = millis / (24 * 3600 * 1000);
  if (days >= 1) return `${Math.round(days * 10) / 10} days`;
  return `${Math.round((millis / (3600 * 1000)) * 10) / 10} hours`;
}

/**
 * Instants worth labelling. Placed at even fractions of the *drawn* width rather than of
 * elapsed time, so the labels are spread across the axis instead of piling into the
 * compressed end — which is what a linear tick sequence does on a log axis, and is how a
 * reader ends up with five labels in the last centimetre and none anywhere else.
 */
function axisTicks(
  earliestMillis: number,
  latestMillis: number,
  place: (millis: number) => number,
): { millis: number; instant: string; place: number }[] {
  const span = latestMillis - earliestMillis;
  if (span <= 0) {
    return [{ millis: latestMillis, instant: simInstant(latestMillis), place: 1 }];
  }
  // Four rather than five, and they still crowded: on a log axis the recent labels bunch
  // toward the right edge, and the first capture of this display had two of them printed
  // over each other. The label format below is what actually fixed it; the count is what
  // stops it recurring the moment the panel is narrower.
  const fractions = [0, 0.35, 0.7, 1];
  return fractions.map((fraction) => {
    const millis = invert(fraction, earliestMillis, latestMillis);
    return { millis, instant: simInstant(millis), place: place(millis) };
  });
}

/** The instant at a drawn fraction: the mapping above, run backwards. */
function invert(fraction: number, earliestMillis: number, latestMillis: number): number {
  const span = latestMillis - earliestMillis;
  const full = Math.log1p(span / LINEAR_BELOW_MILLIS);
  const elapsedFromEnd = (Math.expm1((1 - fraction) * full) * LINEAR_BELOW_MILLIS);
  return Math.round(latestMillis - Math.min(elapsedFromEnd, span));
}
