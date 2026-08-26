// DO NOT EDIT.
// Generated from contracts/schemas/config.ingest.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-05, the single ingestion seam. The batch bounds, the queue bound, the retained-rejection bound and the store connection all arrive here, because every one of them is a property of a destination rather than of the code. The common sections are referenced from config.common.schema.json rather than restated. Unknown keys are rejected: a typo in a key is a startup failure, never a silent default.
 */
export interface DrognaIngestClientConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker: Broker;
  logging: Logging;
  ingest: {
    /**
     * The observation branch, at a delivery guarantee that matches what the sensors publish at. The topic namespace is a convention of the harness and is not configurable.
     */
    subscription: {
      /**
       * MQTT quality of service of the subscription. At level 1 a message is acknowledged only once its batch is written, so the broker holds what the store has not taken.
       */
      qos: 0 | 1 | 2;
    };
    /**
     * One Postgres instance with PostGIS carrying two schemas. The ingest role is the only role with insert permission on this one, which the database enforces rather than the code (FR-018).
     */
    store: {
      /**
       * Connection string for the ingest role. A password, where the destination needs one, arrives in the rendered configuration and appears in no tracked file.
       */
      dsn: string;
      /** The schema written to. observations, beside features in the same instance. */
      schema: string;
      /**
       * The database role connected as. Named here so the client can assert at startup that it is the role the grants were written for.
       */
      role: string;
      /**
       * Named here rather than in code so the query layer and the ingest client can be pointed at the same tables from configuration, which is where the observation store's shape is described.
       */
      tables: {
        things: string;
        sensors: string;
        observed_properties: string;
        datastreams: string;
        observations: string;
        features_of_interest: string;
      };
    };
    /**
     * A batch is written when either bound is reached, and each batch is one transaction: a failure leaves the store with the whole batch or with none of it.
     */
    batch: {
      /** Messages per batch, at most. */
      maximum_messages: number;
      /**
       * The time bound, in simulation seconds. Simulation time deliberately: a host-time flush interval would be a wall-clock read in the operational path, and under an accelerated clock a simulation-time bound flushes more often in real terms, which is correct for a harness whose point is to compress time.
       */
      maximum_interval_seconds: number;
    };
    /**
     * Backpressure is the failure mode the SRD assigns to this component, so the queue has a limit and reaching it costs latency rather than data.
     */
    queue: {
      /**
       * Messages held in memory, at most. At the bound the client stops taking messages from the broker rather than discarding them or growing without limit; the broker holds the excess.
       */
      maximum_depth: number;
    };
    /**
     * A message that fails validation is never written, is counted, and is kept with the reason it was refused so it can be inspected. The retention is bounded because a long run would otherwise fill memory with refusals.
     */
    rejections: {
      /**
       * How many rejections are kept. Reaching the bound is itself reported rather than discarding in silence.
       */
      maximum_retained: number;
    };
    /**
     * Queue depth, write rate, rejection count and any broker-side loss go on ctl/telemetry, so degradation is visible without anyone reading a log file.
     */
    telemetry: {
      /**
       * Simulation seconds between telemetry messages. On the simulation clock like every interval in this component except the heartbeat, which is real time by ADR-0006.
       */
      interval_seconds: number;
    };
  };
}
