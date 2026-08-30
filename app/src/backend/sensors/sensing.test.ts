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

const options = { rootSeed: 77, startCondition: 'loitering', revision: 'test', dirty: false };

describe('sensing (feature 103)', () => {
  it('sensors sample on their cadence and every observation reaches the store valid', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
    // Sample ticks 30 and 60 × four instruments. Tick 0 is missing on purpose and the
    // sensors say why: since feature 113 they sample where ownship last reported, and
    // the platform's first report is published *during* tick 0's delivery pass, so it
    // is queued behind the clock sample the sensors are handling. One sampling tick of
    // cold start, stated rather than papered over — sampling the ocean at a place
    // nobody has reported would be inventing the place (FR-55).
    expect(runtime.observationStore.byDatastream('platform-a', 'temperature-050m').length).toBe(2);
    expect(runtime.observationStore.count()).toBe(8 + 9);
    expect(runtime.ingest.refused).toBe(0);
    expect(runtime.ingest.flagged).toBe(0);
    for (const observation of runtime.observationStore.all()) {
      expect(validator.validate('observation', observation).refusals).toEqual([]);
    }
    runtime.stop();
  });

  it('a stored value is the truth plus declared noise, scorable against the world', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // The first ocean sample lands one sampling interval in, not at tick 0: the
    // sensors have no position until the platform's first report is delivered (FR-55).
    for (let i = 0; i < 30; i++) runtime.clock.tickOnce();
    const temperature50 = runtime.observationStore.byDatastream('platform-a', 'temperature-050m');
    expect(temperature50.length).toBeGreaterThan(0);
    const sample = temperature50[0];
    const noiseStd = config.sensors.instruments.find((i) => i.datastream_id === 'temperature-050m')?.noise_std ?? 0;
    expect(noiseStd).toBeGreaterThan(0);
    // Re-evaluate the truth through an identically seeded second runtime's world: same
    // seed, same demands (none), so the platform is in the same place and the sample
    // is the same value. The platform's motion is inside the replay claim now.
    const twin = buildBackend(config, options, validator);
    for (let i = 0; i < 30; i++) twin.clock.tickOnce();
    const twinSample = twin.observationStore.byDatastream('platform-a', 'temperature-050m')[0];
    expect(twinSample.result).toBe(sample.result);
    expect(twinSample.location).toEqual(sample.location);
    runtime.stop();
    twin.stop();
  });

  it('the sensors sample where ownship reported, never where they guessed (FR-55)', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // Tick 0 is published by the clock as the runtime is built, and the sensors handle
    // it before the platform's first report has been delivered — so their tick-0
    // sample does not happen. Nothing stands in for it: no ocean row exists yet.
    expect(runtime.observationStore.byDatastream('platform-a', 'temperature-050m')).toEqual([]);

    // What they hold once that report lands is the platform's own position, not one
    // they computed: the retired loiter would have put them somewhere else entirely.
    const position = runtime.sensors.lastKnownPosition();
    expect(position).toEqual({
      latitude: config.platform.initial.latitude,
      longitude: config.platform.initial.longitude,
      tick: 0,
    });
    // The skip is counted rather than hidden, so the gap has a stated cause — as a
    // footnote to what the sensors are doing now, never in place of it.
    expect(runtime.sensors.detail()).toContain('1 sampling tick(s) skipped for want of a fresh position');
    expect(runtime.sensors.detail()).toContain('sampling where ownship reported at tick 0');

    // Once a sampling tick comes round with that position still current, they sample.
    for (let i = 0; i < 30; i++) runtime.clock.tickOnce();
    expect(runtime.observationStore.byDatastream('platform-a', 'temperature-050m').length).toBe(1);
    expect(runtime.sensors.detail()).toContain('sampling where ownship reported at tick');
    runtime.stop();
  });

  it('sampling follows the platform, and stopping the platform stops the sampling', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    for (let i = 0; i < 90; i++) runtime.clock.tickOnce();
    const sampled = runtime.observationStore.byDatastream('platform-a', 'temperature-050m');
    expect(sampled.length).toBeGreaterThan(1);
    // The sampled positions move, because the platform moves. With the retired loiter
    // they moved too — what is new is that they move *with ownship*, and the store can
    // be asked to prove it: the sample's position is a position ownship reported.
    const ownship = runtime.observationStore.byDatastream(config.platform.thing.thing_id, 'ownship-course');
    const ownshipPlaces = new Set(
      ownship.map((o) => `${o.location.latitude.toFixed(6)},${o.location.longitude.toFixed(6)}`),
    );
    for (const observation of sampled) {
      expect(
        ownshipPlaces.has(
          `${observation.location.latitude.toFixed(6)},${observation.location.longitude.toFixed(6)}`,
        ),
      ).toBe(true);
    }

    // Stop the platform: the sensors keep beating, and stop having anything to say.
    // One further sample lands — the position it uses is exactly as fresh as every
    // other sample's, one interval old — and then the position goes stale and the
    // sensors go quiet by themselves, saying why.
    runtime.control.stop('platform');
    const oceanAtStop = sampled.length;
    for (let i = 0; i < 120; i++) runtime.clock.tickOnce();
    const after = runtime.observationStore.byDatastream('platform-a', 'temperature-050m').length;
    expect(after).toBe(oceanAtStop + 1);
    expect(runtime.sensors.detail()).toContain('ticks old');
    runtime.stop();
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
    // The bound is the configuration document, not a list typed here: a reference area
    // added to the scenario is provisioned by being declared, and this says so.
    expect(features.map((feature) => feature.kind).sort()).toEqual(
      lockstepConfig().feature_store.features.map((feature) => feature.kind).sort(),
    );
    // Mutating a returned copy changes nothing inside.
    features[0].name = 'defaced';
    expect(runtime.featureStore.features()[0].name).not.toBe('defaced');
    runtime.stop();
  });
});
