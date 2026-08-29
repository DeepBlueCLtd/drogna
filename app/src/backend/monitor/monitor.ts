/**
 * The monitor (V2-C11, SRD-v2 FR-30): subscribes to the observation namespace,
 * pairs co-located temperature and salinity samples, derives sound speed by the one
 * implementation (ADR-0005), scores residuals against the current forecast
 * instance, and raises a divergence event only on sustained persistence — never a
 * single spike. Evidence gathered against a superseded forecast is discarded.
 *
 * Quiet is legible (FR-32): the heartbeat detail always says why nothing is
 * happening — no forecast to score against, nothing breaching, or how far a streak
 * has got.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigMonitor, Divergence, Observation } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { soundSpeedMs } from '../env-generator/analytic.js';
import { sampleHolding, timeAxisPosixOrigin } from '../query/field-sampler.js';
import type { CoverageStore } from '../coverage-store/store.js';

interface Breach {
  tick: number;
  simTime: string;
  residual: number;
  latitude: number;
  longitude: number;
}

export class Monitor {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private readonly pending = new Map<string, { temperature?: Observation; salinity?: Observation }>();
  private breaches: Breach[] = [];
  private scoredAgainst: string | undefined;
  residualCount = 0;
  divergencesRaised = 0;
  private lastResidual: number | undefined;

  constructor(
    private readonly config: ConfigMonitor,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    private readonly runId: string,
  ) {
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({ sim_time: this.simTime.value, tick: this.simTime.tick, status: 'ok', detail: this.quietReason() }),
      runId,
      configDigest(config),
    );
  }

  /** FR-32: three different quiets, three different sentences. */
  quietReason(): string {
    if (!this.store.currentInstance()) {
      return 'quiet: no forecast instance to score against yet — the loop has not turned';
    }
    if (this.breaches.length === 0) {
      return `scoring against ${this.scoredAgainst ?? 'the current run'}: ${this.residualCount} residual(s), last ${this.lastResidual?.toFixed(2) ?? '—'} m/s, nothing breaching`;
    }
    return `scoring against ${this.scoredAgainst}: streak of ${this.breaches.length}/${this.config.persistence_count} breaching sample(s)`;
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    this.client.subscribe(this.config.topics.observations, (message) => {
      this.consider(message.payload as Observation);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private consider(observation: Observation): void {
    const pair = this.config.pairs.find(
      (candidate) =>
        candidate.thing_id === observation.thing_id &&
        (candidate.temperature_datastream === observation.datastream_id ||
          candidate.salinity_datastream === observation.datastream_id),
    );
    if (!pair) return;
    const key = `${pair.thing_id}:${observation.tick}`;
    const slot = this.pending.get(key) ?? {};
    if (observation.datastream_id === pair.temperature_datastream) slot.temperature = observation;
    else slot.salinity = observation;
    this.pending.set(key, slot);
    if (slot.temperature && slot.salinity) {
      this.pending.delete(key);
      this.score(pair.depth_m, slot.temperature, slot.salinity);
    }
  }

  private score(depthM: number, temperature: Observation, salinity: Observation): void {
    const instance = this.store.currentInstance();
    if (!instance) return;
    // A new run means a fresh ledger: evidence against a superseded field is
    // discarded rather than carried.
    if (this.scoredAgainst !== instance.descriptor.holding_id) {
      this.scoredAgainst = instance.descriptor.holding_id;
      this.breaches = [];
    }
    const manifest = instance.descriptor.manifest;
    const origin = timeAxisPosixOrigin(manifest);
    const secondsIntoRun =
      (Date.parse(temperature.sim_time.slice(0, 23) + 'Z') / 1000 - origin);
    const forecast = sampleHolding(instance, {
      longitude: temperature.location.longitude,
      latitude: temperature.location.latitude,
      depthM,
      posixSeconds: origin + Math.max(0, secondsIntoRun),
    });
    if (!forecast.ok) return; // outside the forecast's extent: nothing to score
    const variableOrder = manifest.variables.map((variable) => variable.name);
    const forecastC = soundSpeedMs(
      forecast.value.values[variableOrder.indexOf('temperature')],
      forecast.value.values[variableOrder.indexOf('salinity')],
      depthM,
    );
    const observedC = soundSpeedMs(temperature.result, salinity.result, depthM);
    const residual = observedC - forecastC;
    this.residualCount += 1;
    this.lastResidual = residual;

    if (Math.abs(residual) > this.config.threshold_m_per_s) {
      this.breaches.push({
        tick: temperature.tick,
        simTime: temperature.sim_time,
        residual,
        latitude: temperature.location.latitude,
        longitude: temperature.location.longitude,
      });
      if (this.breaches.length >= this.config.persistence_count) {
        this.raise(depthM, instance.descriptor.run_id);
        this.breaches = [];
      }
    } else {
      this.breaches = [];
    }
  }

  private raise(depthM: number, forecastRunId: string): void {
    const streak = this.breaches;
    const mean = streak.reduce((sum, breach) => sum + Math.abs(breach.residual), 0) / streak.length;
    const peak = Math.max(...streak.map((breach) => Math.abs(breach.residual)));
    const divergence: Divergence = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      divergence_id: `div-${this.runId}-t${this.simTime.tick}`,
      forecast_run_id: forecastRunId,
      region: {
        centre_latitude: streak.reduce((sum, breach) => sum + breach.latitude, 0) / streak.length,
        centre_longitude: streak.reduce((sum, breach) => sum + breach.longitude, 0) / streak.length,
        radius_m: this.config.region.radius_m,
        minimum_depth_m: Math.max(0, depthM - this.config.region.depth_pad_m),
        maximum_depth_m: depthM + this.config.region.depth_pad_m,
      },
      residual: {
        mean_m_per_s: mean,
        peak_m_per_s: peak,
        threshold_m_per_s: this.config.threshold_m_per_s,
        sample_count: streak.length,
      },
      persistence: {
        rule: 'temporal',
        sample_count: streak.length,
        span_seconds:
          (Date.parse(streak[streak.length - 1].simTime.slice(0, 23) + 'Z') -
            Date.parse(streak[0].simTime.slice(0, 23) + 'Z')) /
          1000,
        first_sim_time: streak[0].simTime,
        last_sim_time: streak[streak.length - 1].simTime,
      },
      sound_speed_equation: 'Mackenzie 1981 nine-term equation',
    };
    this.client.publish(this.config.topics.divergence, divergence);
    this.divergencesRaised += 1;
  }
}
