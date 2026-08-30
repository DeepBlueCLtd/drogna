/**
 * Feature 105: the forecast loop, end to end. Nothing here is mocked: sensors
 * sample the drifting world, the monitor scores genuine residuals against genuine
 * forecasts, the scheduler decides, the runner publishes through the store's
 * digest-checked seam — and every control message is validated against its master
 * as it passes.
 *
 * The loop's serving and replay scenarios live in loop-serving.test.ts. They are split
 * for a reason recorded in loop.fixture.ts: a file that turns the loop for longer than
 * vitest's RPC window fails the run while every test in it passes.
 */
import { describe, expect, it } from 'vitest';
import type { Divergence } from '../../generated/types.js';
import { SOUND_SPEED } from '../env-generator/analytic.js';
import { buildBackend, drive, lockstepConfig, options, validator } from './loop.fixture.js';

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
    // Driven rather than hoped for, and no longer at the cost of six thousand ticks.
    //
    // This test used to run the whole scenario and trust that the ocean would breach
    // twice inside the minimum interval. Feature 115 made it stop doing so: a loop that
    // assimilates what the platform measured breaches far later — the first divergence
    // of a scenario now arrives at tick 5970 where it used to come early — so the test
    // first grew to harvest a real one, and became the most expensive thing in the file.
    //
    // What FR-32 is about is the scheduler's policy, not the sea's mood. The cadence
    // floor requests a run at max_interval_ticks whatever the water does; a divergence
    // published straight after is inside the minimum interval by construction. The
    // document is built here rather than harvested, and validated against its master
    // before it is published — so if this drifts from what a monitor really raises, the
    // test says so instead of quietly exercising a shape nothing produces.
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const record = drive(runtime, config, config.scheduler.max_interval_ticks + 1);
    expect(record.requests.length).toBeGreaterThanOrEqual(1);
    expect(record.requests[0].cause).toBe('scheduled');
    const declinedBefore = runtime.scheduler.declinedByPolicy;

    const raised: Divergence = {
      component: config.monitor.id,
      scenario_run_id: record.requests[0].scenario_run_id,
      sim_time: record.requests[0].sim_time,
      tick: record.requests[0].tick,
      divergence_id: 'divergence-inside-the-interval',
      forecast_run_id: record.requests[0].run_id,
      region: {
        centre_latitude: 46.1,
        centre_longitude: -11.2,
        radius_m: config.monitor.region.radius_m,
        minimum_depth_m: 0,
        maximum_depth_m: config.monitor.region.depth_pad_m,
      },
      residual: {
        mean_m_per_s: config.monitor.threshold_m_per_s * 2,
        peak_m_per_s: config.monitor.threshold_m_per_s * 3,
        threshold_m_per_s: config.monitor.threshold_m_per_s,
        sample_count: config.monitor.persistence_count,
      },
      persistence: {
        rule: 'temporal',
        sample_count: config.monitor.persistence_count,
        span_seconds: 60,
        first_sim_time: record.requests[0].sim_time,
        last_sim_time: record.requests[0].sim_time,
      },
      sound_speed_equation: SOUND_SPEED.method,
    };
    expect(validator.validate('divergence', raised).refusals).toEqual([]);

    // The decision the scheduler publishes, not a field read off it: what FR-32 asks
    // for is that the quiet be legible, and legible means said on the wire.
    const decisions: { decision: string; detail: string }[] = [];
    const watcher = runtime.transport.connect('decline-watch', 'shell');
    watcher.subscribe(config.scheduler.topics.telemetry, (message) => {
      const payload = message.payload as { kind: string; decision: string; detail: string };
      if (payload.kind === 'scheduler-decision') decisions.push(payload);
    });

    const monitor = runtime.transport.connect('decline-probe', 'monitor');
    monitor.publish(config.monitor.topics.divergence, raised);
    runtime.clock.tickOnce();

    expect(runtime.scheduler.declinedByPolicy).toBeGreaterThan(declinedBefore);
    expect(decisions.map((entry) => entry.decision)).toContain('minimum-interval');
    expect(decisions.find((entry) => entry.decision === 'minimum-interval')?.detail).toContain(
      'inside the minimum interval',
    );
    runtime.stop();
  });
});
