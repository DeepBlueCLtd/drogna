/**
 * The sensors (V2-C04): simulated instruments on one loitering platform, sampling
 * the true field on a tick cadence, adding their declared seeded noise, and
 * publishing observations in SensorThings vocabulary on obs/<thing>/<datastream>
 * (SRD-v2 FR-22; observation.schema.json).
 *
 * Sensors read the clock and nothing else (ADR-0012, carried): position is a pure
 * function of simulation time, truth comes through the world-sampler port the
 * runtime hands them, and every stochastic draw comes from their named stream in a
 * deterministic order (tick-major, instrument-minor).
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigSensors, Observation } from '../../generated/types.js';
import { Rng } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';
import { fnv1a32 } from '../lib/rng.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { KM_PER_DEGREE_LATITUDE, pressureDbar } from '../env-generator/analytic.js';

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

  constructor(
    private readonly config: ConfigSensors,
    private readonly client: SeamClient,
    private readonly world: WorldSampler,
    private readonly runId: string,
    rootSeed: number,
    private readonly secondsPerTick: number,
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
        detail: `${this.publishedCount} observation(s) published from ${this.config.instruments.length} instrument(s)`,
      }),
      runId,
      configDigest(config),
    );
  }

  /** The platform's loiter: position as a pure function of simulation seconds. */
  positionAt(seconds: number): { latitude: number; longitude: number } {
    const { loiter } = this.config.platform;
    const angle = (2 * Math.PI * seconds) / loiter.period_seconds;
    const latitude = loiter.centre_latitude + (loiter.radius_km * Math.sin(angle)) / KM_PER_DEGREE_LATITUDE;
    const longitude =
      loiter.centre_longitude +
      (loiter.radius_km * Math.cos(angle)) /
        (KM_PER_DEGREE_LATITUDE * Math.cos((loiter.centre_latitude * Math.PI) / 180));
    return { latitude, longitude };
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      if (sample.tick % this.config.sample_interval_ticks === 0) {
        this.sampleAll(sample.tick, sample.sim_time);
      }
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private sampleAll(tick: number, simTime: string): void {
    const seconds = tick * this.secondsPerTick;
    const position = this.positionAt(seconds);
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
