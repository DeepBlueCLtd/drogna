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
 *
 * The threshold and the persistence count are tunable from the operator plane while
 * the run is going (FR-64). What arrives is a command addressed to this component, not
 * a new configuration document: the configured values stay what they were, the values
 * in force are reported in the heartbeat and on every residual sample, and a restart
 * rebuilds this component from configuration and so returns it to them. Everything
 * that scores against a threshold reads it from one place below, because a tuning that
 * reached the streak rule but not the sample report would have the monitor disagreeing
 * with itself about what it is doing.
 *
 * From feature 123 the monitor also publishes the **re-forecast indicator** (FR-117) on a
 * declared topic beside its divergence events. That indicator is a socket and not science:
 * whether re-forecasting is becoming valuable is environmental science and belongs to the
 * environmental-indicators workstream, and what drogna provides is the declared shape, a
 * gauge that renders whatever is published there, and a refusal that names the absence when
 * nothing is. Drogna's own residual statistic is wired in as the reference implementation,
 * and it is published *here* rather than by the telemetry component for the reason the rest
 * of this comment keeps making: this component already holds both the running residual and
 * the threshold in force, so the mark on the gauge and the rule that fires a run cannot
 * disagree. Any other publisher would hold a second copy of the threshold.
 *
 * An ownship observation is not a sample of the ocean (FR-56), and the monitor needs
 * no rule to say so: `pairs` names the thing and the two datastreams it scores, so an
 * observation it did not ask for informs nothing. That is an allowlist, and it is
 * stronger than the denylist the planner carries — the planner informs on whatever
 * arrives, so what it must ignore has to be named. A denylist was written here too and
 * then removed: planted against, the suite stayed green, which is the definition of a
 * check worth nothing (CLAUDE.md, lesson 2).
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  ConfigMonitor,
  Divergence,
  ForecastIndicator,
  Observation,
  OperatorCommand,
} from '../../generated/types.js';
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
  /** Settings in force, where the operator plane has changed one from configuration. */
  private tunedThreshold: number | undefined;
  private tunedPersistence: number | undefined;

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
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: this.quietReason(),
        // The settings in force, reported rather than left to be read out of the
        // sentence above: a display that parses prose is a display inventing figures.
        figures: [
          { key: 'threshold', value: this.threshold(), unit: 'm/s', label: 'drift threshold' },
          { key: 'persistence', value: this.persistence(), unit: 'samples', label: 'persistence' },
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  /**
   * The threshold in force: what the operator plane last set, or what configuration
   * says. One reader for the whole component, so the streak rule and the sample report
   * can never be scoring against different numbers.
   */
  threshold(): number {
    return this.tunedThreshold ?? this.config.threshold_m_per_s;
  }

  /** The persistence count in force, on the same rule as the threshold. */
  persistence(): number {
    return this.tunedPersistence ?? this.config.persistence_count;
  }

  /** Whether either setting differs from the document this component was built from. */
  private tunedFrom(): string {
    const changed: string[] = [];
    if (this.tunedThreshold !== undefined) changed.push(`threshold ${this.config.threshold_m_per_s} → ${this.tunedThreshold} m/s`);
    if (this.tunedPersistence !== undefined) changed.push(`persistence ${this.config.persistence_count} → ${this.tunedPersistence}`);
    return changed.length === 0 ? '' : ` (tuned from the operator plane: ${changed.join(', ')})`;
  }

  /** FR-32: three different quiets, three different sentences. */
  quietReason(): string {
    if (!this.store.currentInstance()) {
      return `quiet: no forecast instance to score against yet — the loop has not turned${this.tunedFrom()}`;
    }
    if (this.breaches.length === 0) {
      return `scoring against ${this.scoredAgainst ?? 'the current run'}: ${this.residualCount} residual(s), last ${this.lastResidual?.toFixed(2) ?? '—'} m/s, nothing breaching${this.tunedFrom()}`;
    }
    return `scoring against ${this.scoredAgainst}: streak of ${this.breaches.length}/${this.persistence()} breaching sample(s)${this.tunedFrom()}`;
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    this.client.subscribe(this.config.topics.observations, (message) => {
      this.consider(message.payload as Observation);
    });
    this.client.subscribe(this.config.topics.command, (message) => {
      this.obey(message.payload as OperatorCommand);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * An operator command addressed to this monitor. A command for another component is
   * ignored — the topic is one, the address is in the message — and a setting this
   * component does not hold is ignored too rather than stored: the surface refuses an
   * undeclared setting at the seam, and a second, quieter store of unknown settings
   * here would be somewhere for one to hide.
   *
   * A tightened threshold does not re-score what has already been scored. The streak
   * is evidence gathered under the rule that was in force when it was gathered, and
   * re-deciding it now would be the monitor rewriting its own record.
   */
  private obey(command: OperatorCommand): void {
    if (command.target !== this.config.id || command.kind !== 'tuning') return;
    if (command.setting === 'threshold_m_per_s') this.tunedThreshold = command.value;
    if (command.setting === 'persistence_count') this.tunedPersistence = command.value;
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

    // How far the streak has got, computed once. Both the telemetry sample and the
    // indicator carry it, and the whole argument for publishing the indicator from this
    // component is that the mark on a gauge and the rule that fires a run cannot disagree —
    // which is a reason to read the figure from one place, not to write it out twice.
    const streak = Math.abs(residual) > this.threshold() ? this.breaches.length + 1 : 0;

    // Every scored sample is reported on the telemetry topic (FR-35): the monitor
    // is the one producer of residuals, and telemetry aggregates rather than
    // recomputing them.
    this.client.publish(this.config.topics.telemetry, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kind: 'residual-sample',
      // The model run scored against is the holding's identity; the descriptor's
      // run_id is the scenario's.
      forecast_run_id: instance.descriptor.holding_id,
      samples: [
        {
          sim_time: temperature.sim_time,
          latitude: temperature.location.latitude,
          longitude: temperature.location.longitude,
          depth_m: depthM,
          residual_m_per_s: residual,
          measured_m_per_s: observedC,
          platform: temperature.thing_id,
        },
      ],
      sound_speed_equation: 'Mackenzie 1981 nine-term equation',
      // How close this is to raising a divergence, in the monitor's own numbers. A
      // consumer that recomputed the streak from the samples it happened to receive
      // would be a second implementation of the rule, free to disagree with the
      // monitor about whether the loop is about to turn (FR-58).
      breach: {
        threshold_m_per_s: this.threshold(),
        streak,
        persistence_count: this.persistence(),
      },
    });

    // The indicator, on the declared socket (FR-117). Published beside the residual sample
    // and from the same two readers — `this.threshold()` and the streak this component
    // keeps — so the mark a gauge draws and the rule that fires a run are the same numbers.
    this.client.publish(this.config.topics.indicator, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      indicator: 'sound-speed-residual',
      label: 'sound-speed residual against the standing forecast',
      value: Math.abs(residual),
      threshold: this.threshold(),
      unit: 'm/s',
      streak: { count: streak, of: this.persistence() },
    } satisfies ForecastIndicator);

    if (Math.abs(residual) > this.threshold()) {
      this.breaches.push({
        tick: temperature.tick,
        simTime: temperature.sim_time,
        residual,
        latitude: temperature.location.latitude,
        longitude: temperature.location.longitude,
      });
      if (this.breaches.length >= this.persistence()) {
        this.raise(depthM, instance.descriptor.holding_id);
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
        threshold_m_per_s: this.threshold(),
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
