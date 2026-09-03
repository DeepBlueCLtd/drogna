/**
 * Feature 120: resolving a start condition, and what resolving one does to the
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
  heldBackBySnapshot,
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

describe('choosing a start condition (feature 120)', () => {
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
        const acts =
          leg.ticks > 0 ||
          leg.demand !== undefined ||
          (leg.prompt ?? []).length > 0 ||
          (leg.tune ?? []).length > 0;
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

  it('a leg may only tune a setting the plane offers, within the bound it declares', () => {
    // Refused mid-pre-roll otherwise, with the page already showing progress — and the
    // bound is the plane's, so a leg cannot ask for something a reader could not.
    const offered = new Map(config.operator.tunables.map((tunable) => [tunable.id, tunable]));
    for (const condition of conditions.conditions) {
      for (const leg of condition.legs) {
        for (const wanted of leg.tune ?? []) {
          const tunable = offered.get(wanted.id);
          expect(tunable, `${condition.id} tunes '${wanted.id}', which is not offered`).toBeDefined();
          if (!tunable) continue;
          expect(wanted.value).toBeGreaterThanOrEqual(tunable.minimum);
          expect(wanted.value).toBeLessThanOrEqual(tunable.maximum);
          if (tunable.integer) expect(Number.isInteger(wanted.value)).toBe(true);
        }
      }
    }
  });

  it('puts every setting it tuned back before the console opens', () => {
    // A pre-roll samples on a passage cadence; the console must open on the one the
    // configuration ships. A condition that tuned something and did not put it back
    // would hand the reader a run quietly running under settings nothing declares.
    // `number | undefined` because the platform's reporting interval is optional in its
    // master. The check below refuses an id it has no shipped value for rather than
    // comparing against undefined and passing, which is the way this would go wrong.
    const shipped: Record<string, number | undefined> = {
      'sampling-cadence': config.sensors.sample_interval_ticks,
      'ownship-reporting': config.platform.report_interval_ticks,
    };
    for (const condition of conditions.conditions) {
      const inForce = new Map<string, number>();
      for (const leg of condition.legs) {
        for (const wanted of leg.tune ?? []) inForce.set(wanted.id, wanted.value);
      }
      for (const [id, value] of inForce) {
        expect(shipped[id], `${condition.id} tunes '${id}', which this check does not know`).toBeDefined();
        expect(value, `${condition.id} leaves '${id}' at ${value}, not the configured ${shipped[id]}`).toBe(
          shipped[id],
        );
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

describe('the committed artefacts a condition declares (feature 120, ADR-0041)', () => {
  it('every condition declares its own seed, and no two share one', () => {
    // A snapshot is a function of the seed, so a condition without one could not have an
    // artefact, and two conditions sharing one would be two situations in one ocean.
    const seeds = conditions.conditions.map((condition) => condition.root_seed);
    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0)).toBe(true);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('holds back exactly the components the declared eras name as their authors', () => {
    for (const condition of conditions.conditions) {
      const covered = heldBackBySnapshot(condition, config.snapshot_source);
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
   * The cut point, and the refusal that used to stand here.
   *
   * Until this feature the shipped value was `["archive", "nowcast"]` and a test in this
   * place *refused* the forecast eras, in these words: holding the loop back for a pre-roll
   * restarts the scheduler, whose run sequence resets to zero, so the first live cycle
   * republishes under the artefact's first cycle's holding ids and replaces them. It was
   * right that the declaration was unsafe and wrong about why, and both halves are worth
   * keeping.
   *
   * Wrong about why: `holdingBack` never stops the scheduler. It stops the authors the
   * declared eras name — the analyst and the model runner — and the scheduler runs through
   * the whole pre-roll untouched, so the reset it warned of never happened.
   *
   * Right that it was unsafe, for a worse reason that was measured rather than reasoned.
   * Holding the analyst back means the scheduler's run request reaches *nobody*: the analyst
   * takes a request synchronously and holds no pending state, so the request is not declined,
   * not failed and not remembered, and the outstanding-run guard latched on it. A run backed
   * by the forecast eras did not lose a holding a minute after opening — it opened with a
   * loop that never turned again at all, and the same fault was reachable from the Operator
   * tab with no artefact in sight.
   *
   * Three changes retired it, and each is proven where it lives rather than here:
   * `scheduler.test.ts` holds the watchdog that releases a run nobody is working on (FR-31)
   * and the run identifiers derived from the request tick, which *narrow* an instance's reuse
   * of another's identifier rather than closing it; `env-generator/generator.test.ts` holds
   * the coverage store refusing a second set of bytes under a held holding id, which closes
   * the remainder; and `preroll.test.ts` drives a snapshot-backed pre-roll and holds the run
   * to opening with what a live run produces, to still turning afterwards on the cadence a
   * live run keeps, and to staging what its card promises.
   *
   * What stays here is the declaration itself, so that a future edit narrowing it has to
   * say why.
   */
  it('declares every era the snapshot source knows an author for', () => {
    // Against the master's own enum rather than a list typed in here, and as a set, because
    // the order of `snapshot_eras` carries no meaning — `heldBackBySnapshot` builds a Set and
    // the artefact is sorted by publication tick. A first version compared a four-element
    // literal and failed a pure reordering with the message "declares no eras", which is
    // false of the one edit it would have caught.
    const known = Object.keys(config.snapshot_source.authors).sort();
    for (const condition of conditions.conditions) {
      expect(
        [...(condition.snapshot_eras ?? [])].sort(),
        `'${condition.id}' declares ${(condition.snapshot_eras ?? []).join(', ') || 'no eras'}; narrowing the ` +
          `cut point is an ordinary configuration edit (FR-18) and this test is where the reason for one goes`,
      ).toEqual(known);
    }
  });
});
