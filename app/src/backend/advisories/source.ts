/**
 * The shore advisory source (V2-C16, SRD-v2 FR-37): authors advisories
 * deterministically from its seed stream and simulation time on a configured
 * cadence, cycling the master's closed kinds, guidance derived from the background
 * sound speed plus seeded jitter. Nothing here can name anything: the master
 * admits no free text, and a test over the master holds that property.
 *
 * It can also be prompted from the operator plane to author now (FR-65). Prompted or
 * on cadence, the advisory is the same deterministic next one in the sequence: the
 * prompt moves when the next one is written, never what it says, so a prompted run and
 * an unprompted one differ in timing and in nothing else.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { Advisory, ConfigAdvisorySource, OperatorCommand } from '../../generated/types.js';
import { Rng } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { isoPlusSeconds } from '../lib/sim-time.js';
import { backgroundTemperature, backgroundSalinity } from '../env-generator/analytic.js';
import { soundSpeedMs } from '../../seam/ocean-relations.js';
import type { EnvGenerator } from '../env-generator/generator.js';
import type { FeatureStore } from '../feature-store/store.js';

const KINDS: Advisory['kind'][] = ['sound-speed-outlook', 'sampling-window', 'caution-region'];

export class AdvisorySource {
  private readonly rng: Rng;
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private sequence = 0;
  /** How many of them were authored because a reader asked, rather than on cadence. */
  private prompted = 0;

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
        detail: `${this.sequence} advisory(ies) authored, every ${this.config.cadence_ticks} tick(s)${
          this.prompted === 0 ? '' : `, ${this.prompted} of them on an operator prompt`
        }`,
        figures: [
          { key: 'authored', value: this.sequence, label: 'authored' },
          { key: 'cadence_ticks', value: this.config.cadence_ticks, unit: 'ticks', label: 'cadence' },
          { key: 'prompted', value: this.prompted, label: 'prompted' },
        ],
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
    this.client.subscribe(this.config.topics.command, (message) => {
      const command = message.payload as OperatorCommand;
      if (command.target !== this.config.id || command.kind !== 'event') return;
      if (command.event !== this.config.prompt_event) return;
      // Nothing is authored before simulation time exists: an advisory dated at the
      // empty instant would be a record of a moment that has not happened. No test
      // reaches this in the assembled runtime, and that is a fact about the assembly
      // rather than about the rule — the clock's first sample is published while the
      // runtime is being built, so every component has heard an instant before any
      // command can be dispatched. Kept for the assembly that does not do that.
      if (this.simTime.value === '') return;
      this.prompted += 1;
      this.author();
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
        end_sim_time: isoPlusSeconds(this.simTime.value, validSeconds),
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


function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
