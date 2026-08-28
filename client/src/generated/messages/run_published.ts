// DO NOT EDIT.
// Generated from contracts/schemas/run-published.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The message the publisher publishes on ctl/run-published once a completed run has become visible in one indivisible step. It is how every consumer learns that a new forecast exists: nothing in drogna polls the query layer to ask whether anything has changed. It carries the fixed collection identifier the query layer serves runs under and the run identifier separately, so a consumer can address the current run at the collection itself and a specific run as the EDR instance run_id names, without a configuration file having been edited anywhere.
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
 * The fixed collection identifier under which the query layer serves every published run. One collection carries the forecast parameters and the uncertainty parameter together, rather than two collections that could disagree about the run they describe, and publishing a run adds no collection: the current run is served at the collection itself, and a specific run as the EDR instance this announcement's run_id names. The identifier is carried beside the run identifier rather than derived from it, which is what makes the pair addressable by a consumer that has only this message.
 */
export interface Collections {
  /**
   * The fixed collection identifier. Its parameters carry the ensemble mean and the per-cell ensemble spread together; there is no separate uncertainty collection, and this document deliberately has nowhere to name one.
   */
  forecast: string;
}

/**
 * SHA-256 digests of the two published fields. A reader that has both bytes and digest can say which run it read, which is what makes the atomicity claim checkable rather than merely asserted.
 */
export interface Digests {
  forecast: string;
  uncertainty: string;
}
