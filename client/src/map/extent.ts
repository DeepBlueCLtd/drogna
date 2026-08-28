/**
 * Where the map is, and how it knows — which are the same question for a surface that is
 * forbidden to invent geography.
 *
 * FR-001 asks that the extent derive from served data or served configuration and never
 * from a value written into client source, and there are exactly two sources, in this
 * order:
 *
 * 1. **The announcement.** `run-published` carries `grid_bounds`: minimum and maximum
 *    latitude, longitude and depth of the grid that was actually published. That is data,
 *    it arrives with no fetch at all, and it is re-read from every announcement rather
 *    than remembered — which is the specification's edge case about a run whose grid
 *    differs from the previous run's. A remembered extent is a claim about a run that has
 *    been superseded.
 * 2. **The served declaration.** `map.extent` in the configuration document, which is what
 *    a destination says about itself before anything has been published. It is what makes
 *    the map demonstrable against a stack whose loop has not turned: extent, graticule,
 *    and a sentence saying no field has arrived.
 *
 * Where there is neither, no frame is drawn. A default rectangle would be a lie with
 * coordinates on it, and the display says so instead.
 *
 * The source is carried beside the extent everywhere it goes, because "the field is drawn
 * in the wrong place" and "the field is drawn in the right place and the frame around it
 * came from somewhere else" look identical on a screen and are entirely different faults.
 */
import { CONTROL_SCHEMAS } from "../contracts/schemas";

import type { ScenarioExtent, VerticalRange } from "../config/runtime";
import type { DrognaModelRunPublished } from "../generated/messages/run_published";

/** A horizontal extent, with the vertical range where one is known. */
export interface MapExtent {
  readonly minimumLongitude: number;
  readonly minimumLatitude: number;
  readonly maximumLongitude: number;
  readonly maximumLatitude: number;
  /** Metres below the surface, positive downwards, or null where nothing stated it. */
  readonly minimumDepthM: number | null;
  readonly maximumDepthM: number | null;
}

/** Which of the two sources the extent in force came from, or neither. */
export type ExtentSource = "announced" | "declared" | "none";

export interface DerivedExtent {
  readonly extent: MapExtent | null;
  readonly source: ExtentSource;
  /** One line naming the source, so the display can be argued with rather than believed. */
  readonly because: string;
}

/** No extent, and the reason. The state a page is in before anything has been served. */
export const NO_EXTENT: DerivedExtent = {
  extent: null,
  source: "none",
  because:
    "no run has been announced and the served configuration declares no extent, so " +
    "nothing has stated where the scenario is.",
};

/**
 * The extent of the grid a run announced, or null where the message was not one.
 *
 * The schema is the arbiter, as it is everywhere else the client reads a control message:
 * a message that does not validate changes nothing, rather than contributing a bound that
 * happened to parse.
 *
 * A run published for inspection rather than made current does not move the extent, for
 * the same reason `overlay.ts` does not let it move the field: the announcement says which
 * it is, and drawing a frame around a run the publisher explicitly did not make current
 * would assert something the message denied.
 */
export function extentFromAnnouncement(raw: unknown): MapExtent | null {
  if (!CONTROL_SCHEMAS.runPublished.validate(raw)) {
    return null;
  }
  const message = raw as DrognaModelRunPublished;
  if (!message.current) {
    return null;
  }
  const bounds = message.grid_bounds;
  return {
    minimumLongitude: bounds.minimum_longitude,
    minimumLatitude: bounds.minimum_latitude,
    maximumLongitude: bounds.maximum_longitude,
    maximumLatitude: bounds.maximum_latitude,
    minimumDepthM: bounds.minimum_depth_m,
    maximumDepthM: bounds.maximum_depth_m,
  };
}

/** The declared extent adapted to the map's vocabulary, or null where none was served. */
export function extentFromDeclaration(
  declared: ScenarioExtent | undefined,
  vertical: VerticalRange | undefined,
): MapExtent | null {
  if (declared === undefined) {
    return null;
  }
  return {
    minimumLongitude: declared.minimumLongitude,
    minimumLatitude: declared.minimumLatitude,
    maximumLongitude: declared.maximumLongitude,
    maximumLatitude: declared.maximumLatitude,
    minimumDepthM: vertical?.minimumDepthM ?? null,
    maximumDepthM: vertical?.maximumDepthM ?? null,
  };
}

/**
 * The extent in force, and where it came from.
 *
 * The announcement wins where there is one, because it describes the grid that is actually
 * being drawn. The declaration is what a destination says about itself and is one step
 * further from the data.
 */
export function chooseExtent(
  announced: MapExtent | null,
  declared: MapExtent | null,
): DerivedExtent {
  if (announced !== null) {
    return {
      extent: announced,
      source: "announced",
      because:
        "the published run stated the bounds of the grid it published, and this is those " +
        "bounds, re-read from the announcement rather than remembered from an earlier one.",
    };
  }
  if (declared !== null) {
    return {
      extent: declared,
      source: "declared",
      because:
        "no run has been announced, so this is the extent the served configuration " +
        "declares for the scenario. It says where the map is, not what is in it.",
    };
  }
  return NO_EXTENT;
}

/** How wide and how tall the extent is, in degrees. */
export function span(extent: MapExtent): { readonly longitude: number; readonly latitude: number } {
  return {
    longitude: Math.abs(extent.maximumLongitude - extent.minimumLongitude),
    latitude: Math.abs(extent.maximumLatitude - extent.minimumLatitude),
  };
}

/**
 * The spacings a graticule is allowed to take, coarsest first.
 *
 * A fixed spacing draws four lines across a hemisphere and a black rectangle across a bay,
 * and both are useless in the same way: the graticule stops being a scale and becomes
 * decoration. So the spacing is chosen from the extent's own span, from the conventional
 * chart steps rather than from an arbitrary division, because a reader can count in
 * degrees, half-degrees and tenths and cannot count in 0.3125.
 */
const SPACINGS: readonly number[] = [30, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];

/** How many lines across the wider axis the graticule aims for. */
const TARGET_LINES = 8;

/** The coarsest conventional spacing that still draws roughly `TARGET_LINES` lines. */
export function graticuleSpacing(extent: MapExtent): number {
  const widest = Math.max(span(extent).longitude, span(extent).latitude);
  const last = SPACINGS[SPACINGS.length - 1] ?? 0.01;
  for (const spacing of SPACINGS) {
    if (widest / spacing >= TARGET_LINES) {
      return spacing;
    }
  }
  return last;
}

/** One graticule line: a labelled path of positions, longitude first. */
export interface GraticuleLine {
  readonly axis: "meridian" | "parallel";
  /** The degree value the line stands at, as the label prints it. */
  readonly degrees: number;
  readonly label: string;
  readonly path: readonly (readonly [number, number])[];
}

export interface Graticule {
  readonly spacingDegrees: number;
  readonly lines: readonly GraticuleLine[];
  /** The extent's own boundary, as a closed path, drawn as the frame. */
  readonly frame: readonly (readonly [number, number])[];
}

function ticks(from: number, to: number, spacing: number): number[] {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const found: number[] = [];
  // Started from a multiple of the spacing rather than from the extent's own edge, so two
  // extents that overlap draw their shared meridians in the same places. A graticule whose
  // lines move when the extent moves is a grid, not a graticule.
  const first = Math.ceil(low / spacing) * spacing;
  for (let value = first; value <= high + spacing / 1e6; value += spacing) {
    // Rounded to the spacing's own precision: repeated addition of 0.1 reaches
    // 0.30000000000000004, and a label reading that is a label nobody trusts.
    found.push(Number((Math.round(value / spacing) * spacing).toFixed(6)));
  }
  return found;
}

/** Degrees as a chart prints them: a magnitude and a hemisphere, never a minus sign. */
export function degreeLabel(value: number, axis: "meridian" | "parallel"): string {
  const hemisphere = axis === "meridian" ? (value < 0 ? "W" : "E") : value < 0 ? "S" : "N";
  return `${Math.abs(value)}°${hemisphere}`;
}

/**
 * The graticule for an extent: meridians, parallels and the frame around them.
 *
 * Geometry, not data. Every position here is derived from the extent by arithmetic, and no
 * part of it is drawn from anything that was fetched — which is what keeps a graticule from
 * being mistaken for content on an empty stack. It is the ruler, and the ruler is honest
 * about there being nothing on it.
 */
export function graticule(extent: MapExtent, spacingDegrees?: number): Graticule {
  const spacing = spacingDegrees ?? graticuleSpacing(extent);
  const west = Math.min(extent.minimumLongitude, extent.maximumLongitude);
  const east = Math.max(extent.minimumLongitude, extent.maximumLongitude);
  const south = Math.min(extent.minimumLatitude, extent.maximumLatitude);
  const north = Math.max(extent.minimumLatitude, extent.maximumLatitude);
  const lines: GraticuleLine[] = [];
  for (const longitude of ticks(west, east, spacing)) {
    lines.push({
      axis: "meridian",
      degrees: longitude,
      label: degreeLabel(longitude, "meridian"),
      path: [
        [longitude, south],
        [longitude, north],
      ],
    });
  }
  for (const latitude of ticks(south, north, spacing)) {
    lines.push({
      axis: "parallel",
      degrees: latitude,
      label: degreeLabel(latitude, "parallel"),
      path: [
        [west, latitude],
        [east, latitude],
      ],
    });
  }
  return {
    spacingDegrees: spacing,
    lines,
    frame: [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  };
}

/** Where the flat map looks from, so the whole extent is inside the viewport. */
export interface ViewFit {
  readonly longitude: number;
  readonly latitude: number;
  readonly zoom: number;
}

/** The normalised Web Mercator ordinate of a latitude, north at zero. */
function mercatorY(latitude: number): number {
  const clamped = Math.max(-85.051129, Math.min(85.051129, latitude));
  const radians = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

/** The latitude a normalised Web Mercator ordinate stands at. */
function latitudeAt(y: number): number {
  const radians = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
  return (radians * 180) / Math.PI;
}

/** How many pixels one whole world is across at zoom zero, as Web Mercator has it. */
const TILE_SIZE = 512;

/**
 * Fit an extent into a viewport.
 *
 * Written here rather than taken from the drawing library's own helper because it is
 * arithmetic with an answer that can be asserted, and a fit computed inside a component
 * that needs a WebGL context to exist is a fit nothing can check. `padding` leaves the
 * frame off the edge of the canvas, where the labels have somewhere to sit.
 */
export function fitView(
  extent: MapExtent,
  width: number,
  height: number,
  padding = 0.9,
): ViewFit {
  const west = Math.min(extent.minimumLongitude, extent.maximumLongitude);
  const east = Math.max(extent.minimumLongitude, extent.maximumLongitude);
  const south = Math.min(extent.minimumLatitude, extent.maximumLatitude);
  const north = Math.max(extent.minimumLatitude, extent.maximumLatitude);
  const spanX = Math.max((east - west) / 360, Number.EPSILON);
  const spanY = Math.max(mercatorY(south) - mercatorY(north), Number.EPSILON);
  const zoomX = Math.log2((width * padding) / (TILE_SIZE * spanX));
  const zoomY = Math.log2((height * padding) / (TILE_SIZE * spanY));
  return {
    longitude: (west + east) / 2,
    latitude: latitudeAt((mercatorY(south) + mercatorY(north)) / 2),
    zoom: Math.min(zoomX, zoomY),
  };
}

/**
 * How wide the canvas is drawn, given how tall it is and what shape the extent is.
 *
 * A canvas of a fixed shape draws a near-square extent with a third of its area empty on
 * either side, which reads as a map that failed to load rather than as a map of a place
 * that happens to be square. So the canvas takes the extent's own shape, in the projection
 * the extent will be drawn in — the mercator span, not the raw degrees, because three
 * degrees of longitude at fifty north is not three degrees of latitude.
 *
 * Bounded at both ends: an extent long enough to be a strip still gets a canvas somebody
 * can read, and one narrow enough to be a column still gets one the page can hold.
 */
export function canvasWidth(
  extent: MapExtent,
  height: number,
  narrowest = 320,
  widest = 1000,
): number {
  const west = Math.min(extent.minimumLongitude, extent.maximumLongitude);
  const east = Math.max(extent.minimumLongitude, extent.maximumLongitude);
  const south = Math.min(extent.minimumLatitude, extent.maximumLatitude);
  const north = Math.max(extent.minimumLatitude, extent.maximumLatitude);
  const spanX = Math.max((east - west) / 360, Number.EPSILON);
  const spanY = Math.max(mercatorY(south) - mercatorY(north), Number.EPSILON);
  return Math.round(Math.max(narrowest, Math.min(widest, height * (spanX / spanY))));
}

/** Whether a position falls inside an extent, used to say what a fetch actually covered. */
export function contains(extent: MapExtent, longitude: number, latitude: number): boolean {
  const west = Math.min(extent.minimumLongitude, extent.maximumLongitude);
  const east = Math.max(extent.minimumLongitude, extent.maximumLongitude);
  const south = Math.min(extent.minimumLatitude, extent.maximumLatitude);
  const north = Math.max(extent.minimumLatitude, extent.maximumLatitude);
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

/** The sentence the display prints beside the frame, naming where the extent came from. */
export function extentWords(derived: DerivedExtent): string {
  if (derived.extent === null) {
    return derived.because;
  }
  const { extent } = derived;
  const horizontal =
    `${degreeLabel(extent.minimumLongitude, "meridian")} to ` +
    `${degreeLabel(extent.maximumLongitude, "meridian")}, ` +
    `${degreeLabel(extent.minimumLatitude, "parallel")} to ` +
    `${degreeLabel(extent.maximumLatitude, "parallel")}`;
  const vertical =
    extent.minimumDepthM === null || extent.maximumDepthM === null
      ? ""
      : `, ${extent.minimumDepthM} m to ${extent.maximumDepthM} m below the surface`;
  return `${horizontal}${vertical}. This extent is ${derived.source}: ${derived.because}`;
}
