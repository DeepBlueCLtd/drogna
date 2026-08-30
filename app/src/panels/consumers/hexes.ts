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
import { cellToBoundary, cellToLatLng, latLngToCell, polygonToCells } from 'h3-js';
import type { Domain } from './domain.js';

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

/**
 * The hexes covering the domain at this resolution, or a refusal naming the count and
 * the ceiling it exceeded.
 */
export function coverDomain(
  domain: Domain,
  resolution: number,
  cellCeiling: number,
): HexCover | HexRefusal {
  // h3-js takes [latitude, longitude] pairs unless told otherwise, which is the
  // opposite of the order everything drawn uses. Stated here once, where the
  // conversion is, rather than discovered later in a picture drawn at right angles.
  const ring: [number, number][] = [
    [domain.south, domain.west],
    [domain.south, domain.east],
    [domain.north, domain.east],
    [domain.north, domain.west],
  ];
  const indexes = polygonToCells(ring, resolution);
  if (indexes.length > cellCeiling) {
    return {
      refused: `resolution ${resolution} would cover the domain with ${indexes.length} hexes, above the configured ceiling of ${cellCeiling}`,
    };
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
 * The domain onto a fixed drawing box. Equirectangular with a cosine correction at the
 * domain's own middle latitude — the smallest thing that keeps a hex looking like a hex
 * over a few degrees of ocean. No renderer, no tiles, no third party: the consumers draw
 * SVG, because a hex grid and a polyline do not need a GPU and a panel that needed one
 * would be a panel that could not be tested without one.
 */
export function projector(domain: Domain, width: number, height: number): Projector {
  const midLatitude = ((domain.south + domain.north) / 2) * (Math.PI / 180);
  const spanX = (domain.east - domain.west) * Math.cos(midLatitude);
  const spanY = domain.north - domain.south;
  const scale = Math.min(width / (spanX || 1), height / (spanY || 1));
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const at = (longitude: number, latitude: number): [number, number] => [
    offsetX + (longitude - domain.west) * Math.cos(midLatitude) * scale,
    // South at the bottom: SVG's y grows downwards and latitude does not.
    height - offsetY - (latitude - domain.south) * scale,
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
 * A value on [0, 1] to a colour that reads on the consumers' yellow ground and separates
 * in greyscale: lightness carries the value, dark for high uncertainty.
 */
export function uncertaintyColour(fraction: number): string {
  const t = Math.min(Math.max(fraction, 0), 1);
  const light = Math.round(255 - 190 * t);
  return `rgb(${light}, ${Math.round(light * 0.92)}, ${Math.round(60 + 40 * (1 - t))})`;
}
