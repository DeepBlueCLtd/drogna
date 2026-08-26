// DO NOT EDIT.
// Generated from contracts/schemas/divergence.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The message the monitor publishes on ctl/divergence when the current forecast has disagreed with the observations for long enough to be worth a model run. The residual is defined on sound speed and never on temperature (ADR-0005), and a single sample is never sufficient: the persistence evidence that justified the event travels with it so that a reader can judge the claim rather than trust it. The monitor raises requests only — nothing here instructs anybody to run anything, and the scheduler is free to decline.
 */
export interface DrognaDivergenceEvent {
  /** The component id of the monitor that raised it, matching config /component/id. */
  component: string;
  /** The scenario run this event belongs to, as carried on every clock sample. */
  scenario_run_id: string;
  /** Simulation time at which the event was raised, ISO-8601 UTC with microsecond precision. */
  sim_time: string;
  /** The tick index the monitor had observed when it raised the event. */
  tick: number;
  /**
   * Deterministic identifier derived from the root seed and the monitor's divergence ordinal, never from entropy or a host clock.
   */
  divergence_id: string;
  /**
   * The model run whose forecast field the residuals were scored against. Evidence gathered against a superseded field is discarded rather than carried, so every sample counted here scored this run.
   */
  forecast_run_id: string;
  region: Region;
  residual: Residual;
  persistence: Persistence;
  /**
   * The named equation the derivation used, so a residual can say which model of sound speed produced it.
   */
  sound_speed_equation: string;
}

/**
 * Where the disagreement is: a centre, a radius in metres and the depth band the contributing samples came from. A radius rather than a spatial index, because indexing belongs to the planner and coupling the monitor to it would buy nothing here.
 */
export interface Region {
  centre_latitude: number;
  centre_longitude: number;
  /** Radius enclosing the contributing samples, in metres. */
  radius_m: number;
  minimum_depth_m: number;
  maximum_depth_m: number;
}

/**
 * The disagreement in metres per second of sound speed. Signed on the mean, because a forecast that is uniformly too fast is a different fault from one that is noisy, and unsigned on the peak.
 */
export interface Residual {
  /** Signed mean of measured minus forecast sound speed over the contributing samples. */
  mean_m_per_s: number;
  /** Largest absolute residual among the contributing samples. */
  peak_m_per_s: number;
  /**
   * The threshold in force when the event was raised, of the order of 1.5 to 2 m/s, which is roughly half a degree Celsius. Carried so a reader need not guess what the scenario was tuned to.
   */
  threshold_m_per_s: number;
  /**
   * How many residual samples justified the event. Never one: a single sample is a spike, and a spike is not a divergence.
   */
  sample_count: number;
}

/**
 * Which rule was satisfied and over what. This is the part that separates a divergence from an outlier, so it is carried rather than summarised away.
 */
export interface Persistence {
  /**
   * spatial: distinct samples above threshold inside one neighbourhood. temporal: consecutive samples above threshold spanning at least the configured simulation-time span.
   */
  rule: "spatial" | "temporal";
  sample_count: number;
  /** Simulation-time span from the first contributing sample to the last, in seconds. */
  span_seconds: number;
  /** Simulation time of the earliest contributing sample. */
  first_sim_time: string;
  /** Simulation time of the latest contributing sample. */
  last_sim_time: string;
}
