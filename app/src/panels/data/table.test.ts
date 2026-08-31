/**
 * The observation table's ordering (feature 121, FR-99).
 *
 * The rule under test is that the table shows *everything the store returned*, ordered
 * by the axis the chart uses where there is one. The chart drops an observation it
 * cannot place in time — it has no choice, there is no x for it — and a table that
 * copied that behaviour would leave the reader two views agreeing because both had
 * looked away from the same row.
 */
import { describe, expect, it } from 'vitest';
import { observationRows, tableSummary, visibleRows, TABLE_ROWS } from './table.js';
import { series } from './series.js';
import type { ObservationPoint } from './read.js';

const point = (id: string, simTime: string, result: number): ObservationPoint => ({ id, simTime, result });

const ORDERED = [
  point('o-1', '2026-01-01T00:00:00.000000Z', 4),
  point('o-2', '2026-01-01T01:00:00.000000Z', 6),
  point('o-3', '2026-01-01T02:00:00.000000Z', 5),
];

describe('the observation table', () => {
  it('orders by simulation time, whatever order the store served them in', () => {
    const rows = observationRows([ORDERED[2], ORDERED[0], ORDERED[1]]);
    expect(rows.map((row) => row.point.id)).toEqual(['o-1', 'o-2', 'o-3']);
  });

  it('keeps an observation whose instant will not parse, and puts it last', () => {
    // The chart cannot draw this row: there is no position on a time axis for an instant
    // that is not one. The table can, and the store having returned it is the fact.
    const unreadable = point('o-4', 'the-sensor-said-this', 7);
    const rows = observationRows([unreadable, ...ORDERED]);
    expect(rows.map((row) => row.point.id)).toEqual(['o-1', 'o-2', 'o-3', 'o-4']);
    expect(rows[3].at).toBeUndefined();
    expect(rows.slice(0, 3).every((row) => row.at !== undefined)).toBe(true);
  });

  it('shows every observation the chart plots, in the same order', () => {
    // The two presentations are one fetch turned around, so they are checked against
    // each other rather than each against a picture.
    const plotted = series(ORDERED, 100, 100);
    if (!plotted) throw new Error('the fixture should plot');
    expect(observationRows(ORDERED).map((row) => row.point.id)).toEqual(
      plotted.plotted.map((entry) => entry.point.id),
    );
  });

  it('draws a window of the recent end when the history is longer than the table', () => {
    // The fetch's ceiling is twenty thousand observations, which the chart absorbs as one
    // polyline and a table cannot. The window is the recent end because that is the end a
    // reader who opened the table is standing at.
    const long = Array.from({ length: TABLE_ROWS + 40 }, (_, index) =>
      point(`o-${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), index),
    );
    const shown = visibleRows(observationRows(long));
    expect(shown.length).toBe(TABLE_ROWS);
    expect(shown[shown.length - 1].point.id).toBe(`o-${long.length - 1}`);
    expect(shown[0].point.id).toBe(`o-40`);
    // A history that fits is not windowed at all.
    expect(visibleRows(observationRows(ORDERED)).length).toBe(3);
  });

  it('holds itself to the store’s count, and states both windows when both are in force', () => {
    expect(tableSummary(3, 3, 3, false)).toMatch(/^3 row\(s\) of the 3 observation\(s\)/);
    expect(tableSummary(3, 3, 3, false)).not.toMatch(/paging ceiling|most recent/);
    // Windowed by the table, and by the fetch as well.
    const both = tableSummary(500, 20_000, 31_402, true);
    expect(both).toMatch(/most recent 500 of the 20000 row\(s\) read/);
    expect(both).toMatch(/31402 observation\(s\) the store reports/);
    expect(both).toMatch(/paging ceiling/);
  });
});
