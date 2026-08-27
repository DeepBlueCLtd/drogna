// DO NOT EDIT.
// Generated from contracts/schemas/run-published.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The message the publisher publishes on ctl/run-published once a completed run has become visible in one indivisible step. It is how every consumer learns that a new forecast exists: nothing in drogna polls the query layer to ask whether anything has changed. It carries the collection identifiers under which the two fields are servable, so a consumer can address them without a configuration file having been edited anywhere.
 */
export interface DrognaModelRunPublished {
  /** The publisher, matching config /component/id. */
  component: string;
  /** The scenario run this belongs to. */
  scenario_run_id: string;
  /** Simulation time at which the run became visible, ISO-8601 UTC with microsecond precision. */
  sim_time: string;
  /** The tick index the publisher had observed. */
  tick: number;
  /** The model run that has been published. */
  run_id: string;
  /**
   * Whether this run is now the current one. Announced rather than assumed, because a run can be published for inspection without being made current.
   */
  current: boolean;
  valid_time: ValidTime;
  grid_bounds: GridBounds;
  collections: Collections;
  digests: Digests;
}

/** The simulation-time span the forecast covers, inclusive of both ends. */
export interface ValidTime {
  /** Simulation time of the first forecast step. */
  start_sim_time: string;
  /** Simulation time of the last forecast step. */
  end_sim_time: string;
}

/**
 * The extent of the published grid on all three spatial axes. Depth increases downwards, as the field itself says explicitly.
 */
export interface GridBounds {
  minimum_latitude: number;
  maximum_latitude: number;
  minimum_longitude: number;
  maximum_longitude: number;
  minimum_depth_m: number;
  maximum_depth_m: number;
}

/**
 * The identifiers under which the query layer serves this run's two fields. They are resolved from the store's layout at request time, so publishing a run adds collections without editing any configuration.
 */
export interface Collections {
  /** Collection identifier of the ensemble mean. */
  forecast: string;
  /** Collection identifier of the per-cell ensemble spread. */
  uncertainty: string;
}

/**
 * SHA-256 digests of the two published fields. A reader that has both bytes and digest can say which run it read, which is what makes the atomicity claim checkable rather than merely asserted.
 */
export interface Digests {
  forecast: string;
  uncertainty: string;
}
