/**
 * A holding's coverage interval, read from its own manifest (feature 115, FR-69, T023).
 *
 * The timeline draws each holding at the interval it covers rather than at the instant
 * it was published, because the thing a table hides is the store *filling up*: the
 * archive spanning twenty years, a now-cast replaced on its cadence, an instance
 * reaching a few hours into a future that has not happened yet.
 *
 * The interval is read from `grid.time`, which states an origin in simulation time, an
 * offset to the first step, a step and a count — so it is a fact about the holding
 * rather than an assumption about its era. An archive holding and a forecast instance
 * are read by exactly the same three lines, which is why there is no `era` anywhere in
 * this file.
 *
 * Nothing here reads a clock: `Date.parse` is used on simulation instants, which are
 * ISO-8601 strings the harness authored, and never on host time. This is the same use
 * `map-data.ts` has made of it since feature 109.
 */
import type { ManifestTimeAxis } from '../map/map-data.js';

export interface CoverageInterval {
  /** Simulation time of the first stored step, in the wire form. */
  readonly startSimTime: string;
  /** Simulation time of the last stored step, in the wire form. */
  readonly endSimTime: string;
  /** The same two, as POSIX milliseconds, for arithmetic and for placing on an axis. */
  readonly startMillis: number;
  readonly endMillis: number;
  readonly stepSeconds: number;
  readonly count: number;
}

/** Parse a simulation instant. Microseconds are trimmed: `Date` holds milliseconds. */
export function simMillis(instant: string): number {
  return Date.parse(`${instant.slice(0, 23)}Z`);
}

/** Render POSIX milliseconds back as a simulation instant in the wire form. */
export function simInstant(millis: number): string {
  return `${new Date(millis).toISOString().slice(0, 23)}000Z`;
}

/**
 * The interval a holding covers, or undefined when its time axis cannot be read. Undefined
 * rather than a guess: a holding drawn at an interval nobody stated would be the timeline
 * inventing the one thing it exists to show.
 */
export function coverageInterval(time: ManifestTimeAxis): CoverageInterval | undefined {
  const originMillis = simMillis(time.origin_sim_time);
  if (!Number.isFinite(originMillis)) return undefined;
  if (!Number.isFinite(time.step_seconds) || time.step_seconds <= 0) return undefined;
  if (!Number.isInteger(time.count) || time.count < 1) return undefined;
  const startMillis = originMillis + time.start_offset_seconds * 1000;
  const endMillis = startMillis + (time.count - 1) * time.step_seconds * 1000;
  return {
    startSimTime: simInstant(startMillis),
    endSimTime: simInstant(endMillis),
    startMillis,
    endMillis,
    stepSeconds: time.step_seconds,
    count: time.count,
  };
}

/** Whether an interval covers an instant, inclusive of both ends as EDR's validity is. */
export function covers(interval: CoverageInterval, instantMillis: number): boolean {
  return instantMillis >= interval.startMillis && instantMillis <= interval.endMillis;
}

/**
 * How long an interval is, said the way a reader would say it. The timeline carries
 * twenty years and six hours on one axis, so "631,152,000 s" is not an answer — and
 * neither is a duration library, for a display that needs one sentence.
 */
export function describeSpan(millis: number): string {
  const seconds = Math.max(0, Math.round(millis / 1000));
  const units: [number, string][] = [
    [365 * 24 * 3600, 'year'],
    [24 * 3600, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const count = Math.round((seconds / size) * 10) / 10;
      return `${count} ${name}${count === 1 ? '' : 's'}`;
    }
  }
  return 'a single instant';
}
