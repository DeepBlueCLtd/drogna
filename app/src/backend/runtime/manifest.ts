/**
 * The run manifest (Constitution II, FR-10): the record from which a run can be
 * started again, of run-manifest.schema.json shape. Written at provisioning, kept
 * current by the runtime, exportable and importable through the shell — V2 persists
 * nothing between visits, so this document is the replay mechanism.
 */
import type { ConfigRun, RunManifest } from '../../generated/types.js';
import { SEED_DERIVATION } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';

/**
 * Identity of a run: the scenario, the start condition the visit chose, and the root
 * seed. The condition is in here rather than only in the manifest because two visits
 * that chose differently genuinely are different runs — a different platform position,
 * a different pre-roll, different holdings — and a run id is stamped into every
 * holding id and every observation id. Without it they would collide on the one
 * identifier everything downstream keys on.
 */
export function deriveRunId(scenario: string, startCondition: string, rootSeed: number): string {
  return `${scenario}-${startCondition}-${rootSeed.toString(36)}`;
}

export function buildRunManifest(
  config: ConfigRun,
  startCondition: string,
  rootSeed: number,
  revision: string,
  dirty: boolean,
  streams: readonly string[],
): RunManifest {
  return {
    schema_version: 1,
    run_id: deriveRunId(config.scenario, startCondition, rootSeed),
    start_condition: startCondition,
    root_seed: rootSeed,
    seed_derivation: { rule: SEED_DERIVATION.rule, version: SEED_DERIVATION.version },
    clock: {
      epoch: config.clock.epoch,
      tick_interval_us: config.clock.tick_interval_us,
      mode: config.clock.mode,
      rate: config.clock.rate,
      min_rate: config.clock.min_rate,
      max_rate: config.clock.max_rate,
    },
    code_version: { revision, dirty },
    participants: [
      { id: config.clock.id, role: 'observer', config_digest: configDigest(config.clock), registered_tick: 0 },
      { id: config.broker.id, role: 'observer', config_digest: configDigest(config.broker), registered_tick: 0 },
      { id: config.boundary.id, role: 'observer', config_digest: configDigest(config.boundary), registered_tick: 0 },
      { id: config.env_generator.id, role: 'observer', config_digest: configDigest(config.env_generator), registered_tick: 0 },
      { id: config.coverage_store.id, role: 'observer', config_digest: configDigest(config.coverage_store), registered_tick: 0 },
      { id: config.sensors.id, role: 'observer', config_digest: configDigest(config.sensors), registered_tick: 0 },
      { id: config.ingest.id, role: 'observer', config_digest: configDigest(config.ingest), registered_tick: 0 },
      { id: config.observation_store.id, role: 'observer', config_digest: configDigest(config.observation_store), registered_tick: 0 },
      { id: config.feature_store.id, role: 'observer', config_digest: configDigest(config.feature_store), registered_tick: 0 },
      { id: config.query.id, role: 'observer', config_digest: configDigest(config.query), registered_tick: 0 },
      { id: config.monitor.id, role: 'observer', config_digest: configDigest(config.monitor), registered_tick: 0 },
      { id: config.scheduler.id, role: 'observer', config_digest: configDigest(config.scheduler), registered_tick: 0 },
      { id: config.model_runner.id, role: 'observer', config_digest: configDigest(config.model_runner), registered_tick: 0 },
      { id: config.planner.id, role: 'observer', config_digest: configDigest(config.planner), registered_tick: 0 },
      { id: config.telemetry.id, role: 'observer', config_digest: configDigest(config.telemetry), registered_tick: 0 },
      { id: config.operator.id, role: 'observer', config_digest: configDigest(config.operator), registered_tick: 0 },
      { id: config.advisory_source.id, role: 'observer', config_digest: configDigest(config.advisory_source), registered_tick: 0 },
      { id: config.advisory_store.id, role: 'observer', config_digest: configDigest(config.advisory_store), registered_tick: 0 },
      { id: config.offload.id, role: 'observer', config_digest: configDigest(config.offload), registered_tick: 0 },
      { id: config.shell.id, role: 'observer', config_digest: configDigest(config.shell), registered_tick: 0 },
    ],
    streams: [...streams],
    exit_state: { state: 'running', final_tick: null },
    non_reproducible: ['/exit_state/detail'],
  };
}
