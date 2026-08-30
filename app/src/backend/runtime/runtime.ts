/**
 * The backend runtime: constructs the in-browser components from the run
 * configuration document, wires them over the seam, and provisions the run
 * (SRD-v2 FR-11: through the components' own code paths, never by poking a store).
 *
 * Construction order is part of the behaviour: broker first (everything else holds
 * a client), then the boundary and routes, then the clock — whose first published
 * sample is the moment simulation time exists; heartbeats start after it so no
 * component ever claims a time it has not heard.
 *
 * The control registry (FR-36) is what makes stop/start/restart genuine: stopping
 * a component disconnects its client — subscriptions die, publishes are refused —
 * and starting builds a fresh instance from configuration through the same factory
 * that built the first one. A restarted component re-subscribes at the end of the
 * delivery order, which is one reason commands are ephemeral and outside AT-04's
 * replay claim.
 *
 * Every component's configuration document is validated against its master before
 * that component does any other work (Constitution IV).
 */
import type { SeamHttpBackend } from '../../seam/http.js';
import type { SeamClient, SeamTransport } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';
import type { ConfigRun, RunManifest } from '../../generated/types.js';
import { Broker } from '../broker/broker.js';
import { createInBrowserTransport } from '../broker/transport-adapter.js';
import { Clock } from '../clock/clock.js';
import { CoverageStore } from '../coverage-store/store.js';
import { EnvGenerator } from '../env-generator/generator.js';
import { SnapshotSource } from '../snapshot/source.js';
import type { SnapshotContents } from '../snapshot/codec.js';
import { salinityAt, temperatureAt } from '../env-generator/analytic.js';
import { Platform } from '../platform/platform.js';
import { Sensors, type WorldSampler } from '../sensors/sensors.js';
import { Ingest } from '../ingest/ingest.js';
import { ObservationStore } from '../observation-store/store.js';
import { FeatureStore } from '../feature-store/store.js';
import { AdvisorySource } from '../advisories/source.js';
import { AdvisoryStore } from '../advisories/store.js';
import { OffloadPackager } from '../offload/packager.js';
import { QueryComponent } from '../query/query.js';
import { Monitor } from '../monitor/monitor.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { Analyst } from '../analyst/analyst.js';
import { ModelRunner } from '../model-runner/runner.js';
import { Planner } from '../planner/planner.js';
import { Telemetry } from '../telemetry/telemetry.js';
import { OperatorSurface, type ComponentControl } from '../operator/operator.js';
import { ReleaseGate } from '../boundary/gate.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { configDigest } from '../lib/sha256.js';
import { parseEpochMicros } from '../lib/sim-time.js';
import { Router } from './router.js';
import { buildRunManifest, deriveRunId } from './manifest.js';

export interface BackendRuntime {
  readonly transport: SeamTransport;
  /**
   * The broker itself, for the one thing only it knows: how many deliveries threw.
   * A component that answers a command by throwing publishes nothing, exactly as a
   * component that declined by rule publishes nothing — and a test that cannot tell
   * those apart passes against machinery that is falling over quietly.
   */
  readonly broker: Broker;
  readonly httpBackend: SeamHttpBackend;
  readonly manifest: RunManifest;
  readonly runId: string;
  readonly clock: Clock;
  readonly store: CoverageStore;
  readonly snapshotSource: SnapshotSource;
  readonly observationStore: ObservationStore;
  readonly featureStore: FeatureStore;
  readonly advisoryStore: AdvisoryStore;
  readonly offload: OffloadPackager;
  readonly ingest: Ingest;
  readonly platform: Platform;
  readonly sensors: Sensors;
  readonly monitor: Monitor;
  readonly scheduler: Scheduler;
  readonly planner: Planner;
  readonly telemetry: Telemetry;
  readonly control: ComponentControl;
  stop(): void;
}

export interface BuildOptions {
  readonly rootSeed: number;
  /**
   * Which start condition the visit chose (config.start-conditions.schema.json). It
   * reaches the manifest and the run id and nothing else here: the condition's effect
   * on the run is a patched configuration document and a pre-roll driven through the
   * operator plane, both of which happen at the composition root before and after this
   * function. A runtime that knew about conditions would be a second place they are
   * applied.
   */
  readonly startCondition: string;
  /**
   * The condition's committed seed-data artefact, already fetched and decoded, or
   * undefined where it declares none (ADR-0041). Decoded outside because fetching is
   * the composition root's business and this function is synchronous — and stays
   * synchronous, because the construction order is the behaviour and an await in the
   * middle of it would put the host's scheduler between two components.
   */
  readonly snapshot?: SnapshotContents;
  /** Why there is none, where one was expected. Reported by the source, never hidden. */
  readonly snapshotUnavailable?: string;
  readonly revision: string;
  readonly dirty: boolean;
}

function validated(validator: SeamValidator, schemaKey: string, document: unknown): void {
  const verdict = validator.validate(schemaKey, document);
  if (!verdict.ok) {
    throw new Error(`configuration refused by its master:\n${verdict.refusals.join('\n')}`);
  }
}

interface Restartable {
  start(): void;
  stop(): void;
}

interface ControlBox {
  component: Restartable;
  client: SeamClient;
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
  validated(validator, 'config.platform', config.platform);
  validated(validator, 'config.sensors', config.sensors);
  validated(validator, 'config.ingest', config.ingest);
  validated(validator, 'config.observation-store', config.observation_store);
  validated(validator, 'config.feature-store', config.feature_store);
  validated(validator, 'config.query', config.query);
  validated(validator, 'config.monitor', config.monitor);
  validated(validator, 'config.scheduler', config.scheduler);
  validated(validator, 'config.model-runner', config.model_runner);
  validated(validator, 'config.planner', config.planner);
  validated(validator, 'config.telemetry', config.telemetry);
  validated(validator, 'config.operator', config.operator);
  validated(validator, 'config.advisory-source', config.advisory_source);
  validated(validator, 'config.advisory-store', config.advisory_store);
  validated(validator, 'config.offload', config.offload);
  validated(validator, 'config.shell', config.shell);
  validated(validator, 'config.snapshot-source', config.snapshot_source);
  if (options.snapshot) validated(validator, 'snapshot', options.snapshot.header);

  const runId = deriveRunId(config.scenario, options.startCondition, options.rootSeed);
  const manifest = buildRunManifest(config, options.startCondition, options.rootSeed, options.revision, options.dirty, [
    config.env_generator.stream,
    config.platform.stream,
    config.sensors.stream,
    config.model_runner.stream,
    config.planner.stream,
    config.advisory_source.stream,
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

  const secondsPerTick = config.clock.tick_interval_us / 1e6;
  const epochPosixSeconds = Number(parseEpochMicros(config.clock.epoch) / 1_000_000n);

  // ---- the control registry: factories build, stop disconnects, start rebuilds --

  const boxes = new Map<string, { running: boolean; box: ControlBox; make: () => ControlBox }>();
  const register = (id: string, make: () => ControlBox): ControlBox => {
    const box = make();
    boxes.set(id, { running: false, box, make });
    return box;
  };
  const control: ComponentControl = {
    ids: () => [...boxes.keys()],
    isRunning: (id) => boxes.get(id)?.running ?? false,
    stop(id) {
      const entry = boxes.get(id);
      if (!entry || !entry.running) return;
      entry.box.component.stop();
      entry.box.client.disconnect();
      entry.running = false;
    },
    start(id) {
      const entry = boxes.get(id);
      if (!entry || entry.running) return;
      entry.box = entry.make();
      entry.box.component.start();
      entry.running = true;
    },
    stepClock: () => clock.step(),
  };

  // Registered before the generator, so on the clock's first sample the artefact's
  // holdings are in the store before the generator decides what is left to author —
  // which is what lets a snapshotted run skip a second archive and a duplicate now-cast
  // rather than publish them and throw them away (`env-generator/generator.ts`).
  const snapshotBox = register(config.snapshot_source.id, () => {
    const client = transport.connect(config.snapshot_source.id, config.snapshot_source.id);
    return {
      component: new SnapshotSource(
        config.snapshot_source,
        client,
        store,
        {
          runId,
          rootSeed: options.rootSeed,
          startCondition: options.startCondition,
          generatorDigest: configDigest(config.env_generator),
        },
        options.snapshot,
        options.snapshotUnavailable,
      ),
      client,
    };
  });

  const generatorBox = register(config.env_generator.id, () => {
    const client = transport.connect(config.env_generator.id, config.env_generator.id);
    return { component: new EnvGenerator(config.env_generator, client, store, runId, options.rootSeed), client };
  });
  const generator = generatorBox.component as EnvGenerator;

  // The world-sampler port: the sensors' one line to the truth (Constitution VI).
  const worldSampler: WorldSampler = {
    temperatureAt: (lon, lat, depth, tick) => temperatureAt(generator.world, lon, lat, depth, tick * secondsPerTick),
    salinityAt: (lon, lat, depth, tick) => salinityAt(generator.world, lon, lat, depth, tick * secondsPerTick),
  };
  // Registration order IS subscription order, and the platform must be subscribed
  // before the sensors: the sensors sample where ownship last reported, so a platform
  // that joined after them would leave them silent for a whole sampling interval
  // rather than a tick. Recorded here rather than left to module import order.
  const platformBox = register(config.platform.id, () => {
    const client = transport.connect(config.platform.id, config.platform.id);
    return {
      component: new Platform(config.platform, client, runId, options.rootSeed, secondsPerTick),
      client,
    };
  });
  const sensorsBox = register(config.sensors.id, () => {
    const client = transport.connect(config.sensors.id, config.sensors.id);
    return {
      component: new Sensors(config.sensors, client, worldSampler, runId, options.rootSeed),
      client,
    };
  });

  const observationStore = new ObservationStore(
    config.observation_store,
    transport.connect(config.observation_store.id, config.observation_store.id),
    runId,
  );
  const ingestBox = register(config.ingest.id, () => {
    const client = transport.connect(config.ingest.id, config.ingest.id);
    return {
      component: new Ingest(config.ingest, client, observationStore, validator, runId, config.platform.limits),
      client,
    };
  });
  const featureStore = new FeatureStore(
    config.feature_store,
    transport.connect(config.feature_store.id, config.feature_store.id),
    runId,
  );
  // The advisory store is a store: written only through its own ingestion seam,
  // protected from the operator plane like the others, read by the query face.
  const advisoryStore = new AdvisoryStore(
    config.advisory_store,
    transport.connect(config.advisory_store.id, config.advisory_store.id),
    validator,
    runId,
  );
  const query = new QueryComponent(
    config.query,
    transport.connect(config.query.id, config.query.id),
    store,
    observationStore,
    advisoryStore,
    featureStore,
    router,
    runId,
  );
  const monitorBox = register(config.monitor.id, () => {
    const client = transport.connect(config.monitor.id, config.monitor.id);
    return { component: new Monitor(config.monitor, client, store, runId), client };
  });
  const schedulerBox = register(config.scheduler.id, () => {
    const client = transport.connect(config.scheduler.id, config.scheduler.id);
    return { component: new Scheduler(config.scheduler, client, runId), client };
  });
  // The analyst stands between the request and the run (feature 116): the scheduler
  // asks, the analyst corrects the field by what was measured and announces, and the
  // runner forecasts from what the announcement names.
  register(config.analyst.id, () => {
    const client = transport.connect(config.analyst.id, config.analyst.id);
    return {
      component: new Analyst(config.analyst, client, store, config.sensors, config.model_runner, runId),
      client,
    };
  });
  register(config.model_runner.id, () => {
    const client = transport.connect(config.model_runner.id, config.model_runner.id);
    return { component: new ModelRunner(config.model_runner, client, store, runId, options.rootSeed), client };
  });
  const plannerBox = register(config.planner.id, () => {
    const client = transport.connect(config.planner.id, config.planner.id);
    return {
      component: new Planner(
        config.planner,
        config.analyst,
        config.sensors,
        client,
        store,
        featureStore,
        runId,
        options.rootSeed,
        secondsPerTick,
        epochPosixSeconds,
      ),
      client,
    };
  });
  register(config.advisory_source.id, () => {
    const client = transport.connect(config.advisory_source.id, config.advisory_source.id);
    return {
      component: new AdvisorySource(config.advisory_source, client, featureStore, generator, runId, options.rootSeed),
      client,
    };
  });
  const offloadBox = register(config.offload.id, () => {
    const client = transport.connect(config.offload.id, config.offload.id);
    return {
      component: new OffloadPackager(config.offload, client, store, observationStore, manifest, runId, secondsPerTick),
      client,
    };
  });
  const telemetry = new Telemetry(
    config.telemetry,
    transport.connect(config.telemetry.id, config.telemetry.id),
    store,
    runId,
    secondsPerTick,
    router,
  );
  const operator = new OperatorSurface(
    config.operator,
    transport.connect(config.operator.id, config.operator.id),
    control,
    runId,
    router,
  );

  // Each component's heartbeat carries the simulation time that component last
  // heard over the seam; only the clock's carries the time it is the source of.
  const trackSimTime = (client: SeamClient) => {
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
        figures: [
          { key: 'allowed', value: gate.allowed, label: 'allowed' },
          { key: 'denied', value: gate.denials, label: 'denied' },
        ],
      }),
      runId,
      configDigest(config.boundary),
    ),
  ];

  // The generator and every consumer subscribe before the clock starts, so the
  // clock's first sample — the moment simulation time exists — triggers
  // provisioning through the store's own publication seam (FR-11) and reaches the
  // whole loop in one deterministic order. Registration order above IS the
  // subscription order.
  for (const entry of boxes.values()) {
    entry.box.component.start();
    entry.running = true;
  }
  telemetry.start();
  operator.start();
  store.heartbeat.start();
  observationStore.heartbeat.start();
  featureStore.heartbeat.start();
  advisoryStore.heartbeat.start();
  query.start();
  clock.start();
  for (const heartbeat of heartbeats) heartbeat.start();

  return {
    transport,
    broker,
    httpBackend: gate,
    manifest,
    runId,
    clock,
    store,
    snapshotSource: snapshotBox.component as SnapshotSource,
    observationStore,
    featureStore,
    advisoryStore,
    offload: offloadBox.component as OffloadPackager,
    ingest: ingestBox.component as Ingest,
    platform: platformBox.component as Platform,
    sensors: sensorsBox.component as Sensors,
    monitor: monitorBox.component as Monitor,
    scheduler: schedulerBox.component as Scheduler,
    planner: plannerBox.component as Planner,
    telemetry,
    control,
    stop(): void {
      for (const heartbeat of heartbeats) heartbeat.stop();
      for (const entry of boxes.values()) {
        if (entry.running) {
          entry.box.component.stop();
          entry.running = false;
        }
      }
      telemetry.stop();
      operator.stop();
      store.heartbeat.stop();
      observationStore.heartbeat.stop();
      featureStore.heartbeat.stop();
      advisoryStore.heartbeat.stop();
      query.stop();
      clock.stop();
    },
  };
}
