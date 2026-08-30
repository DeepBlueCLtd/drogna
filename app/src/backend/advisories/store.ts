/**
 * The advisory store (V2-C17, SRD-v2 FR-37, FR-12): append-only, written only
 * through its own ingestion seam — the subscription below. Every advisory is
 * validated against its master; the size ceiling is enforced with a refusal that
 * names the limit; redelivery is absorbed on the deterministic id; and nothing is
 * ever updated or removed — appends are the only verb this store has.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';
import type { Advisory, ConfigAdvisoryStore } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';

export class AdvisoryStore {
  private readonly byId = new Map<string, Advisory>();
  readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };
  refused = 0;
  absorbed = 0;
  /** Recent refusals, each naming the fault or the limit; bounded. */
  readonly recentRefusals: string[] = [];

  constructor(
    private readonly config: ConfigAdvisoryStore,
    client: SeamClient,
    private readonly validator: SeamValidator,
    runId: string,
  ) {
    client.subscribe(config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    client.subscribe(config.topics.advisory, (message) => this.ingest(message.payload));
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.byId.size} advisory(ies), append-only; ${this.refused} refused`,
        figures: [
          { key: 'advisories', value: this.byId.size, label: 'advisories' },
          { key: 'refused', value: this.refused, label: 'refused' },
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  private ingest(payload: unknown): void {
    const wireBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    if (wireBytes > this.config.size_ceiling_bytes) {
      this.refused += 1;
      this.refuse(
        `advisory of ${wireBytes} bytes refused: the size ceiling is ${this.config.size_ceiling_bytes} bytes — advice travels light`,
      );
      return;
    }
    const verdict = this.validator.validate('advisory', payload);
    if (!verdict.ok) {
      this.refused += 1;
      this.refuse(verdict.refusals[0]);
      return;
    }
    const advisory = payload as Advisory;
    if (this.byId.has(advisory.advisory_id)) {
      this.absorbed += 1;
      return;
    }
    this.byId.set(advisory.advisory_id, advisory);
  }

  private refuse(reason: string): void {
    this.recentRefusals.push(reason);
    if (this.recentRefusals.length > 20) this.recentRefusals.shift();
  }

  count(): number {
    return this.byId.size;
  }

  /** All advisories in sequence order. There is no other read shape, and no write. */
  all(): Advisory[] {
    return [...this.byId.values()].sort((a, b) => a.sequence - b.sequence);
  }
}
