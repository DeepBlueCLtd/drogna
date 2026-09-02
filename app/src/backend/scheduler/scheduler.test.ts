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
}

function watch(runtime: BackendRuntime, config: ConfigRun): Watch {
  const seen: Watch = { requests: [], decisions: [], costTicks: undefined };
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

  tick(scheduler: Scheduler, config: ConfigRun, at: number): void {
    void scheduler;
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
    // Reported once per episode: a hold that republished on every tick would drown the
    // branch in a fact that has not changed.
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
    bench.tick(scheduler, config, 0);
    bench.tick(scheduler, config, 1);
    bench.deliver(config.scheduler.topics.run_published, {
      run_id: 'standing',
      current: true,
      valid_time: { start_sim_time: bench.simTimeAt(0), end_sim_time: bench.simTimeAt(3600) },
    });

    // The floor comes due with plenty of headroom: held, not requested, and the shortfall
    // says how much validity must still decay.
    bench.tick(scheduler, config, config.scheduler.max_interval_ticks);
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
    bench.tick(scheduler, config, config.scheduler.max_interval_ticks + shortfall);
    bench.tick(scheduler, config, 3600);
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
    bench.tick(scheduler, config, 0);
    bench.tick(scheduler, config, 1);
    // A forecast whose validity ends well before the floor comes due.
    bench.deliver(config.scheduler.topics.run_published, {
      run_id: 'lapsed',
      current: true,
      valid_time: { start_sim_time: bench.simTimeAt(0), end_sim_time: bench.simTimeAt(600) },
    });
    bench.tick(scheduler, config, config.scheduler.max_interval_ticks);
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
});
