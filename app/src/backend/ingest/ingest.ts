/**
 * The ingestion seam (V2-C05): the observation store's sole writer. Subscribes to
 * the observation namespace, validates every message against its master, refuses
 * what fails with the fault named and the count observable, and absorbs redelivery
 * (SRD-v2 FR-22; ADR-0014's carried stance: quality flagging IS the ingestion seam).
 *
 * Feature 112 gave the seam its first range rules (FR-51). The ownship datastreams
 * carry an angle, a speed and a depth, and each has bounds that are facts about the
 * platform rather than opinions: a course outside a revolution, a negative speed or a
 * depth beyond what the platform declares it can reach are impossible values, not
 * merely surprising ones. The bounds come from the platform's own configuration,
 * handed in at construction — a number typed into the ingest would be a second
 * declaration of the same limit, free to drift from the one the platform obeys.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';
import type { ConfigIngest, ConfigPlatform, Observation } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import type { ObservationStore } from '../observation-store/store.js';

export class Ingest {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };
  stored = 0;
  refused = 0;
  absorbed = 0;
  flagged = 0;
  /** Flags raised, by reason. A tally by name, because 'six flagged' is not a fault. */
  readonly flagsByReason = new Map<string, number>();
  /** The most recent refusals, each naming the fault; bounded so it cannot grow. */
  readonly recentRefusals: string[] = [];

  constructor(
    private readonly config: ConfigIngest,
    private readonly client: SeamClient,
    private readonly store: ObservationStore,
    private readonly validator: SeamValidator,
    runId: string,
    /** The platform's declared limits: the ownship ranges are read, never retyped. */
    private readonly platformLimits: ConfigPlatform['limits'],
  ) {
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.stored} stored, ${this.refused} refused by their schema, ${this.flagged} flagged out of range, ${this.absorbed} redeliveries absorbed`,
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    this.client.subscribe(this.config.topics.observations, (message) => {
      const verdict = this.validator.validate('observation', message.payload);
      if (!verdict.ok) {
        this.refused += 1;
        this.recentRefusals.push(verdict.refusals[0]);
        if (this.recentRefusals.length > 20) this.recentRefusals.shift();
        return;
      }
      const observation = message.payload as Observation;
      const outOfRange = this.rangeFault(observation);
      if (outOfRange) {
        this.flagged += 1;
        this.flagsByReason.set(outOfRange, (this.flagsByReason.get(outOfRange) ?? 0) + 1);
        this.recentRefusals.push(outOfRange);
        if (this.recentRefusals.length > 20) this.recentRefusals.shift();
        return;
      }
      if (this.store.put(observation)) {
        this.stored += 1;
      } else {
        this.absorbed += 1;
      }
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * The range rules, by observed property, naming the bound rather than reporting
   * 'invalid'. A flag a reader cannot act on is a count, not a quality signal.
   */
  private rangeFault(observation: Observation): string | undefined {
    const value = observation.result;
    switch (observation.observed_property) {
      case 'platform_course':
        return value >= 0 && value < 360
          ? undefined
          : `out-of-range: course ${value} is outside one revolution [0, 360)`;
      case 'platform_speed':
        return value >= 0 && value <= this.platformLimits.maximum_speed_m_per_s
          ? undefined
          : `out-of-range: speed ${value} m/s is outside [0, ${this.platformLimits.maximum_speed_m_per_s}], the platform's declared maximum`;
      case 'platform_depth':
        return value >= 0 && value <= this.platformLimits.maximum_depth_m
          ? undefined
          : `out-of-range: depth ${value} m is outside [0, ${this.platformLimits.maximum_depth_m}], the platform's declared maximum`;
      default:
        // The ocean properties have no range rule here, and inventing one would be
        // this component deciding what the sea may do. The generator's own manifest
        // is the authority on the field, and the monitor scores against it.
        return undefined;
    }
  }
}
