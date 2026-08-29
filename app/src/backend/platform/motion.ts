/**
 * The motion simulator (SRD-v2 FR-47): a pure step from one ownship state to the
 * next, under the platform's declared limits.
 *
 * Pure on purpose — no client, no clock, no RNG. Everything stochastic about the
 * platform lives in the instruments that *report* its state, never in the state
 * itself, so a replay that reproduces the demands reproduces the track exactly.
 *
 * The one subtlety worth stating: a turn takes the short way round, and "short"
 * across 000 is what a naive difference gets wrong. The wrap is held by a test at
 * 350 -> 010, planted the long way round and watched red.
 */
import type { ConfigPlatform, PlatformState } from '../../generated/types.js';

export type Limits = ConfigPlatform['limits'];
export type Vector = PlatformState['current'];
export type Demand = NonNullable<PlatformState['demanded']>;
export type BindingLimit = PlatformState['binding_limit'];

/** Metres per degree of latitude, the harness's one constant for the conversion. */
export const KM_PER_DEGREE_LATITUDE = 111.32;

/** Signed difference a -> b in degrees, taking the short way round: (-180, 180]. */
export function headingDifference(from: number, to: number): number {
  const raw = ((to - from) % 360 + 360) % 360;
  return raw > 180 ? raw - 360 : raw;
}

/** Normalise any heading into [0, 360). */
export function wrapHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Move `value` toward `target` by at most `rate * seconds`. */
function approach(value: number, target: number, rate: number, seconds: number): number {
  const step = rate * seconds;
  const gap = target - value;
  if (Math.abs(gap) <= step) return target;
  return value + Math.sign(gap) * step;
}

export interface Step {
  readonly next: Vector;
  /** Which limit held current away from demanded across this step. */
  readonly binding: BindingLimit;
}

/**
 * One step of simulation time. The order is deliberate: the platform turns, changes
 * speed and changes depth from where it was, then travels on the *new* course at the
 * *new* speed — a vehicle that accelerated through the step did not travel the whole
 * step at its old speed, and pretending otherwise puts the track systematically
 * behind the state that produced it.
 */
export function step(current: Vector, demand: Demand, limits: Limits, seconds: number): Step {
  const course = wrapHeading(
    current.course_degrees +
      approach(0, headingDifference(current.course_degrees, demand.course_degrees), limits.turn_rate_degrees_per_second, seconds),
  );
  const speed = approach(
    current.speed_m_per_s,
    Math.min(demand.speed_m_per_s, limits.maximum_speed_m_per_s),
    limits.acceleration_m_per_s2,
    seconds,
  );
  const depth = approach(
    current.depth_m,
    Math.min(demand.depth_m, limits.maximum_depth_m),
    limits.dive_rate_m_per_s,
    seconds,
  );

  const metres = speed * seconds;
  const radians = (course * Math.PI) / 180;
  const north = (metres * Math.cos(radians)) / (KM_PER_DEGREE_LATITUDE * 1000);
  const latitude = clamp(current.latitude + north, -90, 90);
  // The east-west scale is taken at the latitude the platform is *leaving*, which is
  // the same convention the sensors' retired loiter used. At these speeds and tick
  // lengths the difference is far below the instruments' declared noise; taking it at
  // the arrival latitude instead would be a second convention for no gain.
  const metresPerDegreeEast = KM_PER_DEGREE_LATITUDE * 1000 * Math.cos((current.latitude * Math.PI) / 180);
  const east = metresPerDegreeEast === 0 ? 0 : (metres * Math.sin(radians)) / metresPerDegreeEast;
  const longitude = wrapLongitude(current.longitude + east);

  return {
    next: { latitude, longitude, course_degrees: course, speed_m_per_s: speed, depth_m: depth },
    binding: binding(current, { course_degrees: course, speed_m_per_s: speed, depth_m: depth }, demand, limits),
  };
}

/**
 * Which limit is holding the platform away from what it was asked for. Reported
 * rather than inferred by a reader: a platform that is not obeying must never be
 * mistaken on screen for one that is (FR-020).
 */
function binding(before: Vector, after: Demand, demand: Demand, limits: Limits): BindingLimit {
  if (Math.abs(headingDifference(after.course_degrees, demand.course_degrees)) > 1e-9) return 'turn_rate';
  if (demand.speed_m_per_s > limits.maximum_speed_m_per_s && after.speed_m_per_s >= limits.maximum_speed_m_per_s) {
    return 'maximum_speed';
  }
  if (Math.abs(after.speed_m_per_s - Math.min(demand.speed_m_per_s, limits.maximum_speed_m_per_s)) > 1e-9) {
    return 'acceleration';
  }
  if (demand.depth_m > limits.maximum_depth_m && after.depth_m >= limits.maximum_depth_m) return 'maximum_depth';
  if (Math.abs(after.depth_m - Math.min(demand.depth_m, limits.maximum_depth_m)) > 1e-9) return 'dive_rate';
  void before;
  return 'none';
}

/**
 * What a demand asked for that no amount of simulation time will reach. Returned so
 * the platform can state it rather than clip the demand and say nothing (FR-021):
 * a clipped demand that stayed silent would be the platform quietly rewriting its
 * orders. Course is absent because every course is reachable — only the time it
 * takes varies, and that is the turn rate, which is a binding limit and not a
 * shortfall.
 */
export function shortfall(demand: Demand, limits: Limits): PlatformState['shortfall'] {
  if (demand.speed_m_per_s > limits.maximum_speed_m_per_s) {
    return {
      quantity: 'speed_m_per_s',
      asked: demand.speed_m_per_s,
      allowed: limits.maximum_speed_m_per_s,
      statement: `demanded ${demand.speed_m_per_s} m/s; this platform's declared maximum is ${limits.maximum_speed_m_per_s} m/s, and it is holding there`,
    };
  }
  if (demand.depth_m > limits.maximum_depth_m) {
    return {
      quantity: 'depth_m',
      asked: demand.depth_m,
      allowed: limits.maximum_depth_m,
      statement: `demanded ${demand.depth_m} m; this platform's declared maximum depth is ${limits.maximum_depth_m} m, and it is holding there`,
    };
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Longitudes stay in [-180, 180): the same wrap the map's picking uses. */
export function wrapLongitude(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}
