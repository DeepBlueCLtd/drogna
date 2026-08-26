// DO NOT EDIT.
// Generated from contracts/schemas/observation.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * One measured value published by a simulated sensor on obs/<thing-id>/<datastream-id>, in SensorThings Part 1 vocabulary. SensorThings is the shape and vocabulary of the message and nothing more: no SensorThings server takes part in the write path, and this document is the single definition both the sensors and the ingest client are generated from (SRD FR-16, FR-17). The observed property is an enumeration of exactly three values. Sound speed is absent by decision: ADR-0005 derives it at the point of use from temperature, salinity and pressure, so it is never published and never stored, and a fourth datastream cannot arrive without amending that ADR. Every time here is simulation time taken from the clock port; no broker-assigned timestamp, database default or host clock value appears anywhere in the write path.
 */
export interface DrognaObservation {
  /**
   * Deterministic identifier derived from the root seed and the observation's logical position — thing, datastream and sequence — never from entropy, arrival order or a database sequence. It is the store's primary key, which is what makes redelivery under at-least-once a no-op rather than a duplicate row.
   */
  observation_id: string;
  /** The scenario run this observation belongs to, as carried on every clock sample. */
  scenario_run_id: string;
  /**
   * Phenomenon time: the simulation instant the value was measured at, ISO-8601 UTC with microsecond precision. This is the only time the store orders on. An observation that arrives late is stored on its own time, not on arrival order.
   */
  sim_time: string;
  /**
   * The tick index the sensor had observed when it sampled. Carried beside sim_time because a tick is the unit of causality and an instant is not.
   */
  tick: number;
  /**
   * The sampling platform this observation came from, and the first segment of the topic. A platform is a coordinate and a sampler; it carries no history and is not an entity of any other kind.
   */
  thing_id: string;
  /**
   * The Datastream — the pairing of a Thing, a Sensor and an ObservedProperty with a unit — and the second segment of the topic.
   */
  datastream_id: string;
  /**
   * The simulated instrument that produced the value, carrying its noise characteristics in its metadata.
   */
  sensor_id: string;
  /**
   * The location the observation pertains to, in SensorThings terms. Derived deterministically from the sampled position, so two observations of the same place share one FeatureOfInterest.
   */
  feature_of_interest_id: string;
  observed_property: ObservedProperty;
  /**
   * The measured value, in the unit the Datastream declares: degrees Celsius, practical salinity units or decibars. Seeded sensor noise is already applied; the value is what the instrument reported, not what the world held.
   */
  result: number;
  location: Location;
  context: Context;
}

/**
 * What was measured. Exactly three, closed deliberately. Sound speed is not among them and is not a datastream: it is derived at the point of use by the one implementation in libs/harness_core, called by the monitor, by telemetry and by the environment generator (ADR-0005). A derived value stored beside its inputs is a second source of truth that can disagree with them after a change to the equation, and there would be no way to tell which was right.
 */
export type ObservedProperty = "temperature" | "salinity" | "pressure";

/**
 * Where the sample was taken. A position and a depth, and nothing that would make a series of them into anything other than a sampling path: no heading, no speed, no identity carried between them.
 */
export interface Location {
  /** Degrees north, WGS 84. */
  latitude: number;
  /** Degrees east, WGS 84. */
  longitude: number;
  /** Depth below the surface in metres, positive downwards. */
  depth_m: number;
}

/**
 * The entities this observation belongs to, carried on every message. The ingest client holds no vocabulary of its own: what the store's Thing, Sensor, ObservedProperty, Datastream and FeatureOfInterest rows say is what the sensors published, so the store is a function of the traffic rather than of a second table somebody has to keep in step. Writing them is idempotent — the same identifier carries the same content on every message of that datastream.
 */
export interface Context {
  /** The sampling platform: the simulated vessel or a fixed sampling point. */
  thing: {
    /** Short name for a reader. */
    name: string;
    /** One line saying what the platform is. */
    description: string;
  };
  /** The simulated instrument, and where its noise characteristics are stated. */
  sensor: {
    /** Short name for a reader. */
    name: string;
    /** One line saying what the instrument simulates. */
    description: string;
    /**
     * SensorThings encodingType of the metadata field. The instrument is synthetic, so the metadata is prose rather than a datasheet.
     */
    encoding_type: string;
    /**
     * The instrument's declared noise model: distribution and standard deviation, stated so a stored value can be scored against the generator's field.
     */
    metadata: string;
  };
  /**
   * The quantity, named as the query layer and the coverage store name it, so one vocabulary serves the read path and the write path.
   */
  observed_property: {
    /** The CF-style name, for example sea_water_temperature. */
    id: string;
    /** The quantity in words. */
    name: string;
    /** What the name means, as a definition a consumer can resolve to a vocabulary. */
    definition: string;
    /** One line for a reader. */
    description: string;
  };
  /**
   * The series this observation belongs to, and where the unit of measurement lives. SensorThings puts the unit on the Datastream and not on the Observation, and so does this.
   */
  datastream: {
    /** Short name for a reader. */
    name: string;
    /** One line saying what the series is. */
    description: string;
    /** SensorThings observationType. Every series here is a measurement. */
    observation_type: string;
    unit_of_measurement: {
      /** The unit in words, for example degree Celsius. */
      name: string;
      /** The unit's symbol, for example degC. */
      symbol: string;
      /**
       * The unit as the coverage store spells it, for example degree_C, so a reader can compare a stored observation with a forecast field without a conversion table.
       */
      definition: string;
    };
  };
  /**
   * What the observation is of, in SensorThings terms: the sampled location. The geometry is derived from the message's own position by the ingest client, so it cannot disagree with it.
   */
  feature_of_interest: {
    /** Short name for a reader. */
    name: string;
    /**
     * One line saying what the location is. It is where a sample was taken and not a place anything went.
     */
    description: string;
    /** SensorThings encodingType of the geometry the ingest client derives, which is GeoJSON. */
    encoding_type: string;
  };
}
