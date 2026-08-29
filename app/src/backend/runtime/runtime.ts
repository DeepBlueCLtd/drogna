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
import { ReleaseGate } from '../boundary/gate.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { configDigest } from '../lib/sha256.js';
import { Router } from './router.js';
import { buildRunManifest, deriveRunId } from './manifest.js';

export interface BackendRuntime {
  readonly transport: SeamTransport;
  readonly httpBackend: SeamHttpBackend;
  readonly manifest: RunManifest;
  readonly runId: string;
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
  validated(validator, 'config.shell', config.shell);

  const runId = deriveRunId(config.scenario, options.rootSeed);
  const manifest = buildRunManifest(config, options.rootSeed, options.revision, options.dirty, []);

  const broker = new Broker(config.broker);
  const transport = createInBrowserTransport(broker);

  const router = new Router();
  const boundaryClient = transport.connect(config.boundary.id, config.boundary.id);
  const gate = new ReleaseGate(config.boundary, boundaryClient, router);

  const clockClient = transport.connect(config.clock.id, config.clock.id);
  const clock = new Clock(config.clock, clockClient, runId);
  router.register('PUT', config.clock.http.rate_path, (request) => clock.handleRateRequest(request));

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

  clock.start();
  for (const heartbeat of heartbeats) heartbeat.start();

  return {
    transport,
    httpBackend: gate,
    manifest,
    runId,
    stop(): void {
      for (const heartbeat of heartbeats) heartbeat.stop();
      clock.stop();
    },
  };
}
