/**
 * The feature store (V2-C07): read-only spatial reference, provisioned at scenario
 * start from its configuration document and immutable for the rest of the run
 * (SRD-v2 FR-12). Reference geometry only — the domain, the loiter region — never
 * anything the harness did not place. Served through the query seam at feature 104.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigFeatureStore } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';

export class FeatureStore {
  private readonly featuresById: ReadonlyMap<string, ConfigFeatureStore['features'][number]>;
  readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };

  constructor(config: ConfigFeatureStore, client: SeamClient, runId: string) {
    // Provisioned once, here; the map is never written again and the accessor
    // returns copies, so read-only is structural rather than promised.
    this.featuresById = new Map(config.features.map((feature) => [feature.feature_id, feature]));
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
        detail: `${this.featuresById.size} reference feature(s), read-only`,
        figures: [{ key: 'features', value: this.featuresById.size, label: 'features' }],
      }),
      runId,
      configDigest(config),
    );
  }

  features(): ConfigFeatureStore['features'][number][] {
    return [...this.featuresById.values()].map((feature) => JSON.parse(JSON.stringify(feature)));
  }

  feature(featureId: string): ConfigFeatureStore['features'][number] | undefined {
    const found = this.featuresById.get(featureId);
    return found === undefined ? undefined : JSON.parse(JSON.stringify(found));
  }
}
