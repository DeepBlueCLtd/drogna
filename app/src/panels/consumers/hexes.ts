/**
 * The hex grid the map-bearing consumers resample the domain onto (FR-82).
 *
 * A consumer is not locked to the storage grid, and this is where that stops being a
 * claim: the forecast is stored on a rectangular grid, the consumer asks a decision at
 * whatever granularity suits it, and the aggregation is a genuine coarsening step whose
 * cost is shown — every hex carries how many stored cells fell into it, so a reader can
 * see what the resolution control is actually doing.
 *
 * H3 is the index because it is the one the planner already publishes in (SRD FR-35);
 * two indexes for one domain would be two things to reconcile.
 *
 * The ceiling is a refusal rather than a clamp. Recomputation is synchronous and on the
 * interaction path (FR-79), so a resolution that would cover the domain with more hexes
 * than the configuration allows is declined by name — the reader is told the number and
 * the bound — instead of being silently rounded to something else, or accepted and left
 * to freeze the page.
 */
import { cellToBoundary, cellToLatLng, getHexagonAreaAvg, latLngToCell, polygonToCells } from 'h3-js';
import type { ViewRect } from './view.js';

export interface HexCell {
  readonly index: string;
  /** [longitude, latitude] pairs, ready to draw. */
  readonly boundary: [number, number][];
  readonly longitude: number;
  readonly latitude: number;
}

export interface HexCover {
  readonly resolution: number;
  readonly cells: readonly HexCell[];
}

export interface HexRefusal {
  readonly refused: string;
}

export function isRefusal(cover: HexCover | HexRefusal): cover is HexRefusal {
  return 'refused' in cover;
}


function tooMany(resolution: number, count: number, ceiling: number): string {
  return `resolution ${resolution} needs about ${count} hexes to cover what is in view, above the configured ceiling of ${ceiling} — zoom in, or choose a coarser grid`;
}

/** The view's area in square kilometres, on a sphere flat enough for one domain. */
function areaKm2(rect: ViewRect): number {
  const midLatitude = ((rect.south + rect.north) / 2) * (Math.PI / 180);
  const width = (rect.east - rect.west) * 111.32 * Math.cos(midLatitude);
  const height = (rect.north - rect.south) * 110.57;
  return Math.abs(width * height);
}

/**
 * The hexes covering **what is in view** at this resolution, or a refusal naming the
 * count and the ceiling it exceeded.
 *
 * The view rather than the domain, since the map gained a wheel (`view.ts`): a fine
 * resolution over the whole domain is either unaffordable or unreadable, and zooming in
 * is what makes it neither. That is why the refusal names both remedies.
 */
export function coverExtent(
  rect: ViewRect,
  resolution: number,
  cellCeiling: number,
): HexCover | HexRefusal {
  // h3-js takes [latitude, longitude] pairs unless told otherwise, which is the
  // opposite of the order everything drawn uses. Stated here once, where the
  // conversion is, rather than discovered later in a picture drawn at right angles.
  const ring: [number, number][] = [
    [rect.south, rect.west],
    [rect.south, rect.east],
    [rect.north, rect.east],
    [rect.north, rect.west],
  ];
  // Estimate before enumerating. Asking h3 for the cells and *then* counting them is the
  // obvious order and it is wrong: at a fine resolution over a wide view the enumeration
  // is what runs out of memory, so the refusal never gets to happen. Watched doing
  // exactly that — "Memory allocation failed" from inside the library, with the ceiling
  // check sitting unreached on the next line. The estimate divides the view's area by
  // h3's own average hex area for the resolution, so the bound comes from the library
  // rather than from a number typed here.
  const estimate = Math.round(areaKm2(rect) / getHexagonAreaAvg(resolution, 'km2'));
  if (estimate > cellCeiling) return { refused: tooMany(resolution, estimate, cellCeiling) };
  const indexes = polygonToCells(ring, resolution);
  // And again against the real count, because the estimate is an average over a sphere
  // and this is a rectangle on it.
  if (indexes.length > cellCeiling) {
    return { refused: tooMany(resolution, indexes.length, cellCeiling) };
  }
  const cells = indexes.map((index) => {
    const [latitude, longitude] = cellToLatLng(index);
    return {
      index,
      boundary: cellToBoundary(index).map(([lat, lon]) => [lon, lat] as [number, number]),
      longitude,
      latitude,
    };
  });
  // Ordered by index so two renders of one domain agree, and so a test can name a cell.
  return { resolution, cells: cells.sort((a, b) => (a.index < b.index ? -1 : 1)) };
}

/**
 * The smallest a hex can be drawn and still be worth pointing at, in the drawing's own
 * square units. Below this a per-hex tooltip is a promise the picture cannot keep: the
 * target is smaller than the cursor, and every one of them costs a DOM node.
 */
const POINTABLE_AREA = 100;

/**
 * Whether this many hexes, spread over this drawing, are big enough to carry a tooltip
 * each (T041).
 *
 * The threshold is derived from the map's own size rather than typed, because the map's
 * size is the thing that decides it: 720 x 480 gives about 3,456 hexes before the average
 * cell is under ten units across. It is a real cost as well as a courtesy — every polygon
 * carries a <title> child, so a fine resolution over a wide view was building two DOM
 * nodes per hex, 74,800 of them at resolution 7, for tooltips on targets two pixels wide.
 */
export function hexesArePointable(count: number, width: number, height: number): boolean {
  return count > 0 && count * POINTABLE_AREA <= width * height;
}

/** Which hex a position falls in, at this resolution. */
export function hexAt(longitude: number, latitude: number, resolution: number): string {
  return latLngToCell(latitude, longitude, resolution);
}

export interface HexAggregate {
  /** Mean of the stored values that fell into this hex. */
  readonly mean: number;
  /** How many stored cells fell into it — the size of the coarsening, per hex. */
  readonly cellCount: number;
}

/**
 * Stored grid cells aggregated onto hexes. A hex with no stored cell under it is absent
 * rather than zero: at a fine resolution over a coarse grid that genuinely happens, and
 * a zero would read as a measured value.
 */
export function aggregateOntoHexes(
  points: readonly { longitude: number; latitude: number; value: number }[],
  resolution: number,
): Map<string, HexAggregate> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const index = hexAt(point.longitude, point.latitude, resolution);
    const standing = sums.get(index) ?? { total: 0, count: 0 };
    standing.total += point.value;
    standing.count += 1;
    sums.set(index, standing);
  }
  const aggregates = new Map<string, HexAggregate>();
  for (const [index, { total, count }] of sums) {
    aggregates.set(index, { mean: total / count, cellCount: count });
  }
  return aggregates;
}

export interface Projector {
  readonly width: number;
  readonly height: number;
  /** A position in the domain to a point in the SVG's own coordinates. */
  readonly at: (longitude: number, latitude: number) => [number, number];
  /** A ring of positions to an SVG points attribute. */
  readonly ring: (points: readonly (readonly [number, number])[]) => string;
}

/**
 * The view onto a fixed drawing box. Equirectangular with a cosine correction at the
 * view's own middle latitude — the smallest thing that keeps a hex looking like a hex
 * over a few degrees of ocean. No renderer, no tiles, no third party: the consumers draw
 * SVG, because a hex grid and a polyline do not need a GPU and a panel that needed one
 * would be a panel that could not be tested without one.
 */
export function projector(rect: ViewRect, width: number, height: number): Projector {
  const midLatitude = ((rect.south + rect.north) / 2) * (Math.PI / 180);
  const spanX = (rect.east - rect.west) * Math.cos(midLatitude);
  const spanY = rect.north - rect.south;
  const scale = Math.min(width / (spanX || 1), height / (spanY || 1));
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const at = (longitude: number, latitude: number): [number, number] => [
    offsetX + (longitude - rect.west) * Math.cos(midLatitude) * scale,
    // South at the bottom: SVG's y grows downwards and latitude does not.
    height - offsetY - (latitude - rect.south) * scale,
  ];
  return {
    width,
    height,
    at,
    ring: (points) =>
      points
        .map(([longitude, latitude]) => {
          const [x, y] = at(longitude, latitude);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' '),
  };
}

/**
 * A value on [0, 1] to a colour, over the shell's dark ground.
 *
 * The first version ran dark-for-high over a pale ground, and the running page showed
 * what was wrong with it: a field where almost everything is near saturation came out as
 * one flat dark rectangle with the hex edges invisible inside it. So the ramp now runs
 * *cold and dim* for a well-observed cell to *hot and bright* for one nobody has looked
 * at — which is also the right way round for the question, since the bright cells are the
 * ones worth going to. Lightness carries the value from end to end, so it separates in
 * greyscale as well as in colour, and the top of the ramp is the family's own yellow.
 */
export function uncertaintyColour(fraction: number): string {
  const t = Math.min(Math.max(fraction, 0), 1);
  const mix = (low: number, high: number) => Math.round(low + (high - low) * t);
  return `rgb(${mix(26, 255)}, ${mix(48, 212)}, ${mix(74, 0)})`;
}
