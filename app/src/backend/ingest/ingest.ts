/**
 * The ingestion seam (V2-C05): the observation store's sole writer. Subscribes to
 * the observation namespace, validates every message against its master, refuses
 * what fails with the fault named and the count observable, and absorbs redelivery
 * (SRD-v2 FR-22; ADR-0014's carried stance: quality flagging IS the ingestion seam).
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';
import type { ConfigIngest, Observation } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import type { ObservationStore } from '../observation-store/store.js';

export class Ingest {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };
  stored = 0;
  refused = 0;
  absorbed = 0;
  /** The most recent refusals, each naming the fault; bounded so it cannot grow. */
  readonly recentRefusals: string[] = [];

  constructor(
    private readonly config: ConfigIngest,
    private readonly client: SeamClient,
    private readonly store: ObservationStore,
    private readonly validator: SeamValidator,
    runId: string,
  ) {
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.stored} stored, ${this.refused} refused by their schema, ${this.absorbed} redeliveries absorbed`,
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
      if (this.store.put(message.payload as Observation)) {
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
}
