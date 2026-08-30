/**
 * Feature 118: resolving a start condition, and what resolving one does to the
 * configuration document.
 *
 * The three faults this exists to catch are all silent ones. An address naming a
 * condition that has been withdrawn would open the default and say nothing, so a stale
 * link would look like a working one. A condition whose platform vector never reached the
 * platform document would put every situation in the same place while every card claimed
 * otherwise. And patching the document in place rather than copying it would leave the
 * second boot of a page — a manifest import — running under the first boot's choice.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun, ConfigStartConditions } from '../generated/types.js';
import {
  conditionById,
  conditionFromSearch,
  configForCondition,
  defaultCondition,
  preRollTicks,
  searchNaming,
} from './start-condition.js';

const config = runConfigDocument as ConfigRun;
const conditions = config.start_conditions;

describe('choosing a start condition (feature 118)', () => {
  it('the shipped document offers the four situations, and defaults to arriving', () => {
    expect(conditions.conditions.map((condition) => condition.id)).toEqual([
      'leaving',
      'arriving',
      'loitering',
      'returning',
    ]);
    expect(conditions.default).toBe('arriving');
    expect(defaultCondition(conditions).label).toBe('Arriving in the work area');
  });

  it('every card says something, and every leg advances or acts', () => {
    for (const condition of conditions.conditions) {
      expect(condition.holds.length, `${condition.id} promises something`).toBeGreaterThan(0);
      expect(condition.legs.length, `${condition.id} has a pre-roll`).toBeGreaterThan(0);
      for (const leg of condition.legs) {
        const acts = leg.ticks > 0 || leg.demand !== undefined || (leg.prompt ?? []).length > 0;
        expect(acts, `${condition.id}: '${leg.note}' does something`).toBe(true);
      }
      expect(preRollTicks(condition)).toBeGreaterThan(0);
    }
  });

  it('a leg may only stop a component the operator plane will stop', () => {
    // A script naming a protected component is refused at the plane, mid-pre-roll, with
    // the page already showing progress. Caught here instead, where it is one line.
    const stoppable = new Set(config.operator.protected);
    for (const condition of conditions.conditions) {
      for (const leg of condition.legs) {
        for (const id of leg.stopped ?? []) {
          expect(stoppable.has(id), `${condition.id} stops '${id}', which is protected`).toBe(false);
        }
      }
    }
  });

  it('a leg may only prompt an event the operator plane offers', () => {
    const offered = new Set(config.operator.events.map((event) => event.id));
    for (const condition of conditions.conditions) {
      for (const leg of condition.legs) {
        for (const event of leg.prompt ?? []) {
          expect(offered.has(event), `${condition.id} prompts '${event}', which is not offered`).toBe(true);
        }
      }
    }
  });

  it('an id nothing answers to resolves to nothing, rather than quietly to the default', () => {
    expect(conditionById(conditions, 'alongside')).toBeUndefined();
    expect(conditionFromSearch(conditions, '?start=alongside')).toBeUndefined();
    expect(conditionFromSearch(conditions, '')).toBeUndefined();
    expect(conditionFromSearch(conditions, '?start=loitering')?.id).toBe('loitering');
  });

  it('refuses a document whose default names no condition, rather than booting nowhere', () => {
    const broken: ConfigStartConditions = { ...conditions, default: 'alongside' };
    expect(() => defaultCondition(broken)).toThrow(/alongside/);
  });

  it('writes the choice into the address, keeping whatever else was there', () => {
    expect(searchNaming('', 'loitering')).toBe('?start=loitering');
    expect(searchNaming('?start=leaving', 'returning')).toBe('?start=returning');
    expect(searchNaming('?theme=dark', 'leaving')).toContain('theme=dark');
    expect(searchNaming('?theme=dark', 'leaving')).toContain('start=leaving');
  });

  it('puts the platform where the condition says, and leaves the document it came from alone', () => {
    const condition = conditionById(conditions, 'leaving');
    if (!condition) throw new Error('the leaving condition has gone');
    const before = JSON.stringify(config.platform.initial);
    const effective = configForCondition(config, condition);
    expect(effective.platform.initial).toEqual({
      latitude: condition.platform.latitude,
      longitude: condition.platform.longitude,
      course_degrees: condition.platform.course_degrees,
      speed_m_per_s: condition.platform.speed_m_per_s,
      depth_m: condition.platform.depth_m,
    });
    // The copy is the point: a second boot must not inherit the first boot's choice.
    expect(JSON.stringify(config.platform.initial)).toBe(before);
    expect(effective.platform.thing).toEqual(config.platform.thing);
  });

  it('starts each condition somewhere different, since that is most of what they are', () => {
    const places = conditions.conditions.map(
      (condition) => `${condition.platform.longitude},${condition.platform.latitude}`,
    );
    expect(new Set(places).size).toBe(places.length);
  });

  it('starts every condition inside the domain the generator authors', () => {
    // A platform outside the generated domain samples an extrapolated ocean, and the
    // card would be describing measurements of nothing in particular.
    const { latitude, longitude } = config.env_generator.domain;
    for (const condition of conditions.conditions) {
      expect(condition.platform.latitude).toBeGreaterThanOrEqual(latitude.minimum);
      expect(condition.platform.latitude).toBeLessThanOrEqual(latitude.maximum);
      expect(condition.platform.longitude).toBeGreaterThanOrEqual(longitude.minimum);
      expect(condition.platform.longitude).toBeLessThanOrEqual(longitude.maximum);
      expect(condition.platform.depth_m).toBeLessThanOrEqual(config.platform.limits.maximum_depth_m);
      expect(condition.platform.speed_m_per_s).toBeLessThanOrEqual(config.platform.limits.maximum_speed_m_per_s);
    }
  });
});
