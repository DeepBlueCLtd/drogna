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
  Advisory,
  ConfigRun,
  Heartbeat,
  OperatorComponents,
  OperatorControls,
  RunRequest,
  TelemetrySchedulerDecision,
  TelemetryForecastSkill,
  TelemetryReport,
  TelemetryResidualSampleReport,
} from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';
import { driveTicks, driveUntil } from '../test-support/drive.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 606, startCondition: 'loitering', revision: 'test', dirty: false };

async function get(runtime: BackendRuntime, path: string, method = 'GET') {
  const response = await runtime.httpBackend.handle({ method, path, body: '' });
  return { status: response.status, body: JSON.parse(response.body) as never };
}

describe('the operator view (feature 107)', { timeout: 120_000 }, () => {
  describe('telemetry', () => {
    /**
     * Restarting the model runner is an ordinary operator verb, and from feature 125 it
     * republishes the standing run so that components which were not listening when the run
     * was published can still learn of it (`backend/lib/standing-run.ts`). Two consumers
     * treated that restatement as news, and both were watched doing it:
     *
     *  - telemetry closed the ledger on **any** current publication, so a restart discarded
     *    58 scored samples and left the surface reporting "0 scored sample(s)" while the
     *    monitor went on publishing residuals into it — silence shown where there is traffic;
     *  - the offload packager staged on every announcement, so one run produced two bundles
     *    and twice the staged bytes, with the next genuine bundle's measurement geometry
     *    covering a truncated interval. Four such restarts pass `staging_bound_bytes`, after
     *    which production stops for good, nothing being evictable in V2.
     */
    it('restating the standing run neither closes the skill ledger nor stages a second bundle', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      await driveUntil(runtime.clock, () => runtime.telemetry.lastStatistics?.state === 'reporting', 8000);
      const scoredBefore = runtime.telemetry.lastStatistics?.count ?? 0;
      const runBefore = runtime.telemetry.lastStatistics?.forecast_run_id;
      const bundlesBefore = runtime.offload.staged().length;
      const bytesBefore = runtime.offload.staged().reduce((sum, bundle) => sum + bundle.fieldByteLength, 0);
      expect(scoredBefore, 'nothing was scored, so there is no ledger to lose').toBeGreaterThan(0);

      const statementBefore = runtime.telemetry.lastStatistics;
      runtime.control.stop(config.model_runner.id);
      runtime.control.start(config.model_runner.id);
      await driveTicks(runtime.clock, 20);

      // The staging check belongs here and not after the sweep below: `min_interval_ticks` is
      // 600, so nothing legitimate can have released a run twenty ticks after the restart —
      // whereas over the sweep's 4,000 ticks a genuine run publishes and stages a bundle it
      // is entitled to. Asserting this at the end passed the fault and failed the clean tree.
      expect(runtime.offload.staged().length, 'a second bundle was staged for one run').toBe(bundlesBefore);
      expect(
        runtime.offload.staged().reduce((sum, bundle) => sum + bundle.fieldByteLength, 0),
        'the staging bound was consumed by a restatement',
      ).toBe(bytesBefore);

      // **Monotonic while the run is the same run**, which is the fault's exact shape. A
      // discarded ledger re-warms, so "the count is above where it was" passes on the fault
      // given enough ticks — the first draft of this assertion did exactly that. A genuinely
      // new run *should* reset the ledger, so the comparison only runs across statements that
      // name the same forecast.
      let previous = statementBefore;
      const drops: string[] = [];
      for (let i = 0; i < 4000 && drops.length === 0; i += 1) {
        runtime.clock.tickOnce();
        const now = runtime.telemetry.lastStatistics;
        if (now === previous || !now) continue;
        if (
          previous &&
          now.forecast_run_id === previous.forecast_run_id &&
          // `count` alone is too coarse: statistics publish on a cadence, and a ledger that
          // was discarded re-warms past its old count before the next statement is sent, so
          // the fault passed. `first_sim_time` is where the discard shows — it is the instant
          // of the earliest sample still held, and a reset moves it forward.
          (now.first_sim_time !== previous.first_sim_time || now.count < previous.count)
        ) {
          drops.push(
            `${previous.forecast_run_id}: ${previous.count} scored from ${previous.first_sim_time}, ` +
              `then ${now.count} from ${now.first_sim_time}`,
          );
        }
        previous = now;
      }
      expect(
        drops,
        'the ledger was discarded for a run it was already scoring: the restatement was read as a new run',
      ).toEqual([]);
      expect(previous, 'no statistics were published after the restart').not.toBe(statementBefore);

      // And it is scored against the run that was standing, named as the model run and not as
      // the scenario — telemetry keys its ledger by this and looks the holding up by it, so
      // the scenario id would silently match nothing for the rest of the visit.
      expect(runtime.store.holding(String(previous?.forecast_run_id)), 'the scored run names no holding').toBeDefined();
      expect(scoredBefore, 'nothing was scored before the restart').toBeGreaterThan(0);
      expect(runBefore, 'no run was named before the restart').toBeTruthy();
      runtime.stop();
    });

    it('aggregates the monitor’s samples into master-valid statistics and a skill sentence', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      // Drive until a statistics cadence lands with a scored ledger: each
      // run-published resets it, so the tick this happens at is the loop's own.
      await driveUntil(runtime.clock, () => runtime.telemetry.lastStatistics?.state === 'reporting', 8000);
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
      await driveUntil(runtime.clock, () => runtime.telemetry.lastRegionStatistics.length > 0, 8000);
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
      await driveUntil(runtime.clock, () => runtime.telemetry.lastRegionStatistics.length > 0, 8000);
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
      await driveUntil(runtime.clock, () => captured !== undefined, 8000);
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

      // Counted per datastream, not in total: since feature 113 the platform is
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

  /**
   * Feature 114: the plane a reader can drive. Every assertion below is about what a
   * COMPONENT did with a command, not about what the surface said it dispatched — the
   * surface's own answer is never evidence that anything happened (Constitution VII),
   * and a test that read it as evidence would pass against a surface wired to nothing.
   */
  describe('the operator plane a reader drives (feature 114)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** The last heartbeat a component genuinely published: where a value in force is read. */
    function watchHeartbeats(runtime: BackendRuntime, config: ConfigRun): Map<string, Heartbeat> {
      const heard = new Map<string, Heartbeat>();
      const shell = runtime.transport.connect(`hb-${Math.random()}`, config.shell.role);
      shell.subscribe(config.shell.topics.heartbeat, (message) => {
        const heartbeat = message.payload as Heartbeat;
        heard.set(heartbeat.component, heartbeat);
      });
      return heard;
    }

    function figureOf(heard: Map<string, Heartbeat>, component: string, key: string): number | undefined {
      return heard.get(component)?.figures?.find((figure) => figure.key === key)?.value;
    }

    async function post(runtime: BackendRuntime, path: string, body?: unknown) {
      const response = await runtime.httpBackend.handle({
        method: 'POST',
        path,
        body: body === undefined ? '' : JSON.stringify(body),
      });
      return { status: response.status, body: JSON.parse(response.body) as Record<string, unknown> };
    }

    it('states what it offers, and offers only what its configuration declares', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const response = await get(runtime, config.operator.http.controls_path);
      expect(response.status).toBe(200);
      expect(validator.validate('operator-controls', response.body).refusals).toEqual([]);
      const controls = response.body as OperatorControls;
      expect(controls.step.maximum_ticks).toBe(config.operator.step.maximum_ticks);
      expect(controls.demand.target).toBe(config.operator.demand.target);
      expect(controls.tunables).toEqual(config.operator.tunables);
      expect(controls.events).toEqual(config.operator.events);
      // Nothing in the statement names a component the picture does not draw: a
      // control on a node that does not exist is a control nobody can reach.
      const drawn = new Set(config.shell.components.map((component) => component.id));
      for (const target of [
        controls.demand.target,
        ...controls.tunables.map((tunable) => tunable.target),
        ...controls.events.map((event) => event.target),
      ]) {
        expect(drawn.has(target)).toBe(true);
      }
      // And every event offered is one some component declares it answers to. Two
      // sides naming the same event, as two components name the same topic — read
      // out of the configuration document rather than listed here, so an event
      // offered to nobody fails this however many there come to be.
      //
      // *Which key* declares an answer is read out too. This test used to name
      // `prompt_event` and `fault_event`, which made it a list after all: the first
      // component to declare its answer under a third name would have been reported as
      // waiting for a prompt nobody offers. The convention the masters hold is the
      // suffix, so that is what is read — and the run that introduced sample_event,
      // report_event, announce_event, skill_event and statistics_event is the run that
      // found it, which is the only reason this paragraph can be trusted.
      const answered = new Set(
        Object.values(config as unknown as Record<string, Record<string, unknown>>)
          .filter((component) => typeof component === 'object' && component !== null)
          .flatMap((component) =>
            Object.entries(component)
              .filter(([key]) => key.endsWith('_event'))
              .map(([, event]) => event),
          )
          .filter((event): event is string => typeof event === 'string'),
      );
      expect(answered.size).toBeGreaterThan(0);
      for (const event of controls.events) expect(answered.has(event.id), event.id).toBe(true);
      // And the other way: a component that declares it answers to an event nobody
      // offers is a component waiting for a prompt that can never arrive.
      const offered = new Set(controls.events.map((event) => event.id));
      for (const event of answered) expect(offered.has(event), event).toBe(true);
      runtime.stop();
    });

    it('a tuning changes what the monitor genuinely scores against, and it says so', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'monitor', 'threshold')).toBe(config.monitor.threshold_m_per_s);

      const tuned = 0.4;
      const answer = await post(runtime, config.operator.http.tuning_path, {
        target: 'monitor',
        setting: 'threshold_m_per_s',
        value: tuned,
      });
      expect(answer.status).toBe(200);
      // The surface dispatched; the monitor decides. What is asserted is the
      // monitor's own next heartbeat.
      expect(answer.body.applied).toBe(false);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'monitor', 'threshold')).toBe(tuned);
      expect(runtime.monitor.quietReason()).toMatch(/tuned from the operator plane/);

      // And the number it scores against moved with it: the breach block on the
      // monitor's own residual reports carries the value in force, so a display
      // drawing the threshold draws the one the streak is filling against.
      const shell = runtime.transport.connect('residual-watch', config.shell.role);
      let breachThreshold: number | undefined;
      shell.subscribe(config.telemetry.topics.telemetry, (message) => {
        const payload = message.payload as { kind?: string; breach?: { threshold_m_per_s: number } };
        if (payload.kind === 'residual-sample') breachThreshold ??= payload.breach?.threshold_m_per_s;
      });
      // The monitor scores against a forecast, and the first one is otherwise 1800
      // ticks away at the cadence floor. Asking for it is what this feature is for,
      // and it turns thousands of synchronous ticks into tens — which matters: the
      // ticks are a tight loop that blocks the worker's event loop while it runs,
      // and CI failed on a task-update timeout with every assertion passing.
      await post(runtime, `${config.operator.http.event_prefix}/${config.scheduler.prompt_event}`);
      for (let i = 0; i < 400 && breachThreshold === undefined; i++) runtime.clock.tickOnce();
      expect(breachThreshold).toBe(tuned);
      runtime.stop();
    });

    it('a tuning does not survive a restart, which is what the panel says of it', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      await post(runtime, config.operator.http.tuning_path, {
        target: 'monitor',
        setting: 'threshold_m_per_s',
        value: 3.5,
      });
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'monitor', 'threshold')).toBe(3.5);

      const restart = await get(runtime, `${config.operator.http.command_prefix}/monitor/restart`, 'POST');
      expect(restart.status).toBe(200);
      vi.advanceTimersByTime(2500);
      // Rebuilt from the configuration document by the same factory that built the
      // first one, and reporting what that document says.
      expect(figureOf(heard, 'monitor', 'threshold')).toBe(config.monitor.threshold_m_per_s);
      runtime.stop();
    });

    it('refuses a tuning by naming the bound, the count or the setting — and changes nothing', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      vi.advanceTimersByTime(2500);

      const beyond = await post(runtime, config.operator.http.tuning_path, {
        target: 'monitor',
        setting: 'threshold_m_per_s',
        value: 99,
      });
      expect(beyond.status).toBe(400);
      expect(beyond.body.refused).toMatch(/outside the declared bound for drift threshold \(0.2 to 6\)/);

      const fractional = await post(runtime, config.operator.http.tuning_path, {
        target: 'monitor',
        setting: 'persistence_count',
        value: 2.5,
      });
      expect(fractional.status).toBe(400);
      expect(fractional.body.refused).toMatch(/counts samples/);

      const unknown = await post(runtime, config.operator.http.tuning_path, {
        target: 'monitor',
        setting: 'mystery',
        value: 1,
      });
      expect(unknown.status).toBe(404);
      expect(unknown.body.refused).toMatch(/nothing tunable named 'mystery' on 'monitor'/);
      expect(unknown.body.refused).toMatch(/monitor\/threshold_m_per_s/);

      vi.advanceTimersByTime(2500);
      // A refused command is a command that did not happen: the monitor is still
      // reporting the values it was built with.
      expect(figureOf(heard, 'monitor', 'threshold')).toBe(config.monitor.threshold_m_per_s);
      expect(figureOf(heard, 'monitor', 'persistence')).toBe(config.monitor.persistence_count);
      runtime.stop();
    });

    it('a prompted run is the scheduler’s decision, and its decline is published like any other', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('prompt-watch', config.shell.role);
      const requests: RunRequest[] = [];
      const decisions: TelemetrySchedulerDecision[] = [];
      shell.subscribe(config.scheduler.topics.run_request, (message) => {
        requests.push(message.payload as RunRequest);
      });
      shell.subscribe(config.telemetry.topics.telemetry, (message) => {
        const payload = message.payload as { kind?: string };
        if (payload.kind === 'scheduler-decision') decisions.push(payload as TelemetrySchedulerDecision);
      });

      // The runner is stopped first, so the run this prompt starts stays outstanding
      // and the second prompt meets the rule about duplicates rather than the rule
      // about intervals. In this harness a run completes within the tick it is
      // requested in, so without this the two declines could not be told apart.
      await get(runtime, `${config.operator.http.command_prefix}/model-runner/stop`, 'POST');
      const prompt = `${config.operator.http.event_prefix}/${config.scheduler.prompt_event}`;
      const first = await post(runtime, prompt);
      expect(first.status).toBe(200);
      // Nothing about the loop has been claimed by the surface: it published a prompt.
      expect(first.body.applied).toBe(false);
      expect(requests.length).toBe(1);
      expect(requests[0].cause).toBe('operator');
      expect(requests[0].divergence).toBeNull();
      expect(validator.validate('run-request', requests[0]).refusals).toEqual([]);
      expect(decisions[0].decision).toBe('accepted');
      // A prompt has no divergence, and the record says null rather than naming one.
      expect(decisions[0].divergence_id).toBeNull();
      expect(validator.validate('telemetry', decisions[0]).refusals).toEqual([]);

      // Asked again while that run is outstanding, the scheduler declines — and the
      // decline is a published decision, not a silent nothing.
      const second = await post(runtime, prompt);
      expect(second.status).toBe(200);
      expect(requests.length).toBe(1);
      expect(decisions[1].decision).toBe('duplicate-outstanding');
      expect(decisions[1].detail).toMatch(/operator prompt/);
      expect(validator.validate('telemetry', decisions[1]).refusals).toEqual([]);
      runtime.stop();
    });

    it('declines a prompt inside the minimum interval, and holds it for cost once that is tuned away', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('interval-watch', config.shell.role);
      const requests: RunRequest[] = [];
      const decisions: TelemetrySchedulerDecision[] = [];
      shell.subscribe(config.scheduler.topics.run_request, (message) =>
        requests.push(message.payload as RunRequest),
      );
      shell.subscribe(config.telemetry.topics.telemetry, (message) => {
        const payload = message.payload as { kind?: string };
        if (payload.kind === 'scheduler-decision') decisions.push(payload as TelemetrySchedulerDecision);
      });
      const prompt = `${config.operator.http.event_prefix}/${config.scheduler.prompt_event}`;
      await post(runtime, prompt);
      // The first prompt is accepted: nothing has run, so there is no standing forecast
      // whose remaining life could be worth waiting out.
      expect(requests.length).toBe(1);
      expect(requests[0].cause).toBe('operator');
      expect(decisions.at(-1)?.decision).toBe('accepted');

      // Let the requested run be published, so what answers the next prompt is a rule
      // rather than an outstanding run. A run now occupies the ticks it costs, so this
      // waits for the publication as well as for the elapsed ticks the tuning below is
      // about (T045).
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      for (let i = 0; i < 400 && runtime.store.currentInstance() === undefined; i++) runtime.clock.tickOnce();
      expect(runtime.store.currentInstance()).toBeDefined();
      await post(runtime, prompt);
      expect(requests.length).toBe(1);
      expect(decisions.at(-1)?.decision).toBe('minimum-interval');

      // Now shorten the interval below what has already elapsed, and ask again. The rule
      // did not change; the number it is applied to did, and the scheduler is the thing
      // that applied it — so the minimum interval stops being the answer.
      //
      // What answers instead is feature 123's second dimension: the run is *held for
      // cost*. There is a standing forecast with most of its validity still to run, so
      // there is no need to spend the compute yet, and the hold releases as that headroom
      // decays to the run's cost plus the declared margin (FR-115, ADR-0043). A prompt
      // being held is not an oversight — FR-116 has the reader committing a run against
      // the stated cost, and the hold is the surface saying what that cost buys and when.
      await post(runtime, config.operator.http.tuning_path, {
        target: 'scheduler',
        setting: 'min_interval_ticks',
        value: 30,
      });
      await post(runtime, prompt);
      expect(requests.length).toBe(1);
      const held = decisions.at(-1);
      expect(held?.decision).toBe('held-for-cost');
      // The shortfall is named in the units the hold is measured in, so a reader need not
      // subtract two instants to learn how long. Held against the runner's own declared
      // cost, never a figure this test typed.
      expect(held?.shortfall_ticks ?? 0).toBeGreaterThan(0);
      expect(held?.detail).toMatch(/held for cost/);
      runtime.stop();
    });

    it('a prompted advisory is the next one in the sequence, authored now', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('advisory-watch', config.shell.role);
      const advisories: Advisory[] = [];
      shell.subscribe(config.shell.topics.advisories, (message) =>
        advisories.push(message.payload as Advisory),
      );
      // There is no "before time exists" case to test here, and the reason is worth
      // recording: the runtime publishes the clock's first sample while it is being
      // built, so by the time any command can be dispatched every component has heard
      // an instant. The source still guards against the empty one — a component
      // assembled differently in V3 could be prompted before the clock speaks, and an
      // advisory dated at nothing would be a record of a moment that never happened.
      //
      // A handful of ticks, far short of the cadence: nothing is due.
      for (let i = 0; i < 5; i++) runtime.clock.tickOnce();
      expect(advisories.length).toBe(0);

      const answer = await post(
        runtime,
        `${config.operator.http.event_prefix}/${config.advisory_source.prompt_event}`,
      );
      expect(answer.status).toBe(200);
      expect(advisories.length).toBe(1);
      expect(advisories[0].sequence).toBe(0);
      expect(validator.validate('advisory', advisories[0]).refusals).toEqual([]);
      // The store took it through its own seam, as it does an advisory on cadence.
      expect(runtime.advisoryStore.all().length).toBe(1);
      runtime.stop();
    });

    it('refuses an event nobody offers, naming what is offered', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const answer = await post(runtime, `${config.operator.http.event_prefix}/make-it-so`);
      expect(answer.status).toBe(404);
      expect(answer.body.refused).toMatch(/'make-it-so' is not an event this plane offers/);
      // Every event it does offer, named in the refusal: a refusal that says only
      // 'no' leaves a reader guessing what would have worked.
      for (const event of config.operator.events) {
        expect(answer.body.refused).toContain(event.id);
      }
      runtime.stop();
    });

    it('a prompted now-cast publishes a holding, and the cadence restarts from there', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('nowcast-watch', config.shell.role);
      const announced: { holding_id: string }[] = [];
      shell.subscribe(config.shell.topics.holdings, (message) => {
        // The announcement is flat and light on purpose: it says what became
        // visible, not how big it is (holding-published.schema.json).
        announced.push(message.payload as { holding_id: string });
      });
      // A handful of ticks, far short of the now-cast cadence: nothing is due.
      for (let i = 0; i < 5; i++) runtime.clock.tickOnce();
      expect(announced.length).toBe(0);

      const answer = await post(
        runtime,
        `${config.operator.http.event_prefix}/${config.env_generator.prompt_event}`,
      );
      expect(answer.status).toBe(200);
      // A genuine holding, in the store, through the store's own publication seam.
      expect(announced.length).toBe(1);
      const held = runtime.store.holding(announced[0].holding_id);
      expect(held).toBeDefined();
      expect(validator.validate('coverage-holding', held?.descriptor).refusals).toEqual([]);

      // And the countdown restarted: a cadence that carried on regardless would tell a
      // reader a now-cast was due when one had just been published.
      const heard = watchHeartbeats(runtime, config);
      vi.advanceTimersByTime(2500);
      const toNext = figureOf(heard, 'env-generator', 'ticks_to_nowcast');
      expect(toNext).toBe(config.env_generator.nowcast.interval_ticks);
      expect(figureOf(heard, 'env-generator', 'prompted')).toBe(1);
      runtime.stop();
    });

    it('a prompted replan recomputes now, and says so when it has no field to plan from', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('plan-watch', config.shell.role);
      const plans: unknown[] = [];
      shell.subscribe(config.shell.topics.plan, (message) => plans.push(message.payload));
      const prompt = `${config.operator.http.event_prefix}/${config.planner.prompt_event}`;

      // Before the first clock sample there is no simulation instant to date a plan
      // at, and before any forecast there is no uncertainty field to compute one
      // from. Asked in both states, the planner publishes nothing rather than a
      // hollow plan — and SAYS which state it is in, in its own heartbeat.
      //
      // "Nothing was published" is not enough on its own here: a handler that threw
      // would satisfy it too, and the broker would swallow the throw. Planting
      // against the guards is what showed that, so the assertion is the planner's own
      // account of itself, which an exception cannot produce.
      const heard = watchHeartbeats(runtime, config);
      await post(runtime, prompt);
      expect(plans.length).toBe(0);
      runtime.clock.tickOnce();
      await post(runtime, prompt);
      expect(plans.length).toBe(0);
      vi.advanceTimersByTime(2500);
      expect(heard.get('planner')?.detail).toMatch(/state no-field/);
      // And it declined rather than fell over: a handler that threw would publish
      // nothing too, and the broker would swallow it.
      expect(runtime.broker.deliveryFaults).toBe(0);

      // Ask for a forecast rather than waiting out the cadence floor for one — 1800
      // ticks of tight synchronous loop, four times over in this file, which is what
      // tipped CI into a worker task-update timeout with every assertion passing.
      // The prompt this feature adds gets there in one call.
      await post(runtime, `${config.operator.http.event_prefix}/${config.scheduler.prompt_event}`);
      expect(runtime.store.holdings().length).toBeGreaterThan(2);
      // A field is not enough on its own: the planner also plans from where the
      // platform is, and the platform reports on its own interval. Enough ticks for
      // one report, and no more — the interval between replans is 600, so what makes
      // a plan appear here is still the ask and not the clock.
      for (let i = 0; i < 35; i++) runtime.clock.tickOnce();
      expect(plans.length).toBe(0);
      await post(runtime, prompt);
      expect(plans.length).toBe(1);
      expect(validator.validate('plan', plans[0]).refusals).toEqual([]);
      runtime.stop();
    });

    it('a prompted offload stages a window, and is declined by the rules it already had', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const prompt = `${config.operator.http.event_prefix}/${config.offload.prompt_event}`;

      // Nothing released yet: the packager says so rather than staging an empty
      // bundle over a release that does not exist.
      await post(runtime, prompt);
      expect(runtime.offload.staged().length).toBe(0);
      expect(runtime.offload.declined.at(-1)).toMatch(/nothing has been released yet/);

      // Let some measurements happen, then ask for a forecast — which is what the
      // packager stages over — rather than waiting out the cadence floor for one.
      // Measurements first, because a bundle nobody can score is not staged, and at
      // tick zero there is nothing in the interval to score it against.
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      await post(runtime, `${config.operator.http.event_prefix}/${config.scheduler.prompt_event}`);
      // The run occupies the ticks it costs before it publishes, and the packager stages
      // over a *published* forecast — so this waits for the publication rather than
      // assuming the run was instant (T045).
      for (let i = 0; i < 400 && runtime.store.currentInstance() === undefined; i++) runtime.clock.tickOnce();
      const staged = runtime.offload.staged().length;
      expect(staged).toBeGreaterThan(0);

      // Asked immediately, with no measurements since that staging, it declines by
      // the rule it already had.
      const heard = watchHeartbeats(runtime, config);
      await post(runtime, prompt);
      expect(runtime.offload.staged().length).toBe(staged);
      expect(runtime.offload.declined.at(-1)).toMatch(/no measurements in the interval/);
      // And the decline is legible where the asking happened. Its ledger of declines
      // was in memory and published nowhere until pressing this button on the running
      // page showed a reader being refused with no way to learn why.
      vi.advanceTimersByTime(2500);
      expect(heard.get('offload')?.detail).toMatch(/last declined — .*no measurements in the interval/);

      // Let measurements accumulate, and the same ask stages a genuine window whose
      // geometry covers the interval since the last one.
      for (let i = 0; i < 120; i++) runtime.clock.tickOnce();
      await post(runtime, prompt);
      expect(runtime.offload.staged().length).toBe(staged + 1);
      const bundle = runtime.offload.staged().at(-1);
      expect(validator.validate('bundle-manifest', bundle?.manifest).refusals).toEqual([]);
      expect(bundle?.sibling.measurement_geometry?.measurements.length ?? 0).toBeGreaterThan(0);
      runtime.stop();
    });

    it('a prompted fault is refused at the seam, and the component says it was asked for it', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      // Far enough in that the sensors have a position and have sampled.
      for (let i = 0; i < 90; i++) runtime.clock.tickOnce();
      const refusedBefore = runtime.ingest.refused;
      const storedBefore = runtime.observationStore.all().length;

      await post(runtime, `${config.operator.http.event_prefix}/${config.sensors.fault_event}`);
      // Refused against the committed master, by name, and nothing reached the store.
      expect(runtime.ingest.refused).toBe(refusedBefore + 1);
      expect(runtime.observationStore.all().length).toBe(storedBefore);
      expect(runtime.ingest.recentRefusals.at(-1)).toMatch(/result/);
      vi.advanceTimersByTime(2500);
      // The sensors report what they were asked to produce: a fault a reader ordered
      // is never left looking like an instrument that started lying by itself.
      expect(figureOf(heard, 'sensors', 'faults')).toBe(1);
      expect(runtime.sensors.detail()).toMatch(/deliberately faulty sample/);
      runtime.stop();
    });

    it('a prompted impossible depth is flagged against the platform’s own declared limit', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      const flaggedBefore = runtime.ingest.flagged;
      const depthBefore = runtime.platform.state().current.depth_m;

      await post(runtime, `${config.operator.http.event_prefix}/${config.platform.fault_event}`);
      expect(runtime.ingest.flagged).toBe(flaggedBefore + 1);
      // The flag names the bound, and the bound is the platform's own — the ingest
      // reads it rather than holding a second copy.
      const reason = runtime.ingest.recentRefusals.at(-1) ?? '';
      expect(reason).toMatch(/out-of-range: depth/);
      expect(reason).toContain(String(config.platform.limits.maximum_depth_m));
      // A faulty instrument is not a faulty vehicle: the platform reported an
      // impossible depth and did not dive to one.
      expect(runtime.platform.state().current.depth_m).toBe(depthBefore);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'platform', 'faults')).toBe(1);
      runtime.stop();
    });

    it('the sampling cadence is one setting, and tuning it moves the staleness bound with it', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'sensors', 'sample_interval')).toBe(config.sensors.sample_interval_ticks);

      const rows = () =>
        runtime.observationStore.byDatastream(config.sensors.platform.thing_id, 'temperature-050m').length;
      // The mismatch is built rather than inherited. It used to arrive for free from
      // the declared cadences — the sensors sampling every thirty and the platform
      // reporting every thirty, so a tuned five starved them — and when both dials were
      // shortened to five this test went green for the wrong reason: nothing starved,
      // because nothing was mismatched. The starvation is the claim, so it is now set
      // up on purpose: push the platform's reporting out first.
      const starved = config.sensors.sample_interval_ticks * 6;
      await post(runtime, config.operator.http.tuning_path, {
        target: 'platform',
        setting: 'report_interval_ticks',
        value: starved,
      });
      vi.advanceTimersByTime(2500);
      const beforeRows = rows();
      await post(runtime, config.operator.http.tuning_path, {
        target: 'sensors',
        setting: 'sample_interval_ticks',
        value: 5,
      });
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'sensors', 'sample_interval')).toBe(5);

      // The cadence alone is not enough, and the harness says so rather than
      // pretending: the sensors treat a position older than their own cadence as no
      // position at all, so at five ticks they starve on a platform reporting far more
      // slowly. Found by this test failing, which is the coupling being real.
      const skippedBefore = figureOf(heard, 'sensors', 'skipped') ?? 0;
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(2500);
      expect(rows() - beforeRows).toBeLessThan(6);
      // And the sensors report the starving as a figure of their own rather than
      // leaving it to be inferred from a sentence.
      expect(figureOf(heard, 'sensors', 'skipped') ?? 0).toBeGreaterThan(skippedBefore);

      // The other half of the pair keeps them supplied, and now the shortened cadence
      // does what a reader expected of it.
      await post(runtime, config.operator.http.tuning_path, {
        target: 'platform',
        setting: 'report_interval_ticks',
        value: 5,
      });
      const suppliedFrom = rows();
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
      expect(rows() - suppliedFrom).toBeGreaterThan(6);
      // And the staleness bound moved with the cadence, because it IS the cadence:
      // the sensors' own age figure is measured against the tuned interval.
      const age = heard.get('sensors')?.figures?.find((figure) => figure.key === 'position_age_ticks');
      expect(age?.of).toBe(5);
      runtime.stop();
    });

    it('the planner’s usable-doubt threshold is tunable, and the plan carries the one in force', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('threshold-watch', config.shell.role);
      const plans: { projection: { usable_threshold: number } }[] = [];
      shell.subscribe(config.shell.topics.plan, (message) =>
        plans.push(message.payload as { projection: { usable_threshold: number } }),
      );
      // A forecast on request, a platform report, then a plan on request: what the
      // planner needs and the recompute that uses it, without grinding out the 1800
      // ticks to the cadence floor.
      await post(runtime, `${config.operator.http.event_prefix}/${config.scheduler.prompt_event}`);
      for (let i = 0; i < 35; i++) runtime.clock.tickOnce();
      await post(runtime, `${config.operator.http.event_prefix}/${config.planner.prompt_event}`);
      expect(plans.length).toBeGreaterThan(0);
      expect(plans[0].projection.usable_threshold).toBe(config.planner.usable_threshold);

      await post(runtime, config.operator.http.tuning_path, {
        target: 'planner',
        setting: 'usable_threshold',
        value: 0.5,
      });
      await post(runtime, `${config.operator.http.event_prefix}/${config.planner.prompt_event}`);
      // The plan says which threshold produced it, rather than leaving a reader to
      // assume the configured one.
      expect(plans.at(-1)?.projection.usable_threshold).toBe(0.5);
      expect(runtime.planner.usableThreshold()).toBe(0.5);
      runtime.stop();
    });


    /**
     * The prompts a reader can reach on a node that had nothing (feature 121).
     *
     * Ten of the twenty-two components were protected AND took no control, so opening
     * one gave a face, a wire list and no button at all. These five are what those
     * nodes now offer, and every one of them is a prompt in the sense the plane has
     * always meant: the component decides, and a decline is as complete an outcome as
     * an action. Nothing here manufactures data on request — that is the line each of
     * these was designed against, and each test asserts the component's own account
     * rather than the surface's acknowledgement.
     */
    it('a prompted sample is the ordinary sampling path, and is declined where there is no position to sample at', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      const prompt = `${config.operator.http.event_prefix}/${config.sensors.sample_event}`;

      // Far enough in that the platform has reported and the instruments have sampled.
      for (let i = 0; i < 90; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(2500);
      const skippedBefore = figureOf(heard, 'sensors', 'skipped');

      // Tick 90 is a sampling tick, and an observation's id is a function of its tick,
      // so a prompt here carries the ids the cadence has just published: the store sees
      // the redelivery it was built to absorb and holds the same rows. The sample was
      // still genuinely taken, and is counted as one — what a reader asked for is a
      // fact about the run whether or not it added a row.
      const rowsAtSampledTick = runtime.observationStore.all().length;
      await post(runtime, prompt);
      expect(runtime.observationStore.all().length).toBe(rowsAtSampledTick);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'sensors', 'prompted')).toBe(1);

      // A tick the cadence has not brought round is new rows: genuine observations,
      // through the genuine ingestion seam, one per instrument.
      runtime.clock.tickOnce();
      const rowsBefore = runtime.observationStore.all().length;
      await post(runtime, prompt);
      expect(runtime.observationStore.all().length).toBe(rowsBefore + config.sensors.instruments.length);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'sensors', 'prompted')).toBe(2);
      // And the sampling-tick skip count is untouched by the prompt: a sample taken on
      // request has not skipped a sampling tick, because no tick was due. The count
      // moving here would be the display telling a reader their own button press was
      // the cadence starving.
      expect(figureOf(heard, 'sensors', 'skipped')).toBe(skippedBefore);
      expect(runtime.sensors.detail()).toMatch(/taken on request/);

      // Now take the position away and ask again. Stopping the platform is how a run
      // genuinely reaches this state — the first draft of this test asked before the
      // first tick, and the pre-roll had already supplied a position, so it asserted
      // a decline that never happened. An instrument with nowhere to have been
      // publishes nothing rather than inventing the place.
      //
      // "Nothing published" alone would be satisfied by a handler that threw, and the
      // broker would swallow the throw, so what is asserted is the instruments' own
      // count of declines — which an exception cannot produce — and the fault count.
      await post(runtime, `${config.operator.http.command_prefix}/${config.platform.id}/stop`);
      for (let i = 0; i < 20; i++) runtime.clock.tickOnce();
      const rowsStarved = runtime.observationStore.all().length;
      await post(runtime, prompt);
      expect(runtime.observationStore.all().length).toBe(rowsStarved);
      expect(runtime.broker.deliveryFaults).toBe(0);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'sensors', 'prompts_declined')).toBe(1);
      expect(figureOf(heard, 'sensors', 'prompted')).toBe(2);
      expect(runtime.sensors.detail()).toMatch(/declined for want of a fresh position/);
      runtime.stop();
    });

    it('a prompted position report is the ordinary report, and the store deduplicates one asked for twice', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      const prompt = `${config.operator.http.event_prefix}/${config.platform.report_event}`;
      for (let i = 0; i < 60; i++) runtime.clock.tickOnce();

      const ownship = () =>
        runtime.observationStore.all().filter((row) => row.thing_id === config.platform.thing.thing_id);
      const before = ownship().length;
      await post(runtime, prompt);
      // An observation's id is a function of its tick, so a prompt at a tick the
      // platform has already reported carries the same ids: the store sees the
      // redelivery it was built to absorb and holds the same rows. That is the
      // at-least-once property working rather than a special case, and it is asserted
      // here so a later change that made a prompt mint fresh ids has to argue with it.
      expect(ownship().length).toBe(before);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'platform', 'prompted')).toBe(1);

      // At a tick the interval has not brought round, the report is new rows.
      runtime.clock.tickOnce();
      const unreported = ownship().length;
      await post(runtime, prompt);
      expect(ownship().length).toBeGreaterThan(unreported);
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'platform', 'prompted')).toBe(2);
      runtime.stop();
    });

    it('a prompted announcement names holdings that already exist, and publishes none', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      const shell = runtime.transport.connect('holding-watch', config.shell.role);
      const announced: { holding_id: string; era: string }[] = [];
      shell.subscribe(config.shell.topics.holdings, (message) =>
        announced.push(message.payload as { holding_id: string; era: string }),
      );
      const prompt = `${config.operator.http.event_prefix}/${config.coverage_store.announce_event}`;

      runtime.clock.tickOnce();
      const held = runtime.store.holdings().length;
      const heardFirst = announced.length;
      expect(held).toBeGreaterThan(0);

      await post(runtime, prompt);
      expect(runtime.broker.deliveryFaults).toBe(0);
      // Every announcement names a holding that is in the store, and the store holds
      // exactly what it held: an announcement is a message about bytes, and a store
      // whose prompt manufactured a holding would be one inventing data on request.
      expect(announced.length).toBeGreaterThan(heardFirst);
      expect(runtime.store.holdings().length).toBe(held);
      for (const entry of announced.slice(heardFirst)) {
        expect(runtime.store.holding(entry.holding_id)).toBeDefined();
      }
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'coverage-store', 'announced')).toBe(announced.length - heardFirst);
      runtime.stop();
    });

    it('telemetry publishes its two accounts on request, and the named absence is one of them', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const heard = watchHeartbeats(runtime, config);
      const shell = runtime.transport.connect('telemetry-watch', config.shell.role);
      const said: { kind?: string }[] = [];
      shell.subscribe(config.shell.topics.telemetry, (message) => said.push(message.payload as { kind?: string }));
      const of = (kind: string) => said.filter((entry) => entry.kind === kind);

      // Before anything has been folded, both prompts publish what the cadence would
      // publish: an account that names its own emptiness. A component that stayed
      // silent here would leave a reader unable to tell 'nothing to say' from 'button
      // does nothing', which is the failure the whole tab is a correction to.
      runtime.clock.tickOnce();
      const skillBefore = of('forecast-skill').length;
      const statisticsBefore = of('residual-statistics').length;
      await post(runtime, `${config.operator.http.event_prefix}/${config.telemetry.skill_event}`);
      await post(runtime, `${config.operator.http.event_prefix}/${config.telemetry.statistics_event}`);
      const skill = of('forecast-skill');
      const statistics = of('residual-statistics');
      expect(skill.length).toBe(skillBefore + 1);
      expect(statistics.length).toBeGreaterThan(statisticsBefore);
      // Master-valid, on the same topic and in the same shape as one on cadence: a
      // prompt is a different moment, never a different message.
      expect(validator.validate('telemetry', skill.at(-1)).refusals).toEqual([]);
      expect(validator.validate('telemetry', statistics.at(-1)).refusals).toEqual([]);
      // Which absence it is depends on how far the loop has got; that it names one
      // rather than reporting a score is the point, and 'beating-persistence' one tick
      // in would be a figure invented for the occasion.
      expect(['no-forecast', 'insufficient-samples']).toContain(
        (skill.at(-1) as TelemetryForecastSkill).state,
      );
      vi.advanceTimersByTime(2500);
      expect(figureOf(heard, 'telemetry', 'prompted')).toBe(2);
      runtime.stop();
    });

    it('steps a burst of ticks, and refuses one beyond the declared bound', async () => {
      const config = lockstepConfig();
      const runtime = buildBackend(config, options, validator);
      const before = runtime.clock.currentTick();
      const burst = await post(runtime, config.operator.http.step_path, { ticks: 12 });
      expect(burst.status).toBe(200);
      // Twelve genuine ticks, not one tick and a claim of twelve.
      expect(runtime.clock.currentTick()).toBe(before + 12);

      const beyond = await post(runtime, config.operator.http.step_path, {
        ticks: config.operator.step.maximum_ticks + 1,
      });
      expect(beyond.status).toBe(400);
      expect(beyond.body.refused).toMatch(
        new RegExp(`beyond the declared bound of ${config.operator.step.maximum_ticks}`),
      );
      expect(runtime.clock.currentTick()).toBe(before + 12);

      // And the endpoint still means one tick with no body at all.
      await post(runtime, config.operator.http.step_path);
      expect(runtime.clock.currentTick()).toBe(before + 13);
      runtime.stop();
    });
  });
});
