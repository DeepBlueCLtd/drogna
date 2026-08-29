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
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigSensors, Observation } from '../../generated/types.js';
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
          ...(this.heardPosition
            ? [
                {
                  key: 'position_age_ticks',
                  value: Math.max(0, this.simTime.tick - this.heardPosition.tick),
                  of: this.config.sample_interval_ticks,
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
    const age = this.simTime.tick - this.heardPosition.tick;
    if (age > this.config.sample_interval_ticks) {
      return `${published}; quiet: the last ownship position is ${age} ticks old, beyond the ${this.config.sample_interval_ticks}-tick sampling interval — where the platform is now is not something anything has reported${skipped}`;
    }
    return `${published}; sampling where ownship reported at tick ${this.heardPosition.tick}${skipped}`;
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
      if (sample.tick % this.config.sample_interval_ticks === 0 && sample.tick !== this.lastSampledTick) {
        this.lastSampledTick = sample.tick;
        this.sampleAll(sample.tick, sample.sim_time);
      }
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
    if (!position || tick - position.tick > this.config.sample_interval_ticks) {
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
