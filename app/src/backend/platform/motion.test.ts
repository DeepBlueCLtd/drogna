/**
 * The motion simulator's limits (SRD-v2 FR-52), each held at the place it binds.
 *
 * Every case here was watched failing before it was watched passing: the turn-rate
 * clamp was removed (a 90° demand arrived in one step), the wrap was taken the long
 * way round (350° → 010° swung 340° the wrong way), the shortfall was made silent
 * (an unreachable speed clipped with nothing said), and the binding limit was frozen
 * to 'none' (a platform that was not obeying reported that it was). Each plant went
 * red on the assertion named beside it; each was reverted.
 */
import { describe, expect, it } from 'vitest';
import { headingDifference, shortfall, step, wrapHeading, wrapLongitude, type Demand, type Limits, type Vector } from './motion.js';

const LIMITS: Limits = {
  maximum_speed_m_per_s: 4,
  maximum_depth_m: 400,
  turn_rate_degrees_per_second: 3,
  acceleration_m_per_s2: 0.05,
  dive_rate_m_per_s: 0.5,
};

const AT_REST: Vector = {
  latitude: 46,
  longitude: -11,
  course_degrees: 0,
  speed_m_per_s: 0,
  depth_m: 0,
};

const holding = (v: Vector): Demand => ({
  course_degrees: v.course_degrees,
  speed_m_per_s: v.speed_m_per_s,
  depth_m: v.depth_m,
});

describe('the motion simulator (feature 113)', () => {
  it('takes the short way round, including across 000', () => {
    expect(headingDifference(350, 10)).toBe(20);
    expect(headingDifference(10, 350)).toBe(-20);
    expect(headingDifference(0, 180)).toBe(180);
    // 181 the other way is -179: the short way, and the tie at 180 goes positive.
    expect(headingDifference(0, 181)).toBe(-179);
    expect(wrapHeading(-10)).toBe(350);
    expect(wrapHeading(370)).toBe(10);
  });

  it('turns at the declared rate and no faster, and stops when it arrives', () => {
    const demand: Demand = { course_degrees: 90, speed_m_per_s: 0, depth_m: 0 };
    let state = AT_REST;
    // Three degrees a second, ninety to go: thirty seconds, not one step.
    const first = step(state, demand, LIMITS, 1);
    expect(first.next.course_degrees).toBeCloseTo(3, 9);
    expect(first.binding).toBe('turn_rate');
    for (let i = 0; i < 30; i++) state = step(state, demand, LIMITS, 1).next;
    expect(state.course_degrees).toBeCloseTo(90, 9);
    // Arrived: it holds, and says nothing is binding any more.
    const held = step(state, demand, LIMITS, 1);
    expect(held.next.course_degrees).toBeCloseTo(90, 9);
    expect(held.binding).toBe('none');
  });

  it('turns the short way across 000 rather than the long way round', () => {
    const state: Vector = { ...AT_REST, course_degrees: 350 };
    const demand: Demand = { course_degrees: 10, speed_m_per_s: 0, depth_m: 0 };
    const after = step(state, demand, LIMITS, 1);
    // Three degrees along the short arc is 353, not 347.
    expect(after.next.course_degrees).toBeCloseTo(353, 9);
  });

  it('accelerates and dives at their own rates, each binding in turn', () => {
    const demand: Demand = { course_degrees: 0, speed_m_per_s: 2, depth_m: 100 };
    const after = step(AT_REST, demand, LIMITS, 1);
    expect(after.next.speed_m_per_s).toBeCloseTo(0.05, 9);
    expect(after.next.depth_m).toBeCloseTo(0.5, 9);
    // Course is already right, so what is holding it back is the slower of the two.
    expect(after.binding).toBe('acceleration');

    // At speed, with depth still to go, the dive rate is what binds.
    const atSpeed: Vector = { ...AT_REST, speed_m_per_s: 2, depth_m: 10 };
    expect(step(atSpeed, demand, LIMITS, 1).binding).toBe('dive_rate');
  });

  it('holds at a limit it cannot pass, and says what was asked for', () => {
    const demand: Demand = { course_degrees: 0, speed_m_per_s: 12, depth_m: 0 };
    let state = AT_REST;
    for (let i = 0; i < 500; i++) state = step(state, demand, LIMITS, 1).next;
    expect(state.speed_m_per_s).toBe(LIMITS.maximum_speed_m_per_s);
    expect(step(state, demand, LIMITS, 1).binding).toBe('maximum_speed');

    // The clip is never silent: what was asked and what was allowed both survive.
    const said = shortfall(demand, LIMITS);
    expect(said?.quantity).toBe('speed_m_per_s');
    expect(said?.asked).toBe(12);
    expect(said?.allowed).toBe(4);
    expect(said?.statement).toContain('demanded 12 m/s');
    expect(said?.statement).toContain('maximum is 4 m/s');
    // A reachable demand has nothing to say, and says nothing.
    expect(shortfall({ course_degrees: 0, speed_m_per_s: 3, depth_m: 100 }, LIMITS)).toBeNull();
    // Depth has the same treatment, and is reported separately from speed.
    expect(shortfall({ course_degrees: 0, speed_m_per_s: 1, depth_m: 900 }, LIMITS)?.quantity).toBe('depth_m');
  });

  it('travels on the course and speed it ends the step with', () => {
    // Due east at 4 m/s for 100 s: no change in latitude, and a longitude change of
    // 400 m converted at this latitude. Derived from the constants, not typed in.
    const state: Vector = { ...AT_REST, course_degrees: 90, speed_m_per_s: 4 };
    const demand = holding(state);
    const after = step(state, demand, LIMITS, 100).next;
    expect(after.latitude).toBeCloseTo(state.latitude, 9);
    const metresPerDegree = 111.32 * 1000 * Math.cos((state.latitude * Math.PI) / 180);
    expect(after.longitude - state.longitude).toBeCloseTo(400 / metresPerDegree, 9);

    // And due north puts it all into latitude.
    const north = step({ ...state, course_degrees: 0 }, { ...demand, course_degrees: 0 }, LIMITS, 100).next;
    expect(north.longitude).toBeCloseTo(state.longitude, 9);
    expect(north.latitude - state.latitude).toBeCloseTo(400 / (111.32 * 1000), 9);
  });

  it('keeps longitude in the range the map picks in', () => {
    expect(wrapLongitude(181)).toBeCloseTo(-179, 9);
    expect(wrapLongitude(-181)).toBeCloseTo(179, 9);
    expect(wrapLongitude(-180)).toBeCloseTo(-180, 9);
    // A platform driven east past the antimeridian comes back wound, not stranded.
    const state: Vector = { ...AT_REST, longitude: 179.999, course_degrees: 90, speed_m_per_s: 4 };
    const after = step(state, holding(state), LIMITS, 100).next;
    expect(after.longitude).toBeLessThan(0);
  });

  it('is a pure function: the same inputs give the same step, and the input is unchanged', () => {
    const demand: Demand = { course_degrees: 123, speed_m_per_s: 2.5, depth_m: 75 };
    const before = { ...AT_REST };
    const a = step(AT_REST, demand, LIMITS, 7);
    const b = step(AT_REST, demand, LIMITS, 7);
    expect(a).toEqual(b);
    expect(AT_REST).toEqual(before);
  });
});
