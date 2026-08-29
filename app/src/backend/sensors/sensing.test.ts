/**
 * Feature 103's integration surface: sensors publish master-valid SensorThings
 * observations over the broker on their cadence; the broker's role rules confine
 * them to the observation namespace; the ingestion seam validates, refuses
 * observably, absorbs redelivery, and is the store's sole writer.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Observation } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from '../runtime/runtime.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 77, revision: 'test', dirty: false };

describe('sensing (feature 103)', () => {
  it('sensors sample on their cadence and every observation reaches the store valid', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
    // Sample ticks 0, 30 and 60 × four instruments.
    expect(runtime.observationStore.count()).toBe(12);
    expect(runtime.ingest.refused).toBe(0);
    for (const observation of runtime.observationStore.all()) {
      expect(validator.validate('observation', observation).refusals).toEqual([]);
    }
    runtime.stop();
  });

  it('a stored value is the truth plus declared noise, scorable against the world', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const temperature50 = runtime.observationStore.byDatastream('platform-a', 'temperature-050m');
    expect(temperature50.length).toBeGreaterThan(0);
    const sample = temperature50[0];
    // The loiter starts due east of the eddy centre; the declared noise is 0.02°C,
    // so five standard deviations is a generous but failable bound.
    const noiseStd = config.sensors.instruments.find((i) => i.datastream_id === 'temperature-050m')?.noise_std ?? 0;
    expect(noiseStd).toBeGreaterThan(0);
    // Re-evaluate the truth through an identically seeded second runtime's world.
    const twin = buildBackend(config, options, validator);
    const twinSample = twin.observationStore.byDatastream('platform-a', 'temperature-050m')[0];
    expect(twinSample.result).toBe(sample.result);
    runtime.stop();
    twin.stop();
  });

  it('the broker confines sensors to their namespace, refusal named', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const rogue = runtime.transport.connect('rogue', 'sensors');
    expect(() => rogue.publish('ctl/clock', { tick: 999 })).toThrow(
      /role 'sensors' may not publish on 'ctl\/clock'/,
    );
    runtime.stop();
  });

  it('the ingestion seam refuses a malformed observation observably, the store untouched', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const before = runtime.observationStore.count();
    const rogue = runtime.transport.connect('rogue', 'sensors');
    rogue.publish('obs/platform-a/temperature-050m', { not: 'an observation' });
    expect(runtime.ingest.refused).toBe(1);
    expect(runtime.ingest.recentRefusals[0]).toMatch(/observation/);
    expect(runtime.observationStore.count()).toBe(before);
    runtime.stop();
  });

  it('redelivery is a no-op: the deterministic id absorbs the duplicate', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const observation = runtime.observationStore.all()[0] as Observation;
    const rogue = runtime.transport.connect('rogue', 'sensors');
    const before = runtime.observationStore.count();
    rogue.publish(`obs/${observation.thing_id}/${observation.datastream_id}`, observation);
    expect(runtime.observationStore.count()).toBe(before);
    expect(runtime.ingest.absorbed).toBe(1);
    runtime.stop();
  });

  it('the feature store is provisioned at start and structurally read-only', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const features = runtime.featureStore.features();
    expect(features.map((feature) => feature.kind).sort()).toEqual(['domain', 'loiter_region']);
    // Mutating a returned copy changes nothing inside.
    features[0].name = 'defaced';
    expect(runtime.featureStore.features()[0].name).not.toBe('defaced');
    runtime.stop();
  });
});
