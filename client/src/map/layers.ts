/**
 * The drawing layers themselves — the objects feature 012 recorded as the missing half.
 *
 * 012's T032 note says it plainly: "the downsampling, the stated resolution and the layer's
 * data and accessors are implemented and tested; no Deck.gl layer object is constructed,
 * and no map surface renders one yet." Same for T038's route. This module constructs them,
 * from those modules' own `layerInputs` and `routeLayerInputs` and from this feature's
 * encoding, and adds nothing to what they decided. Where a value is drawn, which cells are
 * drawn and at what stride are 012's answers; how dark and how large is this feature's.
 *
 * **Nothing here fetches, and nothing here is drawn from anything but its arguments.** The
 * graticule and the frame are geometry derived from the extent by arithmetic — the ruler,
 * not the data — and every other layer is built from a fetched response or from a published
 * message, or is not built at all. There is no branch in this file that produces a layer
 * from nothing (Constitution VII).
 *
 * **No text is drawn into the canvas, so no font is fetched.** FR-002 forbids reaching
 * outside the harness for anything, fonts included, and the least fragile way to keep that
 * promise is to have no text on the surface to render: the degree labels, the resolution
 * and the extent are printed in the panel around the canvas, in the page's own type, where
 * they can be selected, read by a screen reader and searched. A map's labels being HTML
 * rather than pixels is a gain and not a compromise.
 *
 * Layer identifiers are derived from the run and plan identifiers rather than from a
 * counter, so two replays of the same scenario produce the same layers in the same order
 * (Constitution II, SC-004).
 */
import { COORDINATE_SYSTEM, OrbitView, MapView } from "@deck.gl/core";
import { PathLayer, PointCloudLayer, ScatterplotLayer } from "@deck.gl/layers";

import { layerInputs } from "../uncertainty/UncertaintyLayer";
import { INK, encode, shade } from "./shading";
import { valueIndex } from "./fieldCube";

import type { Layer, Position } from "@deck.gl/core";
import type { DrawnField, FieldCell } from "../uncertainty/UncertaintyLayer";
import type { RouteLayerInputs, RouteVertex } from "../route/RouteLayer";
import type { FieldCube } from "./fieldCube";
import type { Graticule, MapExtent } from "./extent";

/** The flat map's view: a Web Mercator viewport with no basemap under it (FR-002). */
export const FLAT_VIEW = new MapView({ id: "flat", repeat: false, controller: true });

/** The volume's view: an orbit the viewer rotates and tilts, over cartesian coordinates. */
export const VOLUME_VIEW = new OrbitView({ id: "volume", orbitAxis: "Z", controller: true });

/** Metres in a degree of latitude, near enough for sizing a cell that is drawn, not measured. */
const METRES_PER_DEGREE = 111_320;

/** How wide the graticule and frame are drawn, in pixels. */
const FRAME_WIDTH = 2;
const GRATICULE_WIDTH = 1;
const ROUTE_WIDTH = 3;

/**
 * How large one drawn cell is, in metres, before its magnitude scales it.
 *
 * From the drawn field's own spacing rather than from a constant, so a downsampled field
 * draws larger cells covering the same ground rather than a sparser scatter of small ones
 * that reads as a field with gaps in it. The smaller of the two axes is taken, so cells
 * never overlap on the tighter one.
 */
function cellSpacingMetres(extent: MapExtent, field: DrawnField): number {
  const latitudeSpan = Math.abs(extent.maximumLatitude - extent.minimumLatitude);
  const longitudeSpan = Math.abs(extent.maximumLongitude - extent.minimumLongitude);
  const middle = ((extent.maximumLatitude + extent.minimumLatitude) / 2) * (Math.PI / 180);
  const perRow = (latitudeSpan / Math.max(1, field.rows)) * METRES_PER_DEGREE;
  const perColumn =
    (longitudeSpan / Math.max(1, field.columns)) * METRES_PER_DEGREE * Math.cos(middle);
  return Math.max(1, Math.min(perRow, perColumn));
}

/** The extent's own boundary, drawn as the brightest line on the surface. */
export function frameLayer(extent: MapExtent, graticule: Graticule): Layer {
  return new PathLayer({
    id: "map-extent-frame",
    data: [{ path: graticule.frame.map((position) => [...position] as Position) }],
    getPath: (entry: { path: Position[] }) => entry.path,
    getColor: [...INK.frame],
    getWidth: FRAME_WIDTH,
    widthUnits: "pixels",
    widthMinPixels: FRAME_WIDTH,
    // Named for the extent it bounds, so a re-derived extent replaces the layer rather
    // than leaving the previous run's frame drawn under the new one.
    updateTriggers: { getPath: [extent] },
  }) as unknown as Layer;
}

/** The meridians and parallels. Geometry, and never mistaken for content. */
export function graticuleLayer(graticule: Graticule): Layer {
  return new PathLayer({
    id: "map-graticule",
    data: graticule.lines.map((line) => ({
      path: line.path.map((position) => [...position] as Position),
    })),
    getPath: (entry: { path: Position[] }) => entry.path,
    getColor: [...INK.graticule],
    getWidth: GRATICULE_WIDTH,
    widthUnits: "pixels",
    widthMinPixels: GRATICULE_WIDTH,
  }) as unknown as Layer;
}

export interface FieldLayerOptions {
  readonly extent: MapExtent;
  readonly field: DrawnField;
  readonly onPick?: (cell: FieldCell) => void;
}

/**
 * The uncertainty field.
 *
 * Every cell in `field.cells` is a cell feature 012 chose to draw, at the stride it stated.
 * Nothing is added, nothing is interpolated between them, and the range the shading spans
 * is the observed range of the drawn cells — 012's `layerInputs` computes it, and the
 * legend prints the same two numbers, so what a reader is told the ramp means is what the
 * ramp actually means.
 */
export function fieldLayer(options: FieldLayerOptions): Layer {
  const inputs = layerInputs(options.field);
  const spacing = cellSpacingMetres(options.extent, options.field);
  return new ScatterplotLayer({
    id: inputs.id,
    data: inputs.data as FieldCell[],
    getPosition: (cell: FieldCell) => [...inputs.getPosition(cell)] as [number, number],
    getFillColor: (cell: FieldCell) => [...encode(inputs.getValue(cell), inputs.valueRange).shade],
    getRadius: (cell: FieldCell) =>
      (encode(inputs.getValue(cell), inputs.valueRange).sizeFraction * spacing) / 2,
    radiusUnits: "meters",
    radiusMinPixels: 1,
    stroked: false,
    pickable: options.onPick !== undefined,
    onClick: ({ object }: { object?: FieldCell }) => {
      if (object !== undefined) {
        options.onPick?.(object);
      }
      return true;
    },
    updateTriggers: {
      getFillColor: [inputs.valueRange],
      getRadius: [inputs.valueRange, spacing],
    },
  }) as unknown as Layer;
}

export interface RouteLayerOptions {
  readonly route: RouteLayerInputs;
  /** The sequence numbers the trajectory response declined, so they are drawn as declined. */
  readonly declined: ReadonlySet<number>;
  readonly selected: number | null;
  readonly onPick?: (vertex: RouteVertex) => void;
}

/**
 * The recommended route: the curve, and one mark per published waypoint.
 *
 * Two layers rather than one, because a path and its vertices answer different questions —
 * where the route goes, and where the planner said it would be at a stated instant.
 *
 * A vertex the trajectory response declined is drawn dark and hollow rather than omitted:
 * FR-004 and 012's FR-027 both say a declined vertex is shown as declined with its reason,
 * because a silently missing waypoint reads as a route the planner did not recommend. The
 * marking is a fill and a stroke, not a colour, so it survives greyscale (FR-005).
 */
export function routeLayers(options: RouteLayerOptions): Layer[] {
  const { route } = options;
  if (route.data.length === 0) {
    return [];
  }
  const path = new PathLayer({
    id: `${route.id}-path`,
    data: [{ path: route.path.map((position) => [...position] as Position) }],
    getPath: (entry: { path: Position[] }) => entry.path,
    getColor: [...INK.route],
    getWidth: ROUTE_WIDTH,
    widthUnits: "pixels",
    widthMinPixels: ROUTE_WIDTH,
  }) as unknown as Layer;
  const vertices = new ScatterplotLayer({
    id: `${route.id}-vertices`,
    data: route.data as RouteVertex[],
    getPosition: (vertex: RouteVertex) => [vertex.longitude, vertex.latitude] as [number, number],
    getFillColor: (vertex: RouteVertex) =>
      options.declined.has(vertex.sequence) ? [...INK.declinedVertex] : [...INK.vertex],
    getLineColor: [...INK.vertex],
    getLineWidth: (vertex: RouteVertex) => (options.declined.has(vertex.sequence) ? 2 : 1),
    getRadius: (vertex: RouteVertex) => (vertex.sequence === options.selected ? 9 : 6),
    radiusUnits: "pixels",
    stroked: true,
    lineWidthUnits: "pixels",
    pickable: options.onPick !== undefined,
    onClick: ({ object }: { object?: RouteVertex }) => {
      if (object !== undefined) {
        options.onPick?.(object);
      }
      return true;
    },
    updateTriggers: {
      getFillColor: [options.declined],
      getLineWidth: [options.declined],
      getRadius: [options.selected],
    },
  }) as unknown as Layer;
  return [path, vertices];
}

/** The cell a viewer has picked, ringed so the selection is visible on the surface. */
export function pickedCellLayer(longitude: number, latitude: number): Layer {
  return new ScatterplotLayer({
    id: "map-picked-cell",
    data: [{ longitude, latitude }],
    getPosition: (entry: { longitude: number; latitude: number }) =>
      [entry.longitude, entry.latitude] as [number, number],
    getLineColor: [...INK.picked],
    getFillColor: [0, 0, 0, 0],
    getRadius: 10,
    radiusUnits: "pixels",
    stroked: true,
    filled: false,
    lineWidthUnits: "pixels",
    getLineWidth: 2,
  }) as unknown as Layer;
}

// ---------------------------------------------------------------------------------------
// The volume
// ---------------------------------------------------------------------------------------

/** How large the drawn volume is, in the orbit view's own arbitrary units. */
const VOLUME_WIDTH = 100;
const VOLUME_DEPTH = 60;

/** One point of the drawn volume, in the view's own coordinates with its data beside it. */
export interface VolumePoint {
  readonly position: readonly [number, number, number];
  readonly value: number;
  readonly depthM: number;
  readonly latitude: number;
  readonly longitude: number;
}

export interface DrawnVolume {
  readonly runId: string;
  readonly simTime: string;
  readonly points: readonly VolumePoint[];
  /** One node in every `stride` on each of the three axes is drawn. One means all of them. */
  readonly stride: number;
  readonly cellsInCube: number;
  readonly valueRange: readonly [number, number];
  /** The depth range the volume spans, as the cube's own axis states it. */
  readonly depthRange: readonly [number, number];
  readonly downsampled: boolean;
}

/**
 * The label the depth axis carries, and the convention it declares.
 *
 * Said in words rather than implied by an arrow, because a sign error on a vertical axis is
 * invisible in a picture and entirely plausible in a plot — the same argument `RouteLayer`
 * makes about the route's own depth. Depth is positive downwards, as the coverage's axis
 * states it and as the planner publishes it, and the volume draws it downwards.
 */
export const DEPTH_AXIS_LABEL =
  "Depth, in metres, positive downwards: the axis increases away from the surface, as the " +
  "coverage's own vertical axis does. Nothing here is elevation.";

/** The smallest stride that brings a cube's node count inside the drawing budget. */
function volumeStride(cube: FieldCube, maximum: number): number {
  const cap = Math.max(1, Math.floor(maximum));
  let stride = 1;
  const nodes = (step: number): number =>
    Math.ceil(cube.longitudes.length / step) *
    Math.ceil(cube.latitudes.length / step) *
    Math.ceil(cube.depths.length / step);
  while (nodes(stride) > cap) {
    stride += 1;
  }
  return stride;
}

/**
 * The cube as a volume, from exactly the data the flat map drew.
 *
 * The same fetched cube, at the same instant, reduced by the same kind of stride feature
 * 012 uses on a slice and for the same reason: a stride shows nodes the cube actually
 * contains and says how many it skipped, where an average would produce a value no node
 * ever held. Entering this view fetches nothing — it is a second reading of one response
 * (FR-006, SC-006).
 *
 * A node the response did not report is skipped rather than drawn at zero, and the count of
 * drawn nodes against the cube's own size is what the display states.
 */
export function drawnVolume(
  cube: FieldCube,
  timeIndex: number,
  maximumDrawnCells: number,
): DrawnVolume | null {
  const simTime = cube.times[timeIndex];
  if (simTime === undefined) {
    return null;
  }
  const stride = volumeStride(cube, maximumDrawnCells);
  const depths = cube.depths;
  const shallowest = Math.min(...depths);
  const deepest = Math.max(...depths);
  const depthSpan = Math.max(deepest - shallowest, Number.EPSILON);
  const longitudes = cube.longitudes;
  const latitudes = cube.latitudes;
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const longitudeSpan = Math.max(east - west, Number.EPSILON);
  const latitudeSpan = Math.max(north - south, Number.EPSILON);
  const points: VolumePoint[] = [];
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (let z = 0; z < depths.length; z += stride) {
    for (let y = 0; y < latitudes.length; y += stride) {
      for (let x = 0; x < longitudes.length; x += stride) {
        const value = cube.values[valueIndex(cube, timeIndex, z, y, x)];
        if (value === null || value === undefined) {
          continue;
        }
        const longitude = longitudes[x] as number;
        const latitude = latitudes[y] as number;
        const depthM = depths[z] as number;
        lowest = Math.min(lowest, value);
        highest = Math.max(highest, value);
        points.push({
          position: [
            ((longitude - west) / longitudeSpan - 0.5) * VOLUME_WIDTH,
            ((latitude - south) / latitudeSpan - 0.5) * VOLUME_WIDTH,
            // Downwards. The surface is at the top of the drawn box and depth increases
            // away from it, which is what DEPTH_AXIS_LABEL says in words.
            -((depthM - shallowest) / depthSpan) * VOLUME_DEPTH,
          ],
          value,
          depthM,
          latitude,
          longitude,
        });
      }
    }
  }
  const empty = points.length === 0;
  return {
    runId: cube.runId,
    simTime,
    points,
    stride,
    cellsInCube: longitudes.length * latitudes.length * depths.length,
    valueRange: empty ? [0, 0] : [lowest, highest],
    depthRange: [shallowest, deepest],
    downsampled: stride > 1,
  };
}

/** The sentence the volume prints, stating what it is showing and at what reduction. */
export function volumeWords(volume: DrawnVolume): string {
  if (!volume.downsampled) {
    return `Showing the cube entire: ${volume.points.length} nodes of ${volume.cellsInCube}.`;
  }
  return (
    `Downsampled for drawing: showing 1 node in ${volume.stride} on each of the three axes ` +
    `— ${volume.points.length} of ${volume.cellsInCube}. Every node drawn is a node the ` +
    `cube contains; none is an average of others.`
  );
}

/** The drawn volume, and the box and depth ticks that make its axis readable. */
export function volumeLayers(volume: DrawnVolume): Layer[] {
  const cloud = new PointCloudLayer({
    id: `volume-${volume.runId}`,
    data: volume.points as VolumePoint[],
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getPosition: (point: VolumePoint) => [...point.position] as [number, number, number],
    getColor: (point: VolumePoint) => {
      const [lowest, highest] = volume.valueRange;
      const span = highest - lowest;
      return [...shade(span <= 0 ? 0.5 : (point.value - lowest) / span)];
    },
    pointSize: 4,
    updateTriggers: { getColor: [volume.valueRange] },
  }) as unknown as Layer;
  return [cloud, volumeBoxLayer()];
}

/** The box the volume sits in, so the depth axis has something to be measured against. */
function volumeBoxLayer(): Layer {
  const half = VOLUME_WIDTH / 2;
  const top = 0;
  const bottom = -VOLUME_DEPTH;
  const corners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const ring = (level: number): Position[] =>
    [...corners, corners[0] as [number, number]].map(([x, y]) => [x, y, level] as Position);
  const paths: { path: Position[] }[] = [{ path: ring(top) }, { path: ring(bottom) }];
  for (const [x, y] of corners) {
    paths.push({
      path: [
        [x, y, top] as Position,
        [x, y, bottom] as Position,
      ],
    });
  }
  return new PathLayer({
    id: "volume-box",
    data: paths,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getPath: (entry: { path: Position[] }) => entry.path,
    getColor: [...INK.graticule],
    getWidth: GRATICULE_WIDTH,
    widthUnits: "pixels",
    widthMinPixels: GRATICULE_WIDTH,
  }) as unknown as Layer;
}
