/**
 * What a consumer knows about the water it is reasoning over, and where it learned it
 * (FR-77, FR-82).
 *
 * Every figure here arrives over the seam. The published run's own message carries the
 * domain on all three axes and the collections its fields are servable under, which is
 * why it is also the message that marks a consumer stale: one document says *the
 * forecast has changed*, *this is what it covers*, and *this is where to ask for it*.
 *
 * How deep the vessel can go is not in that message and is not a constant here either.
 * The planner plans only where the platform can go, and publishes the depth bands it
 * planned over; the deepest of those is therefore the platform's reach, stated by the
 * component in the best position to know it. Below that the water is forecast and
 * unreachable, which is the asymmetry the expendables exist for.
 */
import type { Plan, PlatformState, RunPublished } from '../../generated/types.js';

export interface Domain {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
  readonly minimumDepthM: number;
  readonly maximumDepthM: number;
}

export interface DepthZone {
  readonly index: number;
  readonly minimumDepthM: number;
  readonly maximumDepthM: number;
  /** Whether the vessel can transit this zone, and so reduce uncertainty in it. */
  readonly reachable: boolean;
}

export function domainFromRun(run: RunPublished): Domain {
  return {
    west: run.grid_bounds.minimum_longitude,
    south: run.grid_bounds.minimum_latitude,
    east: run.grid_bounds.maximum_longitude,
    north: run.grid_bounds.maximum_latitude,
    minimumDepthM: run.grid_bounds.minimum_depth_m,
    maximumDepthM: run.grid_bounds.maximum_depth_m,
  };
}

/** The domain's own polygon, counter-clockwise, closed — the ring an area query takes. */
export function domainRing(domain: Domain): [number, number][] {
  return [
    [domain.west, domain.south],
    [domain.east, domain.south],
    [domain.east, domain.north],
    [domain.west, domain.north],
    [domain.west, domain.south],
  ];
}

/**
 * How deep the vessel can go, and which component said so.
 *
 * The platform reports its own limits on its state topic, and that is the best authority
 * there is: it is the component the limit belongs to. Failing that, the planner publishes
 * the depth bands it planned over, and it plans only where the platform can go — a
 * weaker statement of the same fact, from a component in a position to know it.
 *
 * Undefined is neither zero nor the whole column. A consumer that has heard neither says
 * it does not know yet, rather than drawing every zone as reachable and sending the
 * expendables nowhere.
 */
export function vesselReach(
  platform: PlatformState | undefined,
  plan: Plan | undefined,
): { readonly metres?: number; readonly from?: string } {
  if (platform) return { metres: platform.limits.maximum_depth_m, from: 'the platform\u2019s reported limits' };
  if (plan && plan.indexing.depth_bands.length > 0) {
    return {
      metres: Math.max(...plan.indexing.depth_bands.map((band) => band.maximum_depth_m)),
      from: 'the planner\u2019s published depth bands',
    };
  }
  return {};
}

/**
 * The column divided into zones. The count is configuration; the depth is the run's; the
 * reach is the planner's. A zone counts as reachable when the vessel can enter it at all
 * — its shallow edge is above the reach — because a zone half of which can be sampled is
 * not a zone the expendables have to serve.
 */
export function depthZones(domain: Domain, count: number, reachM: number | undefined): DepthZone[] {
  const span = (domain.maximumDepthM - domain.minimumDepthM) / count;
  const zones: DepthZone[] = [];
  for (let index = 0; index < count; index++) {
    const minimumDepthM = domain.minimumDepthM + index * span;
    zones.push({
      index,
      minimumDepthM,
      maximumDepthM: minimumDepthM + span,
      reachable: reachM === undefined ? false : minimumDepthM < reachM,
    });
  }
  return zones;
}

/** Which zone a depth falls in, clamped to the column. */
export function zoneOfDepth(zones: readonly DepthZone[], depthM: number): number {
  for (const zone of zones) if (depthM < zone.maximumDepthM) return zone.index;
  return zones.length - 1;
}

/** Metres between two positions, on a sphere flat enough for a domain this size. */
export function metresBetween(
  from: { longitude: number; latitude: number },
  to: { longitude: number; latitude: number },
): number {
  const metresPerDegree = 111_320;
  const midLatitude = ((from.latitude + to.latitude) / 2) * (Math.PI / 180);
  const dx = (to.longitude - from.longitude) * metresPerDegree * Math.cos(midLatitude);
  const dy = (to.latitude - from.latitude) * metresPerDegree;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Simulation instants are ISO-8601 with microseconds; seconds between two of them. */
export function secondsBetween(earlier: string, later: string): number {
  return (instantMillis(later) - instantMillis(earlier)) / 1000;
}

export function instantMillis(instant: string): number {
  return Date.parse(instant.slice(0, 23) + 'Z');
}
