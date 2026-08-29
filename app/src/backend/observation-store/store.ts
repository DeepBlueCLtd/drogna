/**
 * The observation store (V2-C06): in-memory point observations behind a store
 * interface, ordered on phenomenon time, keyed by the deterministic observation_id —
 * which is what makes redelivery under at-least-once a no-op rather than a duplicate
 * row (observation.schema.json). Written only by the ingestion seam; read by the
 * query components of feature 104.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigObservationStore, Observation } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';

export class ObservationStore {
  private readonly byId = new Map<string, Observation>();
  readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };

  constructor(config: ConfigObservationStore, client: SeamClient, runId: string) {
    client.subscribe(config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.byId.size} observation(s)`,
      }),
      runId,
      configDigest(config),
    );
  }

  /** Returns false when the id was already present (a redelivery, absorbed). */
  put(observation: Observation): boolean {
    if (this.byId.has(observation.observation_id)) return false;
    this.byId.set(observation.observation_id, observation);
    return true;
  }

  count(): number {
    return this.byId.size;
  }

  /** All observations ordered by phenomenon time, then id for a total order. */
  all(): Observation[] {
    return [...this.byId.values()].sort((a, b) =>
      a.sim_time === b.sim_time
        ? a.observation_id.localeCompare(b.observation_id)
        : a.sim_time.localeCompare(b.sim_time),
    );
  }

  byDatastream(thingId: string, datastreamId: string): Observation[] {
    return this.all().filter(
      (observation) => observation.thing_id === thingId && observation.datastream_id === datastreamId,
    );
  }

  /** The SensorThings entity sets, as functions of the traffic (context is idempotent). */
  things(): Map<string, Observation['context']['thing'] & { thing_id: string }> {
    const result = new Map<string, Observation['context']['thing'] & { thing_id: string }>();
    for (const observation of this.byId.values()) {
      result.set(observation.thing_id, { thing_id: observation.thing_id, ...observation.context.thing });
    }
    return result;
  }

  datastreams(): Map<string, Observation> {
    const result = new Map<string, Observation>();
    for (const observation of this.all()) {
      const key = `${observation.thing_id}/${observation.datastream_id}`;
      if (!result.has(key)) result.set(key, observation);
    }
    return result;
  }
}
