/**
 * Feature 107: the operator's view. Telemetry aggregates the monitor's samples and
 * says plainly whether the model earns its compute; the operator surface reports
 * components as they report themselves and dispatches genuine commands — a stopped
 * component's heartbeats genuinely cease, a restarted one genuinely resumes, and
 * every refusal names its rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type {
  ConfigRun,
  OperatorComponents,
  TelemetryForecastSkill,
  TelemetryReport,
  TelemetryResidualSampleReport,
} from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 606, revision: 'test', dirty: false };

async function get(runtime: BackendRuntime, path: string, method = 'GET') {
  const response = await runtime.httpBackend.handle({ method, path, body: '' });
  return { status: response.status, body: JSON.parse(response.body) as never };
}

describe('the operator view (feature 107)', { timeout: 120_000 }, () => {
  describe('telemetry', () => {
    it('aggregates the monitor’s samples into master-valid statistics and a skill sentence', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      // Drive until a statistics cadence lands with a scored ledger: each
      // run-published resets it, so the tick this happens at is the loop's own.
      for (let i = 0; i < 8000 && runtime.telemetry.lastStatistics?.state !== 'reporting'; i++) {
        runtime.clock.tickOnce();
      }
      const statistics = runtime.telemetry.lastStatistics;
      const skill = runtime.telemetry.lastSkill;
      expect(statistics).not.toBeNull();
      expect(skill).not.toBeNull();
      expect(validator.validate('telemetry', statistics).refusals).toEqual([]);
      expect(validator.validate('telemetry', skill).refusals).toEqual([]);
      expect(statistics?.state).toBe('reporting');
      expect(statistics?.count).toBeGreaterThan(0);
      // The sentence is emitted by telemetry, not assembled by a display, and it
      // says plainly which side of persistence the model is on (FR-35).
      expect(['beating-persistence', 'not-beating-persistence', 'insufficient-samples']).toContain(skill?.state);
      expect((skill as TelemetryForecastSkill).statement.length).toBeGreaterThan(10);
      const report = await get(runtime, config.telemetry.http.report_path);
      expect(report.status).toBe(200);
      expect(validator.validate('telemetry-report', report.body).refusals).toEqual([]);
      runtime.stop();
    });

    it('scores each sampled region on its own, and never folds a thin one away (#61)', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      for (let i = 0; i < 8000 && runtime.telemetry.lastRegionStatistics.length === 0; i++) {
        runtime.clock.tickOnce();
      }
      const regions = runtime.telemetry.lastRegionStatistics;
      const scenario = runtime.telemetry.lastStatistics;
      expect(regions.length).toBeGreaterThan(0);
      expect(scenario).not.toBeNull();

      const forecast = runtime.store.holding(scenario?.forecast_run_id ?? '');
      expect(forecast).toBeDefined();
      if (!forecast) return;
      const grid = forecast.descriptor.manifest.grid;
      const { rows, columns, minimum_samples: minimum } = config.telemetry.regions;

      let folded = 0;
      for (const region of regions) {
        // Master-valid on the wire, and scoped to a region rather than the scenario.
        expect(validator.validate('telemetry', region).refusals).toEqual([]);
        expect(region.scope.level).toBe('region');
        expect(region.scope.region_id).toMatch(/^r[0-9]+c[0-9]+$/);
        const bounds = region.scope.bounds;
        expect(bounds).not.toBeNull();
        if (!bounds) continue;
        // The grid is laid over the scored holding's own extent, in cells of the
        // configured size — not over a second copy of the domain.
        expect(bounds.maximum_longitude - bounds.minimum_longitude).toBeCloseTo(
          (grid.longitude.maximum - grid.longitude.minimum) / columns,
          6,
        );
        expect(bounds.maximum_latitude - bounds.minimum_latitude).toBeCloseTo(
          (grid.latitude.maximum - grid.latitude.minimum) / rows,
          6,
        );
        expect(bounds.minimum_longitude).toBeGreaterThanOrEqual(grid.longitude.minimum);
        expect(bounds.maximum_longitude).toBeLessThanOrEqual(grid.longitude.maximum);
        // A region below the configured minimum says so and keeps its own figures.
        expect(region.state).toBe(region.count < minimum ? 'insufficient-samples' : 'reporting');
        expect(region.count).toBeGreaterThan(0);
        folded += region.count;
      }
      // Every region id is distinct, and there are no more of them than the grid
      // holds: the number of scopes is fixed before the run starts.
      expect(new Set(regions.map((region) => region.scope.region_id)).size).toBe(regions.length);
      // Strictly fewer, and that is the point: the platform loiters, so most of the
      // grid is never sampled and those regions are ABSENT rather than published
      // with zeroes — an unsampled region and a region scoring zero are different
      // facts. A build that published every cell would fail here.
      expect(regions.length).toBeLessThan(rows * columns);
      // No residual is counted twice, and none is invented: the regions between them
      // hold no more than the scenario scored.
      expect(folded).toBeLessThanOrEqual(scenario?.count ?? 0);

      // Latency is measured in simulation seconds and is never a zero standing in
      // for an unknown (#61).
      const report = (await get(runtime, config.telemetry.http.report_path)).body as {
        latency: { sample_count: number; mean_sim_seconds: number | null; maximum_sim_seconds: number | null };
        regions: unknown[];
      };
      expect(validator.validate('telemetry-report', report).refusals).toEqual([]);
      expect(report.regions.length).toBe(regions.length);
      expect(report.latency.sample_count).toBeGreaterThan(0);
      expect(report.latency.mean_sim_seconds).not.toBeNull();
      expect(report.latency.mean_sim_seconds ?? -1).toBeGreaterThanOrEqual(0);
      expect(report.latency.maximum_sim_seconds ?? -1).toBeGreaterThanOrEqual(
        report.latency.mean_sim_seconds ?? 0,
      );
      runtime.stop();
    });

    it('says insufficient-samples where a region is thin, and keeps its figures (#61)', async () => {
      // A minimum no region in a short run can reach: every region must then say
      // it is thin and keep its own numbers, rather than reporting as if it were
      // sound or being folded into the scenario figure where nobody could tell.
      const config = lockstepConfig();
      config.telemetry.regions = { ...config.telemetry.regions, minimum_samples: 1_000_000 };
      const runtime = buildBackend(config, options, validator);
      for (let i = 0; i < 8000 && runtime.telemetry.lastRegionStatistics.length === 0; i++) {
        runtime.clock.tickOnce();
      }
      const regions = runtime.telemetry.lastRegionStatistics;
      expect(regions.length).toBeGreaterThan(0);
      for (const region of regions) {
        expect(validator.validate('telemetry', region).refusals).toEqual([]);
        expect(region.state).toBe('insufficient-samples');
        // Thin, and still carrying what it did see: the figures stand.
        expect(region.count).toBeGreaterThan(0);
        expect(region.mean_absolute_m_per_s).not.toBeNull();
        expect(region.root_mean_square_m_per_s).not.toBeNull();
      }
      runtime.stop();
    });

    it('measures latency from the observation instant, in simulation seconds (#61)', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      // Capture a residual-sample report the monitor genuinely published, so what is
      // folded below is the producer's own document rather than an invented shape.
      const watcher = runtime.transport.connect('latency-watch', config.shell.role);
      let captured: TelemetryResidualSampleReport | undefined;
      watcher.subscribe(config.telemetry.topics.telemetry, (message) => {
        const payload = message.payload as { kind?: string };
        if (payload.kind === 'residual-sample') captured ??= payload as TelemetryResidualSampleReport;
      });
      for (let i = 0; i < 8000 && !captured; i++) runtime.clock.tickOnce();
      expect(captured).toBeDefined();
      if (!captured) return;

      const before = (await get(runtime, config.telemetry.http.report_path)).body as TelemetryReport;
      // In this harness the monitor scores within the tick the observation was taken,
      // so the honest figure is zero — a real measurement of a loop with no transport
      // delay in it, not a placeholder.
      expect(before.latency.mean_sim_seconds).toBe(0);

      // Now fold the monitor's own report again with its samples dated an hour
      // earlier in SIMULATION time. The figure must move by exactly that hour.
      const delaySeconds = 3600;
      const shifted: TelemetryResidualSampleReport = {
        ...captured,
        samples: captured.samples.map((sample) => ({
          ...sample,
          sim_time: `${new Date(Date.parse(sample.sim_time.slice(0, 23) + 'Z') - delaySeconds * 1000)
            .toISOString()
            .slice(0, 23)}000Z`,
        })),
      };
      expect(validator.validate('telemetry', shifted).refusals).toEqual([]);
      const monitor = runtime.transport.connect('latency-probe', 'monitor');
      monitor.publish(config.telemetry.topics.telemetry, shifted);

      const after = (await get(runtime, config.telemetry.http.report_path)).body as TelemetryReport;
      expect(validator.validate('telemetry-report', after).refusals).toEqual([]);
      expect(after.latency.sample_count).toBe(before.latency.sample_count + shifted.samples.length);
      expect(after.latency.maximum_sim_seconds).toBe(delaySeconds);
      // The mean is the delayed samples' hour spread over every fold so far, which
      // is arithmetic a reader can check rather than a number to be trusted.
      expect(after.latency.mean_sim_seconds).toBeCloseTo(
        (delaySeconds * shifted.samples.length) / after.latency.sample_count,
        6,
      );
      runtime.stop();
    });
  });

  describe('the operator surface', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reports unheard as unheard, never absent (FR-36)', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const response = await get(runtime, config.operator.http.components_path);
      expect(response.status).toBe(200);
      expect(validator.validate('operator-components', response.body).refusals).toEqual([]);
      runtime.stop();
    });

    it('a stopped component genuinely goes silent, and a restart genuinely resumes it', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('shell', 'shell');
      let sensorHeartbeats = 0;
      shell.subscribe(config.shell.topics.heartbeat, (message) => {
        if ((message.payload as { component: string }).component === 'sensors') sensorHeartbeats += 1;
      });

      const stop = await get(runtime, `${config.operator.http.command_prefix}/sensors/stop`, 'POST');
      expect(stop.status).toBe(200);
      const observationsAtStop = runtime.observationStore.count();
      const heartbeatsAtStop = sensorHeartbeats;
      for (let i = 0; i < 120; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(10_000);
      // Silence, not a claim: no heartbeats, no samples, while the world runs on.
      expect(sensorHeartbeats).toBe(heartbeatsAtStop);
      expect(runtime.observationStore.count()).toBe(observationsAtStop);

      const start = await get(runtime, `${config.operator.http.command_prefix}/sensors/start`, 'POST');
      expect(start.status).toBe(200);
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(3000);
      expect(sensorHeartbeats).toBeGreaterThan(heartbeatsAtStop);
      expect(runtime.observationStore.count()).toBeGreaterThan(observationsAtStop);
      runtime.stop();
    });

    it('refuses commands with the rule named: protected, unknown, wrong state', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const clock = await get(runtime, `${config.operator.http.command_prefix}/clock/stop`, 'POST');
      expect(clock.status).toBe(403);
      expect((clock.body as { refused: string }).refused).toMatch(/protected from the operator plane by rule/);
      const unknown = await get(runtime, `${config.operator.http.command_prefix}/mystery/stop`, 'POST');
      expect(unknown.status).toBe(404);
      expect((unknown.body as { refused: string }).refused).toMatch(/no controllable component named 'mystery'/);
      const alreadyRunning = await get(runtime, `${config.operator.http.command_prefix}/sensors/start`, 'POST');
      expect(alreadyRunning.status).toBe(409);
      expect((alreadyRunning.body as { refused: string }).refused).toMatch(/already running/);
      runtime.stop();
    });

    it('the step command advances exactly one tick through the seam', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const before = runtime.clock.currentTick();
      const step = await get(runtime, config.operator.http.step_path, 'POST');
      expect(step.status).toBe(200);
      expect(runtime.clock.currentTick()).toBe(before + 1);
      runtime.stop();
    });

    it('the components report validates and the shell sees the stopped state', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      await get(runtime, `${config.operator.http.command_prefix}/planner/stop`, 'POST');
      const response = await get(runtime, config.operator.http.components_path);
      const report = response.body as OperatorComponents;
      const planner = report.components.find((component) => component.id === 'planner');
      expect(planner?.running).toBe(false);
      expect(planner?.stoppable).toBe(true);
      const clockRow = report.components.find((component) => component.id === 'clock');
      expect(clockRow?.stoppable).toBe(false);
      runtime.stop();
    });
  });
});
