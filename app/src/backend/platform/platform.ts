/**
 * The platform (V2-C21, SRD-v2 FR-52 to FR-54): the ownship motion simulator.
 *
 * Before feature 113 the platform was a closed-form loiter evaluated inside the
 * sensors. It could not be commanded, held no state between ticks, had no course or
 * speed at all, and nothing downstream could see where it had been. It is a
 * component now, and the three consequences are the feature:
 *
 * - it holds **demanded** beside **current**, integrates one toward the other under
 *   declared limits, and names the limit that is binding — so a platform that is not
 *   obeying is never mistaken for one that is;
 * - it takes demands from the broker. The operator surface publishes them today; the
 *   rules admit a second publisher, and the planner is deliberately not one of them
 *   (Constitution VIII: it recommends, it does not command);
 * - it publishes its own state as **ordinary observations**, through the same
 *   ingestion seam and store as every other measurement. There is no second write
 *   path, which is what makes the map's track a genuine query rather than a wire.
 *
 * Motion is a pure function of the clock and the demands heard (motion.ts). The one
 * stochastic thing here is the navigation instruments' noise, drawn from this
 * component's own named stream in a fixed order — tick-major, instrument-minor, the
 * same order the sensors use.
 *
 * It will also, if asked, report ONE depth beyond the maximum it declares it can reach
 * (FR-67). The fault belongs here for the same reason the sensors' does: an instrument
 * that misreports is a thing that happens, and a control plane publishing into the
 * ownship namespace is not. It matters twice over here, because the ingestion seam
 * range-checks ownship values against *these* declared limits — so the flag a reader
 * then reads is the seam applying the platform's own rule to the platform's own
 * message, which is not something an injected message from elsewhere could show. What
 * was asked for is counted and reported: a faulty reading on request is never mistaken
 * for a platform that has started lying on its own account.
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  ConfigPlatform,
  Observation,
  OperatorCommand,
  PlatformDemand,
  PlatformState,
} from '../../generated/types.js';
import { Rng, fnv1a32 } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { shortfall, step, wrapHeading, type Demand, type Vector } from './motion.js';

const PROPERTY_CONTEXT = {
  platform_course: {
    id: 'platform_course_over_ground',
    name: 'platform course over ground',
    definition: 'platform_course',
    description: 'Course of the simulated platform over the ground, degrees true.',
  },
  platform_speed: {
    id: 'platform_speed_over_ground',
    name: 'platform speed over ground',
    definition: 'platform_speed_wrt_ground',
    description: 'Speed of the simulated platform over the ground.',
  },
  platform_depth: {
    id: 'platform_depth_below_surface',
    name: 'platform depth below the surface',
    definition: 'platform_depth',
    description: 'Depth of the simulated platform below the surface, positive downwards.',
  },
} as const;

export class Platform {
  private readonly rng: Rng;
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private current: Vector;
  private demanded: Demand | null = null;
  private demandFrom: string | null = null;
  private demandNote: string | undefined;
  private binding: PlatformState['binding_limit'] = 'none';
  private lastSteppedTick = -1;
  private lastReportedTick = -1;
  publishedCount = 0;
  demandsHeard = 0;
  /** Deliberately faulty readings published on request. Counted and reported. */
  faultsPublished = 0;
  /** Reports made on an operator prompt rather than on the reporting interval (FR-65). */
  private promptedReports = 0;
  /** The reporting interval in force, where the operator plane has changed it. */
  private tunedReportInterval: number | undefined;

  constructor(
    private readonly config: ConfigPlatform,
    private readonly client: SeamClient,
    private readonly runId: string,
    rootSeed: number,
    private readonly secondsPerTick: number,
  ) {
    this.rng = new Rng(rootSeed, config.stream);
    this.current = {
      latitude: config.initial.latitude,
      longitude: config.initial.longitude,
      course_degrees: config.initial.course_degrees,
      speed_m_per_s: config.initial.speed_m_per_s,
      depth_m: config.initial.depth_m,
    };
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: this.detail(),
        // Absent until one has been asked for: a face may not draw a zero where
        // nothing has happened, and 'no faults' is not a measurement (FR-58).
        figures: [
          { key: 'report_interval', value: this.reportInterval(), unit: 'ticks', label: 'reports every' },
          ...(this.faultsPublished === 0
            ? []
            : [{ key: 'faults', value: this.faultsPublished, label: 'faults on request' }]),
          ...(this.promptedReports === 0
            ? []
            : [{ key: 'prompted', value: this.promptedReports, label: 'reported on request' }]),
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  /**
   * How often ownship state is reported, in force. It is not only this component's
   * business: the sensors sample where the platform last said it was and treat a
   * position older than their own cadence as no position at all, so reporting less
   * often than they sample makes them go quiet. That coupling is why this is tunable
   * beside their cadence rather than fixed while theirs moves.
   */
  reportInterval(): number {
    return this.tunedReportInterval ?? this.config.report_interval_ticks ?? 1;
  }

  /** The heartbeat line says what the platform is doing and what is stopping it. */
  detail(): string {
    const where = `${this.current.course_degrees.toFixed(0)}° at ${this.current.speed_m_per_s.toFixed(1)} m/s, ${this.current.depth_m.toFixed(0)} m`;
    const faults =
      this.faultsPublished === 0
        ? ''
        : `; ${this.faultsPublished} deliberately faulty depth reading(s) published on request, each flagged at the ingestion seam`;
    if (!this.demanded) return `${where}; no demand heard, holding what it was configured with${faults}`;
    if (this.binding === 'none') return `${where}; at the demanded course, speed and depth${faults}`;
    return `${where}; ${this.binding.replace(/_/g, ' ')} is binding, working toward ${this.demanded.course_degrees.toFixed(0)}° at ${this.demanded.speed_m_per_s.toFixed(1)} m/s, ${this.demanded.depth_m.toFixed(0)} m${faults}`;
  }

  state(): PlatformState {
    return {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      current: { ...this.current },
      demanded: this.demanded ? { ...this.demanded } : null,
      demand_from: this.demandFrom,
      limits: { ...this.config.limits },
      binding_limit: this.binding,
      shortfall: this.demanded ? shortfall(this.demanded, this.config.limits) : null,
      ...(this.demandNote === undefined ? {} : { note: this.demandNote }),
    };
  }

  start(): void {
    this.client.subscribe(this.config.topics.demand, (message) => {
      this.applyDemand(message.payload as PlatformDemand);
    });
    this.client.subscribe(this.config.topics.command, (message) => {
      const command = message.payload as OperatorCommand;
      if (command.target !== this.config.id) return;
      if (command.kind === 'tuning') {
        if (command.setting === 'report_interval_ticks') this.tunedReportInterval = command.value;
        return;
      }
      if (command.event === this.config.report_event) {
        this.reportOnRequest();
        return;
      }
      if (command.event !== this.config.fault_event) return;
      this.publishFaultyDepth();
    });
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      // A rate-change acknowledgement repeats the tick in force (clock.schema.json).
      // Integrating twice on one tick would move the platform for free, so the step
      // keys to the tick and not to the count of samples heard.
      if (sample.tick === this.lastSteppedTick) return;
      const elapsed = this.lastSteppedTick < 0 ? 0 : sample.tick - this.lastSteppedTick;
      this.lastSteppedTick = sample.tick;
      if (elapsed > 0) this.advance(elapsed * this.secondsPerTick);
      this.client.publish(this.config.topics.state, this.state());
      const interval = this.reportInterval();
      if (sample.tick % interval === 0 && sample.tick !== this.lastReportedTick) {
        this.lastReportedTick = sample.tick;
        this.report(sample.tick, sample.sim_time);
      }
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * A demand names the things it is demanding. An absent field leaves the standing
   * demand alone: asking for a speed is not an implicit order to steer north.
   */
  private applyDemand(demand: PlatformDemand): void {
    const standing: Demand = this.demanded ?? {
      course_degrees: this.current.course_degrees,
      speed_m_per_s: this.current.speed_m_per_s,
      depth_m: this.current.depth_m,
    };
    this.demanded = {
      course_degrees: wrapHeading(demand.course_degrees ?? standing.course_degrees),
      speed_m_per_s: demand.speed_m_per_s ?? standing.speed_m_per_s,
      depth_m: demand.depth_m ?? standing.depth_m,
    };
    this.demandFrom = demand.component;
    this.demandNote = demand.note;
    this.demandsHeard += 1;
  }

  /**
   * One depth reading beyond the declared maximum (FR-67), published on the ordinary
   * topic through the ordinary path. Everything about it is a real report except the
   * value, which is put past the limit this component's own configuration declares —
   * so the seam's flag names that limit, and names it because it read it from the same
   * document rather than from a number typed into the ingest.
   *
   * The platform's own state is untouched: it does not dive to an impossible depth, it
   * reports one. A fault in an instrument is not a fault in the vehicle, and conflating
   * them would make the demonstration teach the wrong thing.
   */
  private publishFaultyDepth(): void {
    const instrument = this.config.instruments.find(
      (candidate) => candidate.observed_property === 'platform_depth',
    );
    if (!instrument || this.simTime.value === '') return;
    const beyond = this.config.limits.maximum_depth_m + 100;
    this.client.publish(
      `${this.config.topics.observation_prefix}/${this.config.thing.thing_id}/${instrument.datastream_id}`,
      this.observation(instrument, this.simTime.tick, this.simTime.value, beyond),
    );
    this.faultsPublished += 1;
  }

  private advance(seconds: number): void {
    const demand: Demand = this.demanded ?? {
      course_degrees: this.current.course_degrees,
      speed_m_per_s: this.current.speed_m_per_s,
      depth_m: this.current.depth_m,
    };
    const moved = step(this.current, demand, this.config.limits, seconds);
    this.current = moved.next;
    this.binding = this.demanded ? moved.binding : 'none';
  }

  /**
   * Where it is, now, outside the reporting interval (FR-65).
   *
   * The other half of the sensors' prompted sample: instruments quiet for want of a
   * fresh position are waiting on exactly this message, and this is how a reader
   * supplies one without changing either cadence.
   *
   * An observation's id is a function of its tick, so a prompt at a tick already
   * reported produces the *same* measurement with the same id, and the store treats it
   * as the redelivery it is rather than as a second row. That is the at-least-once
   * property working, not a special case: the report is counted as prompted either way,
   * because what a reader asked for is a fact about the run whether or not it added a
   * row.
   */
  private reportOnRequest(): void {
    if (this.simTime.value === '') return;
    this.report(this.simTime.tick, this.simTime.value);
    this.promptedReports += 1;
  }

  /** Ownship state, as measurements, on the ordinary observation namespace. */
  private report(tick: number, simTime: string): void {
    for (const instrument of this.config.instruments) {
      const truth =
        instrument.observed_property === 'platform_course'
          ? this.current.course_degrees
          : instrument.observed_property === 'platform_speed'
            ? this.current.speed_m_per_s
            : this.current.depth_m;
      const noisy = truth + this.rng.normal(0, instrument.noise_std);
      // A course is an angle: noise across 000 wraps rather than reading as 359.8
      // degrees of turn. A speed and a depth cannot go negative, and an instrument
      // that reported one would be reporting an impossibility rather than an error.
      const result =
        instrument.observed_property === 'platform_course' ? wrapHeading(noisy) : Math.max(0, noisy);
      this.client.publish(
        `${this.config.topics.observation_prefix}/${this.config.thing.thing_id}/${instrument.datastream_id}`,
        this.observation(instrument, tick, simTime, result),
      );
      this.publishedCount += 1;
    }
  }

  private observation(
    instrument: ConfigPlatform['instruments'][number],
    tick: number,
    simTime: string,
    result: number,
  ): Observation {
    const property = PROPERTY_CONTEXT[instrument.observed_property];
    const location = {
      latitude: this.current.latitude,
      longitude: this.current.longitude,
      depth_m: this.current.depth_m,
    };
    const featureOfInterestId = `foi-${fnv1a32(
      `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)},${location.depth_m.toFixed(1)}`,
    ).toString(16)}`;
    return {
      observation_id: `obs-${this.config.thing.thing_id}-${instrument.datastream_id}-t${tick}`,
      scenario_run_id: this.runId,
      sim_time: simTime,
      tick,
      thing_id: this.config.thing.thing_id,
      datastream_id: instrument.datastream_id,
      sensor_id: instrument.sensor_id,
      feature_of_interest_id: featureOfInterestId,
      observed_property: instrument.observed_property,
      result,
      location,
      context: {
        thing: { name: this.config.thing.name, description: this.config.thing.description },
        sensor: {
          name: `simulated ${property.name} instrument`,
          description: `Simulated navigation instrument reporting ${property.name}.`,
          encoding_type: 'text/plain',
          metadata: `Gaussian noise, standard deviation ${instrument.noise_std} ${instrument.unit.symbol}, drawn from the seeded stream ${this.config.stream}.`,
        },
        observed_property: { ...property },
        datastream: {
          name: `${property.name}`,
          description: `The simulated platform's own ${property.name}. A series of these carries the ownship track in its locations.`,
          observation_type: 'OM_Measurement',
          unit_of_measurement: { ...instrument.unit },
        },
        feature_of_interest: {
          name: `ownship position ${featureOfInterestId.slice(4)}`,
          description: 'Where the platform was when it reported. Unlike a sampling location, a series of these is a track.',
          encoding_type: 'application/geo+json',
        },
      },
    };
  }
}
