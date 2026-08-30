/**
 * The sensors (V2-C04): simulated instruments sampling the true field on a tick
 * cadence, adding their declared seeded noise, and publishing observations in
 * SensorThings vocabulary on obs/<thing>/<datastream> (SRD-v2 FR-22;
 * observation.schema.json).
 *
 * Truth comes through the world-sampler port the runtime hands them, and every
 * stochastic draw comes from their named stream in a deterministic order
 * (tick-major, instrument-minor).
 *
 * **Where they are is no longer their own business** (FR-55, feature 113). The
 * sensors used to evaluate a closed-form loiter from their own configuration, which
 * meant two places would have computed the platform's position the moment a platform
 * component existed. They now sample at the position they last heard on the ownship
 * datastreams, and before they have heard one they publish nothing and say so:
 * sampling the ocean at a place nobody has reported would be inventing the place.
 *
 * That widens ADR-0012 — the sensors read the clock and now the ownship namespace —
 * and makes their output depend on delivery order. The order is deterministic in
 * lockstep, so AT-04 holds; the dependency is stated here and in the replay claim's
 * boundary rather than left to be discovered.
 *
 * A heard position also goes off. Sampling at a position last reported long ago would
 * claim the platform is still there, which is the same class of untruth as a display
 * lighting a component nothing has been heard from — so a position older than one
 * sampling interval is not where the platform is now, and the sensors say so and
 * publish nothing. The bound is the sensors' own declared cadence rather than a number
 * typed in here: stop the platform and the sensors go quiet by themselves, one
 * sampling interval later.
 *
 * The cadence is tunable from the operator plane (FR-64), and because the staleness
 * bound IS the cadence, tuning one tunes both — which is a property of the rule above
 * rather than a coincidence, and the reason both read it from one accessor.
 *
 * These instruments will also, if asked, publish ONE deliberately malformed sample
 * (FR-67). The fault belongs here rather than in the control plane: a faulty
 * instrument is a thing that happens, a control plane publishing into the observation
 * namespace is not, and only the first of those leaves the ingestion seam answering
 * the question a reader actually asked. What they publish is a genuine bad message —
 * the seam refuses it against the committed master and names the fault — and the count
 * of what was asked for is reported, so a fault a reader ordered is never mistaken for
 * an instrument that has started lying on its own account.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigSensors, Observation, OperatorCommand } from '../../generated/types.js';
import { Rng } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';
import { fnv1a32 } from '../lib/rng.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { pressureDbar } from '../env-generator/analytic.js';

/** The honest port to the true ocean (Constitution VI): truth in, nothing else out. */
export interface WorldSampler {
  temperatureAt(longitude: number, latitude: number, depthM: number, tick: number): number;
  salinityAt(longitude: number, latitude: number, depthM: number, tick: number): number;
}

const PROPERTY_CONTEXT = {
  temperature: {
    id: 'sea_water_temperature',
    name: 'sea water temperature',
    definition: 'sea_water_temperature',
    description: 'Temperature of sea water.',
  },
  salinity: {
    id: 'sea_water_salinity',
    name: 'sea water practical salinity',
    definition: 'sea_water_salinity',
    description: 'Practical salinity of sea water.',
  },
  pressure: {
    id: 'sea_water_pressure',
    name: 'sea water pressure',
    definition: 'sea_water_pressure',
    description: 'Pressure in sea water, from the harness pressure relation plus instrument noise.',
  },
} as const;

export class Sensors {
  private readonly rng: Rng;
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private publishedCount = 0;
  private lastSampledTick = -1;
  /** The last ownship position heard, and the tick it was heard at. */
  private heardPosition: { latitude: number; longitude: number; tick: number } | undefined;
  /** Ticks on which sampling was skipped for want of a position. Counted, not hidden. */
  private skippedForNoPosition = 0;
  /** The sampling cadence in force, where the operator plane has changed it. */
  private tunedInterval: number | undefined;
  /** Deliberately faulty samples published on request. Counted and reported. */
  private faultsPublished = 0;

  constructor(
    private readonly config: ConfigSensors,
    private readonly client: SeamClient,
    private readonly world: WorldSampler,
    private readonly runId: string,
    rootSeed: number,
  ) {
    this.rng = new Rng(rootSeed, config.stream);
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: this.detail(),
        figures: [
          { key: 'published', value: this.publishedCount, label: 'published' },
          { key: 'instruments', value: this.config.instruments.length, label: 'instruments' },
          { key: 'sample_interval', value: this.sampleInterval(), unit: 'ticks', label: 'cadence' },
          // The skipped count as a figure, not only as prose in the sentence above.
          // A reader shortening the cadence past the platform's reporting interval
          // starves these instruments, and 'how often did that happen' is a number
          // they know — so it is published as one rather than left to be parsed.
          ...(this.skippedForNoPosition === 0
            ? []
            : [{ key: 'skipped', value: this.skippedForNoPosition, label: 'skipped for position' }]),
          // Absent until one has been asked for: a face may not draw a zero where
          // nothing has happened, and 'no faults' is not a measurement (FR-58).
          ...(this.faultsPublished === 0
            ? []
            : [{ key: 'faults', value: this.faultsPublished, label: 'faults on request' }]),
          ...(this.heardPosition
            ? [
                {
                  key: 'position_age_ticks',
                  value: Math.max(0, this.simTime.tick - this.heardPosition.tick),
                  of: this.sampleInterval(),
                  unit: 'ticks',
                  label: 'position age',
                },
              ]
            : []),
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  /**
   * The sampling cadence in force: what the operator plane last set, or what
   * configuration says. One reader, because this number is two rules at once — how
   * often a sample is taken, and how long a heard position stays fresh — and they may
   * not be allowed to drift apart.
   */
  sampleInterval(): number {
    return this.tunedInterval ?? this.config.sample_interval_ticks;
  }

  /**
   * What the sensors are doing, and when they are doing nothing, why. FR-32's rule
   * carried to a new quiet: a component that goes silent without saying why is
   * indistinguishable from one that has failed.
   */
  detail(): string {
    if (!this.heardPosition) {
      return 'no ownship position heard yet; publishing nothing rather than sampling a place nobody has reported';
    }
    const published = `${this.publishedCount} observation(s) published from ${this.config.instruments.length} instrument(s)`;
    // The skip count is a footnote, never the headline: what the sensors are doing now
    // has to lead, or one cold-start skip masks the live state for the rest of the run.
    const skipped =
      this.skippedForNoPosition > 0
        ? `; ${this.skippedForNoPosition} sampling tick(s) skipped for want of a fresh position`
        : '';
    const faults =
      this.faultsPublished === 0
        ? ''
        : `; ${this.faultsPublished} deliberately faulty sample(s) published on request, each refused at the ingestion seam`;
    const age = this.simTime.tick - this.heardPosition.tick;
    if (age > this.sampleInterval()) {
      return `${published}; quiet: the last ownship position is ${age} ticks old, beyond the ${this.sampleInterval()}-tick sampling interval — where the platform is now is not something anything has reported${skipped}${faults}`;
    }
    return `${published}; sampling where ownship reported at tick ${this.heardPosition.tick}${skipped}${faults}`;
  }

  /** The last ownship position heard, for the tests and the runtime to read. */
  lastKnownPosition(): { latitude: number; longitude: number; tick: number } | undefined {
    return this.heardPosition;
  }

  start(): void {
    // Position arrives as an ordinary observation, on the ordinary namespace: the
    // platform publishes it, the ingestion seam stores it, and the sensors happen to
    // be another subscriber. No private channel, and nothing here re-derives it.
    this.client.subscribe(this.config.topics.ownship, (message) => {
      const observation = message.payload as Observation;
      this.heardPosition = {
        latitude: observation.location.latitude,
        longitude: observation.location.longitude,
        tick: observation.tick,
      };
    });
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      // A rate-change acknowledgement repeats the tick in force (clock.schema.json);
      // sampling keys to the tick, not to the count of samples heard, so a repeat
      // draws nothing and publishes nothing.
      if (sample.tick % this.sampleInterval() === 0 && sample.tick !== this.lastSampledTick) {
        this.lastSampledTick = sample.tick;
        this.sampleAll(sample.tick, sample.sim_time);
      }
    });
    this.client.subscribe(this.config.topics.command, (message) => {
      this.obey(message.payload as OperatorCommand);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private sampleAll(tick: number, simTime: string): void {
    const position = this.heardPosition;
    // A position is current for exactly as long as one sampling interval: the freshest
    // one a sampling tick can hold was reported an interval ago, because the platform's
    // report for this tick is still queued behind the clock sample being handled. Older
    // than that and the platform has stopped saying where it is.
    if (!position || tick - position.tick > this.sampleInterval()) {
      this.skippedForNoPosition += 1;
      return;
    }
    for (const instrument of this.config.instruments) {
      const truth =
        instrument.observed_property === 'temperature'
          ? this.world.temperatureAt(position.longitude, position.latitude, instrument.depth_m, tick)
          : instrument.observed_property === 'salinity'
            ? this.world.salinityAt(position.longitude, position.latitude, instrument.depth_m, tick)
            : pressureDbar(instrument.depth_m);
      const result = truth + this.rng.normal(0, instrument.noise_std);
      this.client.publish(
        `${this.config.topics.observation_prefix}/${this.config.platform.thing_id}/${instrument.datastream_id}`,
        this.observation(instrument, tick, simTime, position, result),
      );
      this.publishedCount += 1;
    }
  }

  /**
   * An operator command addressed to these sensors: the cadence, or the fault they
   * declare they will produce on request.
   */
  private obey(command: OperatorCommand): void {
    if (command.target !== this.config.id) return;
    if (command.kind === 'tuning') {
      if (command.setting === 'sample_interval_ticks') this.tunedInterval = command.value;
      return;
    }
    if (command.event !== this.config.fault_event) return;
    this.publishFaultySample();
  }

  /**
   * One deliberately malformed observation (FR-67), built from the sampling path so
   * that everything about it is a real sample except the one thing spoiled: the
   * result, published as text where the master requires a number.
   *
   * It is published on the ordinary topic, by the component that would really produce
   * it, and nothing here softens it — the ingestion seam refuses it against the
   * committed master and names the fault, which is the whole point of asking. The
   * shell's own client-side validator counts it refused too, on the Messages tab,
   * because a bad message is bad wherever it is read.
   *
   * With no position heard there is nothing to spoil: a fault needs a sample to be a
   * fault of, and inventing a place to have taken it would be a worse untruth than the
   * one being demonstrated.
   */
  private publishFaultySample(): void {
    const position = this.heardPosition;
    const instrument = this.config.instruments[0];
    if (!position || this.simTime.value === '') return;
    const sound = this.observation(instrument, this.simTime.tick, this.simTime.value, position, 0);
    const faulty = { ...sound, result: 'deliberately not a number' } as unknown as Observation;
    this.client.publish(
      `${this.config.topics.observation_prefix}/${this.config.platform.thing_id}/${instrument.datastream_id}`,
      faulty,
    );
    this.faultsPublished += 1;
  }

  private observation(
    instrument: ConfigSensors['instruments'][number],
    tick: number,
    simTime: string,
    position: { latitude: number; longitude: number },
    result: number,
  ): Observation {
    const property = PROPERTY_CONTEXT[instrument.observed_property];
    const location = {
      latitude: position.latitude,
      longitude: position.longitude,
      depth_m: instrument.depth_m,
    };
    // One FeatureOfInterest per sampled place: derived from the position itself, so
    // two observations of the same place share one id and the geometry cannot
    // disagree with the message.
    const featureOfInterestId = `foi-${fnv1a32(
      `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)},${location.depth_m}`,
    ).toString(16)}`;
    return {
      observation_id: `obs-${this.config.platform.thing_id}-${instrument.datastream_id}-t${tick}`,
      scenario_run_id: this.runId,
      sim_time: simTime,
      tick,
      thing_id: this.config.platform.thing_id,
      datastream_id: instrument.datastream_id,
      sensor_id: instrument.sensor_id,
      feature_of_interest_id: featureOfInterestId,
      observed_property: instrument.observed_property,
      result,
      location,
      context: {
        thing: { name: this.config.platform.name, description: this.config.platform.description },
        sensor: {
          name: `simulated ${instrument.observed_property} sensor`,
          description: `Simulated ${instrument.observed_property} instrument with a seeded noise model.`,
          encoding_type: 'text/plain',
          metadata: `Gaussian noise, standard deviation ${instrument.noise_std}, drawn from the seeded stream ${this.config.stream}.`,
        },
        observed_property: { ...property },
        datastream: {
          name: `${instrument.observed_property} at ${instrument.depth_m} m`,
          description: `Simulated ${instrument.observed_property} series at ${instrument.depth_m} m depth.`,
          observation_type: 'OM_Measurement',
          unit_of_measurement: { ...instrument.unit },
        },
        feature_of_interest: {
          name: `sampling location ${featureOfInterestId.slice(4)}`,
          description: 'Where an observation pertains to. Not a location history.',
          encoding_type: 'application/geo+json',
        },
      },
    };
  }
}
