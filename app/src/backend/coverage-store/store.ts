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
import type { ConfigCoverageStore, CoverageHolding, OperatorCommand } from '../../generated/types.js';
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
  /** Holdings re-announced on an operator prompt rather than on publication (FR-65). */
  private announcementsOnRequest = 0;

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
    client.subscribe(config.topics.command, (message) => {
      const command = message.payload as OperatorCommand;
      if (command.target !== config.id) return;
      if (command.kind !== 'event' || command.event !== config.announce_event) return;
      this.announceOnRequest();
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
          // Absent until one has been asked for: 'nobody has pressed it' is not a
          // measurement of anything (FR-58).
          ...(this.announcementsOnRequest === 0
            ? []
            : [{ key: 'announced', value: this.announcementsOnRequest, label: 'announced on request' }]),
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  /**
   * Announce the current era pointers again, on an operator prompt (FR-65).
   *
   * Nothing is published and nothing changes: the announcements name holdings that are
   * already in the store, carrying the same digests over the same bytes. That is the
   * whole of what this offers, and it is the reason the button is honest — a store
   * whose prompt manufactured a holding would be a store inventing data on request.
   *
   * With nothing published there is nothing to announce, and the count stays where it
   * is rather than recording an announcement of an absence: the era pointers are what
   * this component has to say, and having nothing to say is not saying it.
   */
  private announceOnRequest(): void {
    let announced = 0;
    for (const holdingId of this.eraPointers.values()) {
      const held = this.holdingsById.get(holdingId);
      if (!held) continue;
      this.announce(held.descriptor);
      announced += 1;
    }
    if (announced > 0) this.announcementsOnRequest += announced;
  }

  /**
   * One announcement of one holding, on the store's declared topic. Written once and
   * called from both the write path and the prompt, so a re-announcement cannot become
   * a second, differently-shaped message about the same bytes.
   */
  private announce(descriptor: CoverageHolding): void {
    this.client.publish(this.config.topics.published, {
      component: this.config.id,
      holding_id: descriptor.holding_id,
      era: descriptor.era,
      run_id: descriptor.run_id,
      sim_time: descriptor.published_at.sim_time,
      tick: descriptor.published_at.tick,
      field_sha256: descriptor.field.sha256,
    });
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
    /**
     * A holding id names one set of bytes for the life of a run.
     *
     * Without this the map entry was simply overwritten, and the loss was perfectly silent:
     * both holdings are internally consistent, both digests check out against their own
     * descriptors, and the reader finds the field they were looking at replaced by a
     * different one under the same name. The digest check above cannot see it — it proves
     * the staged bytes match the descriptor that travelled with them, which a replacement
     * satisfies exactly.
     *
     * Reachable from the Operator tab with the clock stopped, and watched happening: restart
     * the scheduler at the tick a run was requested at, and a rate change republishes that
     * tick to the fresh instance, whose cadence floor fires and reissues the same
     * tick-derived identifier. Four analysis holdings were replaced with the clock never
     * moving. Deriving run identifiers from the request tick narrows that fault — it needs
     * the restart to land inside the requesting tick, where the counter it replaced collided
     * on every restart — but it does not close it, and the store is where it closes, because
     * the store is what owns the holdings.
     *
     * Re-publishing the *same* bytes stays allowed. A restatement of what is already held is
     * not a loss, and the snapshot source's whole job is to put bytes back exactly as they
     * were authored.
     */
    const standing = this.holdingsById.get(descriptor.holding_id);
    if (standing !== undefined && standing.descriptor.field.sha256 !== recorded) {
      return {
        published: false,
        refusal: `'${descriptor.holding_id}' is already held, with field ${standing.descriptor.field.sha256}; a holding id names one set of bytes for the life of a run, so this publication is refused rather than replacing it silently`,
      };
    }
    // Atomic by construction: the Map entry and era pointer land in one synchronous
    // step; no reader interleaves (ADR-0030's scheduling model).
    this.holdingsById.set(descriptor.holding_id, { descriptor, bytes: staged.bytes });
    if (descriptor.era === 'nowcast') {
      const previous = this.eraPointers.get('nowcast');
      if (previous !== undefined && previous !== descriptor.holding_id) this.holdingsById.delete(previous);
      this.eraPointers.set('nowcast', descriptor.holding_id);
    }
    if (descriptor.era === 'departure') {
      // Authored once at provisioning and never replaced (feature 121). The pointer
      // exists so a reader can ask for the brief by era, as it asks for the now-cast.
      this.eraPointers.set('departure', descriptor.holding_id);
    }
    if (descriptor.era === 'instance') {
      // Instances accumulate as holdings (FR-30); the pointer names the current one.
      this.eraPointers.set('instance', descriptor.holding_id);
    }
    this.announce(descriptor);
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
   * validity window and never refreshed (feature 121).
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
