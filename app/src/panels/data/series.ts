/**
 * The measurement chart's pure half (feature 121, FR-08, FR-09): observations in,
 * plotted geometry out.
 *
 * Nothing here fetches and nothing here knows what an SVG element is, which is what lets
 * the scaling be checked against values rather than against a rendered picture.
 *
 * The extent comes from the observations and from nowhere else. A chart whose axes were
 * drawn from a configured expectation would draw the same picture for a datastream that
 * had reported nothing unusual and for one whose instrument had failed high, and the
 * whole point of plotting a measurement is to see which of those happened.
 */
import type { ObservationPoint } from './read.js';

export interface Plotted {
  readonly x: number;
  readonly y: number;
  readonly point: ObservationPoint;
}

export interface Series {
  readonly plotted: readonly Plotted[];
  /** The value extent actually observed, before any padding for the drawing. */
  readonly value: { readonly minimum: number; readonly maximum: number };
  /** The simulation-time extent actually observed, as epoch milliseconds. */
  readonly time: { readonly first: number; readonly last: number };
  /** The drawn value range, which pads a flat series so it is a line and not an edge. */
  readonly drawn: { readonly minimum: number; readonly maximum: number };
}

/** Simulation instants are ISO-8601 with microsecond precision; Date parses milliseconds. */
export function instantToMillis(simTime: string): number {
  const parsed = Date.parse(simTime);
  if (!Number.isNaN(parsed)) return parsed;
  // A microsecond instant that Date.parse declines: truncate to milliseconds and keep
  // the offset, rather than dropping the point on the floor.
  return Date.parse(simTime.replace(/(\.\d{3})\d+/, '$1'));
}

/**
 * Lay observations out in a box of `width` by `height`, y increasing downwards as SVG
 * has it.
 *
 * Returns undefined for an empty history: a chart of nothing is not a chart, and the
 * caller is required to say why it is empty rather than draw empty axes (FR-09).
 */
export function series(
  points: readonly ObservationPoint[],
  width: number,
  height: number,
): Series | undefined {
  if (points.length === 0) return undefined;
  const withTime = points
    .map((point) => ({ point, at: instantToMillis(point.simTime) }))
    .filter((entry) => Number.isFinite(entry.at) && Number.isFinite(entry.point.result))
    .sort((a, b) => a.at - b.at);
  if (withTime.length === 0) return undefined;

  const first = withTime[0].at;
  const last = withTime[withTime.length - 1].at;
  const values = withTime.map((entry) => entry.point.result);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  // A series that never moved is a fact worth seeing, and dividing by its zero range is
  // not the way to show it: the band is opened to something small and symmetric so the
  // line is drawn flat across the middle rather than collapsing onto an axis.
  const flat = maximum - minimum === 0;
  const pad = flat ? Math.max(Math.abs(maximum) * 0.01, 0.5) : 0;
  const drawn = { minimum: minimum - pad, maximum: maximum + pad };
  const span = drawn.maximum - drawn.minimum;
  const duration = last - first;

  const plotted = withTime.map((entry) => ({
    // One instant, or many at the same instant: put the series in the middle rather than
    // on the left edge, where a single reading would sit on the axis and read as absent.
    x: duration === 0 ? width / 2 : ((entry.at - first) / duration) * width,
    y: height - ((entry.point.result - drawn.minimum) / span) * height,
    point: entry.point,
  }));

  return { plotted, value: { minimum, maximum }, time: { first, last }, drawn };
}

/** The polyline a series draws, at a fixed precision so the path is stable to compare. */
export function path(plotted: readonly Plotted[]): string {
  return plotted.map((entry) => `${entry.x.toFixed(2)},${entry.y.toFixed(2)}`).join(' ');
}

/**
 * Ticks for the value axis: the observed extent and the midpoint between them, which is
 * three labels the reader can check the line against without the axis becoming furniture.
 */
export function valueTicks(series: Series): readonly { value: number; y: number }[] {
  const { minimum, maximum } = series.value;
  const middle = (minimum + maximum) / 2;
  const span = series.drawn.maximum - series.drawn.minimum;
  const at = (value: number) => 1 - (value - series.drawn.minimum) / span;
  const ticks = minimum === maximum ? [minimum] : [maximum, middle, minimum];
  return ticks.map((value) => ({ value, y: at(value) }));
}
