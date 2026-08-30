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
  authorsCoveredBySnapshot,
  conditionById,
  holdingBack,
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

describe('the committed artefacts a condition declares (feature 118, ADR-0040)', () => {
  it('every condition declares its own seed, and no two share one', () => {
    // A snapshot is a function of the seed, so a condition without one could not have an
    // artefact, and two conditions sharing one would be two situations in one ocean.
    const seeds = conditions.conditions.map((condition) => condition.root_seed);
    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0)).toBe(true);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('holds back exactly the components the declared eras name as their authors', () => {
    for (const condition of conditions.conditions) {
      const covered = authorsCoveredBySnapshot(condition, config.snapshot_source);
      const expected = new Set(
        (condition.snapshot_eras ?? []).map((era) => config.snapshot_source.authors[era]),
      );
      expect([...covered].sort()).toEqual([...expected].sort());
      // And holding them back changes the script and nothing else about it.
      const script = holdingBack(condition, covered);
      expect(script.legs.length).toBe(condition.legs.length);
      for (const [index, leg] of script.legs.entries()) {
        expect(leg.ticks).toBe(condition.legs[index].ticks);
        expect(leg.note).toBe(condition.legs[index].note);
        for (const id of covered) expect(leg.stopped).toContain(id);
      }
    }
  });

  /**
   * The cut point, guarded.
   *
   * Which eras are worth committing is meant to be a one-line edit, and for the ocean
   * eras it is. Extending it to the forecast eras is NOT, and the reason is not size: it
   * is that holding the loop back for a pre-roll means restarting the scheduler after
   * one, and a restarted scheduler rebuilds from configuration with its run sequence at
   * zero. Run identifiers are `<run>-run-<sequence>`, and they are the holding ids the
   * analyst and the model runner publish under — so the first live cycle after the
   * console opens would republish under the identifier the artefact's first cycle
   * already used, and the store would replace it. Silently: the digests match, because
   * each holding is internally consistent; the reader would simply find one fewer
   * forecast than the timeline showed a moment earlier.
   *
   * So the edit is made safe rather than left as a trap. Flipping it fails here, with the
   * reason, instead of producing a run that quietly loses holdings a minute after
   * opening. What unblocks it is deriving a run identifier that survives a restart, which
   * is a change to the scheduler and belongs to whichever feature makes it.
   */
  it('refuses to declare the forecast eras until a restarted scheduler stops reusing run ids', () => {
    const authoredByTheLoop = new Set(['analysis', 'instance']);
    for (const condition of conditions.conditions) {
      const declared = (condition.snapshot_eras ?? []).filter((era) => authoredByTheLoop.has(era));
      expect(
        declared,
        `'${condition.id}' declares ${declared.join(' and ')}. Holding the loop back for the ` +
          `pre-roll restarts the scheduler, whose run sequence resets to zero, so the first ` +
          `live cycle republishes under the artefact's first cycle's holding ids and replaces ` +
          `them. Derive a run identifier that survives a restart first.`,
      ).toEqual([]);
    }
  });
});
