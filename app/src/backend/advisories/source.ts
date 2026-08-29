/**
 * The shore advisory source (V2-C16, SRD-v2 FR-37): authors advisories
 * deterministically from its seed stream and simulation time on a configured
 * cadence, cycling the master's closed kinds, guidance derived from the background
 * sound speed plus seeded jitter. Nothing here can name anything: the master
 * admits no free text, and a test over the master holds that property.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { Advisory, ConfigAdvisorySource } from '../../generated/types.js';
import { Rng } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { backgroundTemperature, backgroundSalinity, soundSpeedMs } from '../env-generator/analytic.js';
import type { EnvGenerator } from '../env-generator/generator.js';
import type { FeatureStore } from '../feature-store/store.js';

const KINDS: Advisory['kind'][] = ['sound-speed-outlook', 'sampling-window', 'caution-region'];

export class AdvisorySource {
  private readonly rng: Rng;
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private sequence = 0;

  constructor(
    private readonly config: ConfigAdvisorySource,
    private readonly client: SeamClient,
    private readonly featureStore: FeatureStore,
    private readonly generator: EnvGenerator,
    private readonly runId: string,
    rootSeed: number,
  ) {
    this.rng = new Rng(rootSeed, config.stream);
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.sequence} advisory(ies) authored, every ${this.config.cadence_ticks} tick(s)`,
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      if (sample.tick > 0 && sample.tick % this.config.cadence_ticks === 0) this.author();
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private author(): void {
    const feature = this.featureStore.feature(this.config.region_feature);
    if (!feature) return;
    const ring = feature.geometry.coordinates[0];
    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);
    const bbox: [number, number, number, number] = [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ];
    const kind = KINDS[this.sequence % KINDS.length];
    // Guidance from the world's own background profiles plus seeded jitter: a
    // depth window, and the sound speed expected across it.
    const topDepth = Math.round(this.rng.uniform(20, 120));
    const bottomDepth = topDepth + this.config.depth_span_m;
    const midDepth = (topDepth + bottomDepth) / 2;
    const background = this.generator.world.background;
    const centreSpeed = soundSpeedMs(
      backgroundTemperature(background, midDepth),
      backgroundSalinity(background, midDepth),
      midDepth,
    );
    const halfWidth = this.config.sound_speed_half_width_m_per_s * this.rng.uniform(0.6, 1.4);
    const validSeconds = this.config.valid_seconds;
    const advisory: Advisory = {
      advisory_id: `adv-${this.config.id}-${this.sequence}`,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      sequence: this.sequence,
      kind,
      valid_time: {
        start_sim_time: this.simTime.value,
        end_sim_time: plusSeconds(this.simTime.value, validSeconds),
      },
      region: { bbox },
      guidance: {
        confidence: (['low', 'moderate', 'high'] as const)[this.rng.int(3)],
        recommended_minimum_depth_m: topDepth,
        recommended_maximum_depth_m: bottomDepth,
        expected_sound_speed_minimum_m_per_s: round2(centreSpeed - halfWidth),
        expected_sound_speed_maximum_m_per_s: round2(centreSpeed + halfWidth),
      },
    };
    this.client.publish(this.config.topics.advisory, advisory);
    this.sequence += 1;
  }
}

function plusSeconds(iso: string, seconds: number): string {
  const millis = Date.parse(iso.slice(0, 23) + 'Z') + seconds * 1000;
  return `${new Date(millis).toISOString().slice(0, 23)}000Z`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
