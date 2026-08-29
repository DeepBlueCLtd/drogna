/**
 * The backend runtime: constructs the in-browser components from the run
 * configuration document, wires them over the seam, and provisions the run
 * (SRD-v2 FR-11: through the components' own code paths, never by poking a store).
 *
 * Construction order is part of the behaviour: broker first (everything else holds a
 * client), then the boundary and routes, then the clock — whose first published
 * sample is the moment simulation time exists; heartbeats start after it so no
 * component ever claims a time it has not heard.
 *
 * Every component's configuration document is validated against its master before
 * that component does any other work (Constitution IV).
 */
import type { SeamHttpBackend } from '../../seam/http.js';
import type { SeamTransport } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';
import type { ConfigRun, RunManifest } from '../../generated/types.js';
import { Broker } from '../broker/broker.js';
import { createInBrowserTransport } from '../broker/transport-adapter.js';
import { Clock } from '../clock/clock.js';
import { CoverageStore } from '../coverage-store/store.js';
import { EnvGenerator } from '../env-generator/generator.js';
import { salinityAt, temperatureAt } from '../env-generator/analytic.js';
import { Sensors, type WorldSampler } from '../sensors/sensors.js';
import { Ingest } from '../ingest/ingest.js';
import { ObservationStore } from '../observation-store/store.js';
import { FeatureStore } from '../feature-store/store.js';
import { QueryComponent } from '../query/query.js';
import { Monitor } from '../monitor/monitor.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { ModelRunner } from '../model-runner/runner.js';
import { Planner } from '../planner/planner.js';
import { ReleaseGate } from '../boundary/gate.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { configDigest } from '../lib/sha256.js';
import { Router } from './router.js';
import { parseEpochMicros } from '../lib/sim-time.js';
import { buildRunManifest, deriveRunId } from './manifest.js';

export interface BackendRuntime {
  readonly transport: SeamTransport;
  readonly httpBackend: SeamHttpBackend;
  readonly manifest: RunManifest;
  readonly runId: string;
  readonly clock: Clock;
  readonly store: CoverageStore;
  readonly observationStore: ObservationStore;
  readonly featureStore: FeatureStore;
  readonly ingest: Ingest;
  readonly monitor: Monitor;
  readonly scheduler: Scheduler;
  readonly planner: Planner;
  stop(): void;
}

export interface BuildOptions {
  readonly rootSeed: number;
  readonly revision: string;
  readonly dirty: boolean;
}

function validated(validator: SeamValidator, schemaKey: string, document: unknown): void {
  const verdict = validator.validate(schemaKey, document);
  if (!verdict.ok) {
    throw new Error(`configuration refused by its master:\n${verdict.refusals.join('\n')}`);
  }
}

export function buildBackend(
  config: ConfigRun,
  options: BuildOptions,
  validator: SeamValidator,
): BackendRuntime {
  validated(validator, 'config.run', config);
  validated(validator, 'config.clock', config.clock);
  validated(validator, 'config.broker', config.broker);
  validated(validator, 'config.boundary', config.boundary);
  validated(validator, 'config.env-generator', config.env_generator);
  validated(validator, 'config.coverage-store', config.coverage_store);
  validated(validator, 'config.sensors', config.sensors);
  validated(validator, 'config.ingest', config.ingest);
  validated(validator, 'config.observation-store', config.observation_store);
  validated(validator, 'config.feature-store', config.feature_store);
  validated(validator, 'config.query', config.query);
  validated(validator, 'config.monitor', config.monitor);
  validated(validator, 'config.scheduler', config.scheduler);
  validated(validator, 'config.model-runner', config.model_runner);
  validated(validator, 'config.planner', config.planner);
  validated(validator, 'config.shell', config.shell);

  const runId = deriveRunId(config.scenario, options.rootSeed);
  const manifest = buildRunManifest(config, options.rootSeed, options.revision, options.dirty, [
    config.env_generator.stream,
    config.sensors.stream,
    config.model_runner.stream,
    config.planner.stream,
  ]);

  const broker = new Broker(config.broker);
  const transport = createInBrowserTransport(broker);

  const router = new Router();
  const boundaryClient = transport.connect(config.boundary.id, config.boundary.id);
  const gate = new ReleaseGate(config.boundary, boundaryClient, router);

  const clockClient = transport.connect(config.clock.id, config.clock.id);
  const clock = new Clock(config.clock, clockClient, runId);
  router.register('PUT', config.clock.http.rate_path, (request) => clock.handleRateRequest(request));

  const store = new CoverageStore(
    config.coverage_store,
    transport.connect(config.coverage_store.id, config.coverage_store.id),
    runId,
    router,
  );
  const generator = new EnvGenerator(
    config.env_generator,
    transport.connect(config.env_generator.id, config.env_generator.id),
    store,
    runId,
    options.rootSeed,
  );

  // The world-sampler port: the sensors' one line to the truth (Constitution VI).
  const secondsPerTick = config.clock.tick_interval_us / 1e6;
  const worldSampler: WorldSampler = {
    temperatureAt: (lon, lat, depth, tick) => temperatureAt(generator.world, lon, lat, depth, tick * secondsPerTick),
    salinityAt: (lon, lat, depth, tick) => salinityAt(generator.world, lon, lat, depth, tick * secondsPerTick),
  };
  const sensors = new Sensors(
    config.sensors,
    transport.connect(config.sensors.id, config.sensors.id),
    worldSampler,
    runId,
    options.rootSeed,
    secondsPerTick,
  );
  const observationStore = new ObservationStore(
    config.observation_store,
    transport.connect(config.observation_store.id, config.observation_store.id),
    runId,
  );
  const ingest = new Ingest(
    config.ingest,
    transport.connect(config.ingest.id, config.ingest.id),
    observationStore,
    validator,
    runId,
  );
  const featureStore = new FeatureStore(
    config.feature_store,
    transport.connect(config.feature_store.id, config.feature_store.id),
    runId,
  );
  const query = new QueryComponent(
    config.query,
    transport.connect(config.query.id, config.query.id),
    store,
    observationStore,
    router,
    runId,
  );
  const monitor = new Monitor(config.monitor, transport.connect(config.monitor.id, config.monitor.id), store, runId);
  const scheduler = new Scheduler(config.scheduler, transport.connect(config.scheduler.id, config.scheduler.id), runId);
  const modelRunner = new ModelRunner(
    config.model_runner,
    transport.connect(config.model_runner.id, config.model_runner.id),
    store,
    runId,
    options.rootSeed,
  );
  const planner = new Planner(
    config.planner,
    transport.connect(config.planner.id, config.planner.id),
    store,
    featureStore,
    runId,
    options.rootSeed,
    secondsPerTick,
    Number(parseEpochMicros(config.clock.epoch) / 1_000_000n),
  );

  // Each component's heartbeat carries the simulation time that component last
  // heard over the seam; only the clock's carries the time it is the source of.
  const trackSimTime = (client: ReturnType<SeamTransport['connect']>) => {
    const cache = { value: '', tick: null as number | null };
    client.subscribe(config.clock.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      cache.value = sample.sim_time;
      cache.tick = sample.tick;
    });
    return cache;
  };

  const brokerClient = transport.connect(config.broker.id, config.broker.id);
  const brokerTime = trackSimTime(brokerClient);
  const boundaryTime = trackSimTime(boundaryClient);

  const heartbeats: HeartbeatEmitter[] = [
    new HeartbeatEmitter(
      config.clock.id,
      config.clock.heartbeat,
      clockClient,
      () => ({ sim_time: clock.simTime(), tick: clock.currentTick(), status: 'ok' }),
      runId,
      configDigest(config.clock),
    ),
    new HeartbeatEmitter(
      config.broker.id,
      config.broker.heartbeat,
      brokerClient,
      () => ({ sim_time: brokerTime.value, tick: brokerTime.tick, status: 'ok' }),
      runId,
      configDigest(config.broker),
    ),
    new HeartbeatEmitter(
      config.boundary.id,
      config.boundary.heartbeat,
      boundaryClient,
      () => ({
        sim_time: boundaryTime.value,
        tick: boundaryTime.tick,
        status: 'ok',
        detail: `${gate.denials} denied by default-deny`,
      }),
      runId,
      configDigest(config.boundary),
    ),
  ];

  // The generator and every consumer subscribe before the clock starts, so the
  // clock's first sample — the moment simulation time exists — triggers
  // provisioning through the store's own publication seam (FR-11) and reaches the
  // whole loop in one deterministic order.
  generator.start();
  ingest.start();
  sensors.start();
  monitor.start();
  scheduler.start();
  modelRunner.start();
  planner.start();
  store.heartbeat.start();
  observationStore.heartbeat.start();
  featureStore.heartbeat.start();
  query.start();
  clock.start();
  for (const heartbeat of heartbeats) heartbeat.start();

  return {
    transport,
    httpBackend: gate,
    manifest,
    runId,
    clock,
    store,
    observationStore,
    featureStore,
    ingest,
    monitor,
    scheduler,
    planner,
    stop(): void {
      for (const heartbeat of heartbeats) heartbeat.stop();
      generator.stop();
      sensors.stop();
      ingest.stop();
      monitor.stop();
      scheduler.stop();
      modelRunner.stop();
      planner.stop();
      store.heartbeat.stop();
      observationStore.heartbeat.stop();
      featureStore.heartbeat.stop();
      query.stop();
      clock.stop();
    },
  };
}
