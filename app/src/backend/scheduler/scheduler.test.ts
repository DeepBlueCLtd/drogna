/**
 * The scheduler's second dimension: can a run be afforded now (SRD-v2 FR-115, ADR-0043).
 *
 * **The becalm test is the reason this file exists.** The first formulation of
 * affordability — a run is affordable when it fits inside the standing forecast's remaining
 * validity — was accepted at the interview and is wrong: the cadence floor fires *precisely
 * when* validity has lapsed, so the headroom is zero, no run of any cost is ever affordable,
 * and the loop is becalmed for good. That is the exact fault FR-31 forbids and that
 * `spikes/watched-turn/FINDING.md` has watched happen once already. The test below plants
 * the becalmed state and asserts the run is requested, because the design nearly shipped
 * with the fault rather than because the fault is hypothetical.
 *
 * Driven against the real components over the real broker — the scheduler holds against a
 * cost the model runner published, and a test that injected the cost itself would be
 * checking the arithmetic and not the wiring.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Divergence, RunRequest, TelemetrySchedulerDecision } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';
import { Scheduler } from './scheduler.js';
import { twoLayerStability } from '../model-runner/kernel.js';
import type { SeamClient, SeamMessage } from '../../seam/transport.js';
import { driveTicks, driveUntil } from '../test-support/drive.js';
import { SOUND_SPEED } from '../env-generator/analytic.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 4242, startCondition: 'loitering', revision: 'test', dirty: false };

interface Watch {
  requests: RunRequest[];
  decisions: TelemetrySchedulerDecision[];
  costTicks: number | undefined;
  /** Run ids announced, and run ids published: a run between the two is occupying its cost. */
  started: string[];
  published: string[];
}

function watch(runtime: BackendRuntime, config: ConfigRun): Watch {
  const seen: Watch = { requests: [], decisions: [], costTicks: undefined, started: [], published: [] };
  const shell = runtime.transport.connect(`scheduler-test-${Math.random()}`, 'shell');
  shell.subscribe(config.scheduler.topics.run_request, (message) => {
    seen.requests.push(message.payload as RunRequest);
  });
  shell.subscribe(config.scheduler.topics.telemetry, (message) => {
    const payload = message.payload as { kind?: string };
    if (payload.kind !== 'scheduler-decision') return;
    expect(validator.validate('telemetry', message.payload).refusals).toEqual([]);
    seen.decisions.push(message.payload as TelemetrySchedulerDecision);
  });
  shell.subscribe(config.model_runner.topics.run_cost, (message) => {
    expect(validator.validate('run-cost', message.payload).refusals).toEqual([]);
    seen.costTicks = (message.payload as { cost_ticks: number }).cost_ticks;
  });
  // Announced and published are separate events now that a run occupies the ticks between
  // them, and "a run is occupying its cost" is `started > published` — the only way a test
  // can aim at that window rather than guess a tick.
  shell.subscribe(config.model_runner.topics.run_started, (message) => {
    seen.started.push((message.payload as { run_id: string }).run_id);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    seen.published.push((message.payload as { run_id: string }).run_id);
  });
  return seen;
}

/** A divergence document built here and validated, so its shape is the one a monitor raises. */
function divergenceAt(config: ConfigRun, runtime: BackendRuntime, request: RunRequest): Divergence {
  const raised: Divergence = {
    component: config.monitor.id,
    scenario_run_id: request.scenario_run_id,
    sim_time: request.sim_time,
    tick: runtime.clock.currentTick(),
    divergence_id: `divergence-under-test-${runtime.clock.currentTick()}`,
    forecast_run_id: request.run_id,
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
      first_sim_time: request.sim_time,
      last_sim_time: request.sim_time,
    },
    sound_speed_equation: SOUND_SPEED.method,
  };
  expect(validator.validate('divergence', raised).refusals).toEqual([]);
  return raised;
}

/**
 * A scheduler on a bench: one client, hand-delivered messages, hand-advanced ticks.
 *
 * Used only by the becalm test, and only because the state that test needs is exact. Every
 * other assertion in this file drives the real components over the real broker, because a
 * hold that works on a bench and not in the harness is a hold nobody has.
 */
class Bench {
  readonly published: { topic: string; payload: unknown }[] = [];
  private readonly handlers: { filter: string; handler: (message: SeamMessage) => void }[] = [];

  readonly client: SeamClient = {
    publish: (topic, payload) => {
      this.published.push({ topic, payload: JSON.parse(JSON.stringify(payload)) as unknown });
    },
    subscribe: (filter, handler) => {
      this.handlers.push({ filter, handler });
      return () => undefined;
    },
    disconnect: () => undefined,
  };

  deliver(topic: string, payload: unknown): void {
    const wire = JSON.parse(JSON.stringify(payload)) as unknown;
    for (const entry of this.handlers) {
      if (entry.filter === topic) entry.handler({ topic, payload: wire });
    }
  }

  /** One second of simulation time per tick, which is what the shipped clock publishes. */
  simTimeAt(tick: number): string {
    return `${new Date(Date.UTC(2026, 0, 1) + tick * 1000).toISOString().slice(0, 19)}.000000Z`;
  }

  tick(config: ConfigRun, at: number): void {
    this.deliver(config.scheduler.topics.clock, { sim_time: this.simTimeAt(at), tick: at });
  }

  get requests(): RunRequest[] {
    return this.published
      .filter((entry) => entry.topic.endsWith('/request'))
      .map((entry) => entry.payload as RunRequest);
  }

  get decisions(): TelemetrySchedulerDecision[] {
    return this.published
      .map((entry) => entry.payload as { kind?: string })
      .filter((payload) => payload.kind === 'scheduler-decision') as TelemetrySchedulerDecision[];
  }
}

describe('affording a run (feature 123, FR-115)', { timeout: 240_000 }, () => {
  it('states the cost from the model runner, and restates it so a late listener learns it', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // Subscribed *after* the backend was built, which is the shell's position exactly: it
    // mounts after the run has been provisioned and pre-rolled, so the first statement is
    // one it could never have heard. The restatement cadence is what makes the figure
    // learnable rather than missed, and the drive is that cadence read from configuration.
    const seen = watch(runtime, config);
    await driveTicks(runtime.clock, config.model_runner.cost.restate_every_ticks + 1);
    // The figure is the runner's, reported and not derived: `check-declared-cost` is what
    // stops a second copy appearing in any other component's configuration.
    expect(seen.costTicks).toBeDefined();
    expect(seen.costTicks).toBeGreaterThan(0);
    runtime.stop();
  });

  it('declares its cost against a cell size the run is actually handed', async () => {
    // **The declaration and the occupancy are the same work only while the two agree on the
    // sub-step count.** The cost is stated before any analysis arrives, so it is computed at
    // a nominal cell from configuration; the run then integrates on whatever grid it is
    // handed and reports what that took. Nothing related the two, and the nominal was set at
    // more than twice the real cell — invisible because both round to one sub-step at this
    // step length, and untrue the moment a grid is refined past that.
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const started: { sub_steps_per_step: number | null; cost_ticks: number }[] = [];
    const shell = runtime.transport.connect(`cost-basis-${Math.random()}`, 'shell');
    shell.subscribe(config.model_runner.topics.run_started, (message) => {
      started.push(message.payload as { sub_steps_per_step: number | null; cost_ticks: number });
    });
    await driveUntil(runtime.clock, () => started.length > 0, config.scheduler.max_interval_ticks * 3);
    expect(started.length).toBeGreaterThan(0);
    // The declared figure, recomputed from configuration exactly as the runner declares it.
    const nominal = config.model_runner.cost.nominal_cell_km;
    const declaredSubSteps = twoLayerStability(
      {
        steps: config.model_runner.steps,
        stepSeconds: config.model_runner.step_seconds,
        advectionEastKmPerDay: config.model_runner.advection.east_km_per_day,
        advectionNorthKmPerDay: config.model_runner.advection.north_km_per_day,
        noiseStdTemperature: config.model_runner.noise_std.temperature,
        noiseStdSalinity: config.model_runner.noise_std.salinity,
        twoLayer: {
          interfaceDepthM: config.model_runner.two_layer.interface_depth_m,
          upper: {
            eastKmPerDay: config.model_runner.two_layer.upper.east_km_per_day,
            northKmPerDay: config.model_runner.two_layer.upper.north_km_per_day,
          },
          lower: {
            eastKmPerDay: config.model_runner.two_layer.lower.east_km_per_day,
            northKmPerDay: config.model_runner.two_layer.lower.north_km_per_day,
          },
          horizontalDiffusivityM2PerS: config.model_runner.two_layer.horizontal_diffusivity_m2_per_s,
          interfacialExchangePerDay: config.model_runner.two_layer.interfacial_exchange_per_day,
          maxCourant: config.model_runner.two_layer.max_courant,
          maxSubSteps: config.model_runner.two_layer.max_sub_steps,
        },
      },
      nominal,
      nominal,
    ).subSteps;
    // The reported figure, from the run that happened. They are two kinds of claim and they
    // are allowed to differ — but not silently, and not by a factor.
    expect(started[0].sub_steps_per_step).toBe(declaredSubSteps);
    runtime.stop();
  });

  it('holds the cadence floor’s run while the standing forecast still has life in it', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const seen = watch(runtime, config);
    // Turn the loop until the first run has published, so there is a standing forecast
    // with validity to spare, then on to the next time the cadence floor comes due.
    await driveUntil(
      runtime.clock,
      () => seen.decisions.some((decision) => decision.decision === 'held-for-cost'),
      config.scheduler.max_interval_ticks * 4,
    );
    const held = seen.decisions.find((decision) => decision.decision === 'held-for-cost');
    expect(held).toBeDefined();
    // A hold is not a decline, and it names how much validity must still decay. Held
    // against the cost the runner published, so the figure and the wait cannot disagree.
    expect(held?.run_id).toBeNull();
    expect(held?.shortfall_ticks ?? 0).toBeGreaterThan(0);
    expect(held?.detail).toMatch(/released as that headroom decays/);
    // **Reported once per episode — and driven past the hold to find out.** The first
    // version of this assertion counted the holds at the instant the drive stopped, and the
    // drive stopped *on* the tick that published the first one, so the count was 1 by
    // construction of the stopping condition and not by anything the scheduler did. Deleting
    // the dedupe outright left all seven tests in this file green. A check that cannot fail
    // is worth nothing (CLAUDE.md, lesson 2), and this is the second one this feature has
    // had to fix.
    const heldAtFirstReport = seen.decisions.filter((decision) => decision.decision === 'held-for-cost').length;
    expect(heldAtFirstReport).toBe(1);
    await driveTicks(runtime.clock, 200);
    expect(seen.decisions.filter((decision) => decision.decision === 'held-for-cost').length).toBe(1);

    runtime.stop();
  });

  it('SC-006: the hold cannot becalm the loop — the becalmed state, planted, releases', () => {
    // Planted rather than waited for. The fault this guards against is the one the design
    // nearly shipped with: read the affordability rule the obvious way round and the
    // cadence floor fires precisely when validity has lapsed, so the headroom is zero, no
    // run is affordable, and nothing ever runs again. The state that would expose it is
    // exact — the floor due, a standing forecast, a published cost — and a scenario driven
    // until it happens to arise can be pre-empted by a genuine divergence, which resets
    // the floor and proves nothing about the hold.
    const config = lockstepConfig();
    const bench = new Bench();
    const scheduler = new Scheduler(config.scheduler, bench.client, 'becalm-test');
    scheduler.start();

    // A cost, from the runner. Without one nothing is ever held, so the test would pass
    // against a scheduler that had no hold in it at all.
    bench.deliver(config.model_runner.topics.run_cost, { cost_ticks: 12 });

    // Two samples so the tick length is derived, then a standing forecast valid for an
    // hour of simulation time, then the cadence floor's due tick.
    bench.tick(config, 0);
    bench.tick(config, 1);
    bench.deliver(config.scheduler.topics.run_published, {
      run_id: 'standing',
      current: true,
      valid_time: { start_sim_time: bench.simTimeAt(0), end_sim_time: bench.simTimeAt(3600) },
    });

    // The floor comes due with plenty of headroom: held, not requested, and the shortfall
    // says how much validity must still decay.
    bench.tick(config, config.scheduler.max_interval_ticks);
    expect(bench.requests).toHaveLength(0);
    const held = bench.decisions.at(-1);
    expect(held?.decision).toBe('held-for-cost');
    const shortfall = held?.shortfall_ticks ?? 0;
    expect(shortfall).toBeGreaterThan(0);

    // **The becalmed instant**: the tick at which the standing forecast's validity has run
    // out entirely. Under the rule read the obvious way round there is no headroom at all
    // here and nothing is ever affordable again. Under the rule as written the hold
    // released before this — the run lands as the old one lapses — so by now it has been
    // requested.
    bench.tick(config, config.scheduler.max_interval_ticks + shortfall);
    bench.tick(config, 3600);
    expect(bench.requests.length).toBeGreaterThan(0);
    expect(bench.requests[0].cause).toBe('scheduled');
    // And it was released *before* the lapse, by the declared margin, so the new run has
    // time to land while the old forecast is still standing.
    expect(bench.requests[0].tick).toBeLessThan(3600);
    scheduler.stop();
  });

  it('SC-006, the becalmed instant itself: validity already spent, and the floor still fires', () => {
    // The exact instant the wrong rule dies at, planted on its own. The cadence floor comes
    // due *after* the standing forecast has lapsed — which is the case FR-31 was written
    // for — so the headroom is zero. Read the affordability rule the obvious way round and
    // nothing of any cost fits inside zero, so the run is held, and held again at every
    // tick after it, for ever. Read as written, zero headroom is nothing to wait for.
    const config = lockstepConfig();
    const bench = new Bench();
    const scheduler = new Scheduler(config.scheduler, bench.client, 'becalm-instant');
    scheduler.start();
    bench.deliver(config.model_runner.topics.run_cost, { cost_ticks: 12 });
    bench.tick(config, 0);
    bench.tick(config, 1);
    // A forecast whose validity ends well before the floor comes due.
    bench.deliver(config.scheduler.topics.run_published, {
      run_id: 'lapsed',
      current: true,
      valid_time: { start_sim_time: bench.simTimeAt(0), end_sim_time: bench.simTimeAt(600) },
    });
    bench.tick(config, config.scheduler.max_interval_ticks);
    expect(bench.decisions.some((decision) => decision.decision === 'held-for-cost')).toBe(false);
    expect(bench.requests).toHaveLength(1);
    expect(bench.requests[0].cause).toBe('scheduled');
    scheduler.stop();
  });

  it('releases an outstanding run the runner says it will not publish, rather than waiting for ever', async () => {
    // **The fault a cost introduced, and the reason this test is not optional.** A run now
    // occupies the ticks it costs, so there is an interval on every run in which the model
    // runner can be stopped with the publication staged and undelivered. This component
    // clears its outstanding run on a publication and on nothing else, so before the runner
    // learned to say so, stopping it in that window meant no cadence floor and no
    // divergence would ever be acted on again — a permanently becalmed loop reached through
    // an ordinary operator verb, which is what FR-31 forbids.
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const seen = watch(runtime, config);
    // Turn the loop until a run has been announced and is occupying its cost.
    await driveUntil(
      runtime.clock,
      () => seen.requests.length > 0 && runtime.store.currentInstance() === undefined,
      config.scheduler.max_interval_ticks * 3,
    );
    expect(seen.requests.length).toBeGreaterThan(0);
    expect(runtime.store.currentInstance()).toBeUndefined();
    const requestsBefore = seen.requests.length;

    // Stopped mid-occupancy, exactly as the Operator tab's stop control does it.
    runtime.control.stop(config.model_runner.id);
    expect(runtime.scheduler.abandoned).toBe(1);

    // And the loop turns again: with the runner restarted, the next cadence floor is acted
    // on rather than declined against a run that is never coming.
    runtime.control.start(config.model_runner.id);
    await driveUntil(
      runtime.clock,
      () => seen.requests.length > requestsBefore,
      config.scheduler.max_interval_ticks * 4,
    );
    expect(seen.requests.length).toBeGreaterThan(requestsBefore);
    runtime.stop();
  });

  it('restarting the scheduler inside a run’s cost does not becalm the loop', async () => {
    // **The second entrance to the same window, and it was open.** The test above answers
    // the model runner being stopped mid-occupancy. This answers the other side: restarting
    // *this* component while a run is spending its cost. A fresh scheduler has no run in
    // flight and no standing validity to hold against, so its cadence floor fires at once,
    // the analyst obliges, and a second analysis reaches a runner that is still occupied.
    //
    // The runner refused it — correctly — by throwing. But this runs inside a broker
    // subscription handler, and the broker catches handler faults and increments a counter,
    // so nothing was ever told: the scheduler went on waiting for a publication that had
    // been refused before any work was done. Measured before the fix, at `loitering` seed
    // 4242 with the restart at tick 4420: twenty thousand ticks and eleven cadence floors
    // afterwards with nothing requested, started or published. The comment on that branch
    // said it "cannot be reached from the shipped loop"; it is reached by pressing a button.
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const seen = watch(runtime, config);
    // **The second run, not the first, and the difference is not incidental.** A restarted
    // scheduler counts run ids from zero again, so a restart during the *first* run has the
    // new scheduler asking for the same `…-run-0` that is already occupying — and the
    // occupying run's publication then clears the new scheduler's outstanding run by an id
    // collision rather than by anything being right. The first draft of this test restarted
    // during run 0, was rescued by that collision, and passed against the unfixed code on
    // every assertion but one. The window this is about is the second run occupying while
    // the restarted scheduler asks for the first id again.
    await driveUntil(
      runtime.clock,
      () => seen.started.length >= 2 && seen.published.length < seen.started.length,
      config.scheduler.max_interval_ticks * 6,
    );
    expect(seen.started.length, 'the loop never reached a second run').toBeGreaterThanOrEqual(2);
    expect(seen.published.length, 'the second run was not still occupying its cost').toBeLessThan(seen.started.length);
    const requestsBefore = seen.requests.length;

    // The Operator tab's own verbs, on the scheduler rather than the runner.
    runtime.control.stop(config.scheduler.id);
    runtime.control.start(config.scheduler.id);

    // The restarted scheduler's first floor fires at once — it has nothing to hold against.
    // That request is the one the occupied runner refuses.
    await driveUntil(
      runtime.clock,
      () => seen.requests.length > requestsBefore,
      config.scheduler.max_interval_ticks * 2,
    );
    const afterRestart = seen.requests.length;

    // **This is the assertion that sees the becalm, and the reason the first draft of this
    // test was too weak to keep.** Neither "a forecast eventually appeared" nor "a request
    // followed the restart" separates the two cases: the run that was already occupying its
    // cost publishes either way, and the restarted scheduler makes its first request either
    // way. What only the fixed loop does is make a *second* one — because the refusal is
    // heard, the outstanding run is cleared, and the next floor is free to fire. Held for
    // four cadence intervals, so the failure is a silence rather than a near miss.
    await driveUntil(
      runtime.clock,
      () => seen.requests.length > afterRestart,
      config.scheduler.max_interval_ticks * 4,
    );
    expect(
      seen.requests.length,
      'nothing was requested for four cadence intervals: the refused run is still held in flight',
    ).toBeGreaterThan(afterRestart);
    // And the refusal was heard rather than swallowed. A broker delivery fault here means
    // the runner threw into a handler that catches — the shape of the fault, not of the fix.
    expect(runtime.broker.deliveryFaults, 'the refusal was thrown into a handler that swallowed it').toBe(0);
    runtime.stop();
  });

  it('a reader’s prompt does not make the cadence floor repeat itself', () => {
    // Planted on the bench, because the state is exact: the floor holding, and a prompt
    // arriving inside that hold. The hold marker was a single field named for the cause
    // being held and used as the marker for having reported it — so a prompt overwrote the
    // floor's cause, and the next clock sample found it missing and republished a fact that
    // had not changed. One spurious row on the Forecast timeline and one wrong figure on the
    // scheduler's face, per press.
    const config = lockstepConfig();
    const bench = new Bench();
    const scheduler = new Scheduler(config.scheduler, bench.client, 'prompt-episode');
    scheduler.start();
    bench.deliver(config.model_runner.topics.run_cost, { cost_ticks: 9 });
    bench.tick(config, 0);
    bench.tick(config, 1);
    bench.deliver(config.scheduler.topics.run_published, {
      run_id: 'standing',
      current: true,
      valid_time: { start_sim_time: bench.simTimeAt(0), end_sim_time: bench.simTimeAt(7200) },
    });

    const floorHolds = () =>
      bench.decisions.filter(
        (decision) => decision.decision === 'held-for-cost' && decision.detail.includes('cadence floor'),
      ).length;
    const promptHolds = () =>
      bench.decisions.filter(
        (decision) => decision.decision === 'held-for-cost' && decision.detail.includes('reader prompted'),
      ).length;

    bench.tick(config, config.scheduler.max_interval_ticks);
    expect(floorHolds()).toBe(1);

    // A reader presses the button twice while the floor is holding. Each press is answered —
    // a prompt is a discrete act and a button that says nothing looks broken — and neither
    // press makes the floor say its piece again.
    bench.deliver(config.scheduler.topics.command, {
      target: config.scheduler.id,
      kind: 'event',
      event: config.scheduler.prompt_event,
    });
    bench.tick(config, config.scheduler.max_interval_ticks + 1);
    bench.deliver(config.scheduler.topics.command, {
      target: config.scheduler.id,
      kind: 'event',
      event: config.scheduler.prompt_event,
    });
    bench.tick(config, config.scheduler.max_interval_ticks + 2);

    expect(promptHolds()).toBe(2);
    expect(floorHolds()).toBe(1);
    expect(bench.requests).toHaveLength(0);
    scheduler.stop();
  });

  it('SC-007: a divergence is never held, at a tick where a scheduled run would be', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const seen = watch(runtime, config);
    await driveUntil(
      runtime.clock,
      () => seen.decisions.some((decision) => decision.decision === 'held-for-cost'),
      config.scheduler.max_interval_ticks * 4,
    );
    expect(seen.decisions.some((decision) => decision.decision === 'held-for-cost')).toBe(true);
    const before = seen.requests.length;
    // The same tick, the same headroom, the same standing forecast — and a divergence
    // rather than the cadence floor. A hold is a bet that the standing forecast is still
    // worth something; a divergence is the world saying it is not.
    const monitor = runtime.transport.connect('divergence-probe', 'monitor');
    monitor.publish(config.monitor.topics.divergence, divergenceAt(config, runtime, seen.requests[0]));
    expect(seen.requests.length).toBe(before + 1);
    expect(seen.requests.at(-1)?.cause).toBe('divergence');
    expect(seen.decisions.at(-1)?.decision).toBe('accepted');
    runtime.stop();
  });
  /**
   * FR-31, through the one door that was still open: a run requested into a component
   * that is not there to hear it.
   *
   * The `run-failed` release covers the model runner, which is still present to say it
   * will not deliver. The analyst is not: it takes a run request synchronously and holds
   * no pending state, so a request published while it is stopped is not declined, not
   * failed and not remembered. It vanishes, and the scheduler's outstanding-run guard
   * latches on it for the rest of the visit.
   *
   * Watched happening before the watchdog existed, by exactly the steps below — stop the
   * analyst from the Operator tab, let the cadence floor come due, start it again — and the
   * loop never turned another cycle: `analysis` and `instance` frozen where they stood, every
   * later divergence declined as a duplicate of a run nobody was working on. Driven through
   * the plane's own endpoints rather than by calling `stop()`, because the reachability by an
   * ordinary reader is the point.
   */
  it('FR-31: the loop recovers from a run requested into a stopped analyst', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const seen = watch(runtime, config);
    const command = (id: string, verb: 'stop' | 'start') =>
      runtime.httpBackend.handle({
        method: 'POST',
        path: `${config.operator.http.command_prefix}/${id}/${verb}`,
        body: '',
      });

    // The loop turning, as a reader would find it.
    await driveUntil(runtime.clock, () => seen.published.length >= 1, config.scheduler.max_interval_ticks * 6);
    const whileWarm = seen.published.length;
    expect(whileWarm, 'the loop never turned at all, so this test proves nothing').toBeGreaterThan(0);

    const requestedWhileWarm = seen.requests.length;
    expect((await command(config.analyst.id, 'stop')).status).toBe(200);

    // Driven until a run is actually requested into the silence, not for a tick count that
    // might not reach one. The cadence floor comes due on its own schedule and is then *held*
    // while the standing forecast still has life in it (FR-115), so "max_interval ticks have
    // passed" is not the same event as "a run was requested" — and a version of this test that
    // assumed it was passed against the unfixed scheduler, having never set the latch it was
    // written to catch.
    await driveUntil(
      runtime.clock,
      () => seen.requests.length > requestedWhileWarm,
      config.scheduler.max_interval_ticks * 6,
    );
    expect(
      seen.requests.length,
      'no run was requested while the analyst was stopped, so the latch this test needs was never set',
    ).toBeGreaterThan(requestedWhileWarm);
    expect(seen.published.length, 'a run published with the analyst stopped').toBe(whileWarm);

    // The reader changes their mind, as the Operator tab invites them to.
    expect((await command(config.analyst.id, 'start')).status).toBe(200);

    // The watchdog releases the run nobody was working on, and the floor turns the loop
    // again. Without it this waits out the whole limit and the count never moves.
    await driveUntil(
      runtime.clock,
      () => seen.published.length > whileWarm,
      config.scheduler.max_interval_ticks * 6,
    );
    expect(
      seen.published.length,
      'the loop never turned again after the analyst came back: the outstanding-run guard is still latched',
    ).toBeGreaterThan(whileWarm);
    runtime.stop();
  });
});
