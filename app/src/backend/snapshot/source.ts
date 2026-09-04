/**
 * The snapshot source (V2-C22, feature 120, ADR-0041): republishes a committed
 * seed-data artefact into the coverage store, on the clock, through the store's one
 * write path.
 *
 * Why this is a component and not a loader in the composition root is the whole of the
 * decision the constitution was amended for. The holdings in an artefact were authored
 * by the environment generator and the loop at build time, from the same configuration
 * and the same declared seed, and a gate regenerates them and fails on any difference —
 * so what they contain is provably what a live run would have produced. What was still
 * needed was for them to *arrive* the way a live publication arrives: staged, digest-
 * checked against the descriptor, landing atomically, announced on the store's topic,
 * from something that subscribes to the clock and can be stopped. A `store.publish` call
 * in `main.tsx` would have got the bytes in; it would not have got any of that, and it
 * would have put the one thing FR-11 exists to prevent — a write into a store from
 * outside a component — into the one module that imports both halves of the seam.
 *
 * It is also, being a component, *visible*. The Operator tab draws it, its heartbeat says
 * how many holdings it has replayed and how many are still to come, and a reader who
 * wants to know where the ocean came from can look rather than take somebody's word.
 * Where a condition declares no artefact it runs anyway and says so: a node missing from
 * the picture reads as a beat that has not landed, and "the ocean was authored live here"
 * is information.
 *
 * The refusals are at construction, before the clock is subscribed to, because every one
 * of them means the artefact describes a different run than the one about to open. A
 * page that published a stale ocean and then sampled the current one would produce
 * residuals that are an artefact of the mismatch and a monitor that reports drift that
 * is not there — which is exactly the class of silent wrongness the digest check exists
 * for, one level up.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigSnapshotSource, Snapshot } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import type { CoverageStore, StagedHolding } from '../coverage-store/store.js';
import type { SnapshotContents } from './codec.js';

/** What the run this source is joining says about itself, for the refusals below. */
export interface SnapshotExpectation {
  readonly runId: string;
  readonly rootSeed: number;
  readonly startCondition: string;
  /** Digest of the environment generator's configuration, as this run read it. */
  readonly generatorDigest: string;
}

export class SnapshotSource {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };
  private readonly pending: StagedHolding[];
  private readonly total: number;
  private published = 0;
  /**
   * Holdings the store declined to write because it already held something newer for that
   * era. Counted apart from both of the others, because it is neither: the bytes were
   * accounted for, so it is not a refusal, and nothing was written, so it is not a replay.
   * It is reached on a restart — the source republishes an artefact whose instants the
   * running loop has since passed — and on that path it is the ordinary outcome rather
   * than a fault.
   */
  private superseded = 0;
  /** Refusals from the store, kept and reported: a snapshot may not fail quietly. */
  readonly refused: string[] = [];

  constructor(
    private readonly config: ConfigSnapshotSource,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    expectation: SnapshotExpectation,
    /** The decoded artefact, or undefined where the condition declares none. */
    contents: SnapshotContents | undefined,
    /**
     * Why there is no artefact, when one was expected. A missing or unreadable file is a
     * performance regression and not a correctness one — the drift gate's whole claim is
     * that the artefact only ever holds what the components would author — so the page
     * falls back to authoring live rather than refusing to open. What it may not do is
     * fall back *quietly*: a deployment that has silently lost its assets would then look
     * exactly like one that never had them, and the several seconds it costs would be
     * put down to the machine being slow.
     */
    private readonly unavailable?: string,
  ) {
    if (contents) refuseMismatch(contents.header, expectation);
    // Publication order is the order the artefact lists them in, which is the order the
    // era pointers moved in the run that produced it. Sorting by tick here would look
    // tidier and would reorder two holdings published on one tick, which is how the
    // 'current' instance ends up being the wrong one of a pair.
    this.pending = contents ? [...contents.holdings] : [];
    this.total = this.pending.length;
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: this.refused.length > 0 || this.unavailable !== undefined ? 'degraded' : 'ok',
        detail:
          this.total === 0
            ? this.unavailable === undefined
              ? 'no committed artefact for this start condition; the ocean and its forecasts were computed live'
              : `the committed artefact was expected and could not be used, so the ocean and its forecasts were computed live instead: ${this.unavailable}`
            : `${this.published} of ${this.total} holding(s) replayed from the committed artefact` +
              (this.superseded > 0
                ? `; ${this.superseded} the store already held newer holdings than`
                : '') +
              (this.refused.length > 0 ? `; ${this.refused.length} refused by the store` : ''),
        figures:
          this.total === 0
            ? []
            : [
                { key: 'replayed', value: this.published, of: this.total, label: 'replayed' },
                // Both absent until one has happened: a face may not draw a zero where
                // nothing has gone wrong (FR-58). Superseded is not a fault and does not
                // move the status, but it is the difference between the two numbers above
                // and a reader who is told only 'replayed' is left to guess at it.
                ...(this.superseded === 0
                  ? []
                  : [{ key: 'superseded', value: this.superseded, label: 'already newer' }]),
                ...(this.refused.length === 0
                  ? []
                  : [{ key: 'refused', value: this.refused.length, label: 'refused' }]),
              ],
      }),
      expectation.runId,
      configDigest(config),
    );
  }

  /** How many holdings are still to be republished. Read by the Operator's face. */
  outstanding(): number {
    return this.pending.length;
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      this.release(sample.tick);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * Publish everything whose publication instant has arrived. A holding is republished
   * at the tick its descriptor records, not at the first tick this source hears, because
   * the instant is part of the record: the Holdings timeline draws it, the monitor reads
   * a forecast's validity from it, and a run whose twenty-year archive and whose newest
   * forecast were both published at tick zero is a run whose history has been flattened.
   *
   * A holding already behind the current tick — which is every holding when a run is
   * built and the clock's first sample is tick zero — goes out at once and in order.
   */
  private release(tick: number): void {
    while (this.pending.length > 0 && this.pending[0].descriptor.published_at.tick <= tick) {
      const staged = this.pending.shift() as StagedHolding;
      const verdict = this.store.publish(staged);
      // Three outcomes, one counter each, and a switch rather than a chain ending in `else`:
      // both faults this exists to close were an `else` sweeping up a case nobody had named
      // — first a superseded publication counted as replayed, then the same one reported as a
      // store refusal with no reason to give for it. A fourth outcome would land in no case
      // here and be counted nowhere, so the compiler is asked instead.
      switch (verdict.outcome) {
        case 'written':
          this.published += 1;
          break;
        case 'superseded':
          this.superseded += 1;
          break;
        case 'refused':
          this.refused.push(`${staged.descriptor.holding_id}: ${verdict.refusal}`);
          break;
        default: {
          const unnamed: never = verdict;
          throw new Error(`the coverage store returned an outcome this source cannot count: ${JSON.stringify(unnamed)}`);
        }
      }
    }
  }
}

function refuseMismatch(header: Snapshot, expectation: SnapshotExpectation): void {
  const complaints: string[] = [];
  if (header.start_condition !== expectation.startCondition) {
    complaints.push(
      `it was built for start condition '${header.start_condition}', this run is '${expectation.startCondition}'`,
    );
  }
  if (header.root_seed !== expectation.rootSeed) {
    complaints.push(`it was built from seed ${header.root_seed}, this run is seeded ${expectation.rootSeed}`);
  }
  if (header.run_id !== expectation.runId) {
    complaints.push(`its holdings name run '${header.run_id}', this run is '${expectation.runId}'`);
  }
  if (header.config_digest !== expectation.generatorDigest) {
    complaints.push(
      `it was built under environment-generator configuration ${header.config_digest}, ` +
        `this run reads ${expectation.generatorDigest}`,
    );
  }
  if (complaints.length > 0) {
    throw new Error(
      `the committed snapshot does not describe this run and is refused rather than published: ${complaints.join('; ')}`,
    );
  }
}
