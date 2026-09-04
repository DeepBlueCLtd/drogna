/**
 * The telemetry component (V2-C15, SRD-v2 FR-35): aggregates the residual samples
 * the monitor reports — one producer of residuals, one aggregator — computes
 * running statistics and forecast skill against a persistence reference, counts
 * throughput per simulation second (the only rate that means anything where the
 * pace is a dial), and serves the current account on its seam path.
 *
 * Persistence holds the forecast run's initial step constant across its validity —
 * the classic baseline — and the skill message carries its formula and a plain
 * sentence, emitted here so every consumer says the same thing about a model that
 * is not earning its compute.
 *
 * Residuals are aggregated twice over: once for the scenario, and once per cell of
 * the configured region grid (issue #61), which is laid over the extent of the very
 * holding the residuals were scored against rather than over a second copy of the
 * domain in configuration. A region below the configured minimum says
 * 'insufficient-samples' and keeps its own figures; it is never folded into the
 * scenario figure, where nobody could tell it was thin. And every fold records its
 * own latency in SIMULATION seconds — from the instant the observation was taken to
 * the instant its residual was folded — because a wall-clock figure would measure
 * the host and the rate dial rather than the harness (Constitution I).
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamHttpResponse } from '../../seam/http.js';
import type {
  ConfigTelemetry,
  CoverageHolding,
  OperatorCommand,
  RunPublished,
  TelemetryForecastSkill,
  TelemetryResidualSampleReport,
  TelemetryResidualStatistics,
} from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { standingRunFacts } from '../lib/standing-run.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { soundSpeedMs } from '../env-generator/analytic.js';
import { sampleHolding, timeAxisPosixOrigin } from '../query/field-sampler.js';
import type { CoverageStore } from '../coverage-store/store.js';
import type { Router } from '../runtime/router.js';

const EQUATION = 'Mackenzie 1981 nine-term equation';

/** One region cell's running ledger, held in bounded memory like the scenario's. */
interface RegionLedger {
  regionId: string;
  bounds: {
    minimum_latitude: number;
    maximum_latitude: number;
    minimum_longitude: number;
    maximum_longitude: number;
  };
  residuals: number[];
  firstSampleTime: string;
  lastSampleTime: string;
}

export class Telemetry {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private forecastRunId: string | null = null;
  private residuals: number[] = [];
  private persistenceErrors: number[] = [];
  private firstSampleTime: string | null = null;
  private lastSampleTime: string | null = null;
  /** One running ledger per region cell that has seen a residual. Bounded by the
   * configured grid: rows × columns, fixed before the run starts. */
  private readonly regions = new Map<string, RegionLedger>();
  /** Latency in simulation seconds, folded incrementally: sum, worst and count. */
  private latency = { count: 0, totalSeconds: 0, maximumSeconds: 0 };
  lastRegionStatistics: TelemetryResidualStatistics[] = [];
  private observationCount = 0;
  private telemetryMessageCount = 0;
  private windowStartTick = 0;
  lastStatistics: TelemetryResidualStatistics | null = null;
  lastSkill: TelemetryForecastSkill | null = null;
  /** Publications made on an operator prompt rather than on the cadence (FR-65). */
  private promptedPublications = 0;

  constructor(
    private readonly config: ConfigTelemetry,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    private readonly runId: string,
    private readonly secondsPerTick: number,
    router: Router,
  ) {
    router.register('GET', config.http.report_path, () => this.report());
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: this.lastSkill?.statement ?? 'no skill figure yet: the loop has not produced enough scored samples',
        // Absent until one has been asked for, on the rule every other component's
        // prompt figure follows: 'nobody has pressed it' is not a measurement, and an
        // unprompted run publishes exactly the heartbeat it published before (FR-58).
        ...(this.promptedPublications === 0
          ? {}
          : {
              figures: [
                { key: 'prompted', value: this.promptedPublications, label: 'published on request' },
              ],
            }),
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      const previousTick = this.simTime.tick;
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      if (sample.tick > previousTick && sample.tick % this.config.cadence_ticks === 0) {
        this.adoptStandingRun();
        this.publishStatistics();
        this.publishSkill();
      }
    });
    this.client.subscribe(this.config.topics.observations, () => {
      this.observationCount += 1;
    });
    // The two publication prompts (FR-65). Neither changes what is aggregated: each
    // publishes now what the cadence would have published next, computed from the
    // residuals folded so far — including the named absence a cadence publishes when
    // nothing has been folded. A prompt that quietly recomputed differently would make
    // the button a second source for the same figures.
    this.client.subscribe(this.config.topics.command, (message) => {
      const command = message.payload as OperatorCommand;
      if (command.target !== this.config.id || command.kind !== 'event') return;
      if (command.event === this.config.skill_event) {
        this.publishSkill();
        this.promptedPublications += 1;
        return;
      }
      if (command.event === this.config.statistics_event) {
        this.publishStatistics();
        this.promptedPublications += 1;
      }
    });
    this.client.subscribe(this.config.topics.run_published, (message) => {
      const published = message.payload as RunPublished;
      if (!published.current) return;
      // A **new** current run closes the previous ledger: skill is per run, and evidence
      // against a superseded field is not carried (the monitor's rule, held here too). A
      // restatement of the run already being scored is not a new run and closes nothing.
      //
      // The model runner republishes the standing run when it resumes, so that a component
      // which was not listening when the run was published can still learn of it (feature
      // 125, `backend/lib/standing-run.ts`). This handler could not tell the two apart and
      // discarded the ledger either way: restarting the runner from the Operator tab threw
      // away 58 scored samples and left the Telemetry surface reporting "0 scored sample(s)"
      // while the monitor went on publishing residuals into it — silence shown where there
      // is traffic, which is the half of Principle VII that is easiest to ship by accident.
      this.adoptRun(published.run_id);
    });
    this.client.subscribe(this.config.topics.telemetry, (message) => {
      this.telemetryMessageCount += 1;
      const payload = message.payload as { kind?: string };
      if (payload.kind === 'residual-sample') this.absorb(message.payload as TelemetryResidualSampleReport);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * The run that stands, when this component was never told of one.
   *
   * `forecastRunId` is set from `run_published` and from nothing else, and since feature 125
   * the model runner is held back for the whole of a replayed pre-roll — so through every tick
   * of it this ledger knew of no forecast. Two harms, both measured. On `loitering` it dropped
   * every sample the monitor scored against the forecast the artefact had supplied: **52
   * scored, 52 discarded**, and the restatement arriving a tick after the console opens cannot
   * repair that, the evidence being already thrown away. On `leaving`, whose sensors are
   * stopped for the whole pre-roll so no sample ever arrives, the node read **"no forecast to
   * score" over a store holding two forecasts** — `no-forecast` where the honest state is
   * `warming`, which is the difference between "there is nothing to score against" and "there
   * is nothing scored yet".
   *
   * So the store is asked for the run that stands: the same resumption rule the model runner
   * and the offload packager follow, and the same reading. Not a second opinion about which
   * run is current — the store's own era pointer *is* the current run, and an announcement
   * about it does exactly what this does. A first version only ever filled a null, and went
   * stale on `arriving`, whose artefact replays three cycles: the ledger adopted the first and
   * then dropped every sample the monitor scored against the second and third.
   *
   * Called where the ledger is *used*, not on a cadence, because both harms are at the point
   * of use: one drops a sample, the other states a condition. A first version called it only
   * from the sample path and left `leaving` reading `no-forecast`, which is how the second
   * harm was found.
   */
  private adoptStandingRun(): void {
    const standing = standingRunFacts(this.store);
    if (standing) this.adoptRun(standing.run_id);
  }

  /**
   * Begin scoring a run. A **new** current run closes the previous ledger — skill is per run,
   * and evidence against a superseded field is not carried (the monitor's rule, held here
   * too) — and the run already being scored closes nothing, which is what makes a restatement
   * of it inert.
   */
  private adoptRun(runId: string): void {
    if (runId === this.forecastRunId) return;
    this.forecastRunId = runId;
    this.residuals = [];
    this.persistenceErrors = [];
    this.firstSampleTime = null;
    this.lastSampleTime = null;
    this.regions.clear();
    this.latency = { count: 0, totalSeconds: 0, maximumSeconds: 0 };
  }

  private absorb(report: TelemetryResidualSampleReport): void {
    this.adoptStandingRun();
    if (report.forecast_run_id !== this.forecastRunId) return;
    const forecast = this.store.holding(report.forecast_run_id);
    if (!forecast) return;
    const origin = timeAxisPosixOrigin(forecast.descriptor.manifest);
    const order = forecast.descriptor.manifest.variables.map((variable) => variable.name);
    const grid = forecast.descriptor.manifest.grid;
    for (const sample of report.samples) {
      this.residuals.push(sample.residual_m_per_s);
      this.firstSampleTime ??= sample.sim_time;
      this.lastSampleTime = sample.sim_time;
      this.foldRegion(grid, sample);
      this.foldLatency(sample.sim_time);
      // Persistence: the run's initial step held constant — sampled at the run's
      // own origin instant, whatever the observation's time.
      const initial = sampleHolding(forecast, {
        longitude: sample.longitude,
        latitude: sample.latitude,
        depthM: sample.depth_m,
        posixSeconds: origin,
      });
      if (initial.ok) {
        const persisted = soundSpeedMs(
          initial.value.values[order.indexOf('temperature')],
          initial.value.values[order.indexOf('salinity')],
          sample.depth_m,
        );
        this.persistenceErrors.push(sample.measured_m_per_s - persisted);
      }
    }
  }

  /**
   * The region cell a sample falls in, over the extent of the holding it was scored
   * against. The grid is closed on its west and south edges and open on the others,
   * with the far edges belonging to the last cell, so every sample inside the extent
   * lands in exactly one region and none lands in two.
   */
  private regionOf(
    grid: CoverageHolding['manifest']['grid'],
    longitude: number,
    latitude: number,
  ): RegionLedger | undefined {
    const { rows, columns } = this.config.regions;
    const west = grid.longitude.minimum;
    const east = grid.longitude.maximum;
    const south = grid.latitude.minimum;
    const north = grid.latitude.maximum;
    if (longitude < west || longitude > east || latitude < south || latitude > north) return undefined;
    const columnWidth = (east - west) / columns;
    const rowHeight = (north - south) / rows;
    const column = Math.min(columns - 1, Math.floor((longitude - west) / columnWidth));
    const row = Math.min(rows - 1, Math.floor((latitude - south) / rowHeight));
    const regionId = `r${row}c${column}`;
    const existing = this.regions.get(regionId);
    if (existing) return existing;
    const ledger: RegionLedger = {
      regionId,
      bounds: {
        minimum_longitude: round6(west + column * columnWidth),
        maximum_longitude: round6(west + (column + 1) * columnWidth),
        minimum_latitude: round6(south + row * rowHeight),
        maximum_latitude: round6(south + (row + 1) * rowHeight),
      },
      residuals: [],
      firstSampleTime: '',
      lastSampleTime: '',
    };
    this.regions.set(regionId, ledger);
    return ledger;
  }

  private foldRegion(
    grid: CoverageHolding['manifest']['grid'],
    sample: TelemetryResidualSampleReport['samples'][number],
  ): void {
    const ledger = this.regionOf(grid, sample.longitude, sample.latitude);
    // A sample outside the scored holding's extent belongs to no region and is not
    // put in one: the scenario figure already holds it, and inventing a region for
    // it would put a figure somewhere the holding does not cover.
    if (!ledger) return;
    ledger.residuals.push(sample.residual_m_per_s);
    if (ledger.firstSampleTime === '') ledger.firstSampleTime = sample.sim_time;
    ledger.lastSampleTime = sample.sim_time;
  }

  /**
   * Latency, in simulation seconds, between the instant an observation was taken and
   * the instant its residual was folded in here — the clock's own instant, never the
   * host's. A fold that appears to arrive before its observation would be a clock
   * fault rather than a negative latency, so it is not folded and does not average
   * a real delay away.
   */
  private foldLatency(sampleSimTime: string): void {
    if (!this.simTime.value) return;
    const taken = Date.parse(sampleSimTime.slice(0, 23) + 'Z') / 1000;
    const folded = Date.parse(this.simTime.value.slice(0, 23) + 'Z') / 1000;
    if (!Number.isFinite(taken) || !Number.isFinite(folded)) return;
    const span = folded - taken;
    if (span < 0) return;
    this.latency.count += 1;
    this.latency.totalSeconds += span;
    this.latency.maximumSeconds = Math.max(this.latency.maximumSeconds, span);
  }

  private freshness(): { freshness: 'fresh' | 'stale'; staleSpanSeconds: number | null } {
    if (!this.lastSampleTime) return { freshness: 'stale', staleSpanSeconds: null };
    const last = Date.parse(this.lastSampleTime.slice(0, 23) + 'Z') / 1000;
    const now = Date.parse(this.simTime.value.slice(0, 23) + 'Z') / 1000;
    const span = now - last;
    return span <= this.config.staleness_window_seconds
      ? { freshness: 'fresh', staleSpanSeconds: null }
      : { freshness: 'stale', staleSpanSeconds: span };
  }

  private publishStatistics(): void {
    const count = this.residuals.length;
    const { freshness, staleSpanSeconds } = this.freshness();
    const mean = count ? this.residuals.reduce((a, b) => a + b, 0) / count : null;
    const meanAbs = count ? this.residuals.reduce((a, b) => a + Math.abs(b), 0) / count : null;
    const rms = count ? Math.sqrt(this.residuals.reduce((a, b) => a + b * b, 0) / count) : null;
    const statistics: TelemetryResidualStatistics = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kind: 'residual-statistics',
      forecast_run_id: this.forecastRunId,
      state: this.forecastRunId === null ? 'no-forecast' : count === 0 ? 'warming' : 'reporting',
      closed: false,
      scope: { level: 'scenario', region_id: null, bounds: null },
      basis: count === 0 ? 'none' : 'samples',
      count,
      mean_m_per_s: mean,
      mean_absolute_m_per_s: meanAbs,
      root_mean_square_m_per_s: rms,
      minimum_m_per_s: count ? Math.min(...this.residuals) : null,
      maximum_m_per_s: count ? Math.max(...this.residuals) : null,
      first_sim_time: this.firstSampleTime,
      last_sim_time: this.lastSampleTime,
      last_updated_sim_time: this.lastSampleTime,
      freshness,
      stale_span_seconds: staleSpanSeconds,
      implausible: rms !== null && rms > 100,
      implausible_reason:
        rms !== null && rms > 100 ? 'root-mean-square residual above 100 m/s: something upstream is broken, not the ocean' : null,
    };
    this.client.publish(this.config.topics.telemetry, statistics);
    this.lastStatistics = statistics;
    this.publishRegionStatistics(freshness, staleSpanSeconds);
  }

  /**
   * One message per region that has seen a residual (issue #61). A region nobody
   * sampled is not published: an unsampled region and a region scoring zero are
   * different facts, and publishing the first as the second would be the failure
   * this component exists to prevent.
   */
  private publishRegionStatistics(
    freshness: 'fresh' | 'stale',
    staleSpanSeconds: number | null,
  ): void {
    const published: TelemetryResidualStatistics[] = [];
    for (const ledger of [...this.regions.values()].sort((a, b) => a.regionId.localeCompare(b.regionId))) {
      const count = ledger.residuals.length;
      if (count === 0) continue;
      const mean = ledger.residuals.reduce((a, b) => a + b, 0) / count;
      const meanAbs = ledger.residuals.reduce((a, b) => a + Math.abs(b), 0) / count;
      const rms = Math.sqrt(ledger.residuals.reduce((a, b) => a + b * b, 0) / count);
      const statistics: TelemetryResidualStatistics = {
        component: this.config.id,
        scenario_run_id: this.runId,
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        kind: 'residual-statistics',
        forecast_run_id: this.forecastRunId,
        state: count < this.config.regions.minimum_samples ? 'insufficient-samples' : 'reporting',
        closed: false,
        scope: { level: 'region', region_id: ledger.regionId, bounds: ledger.bounds },
        basis: 'samples',
        count,
        mean_m_per_s: mean,
        mean_absolute_m_per_s: meanAbs,
        root_mean_square_m_per_s: rms,
        minimum_m_per_s: Math.min(...ledger.residuals),
        maximum_m_per_s: Math.max(...ledger.residuals),
        first_sim_time: ledger.firstSampleTime,
        last_sim_time: ledger.lastSampleTime,
        last_updated_sim_time: ledger.lastSampleTime,
        freshness,
        stale_span_seconds: staleSpanSeconds,
        implausible: rms > 100,
        implausible_reason:
          rms > 100
            ? 'root-mean-square residual above 100 m/s: something upstream is broken, not the ocean'
            : null,
      };
      this.client.publish(this.config.topics.telemetry, statistics);
      published.push(statistics);
    }
    this.lastRegionStatistics = published;
  }

  private publishSkill(): void {
    const count = Math.min(this.residuals.length, this.persistenceErrors.length);
    const enough = count >= this.config.minimum_skill_samples;
    const modelMse = enough ? this.residuals.slice(0, count).reduce((a, b) => a + b * b, 0) / count : null;
    const persistenceMse = enough
      ? this.persistenceErrors.slice(0, count).reduce((a, b) => a + b * b, 0) / count
      : null;
    const skillScore =
      modelMse !== null && persistenceMse !== null && persistenceMse > 0 ? 1 - modelMse / persistenceMse : null;
    const state: TelemetryForecastSkill['state'] =
      this.forecastRunId === null
        ? 'no-forecast'
        : !enough
          ? 'insufficient-samples'
          : persistenceMse === 0
            ? 'reference-without-error'
            : (skillScore ?? 0) > 0
              ? 'beating-persistence'
              : 'not-beating-persistence';
    const statement =
      state === 'beating-persistence'
        ? `the model beats persistence: skill ${skillScore?.toFixed(3)} over ${count} sample(s)`
        : state === 'not-beating-persistence'
          ? `the model is not earning its compute: skill ${skillScore?.toFixed(3)} against persistence over ${count} sample(s)`
          : state === 'insufficient-samples'
            ? `${count} scored sample(s) of the ${this.config.minimum_skill_samples} needed before a skill figure means anything`
            : state === 'reference-without-error'
              ? 'persistence shows no error: a skill ratio against zero says nothing'
              : 'no forecast to score';
    const { freshness } = this.freshness();
    // The master couples skill_score's nullability to the state variant; the
    // construction above respects it and the tests validate every emission, but
    // the coupling is beyond TS narrowing here — hence the cast at the end.
    const skill = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kind: 'forecast-skill',
      forecast_run_id: this.forecastRunId,
      reference_run_id: this.forecastRunId,
      reference_changed: false,
      sample_count: count,
      minimum_sample_count: this.config.minimum_skill_samples,
      model_mean_square_error: modelMse,
      persistence_mean_square_error: persistenceMse,
      skill_score: skillScore === null ? null : Math.round(skillScore * 1e6) / 1e6,
      formula: '1 - model_mean_square_error / persistence_mean_square_error',
      state,
      statement,
      last_updated_sim_time: this.lastSampleTime,
      freshness,
      sound_speed_equation: EQUATION,
    } as TelemetryForecastSkill;
    this.client.publish(this.config.topics.telemetry, skill);
    this.lastSkill = skill;
  }

  private report(): SeamHttpResponse {
    const windowTicks = Math.max(1, this.simTime.tick - this.windowStartTick);
    const windowSeconds = windowTicks * this.secondsPerTick;
    const body = {
      schema_version: 1,
      statistics: this.lastStatistics,
      skill: this.lastSkill,
      throughput: {
        window_sim_seconds: windowSeconds,
        observations_per_sim_second: round6(this.observationCount / windowSeconds),
        telemetry_messages_per_sim_second: round6(this.telemetryMessageCount / windowSeconds),
      },
      regions: this.lastRegionStatistics,
      latency: {
        basis:
          "from the simulation instant an observation was taken to the simulation instant its residual was folded into these statistics; simulation time throughout, never the host's clock",
        sample_count: this.latency.count,
        mean_sim_seconds:
          this.latency.count === 0 ? null : round6(this.latency.totalSeconds / this.latency.count),
        maximum_sim_seconds: this.latency.count === 0 ? null : round6(this.latency.maximumSeconds),
      },
    };
    return { status: 200, body: JSON.stringify(body) };
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
