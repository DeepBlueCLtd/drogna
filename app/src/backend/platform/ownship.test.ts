/**
 * An ownship observation is not a sample of the ocean (SRD-v2 FR-56).
 *
 * The platform publishes on the same namespace as the sensors, through the same
 * ingestion seam, into the same store — which is what makes the track a genuine
 * query. It is also the trap: every consumer that reasons about *where the sea has
 * been measured* now hears traffic that measures the platform instead. Counting one
 * would refresh the planner's confidence everywhere the platform went without a
 * single sounding being taken, and would hand the monitor a course to pair with a
 * salinity.
 *
 * Both exclusions are by name, and both assertions below were watched failing with
 * the name removed.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from '../runtime/runtime.js';

const validator = createSeamValidator();
const options = { rootSeed: 91, startCondition: 'loitering', revision: 'test', dirty: false };

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

describe('ownship observations are not soundings (feature 113)', () => {
  it('the planner’s exclusion names the platform’s own datastreams', () => {
    const config = lockstepConfig();
    const declared = config.platform.instruments.map((instrument) => instrument.datastream_id).sort();
    // The names in the planner's document are the platform's own, so a fourth ownship
    // datastream cannot arrive and be quietly treated as a sounding.
    expect([...(config.planner.excluded_datastreams ?? [])].sort()).toEqual(declared);
    // The monitor carries no such list, and should not: `pairs` names the thing and the
    // two datastreams it scores, so an observation it did not ask for informs nothing.
    // A denylist was written here too, planted against, and found unable to fail — the
    // master no longer admits the field, which is this assertion's other half.
    expect('excluded_datastreams' in config.monitor).toBe(false);
    for (const pair of config.monitor.pairs) {
      expect(declared).not.toContain(pair.temperature_datastream);
      expect(declared).not.toContain(pair.salinity_datastream);
      expect(pair.thing_id).not.toBe(config.platform.thing.thing_id);
    }
  });

  it('with only the platform publishing, nothing is scored and nothing is informed', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // Stop the sensors: the ocean goes unmeasured while ownship reports throughout.
    runtime.control.stop('sensors');
    const ownshipBefore = runtime.observationStore.byDatastream(
      config.platform.thing.thing_id,
      'ownship-course',
    ).length;
    const informedBefore = runtime.planner.soundingsInformed;
    const scoredBefore = runtime.monitor.residualCount;

    for (let i = 0; i < 300; i++) runtime.clock.tickOnce();

    // The platform genuinely published all the way through — so the two zeros below
    // are an exclusion working, not a silent harness.
    expect(
      runtime.observationStore.byDatastream(config.platform.thing.thing_id, 'ownship-course').length,
    ).toBeGreaterThan(ownshipBefore);
    expect(runtime.planner.soundingsInformed).toBe(informedBefore);
    expect(runtime.monitor.residualCount).toBe(scoredBefore);
    runtime.stop();
  });

  it('and with the sensors running, soundings do inform — so the zeros above mean something', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    for (let i = 0; i < 300; i++) runtime.clock.tickOnce();
    expect(runtime.planner.soundingsInformed).toBeGreaterThan(0);
    runtime.stop();
  });

  it('ownship rows reach the store through the ordinary seam, master-valid', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
    const rows = runtime.observationStore.byDatastream(config.platform.thing.thing_id, 'ownship-course');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(validator.validate('observation', row).refusals).toEqual([]);
    }
    // Position is the location every observation carries, not a scalar result (FR-54).
    expect(rows[0].location.latitude).toBeCloseTo(config.platform.initial.latitude, 6);
    expect(rows[0].observed_property).toBe('platform_course');
    // Nothing was flagged: the platform cannot exceed the limits the ingest checks it
    // against, because they are the same declared limits it integrates under.
    expect(runtime.ingest.flagged).toBe(0);
    runtime.stop();
  });
});
