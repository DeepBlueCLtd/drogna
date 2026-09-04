/**
 * The offload packager (V2-C20, SRD-v2 FR-39): announcement-only in V2, keeping
 * the export's shape for V3. On each published run it stages the bundle — the
 * released forecast field bytes with their bundle manifest — and the run-manifest
 * SIBLING carrying the measurement geometry: the identification radius and every
 * sampled position and simulation time in the interval since the previous release,
 * beside the bundle and never inside it (E11). It then announces the staged
 * departure on its declared topic. No real transfer and no verified-receipt
 * eviction until V3: the ledger states beyond 'staged' hold zero, honestly.
 *
 * A reader may ask for a window now (FR-65). The prompt stages over the release this
 * packager last heard — it does not invent one, and with nothing released yet it says
 * so — and it is answered under exactly the rules a released run is answered under:
 * declined at the staging bound, declined where the interval holds no measurements.
 * The only thing the prompt changes is where the measurement interval ends: at the
 * current tick rather than at the release's. A bundle nobody can score is not staged,
 * prompted or not, and that decline is half the reason this control is worth having.
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  BundleManifest,
  ConfigOffload,
  OperatorCommand,
  OffloadTelemetry,
  RunManifest,
  RunManifestMeasurement,
  RunPublished,
} from '../../generated/types.js';
import { configDigest, sha256Hex } from '../lib/sha256.js';
import { standingRunFacts, type StandingRun } from '../lib/standing-run.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import type { CoverageStore } from '../coverage-store/store.js';
import type { ObservationStore } from '../observation-store/store.js';

/**
 * One staged departure. The sibling travels BESIDE the bundle: the bundle's
 * members list the field bytes only, and the geometry lives in the sibling —
 * a transfer that shipped the bundle alone would ship no measurement position.
 */
export interface StagedBundle {
  readonly manifest: BundleManifest;
  readonly sibling: RunManifest;
  readonly fieldByteLength: number;
}

export class OffloadPackager {
  private readonly heartbeat: HeartbeatEmitter;
  private readonly runManifestDigest: string;
  private readonly runReference: string;
  private readonly baseManifest: RunManifest;
  private simTime = { value: '', tick: 0 };
  private intervalStartTick = 0;
  private stagedBundles: StagedBundle[] = [];
  /** The last release heard: what a prompted window is staged over. */
  /**
   * The run a bundle has actually been staged for.
   *
   * Kept apart from `lastPublished`, which is only "the run this component has *heard* of".
   * The two diverge on the path this feature adds: through a replayed pre-roll nothing is
   * announced at all, so a bundle staged from a reader's prompt — read out of the store —
   * left `lastPublished` unset. A dedupe keyed on the announcement would then have let the
   * *next* restatement of that same run stage it a second time.
   *
   * The first attempt did key on `lastPublished` and looked right, because the test covering
   * it restarted the runner in a **live** run, where the announcement handler had set the
   * field — so the guard worked and the path that needed it was never exercised. Keyed on
   * what was actually staged, a restatement of a run already bundled is a no-op on both
   * paths: measured, restarting the runner after a replayed open leaves the count where it
   * was, on the live run and the snapshot-backed one alike.
   *
   * What this deliberately does **not** suppress is the first staging of a run this component
   * had not heard of. A replayed run learns of the standing forecast when the model runner
   * restates it, and bundling it then is the restatement doing its job — the run was released,
   * during the pre-roll the artefact stands for. `returning` ends with the live run's first
   * two windows rather than its five, which is a fidelity gap and not a phantom bundle.
   */
  private stagedForRunId: string | undefined;
  /** Windows staged because a reader asked, rather than on a release. */
  private prompted = 0;
  private stagedBytes = 0;
  private producing = true;
  /** Windows declined and why: no measurements in the interval, or the bound. */
  readonly declined: string[] = [];

  constructor(
    private readonly config: ConfigOffload,
    private readonly client: SeamClient,
    private readonly coverageStore: CoverageStore,
    private readonly observationStore: ObservationStore,
    runManifest: RunManifest,
    private readonly runId: string,
    private readonly secondsPerTick: number,
  ) {
    // The digest is of the manifest as the run started (exit_state 'running'):
    // the reference a bundle carries must not drift as the run ages, and two
    // packaging runs over one manifest must produce the same identifiers.
    this.runManifestDigest = configDigest(runManifest);
    this.runReference = sha256Hex(this.runManifestDigest).slice(0, 32);
    this.baseManifest = JSON.parse(JSON.stringify(runManifest)) as RunManifest;
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        // The most recent decline, in the packager's own words. Its ledger of
        // declines was in memory and published nowhere, so a reader who asked it to
        // stage and was refused saw nothing change and had no way to learn why —
        // found by pressing the button on the running page. FR-32's rule: a
        // component that does nothing says why it did nothing.
        detail: `${this.stagedBundles.length} bundle(s) staged, ${this.stagedBytes} of ${this.config.staging_bound_bytes} byte(s); announcement-only until V3${
          this.declined.length === 0 ? '' : `; last declined — ${this.declined[this.declined.length - 1]}`
        }`,
        figures: [
          { key: 'bundles', value: this.stagedBundles.length, label: 'bundles' },
          ...(this.prompted === 0 ? [] : [{ key: 'prompted', value: this.prompted, label: 'prompted' }]),
          ...(this.declined.length === 0
            ? []
            : [{ key: 'declined', value: this.declined.length, label: 'declined' }]),
          {
            key: 'staged_bytes',
            value: this.stagedBytes,
            of: this.config.staging_bound_bytes,
            unit: 'B',
            label: 'staged',
          },
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
    });
    this.client.subscribe(this.config.topics.run_published, (message) => {
      const published = message.payload as RunPublished;
      // A run stages once. The announcement is republished when the model runner resumes and
      // restates the run that already stood (feature 125), and a handler that staged on every
      // announcement made a bundle for a release that had not happened: two bundles and twice
      // the staged bytes for one run, with `intervalStartTick` advanced so the *next* genuine
      // bundle's measurement geometry covered a truncated interval. Four such restarts push
      // `stagedBytes` past the bound, after which production stops for good — nothing is
      // evictable in V2. Staging a bundle for a release that did not happen is also a claim
      // about a release that did not happen.
      if (this.stagedForRunId === published.run_id) return;
      this.stage(published, published.tick);
    });
    this.client.subscribe(this.config.topics.command, (message) => {
      const command = message.payload as OperatorCommand;
      if (command.target !== this.config.id || command.kind !== 'event') return;
      if (command.event !== this.config.prompt_event) return;
      // Nothing announced is not the same as nothing standing. This component learns of a
      // run from `run_published` and from nothing else, so a run published while it was not
      // listening — or, since feature 125, one replayed into the store from a committed
      // artefact while the model runner was held back for the whole pre-roll — leaves it
      // believing the run has no forecast at all. `returning`'s card promises a staged
      // package and its script prompts for one mid-pre-roll, at a tick where the runner is
      // held back; before this line it declined, and the Offload surface told the reader
      // nothing had been released while the store held eight forecasts.
      //
      // So the store is consulted before the ledger is written: what stands is a fact about
      // the inventory, and reading it is the same resumption rule the environment generator
      // and the model runner already follow.
      const against = standingRunFacts(this.coverageStore);
      if (!against) {
        // Genuinely nothing to stage a bundle OF. Said in the ledger rather than answered
        // with an empty bundle.
        this.declined.push(
          `window ${this.stagedBundles.length + this.declined.length}: asked to stage, and nothing has been released yet to stage over`,
        );
        this.announce();
        return;
      }
      this.prompted += 1;
      this.stage(against, this.simTime.tick);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  staged(): StagedBundle[] {
    return [...this.stagedBundles];
  }

  /**
   * Stage one window over a release. `uptoTick` ends the measurement interval: the
   * release's own tick where the release triggered this, the current tick where a
   * reader asked. Everything else — the bound, the missing holding, the empty
   * interval — is decided by the rules that were already here.
   */
  private stage(published: StandingRun, uptoTick: number): void {
    // Recorded before the bound check below, so a run declined for want of staging room is
    // not staged again by the next announcement of the same run.
    this.stagedForRunId = published.run_id;
    const windowIndex = this.stagedBundles.length + this.declined.length;
    if (!this.producing || this.stagedBytes >= this.config.staging_bound_bytes) {
      // At the bound with nothing evictable — and in V2 nothing is ever
      // evictable, because eviction stays gated on a receipt no transfer sends.
      this.producing = false;
      this.declined.push(`window ${windowIndex}: staging area at its bound; production stopped, not made room for`);
      this.announce();
      return;
    }

    const holding = this.coverageStore.holding(published.collections.forecast);
    if (!holding) {
      this.declined.push(`window ${windowIndex}: published run names holding '${published.collections.forecast}' and the store does not hold it`);
      this.announce();
      return;
    }

    // The measurement geometry covers the interval between two successive
    // released products (run-manifest.schema.json): from the previous release —
    // or the run's epoch, for the first — up to this one.
    const measurements = this.measurementsSince(this.intervalStartTick, uptoTick);
    if (measurements.length === 0) {
      // A geometry with no measurements is not a geometry: it buffers to no
      // cells and every comparison against it is inconclusive. No bundle at all
      // beats a bundle whose release nobody can score.
      this.declined.push(`window ${windowIndex}: no measurements in the interval; a bundle nobody can score is not staged`);
      this.announce();
      return;
    }
    const intervalSeconds = Math.max(1, Math.round((uptoTick - this.intervalStartTick) * this.secondsPerTick));

    const grid = holding.descriptor.manifest.grid;
    const bundleId = `b-${sha256Hex(`${this.runReference}:${windowIndex}:${this.config.format_version}`).slice(0, 16)}`;
    const manifest: BundleManifest = {
      schema_version: 1,
      bundle_id: bundleId,
      run_reference: this.runReference,
      run_manifest_digest: this.runManifestDigest,
      format_version: this.config.format_version,
      window: {
        index: windowIndex,
        start_sim_time: published.valid_time.start_sim_time,
        end_sim_time: published.valid_time.end_sim_time,
      },
      members: [
        {
          name: `${bundleId}.f32`,
          digest: holding.descriptor.field.sha256,
          byte_length: holding.descriptor.field.byte_length,
        },
      ],
      variables: holding.descriptor.manifest.variables.map((variable) => variable.name),
      profile_count: grid.latitude.count * grid.longitude.count,
      level_count: grid.latitude.count * grid.longitude.count * grid.depth.count,
    };

    const sibling: RunManifest = {
      ...this.baseManifest,
      measurement_geometry: {
        identification_radius_m: this.config.identification_radius_m,
        interval_seconds: intervalSeconds,
        measurements,
      },
    };

    this.stagedBundles.push({ manifest, sibling, fieldByteLength: holding.descriptor.field.byte_length });
    this.stagedBytes += holding.descriptor.field.byte_length;
    this.intervalStartTick = uptoTick;
    if (this.stagedBytes >= this.config.staging_bound_bytes) this.producing = false;
    this.announce();
  }

  private measurementsSince(startTick: number, endTick: number): RunManifestMeasurement[] {
    return this.observationStore
      .all()
      .filter((observation) => observation.tick >= startTick && observation.tick < endTick)
      .map((observation) => ({
        longitude: observation.location.longitude,
        latitude: observation.location.latitude,
        simulation_seconds: Math.round((observation.tick - startTick) * this.secondsPerTick),
      }));
  }

  private announce(): void {
    const report: OffloadTelemetry = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      bundles: {
        staged: this.stagedBundles.length,
        transferred: 0,
        verified: 0,
        evictable: 0,
        evicted: 0,
        failed: 0,
      },
      verification: { refused: 0, verified: 0 },
      staging: {
        bytes: this.stagedBytes,
        bound_bytes: this.config.staging_bound_bytes,
        at_bound: this.stagedBytes >= this.config.staging_bound_bytes,
        producing: this.producing,
      },
    };
    this.client.publish(this.config.topics.offload, report);
  }
}
