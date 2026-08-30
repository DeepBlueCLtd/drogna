/**
 * Feature 105: the forecast loop, end to end. Nothing here is mocked: sensors
 * sample the drifting world, the monitor scores genuine residuals against genuine
 * forecasts, the scheduler decides, the runner publishes through the store's
 * digest-checked seam — and every control message is validated against its master
 * as it passes.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Divergence, RunPublished, RunRequest } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 4242, revision: 'test', dirty: false };

interface LoopRecord {
  divergences: Divergence[];
  requests: RunRequest[];
  published: RunPublished[];
}

function drive(runtime: BackendRuntime, config: ConfigRun, ticks: number): LoopRecord {
  const shell = runtime.transport.connect(`shell-${Math.random()}`, 'shell');
  const record: LoopRecord = { divergences: [], requests: [], published: [] };
  shell.subscribe(config.monitor.topics.divergence, (message) => {
    expect(validator.validate('divergence', message.payload).refusals).toEqual([]);
    record.divergences.push(message.payload as Divergence);
  });
  shell.subscribe(config.scheduler.topics.run_request, (message) => {
    expect(validator.validate('run-request', message.payload).refusals).toEqual([]);
    record.requests.push(message.payload as RunRequest);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    expect(validator.validate('run-published', message.payload).refusals).toEqual([]);
    record.published.push(message.payload as RunPublished);
  });
  for (let i = 0; i < ticks; i++) runtime.clock.tickOnce();
  return record;
}

describe('the forecast loop (feature 105)', { timeout: 120_000 }, () => {
  it('AT-02 descendant: the loop turns end to end — floor-scheduled first, then divergence-triggered, every message master-valid', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // Before the loop turns, quiet is legible in the monitor's own words (FR-32).
    expect(runtime.monitor.quietReason()).toMatch(/no forecast instance to score against/);

    const record = drive(runtime, config, 6000);

    // The cadence floor produced the first run, at exactly the configured interval,
    // labelled by its cause (FR-31: the loop cannot be becalmed).
    expect(record.requests.length).toBeGreaterThanOrEqual(2);
    expect(record.requests[0].cause).toBe('scheduled');
    expect(record.requests[0].tick).toBe(config.scheduler.max_interval_ticks);
    expect(record.requests[0].divergence).toBeNull();

    // Genuine divergence followed: the kernel's noise and wrong advection against
    // the drifting world breach the threshold with sustained persistence, and the
    // divergence-triggered run carries the divergence whole.
    const divergenceRuns = record.requests.filter((request) => request.cause === 'divergence');
    expect(record.divergences.length).toBeGreaterThanOrEqual(1);
    expect(divergenceRuns.length).toBeGreaterThanOrEqual(1);
    expect(divergenceRuns[0].divergence?.divergence_id).toBe(
      record.divergences.find((d) => d.divergence_id === divergenceRuns[0].divergence?.divergence_id)?.divergence_id,
    );
    expect(record.divergences[0].residual.sample_count).toBe(config.monitor.persistence_count);
    expect(record.divergences[0].residual.peak_m_per_s).toBeGreaterThan(config.monitor.threshold_m_per_s);

    // Every request became a published run: forecast and uncertainty together, the
    // digests agreeing with what the store actually holds (FR-13's chain).
    expect(record.published.map((p) => p.run_id)).toEqual(record.requests.map((r) => r.run_id));
    for (const published of record.published) {
      const forecast = runtime.store.holding(published.collections.forecast);
      const uncertainty = runtime.store.holding(published.collections.uncertainty);
      expect(forecast?.descriptor.field.sha256).toBe(published.digests.forecast);
      expect(uncertainty?.descriptor.field.sha256).toBe(published.digests.uncertainty);
      expect(forecast?.descriptor.era).toBe('instance');
    }

    // Instances accumulate as holdings: archive + nowcast + 5 per run — the runner's
    // forecast and uncertainty, and the analyst's analysis, error and provenance
    // (FR-30, as feature 115 amends it). Every one is a holding you can query, which
    // is the whole reason the analysis is a component rather than a private stage.
    expect(runtime.store.holdings().length).toBe(2 + 5 * record.published.length);

    runtime.stop();
  });

  it('declines inside the minimum interval, and the decline is legible (FR-32)', () => {
    // Driven rather than hoped for. This test used to run the whole scenario and trust
    // that the ocean would breach twice inside the minimum interval; feature 115 made
    // it stop doing so, because a loop that assimilates what the platform measures
    // breaches less often — over six thousand ticks the divergence count fell from
    // several to one. That is the feature working, so the test now exercises the
    // requirement directly: two divergences inside the interval, and the second
    // declined. What FR-32 asks about is the scheduler's policy, not the sea's mood.
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const shell = runtime.transport.connect('decline-probe', 'monitor');
    const record = drive(runtime, config, 6000);
    expect(record.divergences.length).toBeGreaterThanOrEqual(1);
    const genuine = record.divergences[0];
    const declinedBefore = runtime.scheduler.declinedByPolicy;
    // A genuine divergence the loop raised, re-published twice on consecutive ticks.
    // Whatever the scheduler's history, the second is inside the minimum interval of
    // the request the first warranted — the decline is forced rather than awaited.
    shell.publish(config.monitor.topics.divergence, { ...genuine, divergence_id: `${genuine.divergence_id}-a` });
    runtime.clock.tickOnce();
    shell.publish(config.monitor.topics.divergence, { ...genuine, divergence_id: `${genuine.divergence_id}-b` });
    runtime.clock.tickOnce();
    expect(runtime.scheduler.declinedByPolicy).toBeGreaterThan(declinedBefore);
    runtime.stop();
  });

  it('serves each instance through EDR by convention, without configuration edits (FR-29)', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const record = drive(runtime, config, 2000);
    expect(record.published.length).toBeGreaterThanOrEqual(1);
    const response = await runtime.httpBackend.handle({ method: 'GET', path: '/api/edr/collections', body: '' });
    const ids = (JSON.parse(response.body) as { collections: { id: string }[] }).collections.map((c) => c.id);
    expect(ids).toContain(record.published[0].collections.forecast);
    expect(ids).toContain(record.published[0].collections.uncertainty);
    runtime.stop();
  });

  it('replays byte-identically: one seed, one loop, twice (AT-04 grows with the loop)', () => {
    const config = lockstepConfig();
    const first = buildBackend(config, options, validator);
    const firstRecord = drive(first, config, 2500);
    const firstDigests = first.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort();
    first.stop();
    const second = buildBackend(config, options, validator);
    const secondRecord = drive(second, config, 2500);
    const secondDigests = second.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort();
    second.stop();
    expect(secondDigests).toEqual(firstDigests);
    expect(JSON.stringify(secondRecord)).toBe(JSON.stringify(firstRecord));
  });
});
