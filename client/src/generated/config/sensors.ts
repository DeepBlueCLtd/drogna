// DO NOT EDIT.
// Generated from contracts/schemas/config.sensors.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { ObservedProperty } from "../messages/observation";
import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-04, the simulated sensors. Where they sample, how often, what they publish and with what noise all arrive here, so the same image samples a different world at a different rate without a source change. The common sections are referenced from config.common.schema.json rather than restated. Unknown keys are rejected: a typo in a key is a startup failure, never a silent default. Three datastreams and no more — sound speed is derived at the point of use and is not published (ADR-0005).
 */
export interface DrognaSimulatedSensorsConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker: Broker;
  logging: Logging;
  sensors: {
    /**
     * The SensorThings Thing these sensors are mounted on. A coordinate and a sampler: it carries no history and nothing is carried between its positions.
     */
    platform: {
      /** The Thing identifier, and the first segment of every topic these sensors publish on. */
      id: string;
      /** Short name for a reader. */
      name: string;
      /** One line saying what the platform is. */
      description: string;
    };
    /**
     * Where the environment generator's ground-truth manifest is. The sensors evaluate the analytic form the manifest describes rather than reading the stored field file, so a sampled value is the truth at a point rather than the truth plus an interpolation.
     */
    field: {
      /** Directory holding the generated field and its manifest. */
      directory: string;
      /** File name of the ground-truth manifest within that directory. */
      manifest_file: string;
    };
    /**
     * The rate and the positions. The sampling pattern of a scenario — arrive cold, then loiter, revisiting at the local decorrelation timescale — belongs to the scenario and planner features; these sensors sample where and when they are told to.
     */
    sampling: {
      /**
       * Simulation seconds between samples. Simulation time, not host time: under an accelerated clock the sensors publish faster in real terms, which is the point of compressing time.
       */
      interval_seconds: number;
      /** The depths sampled at each position, in metres below the surface. */
      depths_m: number[];
      /**
       * The positions visited, in order and then repeated. A list of places a sample is taken, not a route anything travels.
       */
      positions: ({
        latitude: number;
        longitude: number;
      })[];
      /**
       * Stop after this many samples. Absent means run until the clock stops, which is what a scenario does; a fixed count is what a demonstration of a fixed length needs.
       */
      maximum_samples?: number;
    };
    /**
     * Exactly three: temperature, salinity and pressure. There is no sound-speed datastream and adding one would need ADR-0005 amended. The observed property of each is an enumeration this schema closes at three; that there are three entries and that they are distinct is checked by the component at startup, because the deployment's own configuration checker runs on the standard library alone and implements no cardinality keyword.
     */
    datastreams: Datastream[];
    /**
     * The topic namespaces obs/ and ctl/ are conventions of the harness and are not configurable; what is configurable is the delivery guarantee.
     */
    publication: {
      /**
       * MQTT quality of service. Level 1, at-least-once, is the default: duplicate suppression rests on the deterministic observation identifier rather than on the broker. Level 2 is available if level 1 proves troublesome, and is this value and nothing else.
       */
      qos: 0 | 1 | 2;
      /**
       * Whether observations are retained by the broker. False for a stream of measurements; a retained observation would be delivered again to every new subscriber and would say a stale value is current.
       */
      retain?: boolean;
    };
    /**
     * What a sensor does when the broker is not there. It retries with bounded backoff driven by the simulation clock, publishes no heartbeat until it is connected, and is therefore correctly greyed out in the client rather than falsely lit.
     */
    reconnect: {
      /**
       * First wait, in simulation seconds. The host clock is not consulted, here or anywhere else in this component but the heartbeat.
       */
      initial_seconds: number;
      /**
       * Ceiling on the wait, in simulation seconds. Bounded so a sensor keeps trying rather than backing off into silence.
       */
      maximum_seconds: number;
    };
  };
}

/**
 * One series: the pairing of the platform, an instrument and an observed property with a unit, and the noise the instrument adds.
 */
export interface Datastream {
  /** The Datastream identifier, and the second segment of the topic. */
  id: string;
  /** Short name for a reader. */
  name: string;
  /** One line saying what the series is. */
  description: string;
  observed_property: ObservedPropertyConfiguration;
  /** SensorThings observationType. Every series here is a measurement. */
  observation_type: string;
  unit_of_measurement: {
    /** The unit in words. */
    name: string;
    /** The unit's symbol. */
    symbol: string;
    /**
     * The unit as the coverage store spells it, so a stored observation and a forecast field compare without a conversion table.
     */
    definition: string;
  };
  sensor: {
    /** The Sensor identifier. */
    id: string;
    /** Short name for a reader. */
    name: string;
    /** One line saying what the instrument simulates. */
    description: string;
    /**
     * SensorThings encodingType of the instrument's metadata. The metadata itself is composed from the noise model, so an instrument cannot describe a noise it does not add.
     */
    encoding_type: string;
  };
  /**
   * Drawn from the seeded generator for this component's stream, so the observations are reproducible from the run manifest and two runs from one root seed produce identical stores.
   */
  noise: {
    /**
     * gaussian adds a seeded draw; none publishes the field value unchanged, which is what a test that wants an exact comparison asks for.
     */
    distribution: "gaussian" | "none";
    /**
     * One standard deviation, in the datastream's unit. Zero is the same as no noise and is stated rather than implied.
     */
    standard_deviation: number;
  };
}

/**
 * The quantity, named as both the query layer and the coverage store name it. The measured spelling is one of exactly three; there is no fourth, by ADR-0005.
 */
export interface ObservedPropertyConfiguration {
  /** Which of the three quantities this series carries, as it appears on the wire. */
  measured: ObservedProperty;
  /** The CF-style name, for example sea_water_temperature. */
  id: string;
  /** The quantity in words. */
  name: string;
  /** What the name means, as a definition a consumer can resolve. */
  definition: string;
  /** One line for a reader. */
  description: string;
}
