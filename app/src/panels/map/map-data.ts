/**
 * The Map panel's data builders (FR-40), pure and testable without WebGL: grid
 * cells from an area-query Coverage, advisory validity against the displayed
 * instant, the route as a four-dimensional curve with the platform's position
 * interpolated at the displayed time, and the projection's H3 cells. Everything
 * here transforms documents that crossed the seam; nothing reads a store.
 */
import { cellToBoundary } from 'h3-js';
import type { Advisory, FeaturesResponseFeature, Plan } from '../../generated/types.js';

/** The Grid-domain Coverage subset the area query serves (coveragejson master). */
export interface GridCoverage {
  domain: {
    domainType: string;
    axes: { x: { values: number[] }; y: { values: number[] }; z: { values: number[] }; t: { values: string[] } };
  };
  ranges: Record<string, { shape: number[]; values: number[] }>;
}

export interface GridCell {
  /** [west, south, east, north] of the cell, centred on the grid point. */
  bounds: [number, number, number, number];
  value: number;
}

/** The coverage's grid points as drawable cells, with the value range observed. */
export function gridCells(
  coverage: GridCoverage,
  parameter: string,
): { cells: GridCell[]; minimum: number; maximum: number } | undefined {
  const range = coverage.ranges[parameter];
  if (!range || coverage.domain.domainType !== 'Grid') return undefined;
  const lons = coverage.domain.axes.x.values;
  const lats = coverage.domain.axes.y.values;
  const lonHalf = lons.length > 1 ? (lons[1] - lons[0]) / 2 : 0.125;
  const latHalf = lats.length > 1 ? (lats[1] - lats[0]) / 2 : 0.1;
  const cells: GridCell[] = [];
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let latIndex = 0; latIndex < lats.length; latIndex++) {
    for (let lonIndex = 0; lonIndex < lons.length; lonIndex++) {
      const value = range.values[latIndex * lons.length + lonIndex];
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
      cells.push({
        bounds: [
          lons[lonIndex] - lonHalf,
          lats[latIndex] - latHalf,
          lons[lonIndex] + lonHalf,
          lats[latIndex] + latHalf,
        ],
        value,
      });
    }
  }
  return { cells, minimum, maximum };
}

/**
 * A perceptual single-hue ramp, legible in greyscale because lightness carries
 * the value: low is dark, high is light, with a blue-to-warm drift for colour.
 */
export function rampColour(value: number, minimum: number, maximum: number): [number, number, number] {
  const span = maximum - minimum;
  const t = span > 0 ? Math.min(Math.max((value - minimum) / span, 0), 1) : 0.5;
  return [Math.round(40 + 200 * t), Math.round(60 + 130 * t), Math.round(120 + 60 * (1 - t))];
}

export type AdvisoryFeature = FeaturesResponseFeature & {
  properties: Omit<Advisory, 'region'>;
};

/** Whether the advisory is valid at the displayed simulation instant (FR-40). */
export function validAt(advisory: Pick<Advisory, 'valid_time'>, displayedSimTime: string): boolean {
  return (
    advisory.valid_time.start_sim_time <= displayedSimTime && displayedSimTime < advisory.valid_time.end_sim_time
  );
}

export interface RoutePosition {
  longitude: number;
  latitude: number;
  depthM: number;
  /** The vertex the platform is travelling toward at the displayed instant. */
  towardSequence: number | null;
}

/**
 * Where along the committed route the platform stands at the displayed instant:
 * linear interpolation between successive arrival times — before the first
 * vertex it sits at the plan's platform position, after the last it holds there.
 */
export function routePositionAt(plan: Plan, displayedSimTime: string): RoutePosition | undefined {
  const vertices = plan.route.vertices;
  if (vertices.length === 0) return undefined;
  const legs: { longitude: number; latitude: number; depth_m: number; arrival_sim_time: string }[] = [
    { ...plan.platform, arrival_sim_time: plan.horizon.start_sim_time },
    ...vertices,
  ];
  if (displayedSimTime <= legs[0].arrival_sim_time) {
    return { longitude: legs[0].longitude, latitude: legs[0].latitude, depthM: legs[0].depth_m, towardSequence: vertices[0].sequence };
  }
  for (let i = 1; i < legs.length; i++) {
    if (displayedSimTime <= legs[i].arrival_sim_time) {
      const from = legs[i - 1];
      const to = legs[i];
      const t0 = Date.parse(from.arrival_sim_time.slice(0, 23) + 'Z');
      const t1 = Date.parse(to.arrival_sim_time.slice(0, 23) + 'Z');
      const now = Date.parse(displayedSimTime.slice(0, 23) + 'Z');
      const t = t1 > t0 ? (now - t0) / (t1 - t0) : 1;
      return {
        longitude: from.longitude + t * (to.longitude - from.longitude),
        latitude: from.latitude + t * (to.latitude - from.latitude),
        depthM: from.depth_m + t * (to.depth_m - from.depth_m),
        towardSequence: vertices[i - 1].sequence,
      };
    }
  }
  const last = legs[legs.length - 1];
  return { longitude: last.longitude, latitude: last.latitude, depthM: last.depth_m, towardSequence: null };
}

export interface ProjectionCell {
  boundary: [number, number][];
  /** 0 (collapsed) to 1 (at saturation): how much doubt stands in the cell now. */
  fraction: number;
  state: Plan['projection']['regions'][number]['state'];
  depthBand: number;
}

/**
 * A graticule for the globe: meridians and parallels as paths, generated here
 * rather than fetched — the page's one sphere reference, no tiles, no third
 * party. Meridians are split at the poles' approach so paths stay renderable.
 */
export function graticule(stepDegrees: number): [number, number][][] {
  const paths: [number, number][][] = [];
  for (let lon = -180; lon < 180; lon += stepDegrees) {
    const meridian: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 5) meridian.push([lon, lat]);
    paths.push(meridian);
  }
  for (let lat = -80; lat <= 80; lat += stepDegrees) {
    const parallel: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 5) parallel.push([lon, lat]);
    paths.push(parallel);
  }
  return paths;
}

/** The projection's H3 cells as polygons, the uncertainty fraction to shade by. */
export function projectionCells(plan: Plan, depthBand: number): ProjectionCell[] {
  return plan.projection.regions
    .filter((region) => region.depth_band === depthBand)
    .map((region) => ({
      boundary: cellToBoundary(region.h3_index, true).map(([lon, lat]) => [lon, lat] as [number, number]),
      fraction:
        region.saturated_uncertainty > 0
          ? Math.min(region.uncertainty_now / region.saturated_uncertainty, 1)
          : 0,
      state: region.state,
      depthBand: region.depth_band,
    }));
}

/**
 * Whether a lon/lat lies inside a closed ring (ray casting, half-open on the north
 * and east edges). The map uses it to say whether a picked position is inside the
 * domain — the query is sent either way, and the server's own answer is what the
 * composer displays; this is a warning, never a veto.
 */
export function insideRing(ring: readonly [number, number][], longitude: number, latitude: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [lonA, latA] = ring[index];
    const [lonB, latB] = ring[previous];
    if (
      latA > latitude !== latB > latitude &&
      longitude < ((lonB - lonA) * (latitude - latA)) / (latB - latA) + lonA
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** The time axis the ground-truth manifest states, in seconds from its origin. */
export interface ManifestTimeAxis {
  origin_sim_time: string;
  start_offset_seconds: number;
  step_seconds: number;
  count: number;
}

/**
 * The instants a holding actually stores (issue #60). The field advances at these
 * steps and no others, so they are what the scrubber refetches on: the displayed
 * instant moves continuously, the field moves when it crosses into another step.
 * Derived from the manifest rather than from a step typed into the shell.
 */
export function manifestInstants(time: ManifestTimeAxis): string[] {
  const originMillis = Date.parse(time.origin_sim_time.slice(0, 23) + 'Z');
  const instants: string[] = [];
  for (let index = 0; index < time.count; index++) {
    const seconds = time.start_offset_seconds + index * time.step_seconds;
    instants.push(`${new Date(originMillis + seconds * 1000).toISOString().slice(0, 23)}000Z`);
  }
  return instants;
}

/**
 * The stored instant a displayed instant falls on: the nearest step, which is what
 * the server's nearest-neighbour sampler would pick anyway, and ties go to the
 * earlier step so the choice is a rule rather than a coincidence of floating point.
 * Outside the axis it clamps, and `beyond` says so — the field then shows an end of
 * its extent, and the panel has to admit that rather than imply the field goes on.
 */
export function nearestInstant(
  instants: readonly string[],
  displayedSimTime: string,
): { instant: string; beyond: 'before' | 'after' | undefined } | undefined {
  if (instants.length === 0 || displayedSimTime === '') return undefined;
  const target = Date.parse(displayedSimTime.slice(0, 23) + 'Z');
  if (!Number.isFinite(target)) return undefined;
  if (target < Date.parse(instants[0].slice(0, 23) + 'Z')) return { instant: instants[0], beyond: 'before' };
  const last = instants[instants.length - 1];
  if (target > Date.parse(last.slice(0, 23) + 'Z')) return { instant: last, beyond: 'after' };
  let chosen = instants[0];
  let best = Number.POSITIVE_INFINITY;
  for (const instant of instants) {
    const distance = Math.abs(Date.parse(instant.slice(0, 23) + 'Z') - target);
    if (distance < best) {
      best = distance;
      chosen = instant;
    }
  }
  return { instant: chosen, beyond: undefined };
}

/**
 * The ownship track (SRD-v2 FR-55): the places the platform reported, in phenomenon
 * time order, taken from observations the query layer served.
 *
 * Not interpolated. The planner's route is a four-dimensional curve and is drawn as
 * one; this is a record of where the platform said it was, and drawing a smooth line
 * between two distant reports would claim positions nothing published. Where the
 * platform was stopped the track has a gap, and the gap is what the silence looked
 * like.
 */
export interface TrackPoint {
  readonly longitude: number;
  readonly latitude: number;
  readonly depthM: number;
  readonly simTime: string;
}

/**
 * One served Observation, as the SensorThings subset returns it. Where the observation
 * pertains to is its FeatureOfInterest — that is SensorThings' own answer to the
 * question, and the reason the track needs no entity set of its own: the geometry is
 * already on every observation the query layer serves.
 */
export interface ServedObservation {
  readonly phenomenonTime: string;
  readonly result: number;
  readonly FeatureOfInterest?: {
    readonly feature?: { readonly type: string; readonly coordinates: readonly number[] };
  };
}

/**
 * Order by phenomenon time and drop anything with no geometry. An observation with no
 * place is not a place: it is dropped rather than defaulted to zero, which would put
 * the platform in the Gulf of Guinea.
 */
export function ownshipTrack(observations: readonly ServedObservation[]): TrackPoint[] {
  return observations
    .flatMap((observation) => {
      const point = observation.FeatureOfInterest?.feature;
      if (!point || point.type !== 'Point' || point.coordinates.length < 2) return [];
      return [
        {
          longitude: point.coordinates[0],
          latitude: point.coordinates[1],
          depthM: point.coordinates[2] ?? 0,
          simTime: observation.phenomenonTime,
        },
      ];
    })
    .sort((a, b) => a.simTime.localeCompare(b.simTime));
}

/**
 * The demanded course drawn as a ray from where the platform is, its length the
 * demanded speed against a stated scale. Returns nothing when no demand is standing:
 * a ray pointing along the current course would say the platform had been told to
 * carry on, which nobody told it.
 */
export function demandRay(
  current: { longitude: number; latitude: number },
  demandedCourseDegrees: number | undefined,
  demandedSpeed: number | undefined,
  metresPerUnitSpeed: number,
): [[number, number], [number, number]] | undefined {
  if (demandedCourseDegrees === undefined || demandedSpeed === undefined) return undefined;
  const metres = demandedSpeed * metresPerUnitSpeed;
  const radians = (demandedCourseDegrees * Math.PI) / 180;
  const north = (metres * Math.cos(radians)) / (KM_PER_DEGREE_LATITUDE * 1000);
  const eastScale = KM_PER_DEGREE_LATITUDE * 1000 * Math.cos((current.latitude * Math.PI) / 180);
  const east = eastScale === 0 ? 0 : (metres * Math.sin(radians)) / eastScale;
  return [
    [current.longitude, current.latitude],
    [current.longitude + east, current.latitude + north],
  ];
}

/** The one conversion constant, shared with the motion simulator rather than retyped. */
const KM_PER_DEGREE_LATITUDE = 111.32;
