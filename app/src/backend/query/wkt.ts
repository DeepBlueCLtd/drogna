/**
 * The WKT subset the EDR component accepts, and only that subset: POINT for
 * position queries, LINESTRING ZM for trajectory queries (per-vertex depth and
 * time, FR-28). Everything else is refused with the shape named (FR-27) — a parser
 * that guessed would be an offered-but-stubbed capability.
 */

export interface TrajectoryVertex {
  longitude: number;
  latitude: number;
  depthM: number;
  /** POSIX seconds UTC — the M ordinate, the per-vertex timestamp of FR-28. */
  posixSeconds: number;
}

export type WktResult<T> = { ok: true; value: T } | { ok: false; refusal: string };

export function parsePoint(coords: string): WktResult<{ longitude: number; latitude: number }> {
  const match = /^POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(coords.trim());
  if (!match) {
    return { ok: false, refusal: `coords '${coords}' is not the accepted shape POINT(lon lat)` };
  }
  return { ok: true, value: { longitude: Number(match[1]), latitude: Number(match[2]) } };
}

/** POLYGON with one ring; the area subset samples the ring's bounding box. */
export function parsePolygon(
  coords: string,
): WktResult<{ west: number; south: number; east: number; north: number }> {
  const match = /^POLYGON\s*\(\s*\(([^)]*)\)\s*\)$/i.exec(coords.trim());
  if (!match) {
    return {
      ok: false,
      refusal: `coords '${coords.slice(0, 60)}' is not the accepted shape POLYGON((lon lat, ...)): one ring, and the area subset samples its bounding box`,
    };
  }
  const ring: [number, number][] = [];
  for (const vertexText of match[1].split(',')) {
    const parts = vertexText.trim().split(/\s+/).map(Number);
    if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) {
      return { ok: false, refusal: `polygon vertex '${vertexText.trim()}' does not carry the two ordinates lon lat` };
    }
    ring.push([parts[0], parts[1]]);
  }
  if (ring.length < 4) {
    return { ok: false, refusal: 'a polygon ring needs at least four vertices, closing on its first' };
  }
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return {
    ok: true,
    value: {
      west: Math.min(...lons),
      south: Math.min(...lats),
      east: Math.max(...lons),
      north: Math.max(...lats),
    },
  };
}

export function parseTrajectory(coords: string): WktResult<TrajectoryVertex[]> {
  const match = /^LINESTRING\s*ZM\s*\(([^)]*)\)$/i.exec(coords.trim());
  if (!match) {
    return {
      ok: false,
      refusal: `coords '${coords.slice(0, 60)}' is not the accepted shape LINESTRINGZM(lon lat depth posix_seconds, ...): the trajectory subset carries per-vertex depth and time, and no other LINESTRING form is implemented`,
    };
  }
  const vertices: TrajectoryVertex[] = [];
  for (const vertexText of match[1].split(',')) {
    const parts = vertexText.trim().split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
      return { ok: false, refusal: `trajectory vertex '${vertexText.trim()}' does not carry the four ordinates lon lat depth posix_seconds` };
    }
    vertices.push({ longitude: parts[0], latitude: parts[1], depthM: parts[2], posixSeconds: parts[3] });
  }
  if (vertices.length < 2) {
    return { ok: false, refusal: 'a trajectory needs at least two vertices' };
  }
  return { ok: true, value: vertices };
}
