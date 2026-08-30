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
import { driveTicks } from '../test-support/drive.js';
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

async function drive(runtime: BackendRuntime, config: ConfigRun, ticks: number): Promise<LoopRecord> {
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
  await driveTicks(runtime.clock, ticks);
  return record;
}

describe('the forecast loop (feature 105)', { timeout: 120_000 }, () => {
  it('AT-02 descendant: the loop turns end to end — floor-scheduled first, then divergence-triggered, every message master-valid', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // Before the loop turns, quiet is legible in the monitor's own words (FR-32).
    expect(runtime.monitor.quietReason()).toMatch(/no forecast instance to score against/);

    const record = await drive(runtime, config, 6000);

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

    // Instances accumulate as holdings: archive + nowcast + 2 per run (FR-30).
    expect(runtime.store.holdings().length).toBe(2 + 2 * record.published.length);

    runtime.stop();
  });

  it('declines inside the minimum interval, and the decline is legible (FR-32)', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    await drive(runtime, config, 6000);
    expect(runtime.scheduler.declinedByPolicy).toBeGreaterThanOrEqual(1);
    runtime.stop();
  });

  it('serves each instance through EDR by convention, without configuration edits (FR-29)', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const record = await drive(runtime, config, 2000);
    expect(record.published.length).toBeGreaterThanOrEqual(1);
    const response = await runtime.httpBackend.handle({ method: 'GET', path: '/api/edr/collections', body: '' });
    const ids = (JSON.parse(response.body) as { collections: { id: string }[] }).collections.map((c) => c.id);
    expect(ids).toContain(record.published[0].collections.forecast);
    expect(ids).toContain(record.published[0].collections.uncertainty);
    runtime.stop();
  });

  it('replays byte-identically: one seed, one loop, twice (AT-04 grows with the loop)', async () => {
    const config = lockstepConfig();
    const first = buildBackend(config, options, validator);
    const firstRecord = await drive(first, config, 2500);
    const firstDigests = first.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort();
    first.stop();
    const second = buildBackend(config, options, validator);
    const secondRecord = await drive(second, config, 2500);
    const secondDigests = second.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort();
    second.stop();
    expect(secondDigests).toEqual(firstDigests);
    expect(JSON.stringify(secondRecord)).toBe(JSON.stringify(firstRecord));
  });
});
