/**
 * The coverage store (V2-C08): gridded holdings across five eras behind a store
 * interface, in memory today, an engine in V3 (Constitution VI).
 *
 * The store semantics that carried from V1 (SRD-v2 FR-12, FR-13):
 *  - one writer, through the staged-publication seam below — there is no other way in;
 *  - publication verifies integrity: the descriptor records a digest of the bytes it
 *    names, and a staged holding whose bytes do not match is refused with the
 *    mismatch named, the current holdings untouched;
 *  - publication is atomic: a reader sees the previous state or the whole new
 *    holding, never a partial field;
 *  - each publication is announced on the store's declared topic — consumers
 *    subscribe, nothing polls.
 *
 * Byte format `drogna-f32-v1`: each variable's float32 values in the manifest's
 * variable order, C order [time][depth][latitude][longitude], little-endian,
 * concatenated.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamHttpResponse } from '../../seam/http.js';
import type { ConfigCoverageStore, CoverageHolding } from '../../generated/types.js';
import { sha256Hex } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { configDigest } from '../lib/sha256.js';
import type { Router } from '../runtime/router.js';

export interface StagedHolding {
  readonly descriptor: CoverageHolding;
  readonly bytes: Uint8Array;
}

export interface PublicationVerdict {
  readonly published: boolean;
  /** When refused, names the mismatch. */
  readonly refusal?: string;
}

export class CoverageStore {
  private readonly holdingsById = new Map<string, { descriptor: CoverageHolding; bytes: Uint8Array }>();

  /** Bytes the store is actually holding, summed over the holdings it has. */
  totalBytes(): number {
    let total = 0;
    for (const holding of this.holdingsById.values()) total += holding.bytes.byteLength;
    return total;
  }

  /** Each holding's size, newest first: the stack the Operator's face draws. */
  holdingSizes(): { id: string; bytes: number }[] {
    return [...this.holdingsById.values()]
      .map((holding) => ({ id: holding.descriptor.holding_id, bytes: holding.bytes.byteLength }))
      .reverse();
  }
  /** The era pointers: 'nowcast' names the one current now-cast holding. */
  private readonly eraPointers = new Map<string, string>();
  readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };

  constructor(
    private readonly config: ConfigCoverageStore,
    private readonly client: SeamClient,
    runId: string,
    router: Router,
  ) {
    client.subscribe(config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    router.register('GET', config.http.holdings_path, () => this.handleInventoryRequest());
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.holdingsById.size} holding(s)`,
        figures: [
          { key: 'holdings', value: this.holdingsById.size, label: 'holdings' },
          { key: 'bytes', value: this.totalBytes(), unit: 'B', label: 'stored' },
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  /**
   * The one write path. The digest check is the whole point: what was staged is
   * hashed again here, against what the descriptor claims, and a mismatch is a
   * refusal that names both digests — the pointer untouched (FR-13).
   */
  publish(staged: StagedHolding): PublicationVerdict {
    const measured = `sha256:${sha256Hex(staged.bytes)}`;
    const recorded = staged.descriptor.field.sha256;
    if (measured !== recorded) {
      return {
        published: false,
        refusal: `staged field does not match the digest its descriptor records: descriptor says ${recorded}, the bytes are ${measured}; holding refused, pointer untouched`,
      };
    }
    if (staged.bytes.byteLength !== staged.descriptor.field.byte_length) {
      return {
        published: false,
        refusal: `staged field is ${staged.bytes.byteLength} bytes where its descriptor records ${staged.descriptor.field.byte_length}; holding refused, pointer untouched`,
      };
    }
    const descriptor = staged.descriptor;
    // Atomic by construction: the Map entry and era pointer land in one synchronous
    // step; no reader interleaves (ADR-0030's scheduling model).
    this.holdingsById.set(descriptor.holding_id, { descriptor, bytes: staged.bytes });
    if (descriptor.era === 'nowcast') {
      const previous = this.eraPointers.get('nowcast');
      if (previous !== undefined && previous !== descriptor.holding_id) this.holdingsById.delete(previous);
      this.eraPointers.set('nowcast', descriptor.holding_id);
    }
    if (descriptor.era === 'departure') {
      // Authored once at provisioning and never replaced (feature 120). The pointer
      // exists so a reader can ask for the brief by era, as it asks for the now-cast.
      this.eraPointers.set('departure', descriptor.holding_id);
    }
    if (descriptor.era === 'instance') {
      // Instances accumulate as holdings (FR-30); the pointer names the current one.
      this.eraPointers.set('instance', descriptor.holding_id);
    }
    this.client.publish(this.config.topics.published, {
      component: this.config.id,
      holding_id: descriptor.holding_id,
      era: descriptor.era,
      run_id: descriptor.run_id,
      sim_time: descriptor.published_at.sim_time,
      tick: descriptor.published_at.tick,
      field_sha256: descriptor.field.sha256,
    });
    return { published: true };
  }

  holdings(): CoverageHolding[] {
    return [...this.holdingsById.values()].map((entry) => entry.descriptor);
  }

  holding(holdingId: string): { descriptor: CoverageHolding; bytes: Uint8Array } | undefined {
    return this.holdingsById.get(holdingId);
  }

  currentNowcast(): { descriptor: CoverageHolding; bytes: Uint8Array } | undefined {
    const id = this.eraPointers.get('nowcast');
    return id === undefined ? undefined : this.holdingsById.get(id);
  }

  /**
   * The departure forecast: the brief the vessel sailed with, held constant across its
   * validity window and never refreshed (feature 120).
   *
   * Truth-derived, like the now-cast, and so guarded like it: the truth-initialisation
   * gate names this accessor beside `currentNowcast()`. A forecast initialised from a
   * field the generator evaluated is the leak that gate exists to stop, and a second
   * truth-derived accessor is a second easiest field to reach for.
   */
  departureHolding(): { descriptor: CoverageHolding; bytes: Uint8Array } | undefined {
    const id = this.eraPointers.get('departure');
    return id === undefined ? undefined : this.holdingsById.get(id);
  }

  /** The current forecast instance — what the monitor scores against. */
  currentInstance(): { descriptor: CoverageHolding; bytes: Uint8Array } | undefined {
    const id = this.eraPointers.get('instance');
    return id === undefined ? undefined : this.holdingsById.get(id);
  }

  private handleInventoryRequest(): SeamHttpResponse {
    return {
      status: 200,
      body: JSON.stringify({ schema_version: 1, holdings: this.holdings() }),
    };
  }
}
