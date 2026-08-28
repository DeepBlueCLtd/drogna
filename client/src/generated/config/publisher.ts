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
       * The subdirectory of the store root that holds the runs. The layout gives a run directory no prefix of its own — the directory is the run identifier, and the identifier already begins with the prefix its own rule states — so this names the directory they sit in. It replaces run_directory_prefix, which carried this value for want of a key of its own and which could not be empty.
       */
      runs_dirname: string;
      /** Name of the entry in the root that resolves to the current run's directory. */
      current_pointer: string;
      /**
       * What an in-flight name ends in. Anything under it is invisible to the catalogue, which is what lets a run be assembled and a pointer be replaced without a reader ever seeing either half-made. It states the same value as query.coverage_store.partial_suffix and the model runner's staging.partial_suffix; three statements rather than one because no component reads another's configuration.
       */
      partial_suffix: string;
      forecast_file: string;
      uncertainty_file: string;
      manifest_file: string;
    };
    /**
     * The fixed identifier under which the query layer serves every published run. It is stated here rather than derived from the run identifier, because the query layer's design is one collection whose current run changes and whose past runs are EDR instances — publishing a run adds no collection, so there is no per-run name to derive. It states the same identifier the destination's query configuration serves; two statements rather than one because no component reads another's configuration.
     */
    collections: {
      /**
       * The fixed collection identifier, carrying the forecast parameters and the uncertainty parameter together.
       */
      forecast: string;
    };
  };
}
