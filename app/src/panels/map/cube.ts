/**
 * The depth-cube's pure half (issue #59): the frame that carries a lon/lat/depth
 * triple into the cartesian space an OrbitView rotates, and carries a clicked point
 * back out again. V1's map let the viewer rotate a cube of the data volume; V2's map
 * gained a globe instead, and served depth one slice at a time. This restores the
 * volume without inventing one: each level drawn is a genuine EDR area query, and the
 * levels themselves come from the holding's own manifest, which states the depth axis
 * exactly (minimum, spacing, count) rather than leaving the shell to guess.
 *
 * Nothing here fetches, and nothing here knows about deck.gl.
 */

/** The axis shape the ground-truth manifest states for each dimension. */
export interface ManifestAxis {
  minimum: number;
  maximum: number;
  count: number;
  spacing: number;
}

/**
 * The values an axis actually holds. Taken from the spacing the manifest states,
 * not from dividing the extent — the two agree for every holding this harness
 * authors, and where they ever disagree the spacing is the one the sampler used.
 */
export function axisValues(axis: ManifestAxis): number[] {
  const values: number[] = [];
  for (let index = 0; index < axis.count; index++) {
    values.push(round3(axis.minimum + index * axis.spacing));
  }
  return values;
}

export interface CubeBounds {
  west: number;
  east: number;
  south: number;
  north: number;
  /** The deepest level drawn, in metres, positive downwards. */
  deepest: number;
}

/** Half-width of the drawn volume, in the view's own units; the ground is z = 0. */
const HORIZONTAL_SPAN = 100;
/** How far down the deepest level is drawn. Depth is exaggerated, and says so. */
const VERTICAL_SPAN = 80;

/**
 * The mapping between the domain's degrees-and-metres and the cube's units, and its
 * exact inverse — the inverse is what lets a click on a slice place an EDR query, so
 * the two are tested as a round trip rather than written twice.
 */
export interface CubeFrame {
  /** Units per degree, the same for both horizontal axes so slices keep their shape. */
  readonly unitsPerDegree: number;
  readonly bounds: CubeBounds;
  toCartesian(longitude: number, latitude: number, depthM: number): [number, number, number];
  toGeographic(x: number, y: number): { longitude: number; latitude: number };
  /** The depth a cube-space height stands for, clamped to the volume drawn. */
  depthAt(z: number): number;
}

export function cubeFrame(bounds: CubeBounds): CubeFrame {
  const lonSpan = Math.max(bounds.east - bounds.west, 1e-9);
  const latSpan = Math.max(bounds.north - bounds.south, 1e-9);
  const unitsPerDegree = (2 * HORIZONTAL_SPAN) / Math.max(lonSpan, latSpan);
  const lonCentre = (bounds.west + bounds.east) / 2;
  const latCentre = (bounds.south + bounds.north) / 2;
  const deepest = Math.max(bounds.deepest, 1e-9);
  return {
    unitsPerDegree,
    bounds,
    toCartesian(longitude, latitude, depthM) {
      const z = -(depthM / deepest) * VERTICAL_SPAN;
      return [
        (longitude - lonCentre) * unitsPerDegree,
        (latitude - latCentre) * unitsPerDegree,
        // The surface is zero, not negative zero: a sign nobody meant is a sign
        // somebody will eventually read.
        z === 0 ? 0 : z,
      ];
    },
    toGeographic(x, y) {
      return {
        longitude: round3(x / unitsPerDegree + lonCentre),
        latitude: round3(y / unitsPerDegree + latCentre),
      };
    },
    depthAt(z) {
      const metres = (-z / VERTICAL_SPAN) * deepest;
      return round3(Math.min(Math.max(metres, 0), deepest));
    },
  };
}

/**
 * The twelve edges of the drawn volume, as cartesian paths: the frame a rotating
 * viewer needs to read which way is down and where the domain ends.
 */
export function volumeEdges(frame: CubeFrame): [number, number, number][][] {
  const { west, east, south, north, deepest } = frame.bounds;
  const corner = (longitude: number, latitude: number, depth: number) =>
    frame.toCartesian(longitude, latitude, depth);
  const face = (depth: number): [number, number, number][] => [
    corner(west, south, depth),
    corner(east, south, depth),
    corner(east, north, depth),
    corner(west, north, depth),
    corner(west, south, depth),
  ];
  const uprights: [number, number, number][][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ].map(([longitude, latitude]) => [corner(longitude, latitude, 0), corner(longitude, latitude, deepest)]);
  return [face(0), face(deepest), ...uprights];
}

/**
 * The platform in the volume (feature 114, FR-69): the track it reported and the course
 * it was demanded, carried into the cube's cartesian space.
 *
 * Pure, and here rather than inline in the panel, because the claim worth checking is not
 * that a layer exists but that **the track is at the depths the platform reported**. The
 * plan view and the globe have nowhere to put a depth and flatten it of necessity; the
 * volume's whole subject is depth, and a track drawn along its floor would be the panel
 * discarding the one dimension that view exists for. A test can assert that here; it
 * cannot assert it against a deck.gl layer in a headless browser with no WebGL.
 */
export interface OwnshipInCube {
  /** The reported positions, at their reported depths, in cube space. */
  readonly track: [number, number, number][];
  /** The demanded course as a ray from where the platform is, at the depth it is. */
  readonly demand?: [number, number, number][];
}

export function ownshipInCube(
  frame: CubeFrame,
  points: readonly { longitude: number; latitude: number; depthM: number }[],
  ray: readonly (readonly [number, number])[] | undefined,
  currentDepthM: number | undefined,
): OwnshipInCube {
  const track = points.map((point) =>
    frame.toCartesian(point.longitude, point.latitude, point.depthM),
  );
  // A demand carries a course and a speed and says nothing about descending, so the ray
  // is drawn at the depth the platform is *at* — reported, not demanded, and never zero
  // by default: a ray on the surface would say the platform had been told to come up.
  const demand =
    ray && ray.length > 0 && currentDepthM !== undefined
      ? ray.map(([longitude, latitude]) => frame.toCartesian(longitude, latitude, currentDepthM))
      : undefined;
  return { track, demand };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
