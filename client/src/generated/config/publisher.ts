// DO NOT EDIT.
// Generated from contracts/schemas/config.publisher.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-14, the publisher. Partial visibility is the failure this component owns: everything here exists so that making a run visible is one operation on one volume, and so that the names a run is servable under are derived from the store's layout rather than enumerated in a collection file. The common sections are referenced from config.common.schema.json rather than restated.
 */
export interface DrognaPublisherConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  publisher: {
    /**
     * The same location the model runner writes into, on the same volume as the catalogue, because a move across volumes is a copy and a copy is not indivisible.
     */
    staging: {
      directory: string;
      forecast_file: string;
      uncertainty_file: string;
      manifest_file: string;
    };
    /**
     * A directory per run under a root, with the current run named by a pointer that is replaced in one operation. The layout is the query layer's to define; these are the names this component needs in order to write into it.
     */
    catalogue: {
      root_directory: string;
      /**
       * Prefixed to the run identifier to name a run's directory, so a run directory is recognisable as one.
       */
      run_directory_prefix: string;
      /** Name of the entry in the root that resolves to the current run's directory. */
      current_pointer: string;
      forecast_file: string;
      uncertainty_file: string;
      manifest_file: string;
    };
    /**
     * Identifiers are derived from the run identifier by prefix, so that a new run is addressable the moment it is catalogued and no collection is ever enumerated in a configuration file.
     */
    collections: {
      forecast_prefix: string;
      uncertainty_prefix: string;
    };
  };
}
