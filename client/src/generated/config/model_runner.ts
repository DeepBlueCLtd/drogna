// DO NOT EDIT.
// Generated from contracts/schemas/config.model_runner.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-13, the model runner. Being irreplaceable is the failure this component owns, so the kernel is selected here by name from the implementations registered behind the kernel port, and swapping one for another is a configuration change with no source edit outside the runner. The numerics are deliberately fake: what is configured is the shape of the ensemble and the size of the noise, not a physical model. The common sections are referenced from config.common.schema.json rather than restated.
 */
export interface DrognaModelRunnerConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  model_runner: {
    /**
     * Initialisation state in, gridded field out. The name selects a registered implementation; nothing outside the runner knows which one ran except through ctl/run-started, which carries it.
     */
    kernel: {
      /**
       * analytic advects the manifest's features by their recorded drift and adds seeded noise. persistence holds the initialisation state still, which is the reference a forecast has to beat and a second implementation proving the port is real.
       */
      name: "analytic" | "persistence";
      /**
       * Standard deviation of the seeded noise added to temperature, in degrees Celsius. Fake numerics, stated as such.
       */
      noise_temperature_c: number;
      /** Standard deviation of the seeded noise added to salinity, in practical salinity units. */
      noise_salinity_psu: number;
    };
    /**
     * One derived random stream per member, so a member's realisation is a function of the root seed and its ordinal and of nothing else.
     */
    ensemble: {
      /**
       * Largest ensemble this runner will accept. A request for more is refused rather than quietly truncated, because a spread over fewer members than were asked for is a different quantity.
       */
      maximum_size: number;
      /** Spread of the members' perturbed initial temperature, in degrees Celsius. */
      perturbation_temperature_c: number;
      /** Spread of the members' perturbed initial salinity, in practical salinity units. */
      perturbation_salinity_psu: number;
      /**
       * Fractional spread applied to each feature's recorded drift velocity, which is what makes the members disagree more where a feature is moving.
       */
      perturbation_drift_fraction: number;
    };
    /**
     * The run's spatial grid is the ground-truth manifest's grid; only the time axis is the run's own, because a forecast is initialised now and is valid forward.
     */
    forecast: {
      /** Spacing of the forecast time axis, in seconds of simulation time. */
      step_seconds: number;
      /** Number of forecast steps, the first being the initialisation instant. */
      step_count: number;
    };
    /**
     * The environment generator's ground-truth manifest. The runner reads the recorded drift velocities from it and does not define them.
     */
    ground_truth: {
      directory: string;
      manifest_file: string;
    };
    /**
     * The runner writes here and nowhere else. Nothing a reader can reach is touched by this component; making a run visible is the publisher's single operation.
     */
    staging: {
      directory: string;
      forecast_file: string;
      uncertainty_file: string;
      manifest_file: string;
    };
    /**
     * Width of the stored data variables. Byte-identity does not survive a silent change of precision, so it is stated and recorded.
     */
    stored_dtype: "float32" | "float64";
  };
}
