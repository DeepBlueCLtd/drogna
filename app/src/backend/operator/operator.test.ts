/**
 * Feature 107: the operator's view. Telemetry aggregates the monitor's samples and
 * says plainly whether the model earns its compute; the operator surface reports
 * components as they report themselves and dispatches genuine commands — a stopped
 * component's heartbeats genuinely cease, a restarted one genuinely resumes, and
 * every refusal names its rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, OperatorComponents, TelemetryForecastSkill } from '../../generated/types.js';
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

      // Counted per datastream, not in total: since feature 112 the platform is
      // publishing ownship rows into the same store, so a total row count would go on
      // climbing with the sensors stopped and the assertion would pass for the wrong
      // reason. What must freeze is the ocean sampling.
      const oceanRows = () =>
        runtime.observationStore.byDatastream(config.sensors.platform.thing_id, 'temperature-050m').length;
      const ownshipRows = () =>
        runtime.observationStore.byDatastream(config.platform.thing.thing_id, 'ownship-course').length;

      const stop = await get(runtime, `${config.operator.http.command_prefix}/sensors/stop`, 'POST');
      expect(stop.status).toBe(200);
      const observationsAtStop = oceanRows();
      const ownshipAtStop = ownshipRows();
      const heartbeatsAtStop = sensorHeartbeats;
      for (let i = 0; i < 120; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(10_000);
      // Silence, not a claim: no heartbeats, no samples, while the world runs on.
      expect(sensorHeartbeats).toBe(heartbeatsAtStop);
      expect(oceanRows()).toBe(observationsAtStop);
      // And the world genuinely ran on: the platform kept reporting throughout, which
      // is what makes the sensors' silence a fact about the sensors.
      expect(ownshipRows()).toBeGreaterThan(ownshipAtStop);

      const start = await get(runtime, `${config.operator.http.command_prefix}/sensors/start`, 'POST');
      expect(start.status).toBe(200);
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(3000);
      expect(sensorHeartbeats).toBeGreaterThan(heartbeatsAtStop);
      expect(oceanRows()).toBeGreaterThan(observationsAtStop);
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
