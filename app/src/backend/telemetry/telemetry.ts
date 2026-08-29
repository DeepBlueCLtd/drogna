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
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamHttpResponse } from '../../seam/http.js';
import type {
  ConfigTelemetry,
  RunPublished,
  TelemetryForecastSkill,
  TelemetryResidualSampleReport,
  TelemetryResidualStatistics,
} from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { soundSpeedMs } from '../env-generator/analytic.js';
import { sampleHolding, timeAxisPosixOrigin } from '../query/field-sampler.js';
import type { CoverageStore } from '../coverage-store/store.js';
import type { Router } from '../runtime/router.js';

const EQUATION = 'Mackenzie 1981 nine-term equation';

export class Telemetry {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private forecastRunId: string | null = null;
  private residuals: number[] = [];
  private persistenceErrors: number[] = [];
  private firstSampleTime: string | null = null;
  private lastSampleTime: string | null = null;
  private observationCount = 0;
  private telemetryMessageCount = 0;
  private windowStartTick = 0;
  lastStatistics: TelemetryResidualStatistics | null = null;
  lastSkill: TelemetryForecastSkill | null = null;

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
        this.publishStatistics();
        this.publishSkill();
      }
    });
    this.client.subscribe(this.config.topics.observations, () => {
      this.observationCount += 1;
    });
    this.client.subscribe(this.config.topics.run_published, (message) => {
      const published = message.payload as RunPublished;
      if (!published.current) return;
      // A new current run closes the previous ledger: skill is per run, and
      // evidence against a superseded field is not carried (the monitor's rule,
      // held here too).
      this.forecastRunId = published.run_id;
      this.residuals = [];
      this.persistenceErrors = [];
      this.firstSampleTime = null;
      this.lastSampleTime = null;
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

  private absorb(report: TelemetryResidualSampleReport): void {
    if (report.forecast_run_id !== this.forecastRunId) return;
    const forecast = this.store.holding(report.forecast_run_id);
    if (!forecast) return;
    const origin = timeAxisPosixOrigin(forecast.descriptor.manifest);
    const order = forecast.descriptor.manifest.variables.map((variable) => variable.name);
    for (const sample of report.samples) {
      this.residuals.push(sample.residual_m_per_s);
      this.firstSampleTime ??= sample.sim_time;
      this.lastSampleTime = sample.sim_time;
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
    };
    return { status: 200, body: JSON.stringify(body) };
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
