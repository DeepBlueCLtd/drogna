/**
 * The observation table's pure half (feature 121, FR-99): observations in, rows out.
 *
 * The chart and the table are two presentations of **one** fetched history, and this
 * module exists so they can be checked against each other rather than each against a
 * picture. A reader who switches to the table to read off a value the line passes
 * through is entitled to find the same observations there, in the same order.
 *
 * They are not, however, required to hold the *same count*, and the difference is the
 * reason this is not just `series()` again. The chart can only draw a point it can place
 * in time, so `series()` drops an observation whose instant will not parse. The table has
 * no such need: it can show that row and say the instant is unreadable, which is a fact
 * about the store worth seeing and one the chart is structurally unable to show. Dropping
 * it here as well would leave the reader with two views that agree by having both looked
 * away.
 */
import { instantToMillis } from './series.js';
import type { ObservationPoint } from './read.js';

export interface ObservationRow {
  readonly point: ObservationPoint;
  /** Epoch milliseconds, or undefined for an instant that would not parse. */
  readonly at: number | undefined;
}

/**
 * Every observation, oldest first, with the unplaceable ones last.
 *
 * Last rather than first, and kept rather than dropped: they have no position on the
 * axis the rest are ordered by, so any position among them would be invented, and the
 * end of the table is the one place that says so without claiming an instant.
 */
export function observationRows(points: readonly ObservationPoint[]): readonly ObservationRow[] {
  const rows = points.map((point) => {
    const at = instantToMillis(point.simTime);
    return { point, at: Number.isFinite(at) ? at : undefined };
  });
  const placed = rows.filter((row) => row.at !== undefined);
  const unplaceable = rows.filter((row) => row.at === undefined);
  placed.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return [...placed, ...unplaceable];
}

/**
 * How many rows the table draws at once.
 *
 * The fetch's own ceiling is twenty thousand observations (`read.ts`), which the chart
 * absorbs as one polyline and a table cannot: sixty thousand cells is a page that will
 * not scroll. So the table draws a window, and the window is the recent end — a reader
 * who opened the table rather than the chart is reading values, and the value being
 * asked for is far more often "what has it just said" than "what did it say at the top
 * of the run". The chart is the one that carries the whole shape.
 */
export const TABLE_ROWS = 500;

/** The window the table draws: the most recent `ceiling` rows, in the same order. */
export function visibleRows(
  rows: readonly ObservationRow[],
  ceiling: number = TABLE_ROWS,
): readonly ObservationRow[] {
  return rows.length <= ceiling ? rows : rows.slice(rows.length - ceiling);
}

/**
 * What the table says about itself, in the reader's terms.
 *
 * Held to the store's own count rather than to the length of what was read, for the same
 * reason the chart is: a table showing the first thousand of ten thousand rows and saying
 * "1000 observations" has told the reader something false about the store. Both windows
 * are stated when both are in force — the store's history is longer than one fetch, and
 * that fetch is longer than one table.
 */
export function tableSummary(
  shown: number,
  fetched: number,
  held: number,
  truncated: boolean,
): string {
  const ceiling = truncated
    ? ' The history was long enough to reach this tab’s paging ceiling, so the chart draws the earliest part of it.'
    : '';
  if (shown < fetched) {
    return `the most recent ${shown} of the ${fetched} row(s) read, of ${held} observation(s) the store reports for this datastream.${ceiling}`;
  }
  return `${shown} row(s) of the ${held} observation(s) the store reports for this datastream.${ceiling}`;
}
