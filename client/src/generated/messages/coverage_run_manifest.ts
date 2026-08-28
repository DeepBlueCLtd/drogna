// DO NOT EDIT.
// Generated from contracts/schemas/coverage-run-manifest.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The document that sits beside a published run in the coverage store, and the reason a served value can be traced back to what produced it. Constitution III requires a shape that crosses a boundary to have a master, and this one crosses the widest boundary in the harness: the publisher writes it and the query layer refuses to catalogue a run without it, which is why its rules were stated twice — in stores/coverage/layout.md and in each of the two implementations — before this file existed. It is not run-manifest.schema.json, which is C-01's record of how to replay a whole scenario; this one describes one forecast run and is read by a catalogue rather than by a replay.
 */
export interface DrognaCoverageRunManifest {
  /** Bumped when the shape changes in a way a reader must notice. */
  schema_version: number;
  /**
   * This run's identifier. It must equal the name of the directory holding this file: a run whose manifest disagrees with its directory is refused rather than catalogued, because nothing in a response would then say which of the two names it was answering under.
   */
  run_id: string;
  /**
   * The seed the run derives from. With run_sequence it determines run_id, by the rule stores/coverage/layout.md states.
   */
  root_seed: number;
  /**
   * Which run of this scenario this is. Null where nothing carried it — a run named by a rule other than the store's cannot have its sequence read back out of its name, and a guess here would look like a fact that reproduced the run.
   */
  run_sequence: number | null;
  /** What produced the initial state this run was advected from. */
  generator_version: string;
  /** The model kernel that produced the forecast, and the version of the analytic form it used. */
  model_version: string;
  /**
   * The simulation time the run was made at. Simulation time, never host time (Constitution I).
   */
  sim_time: string;
  /**
   * Load-bearing beyond documentation: an EDR query that names no time is answered over this extent, taken from this document rather than from a host clock — there is no now here, and reading one to decide what a forecast says would be Constitution I broken at the one place the answer would still look right.
   */
  valid_time: {
    /** Start of the valid extent, in simulation time. */
    begin: string;
    /**
     * End of the valid extent, in simulation time. Not before begin — an ordering this document cannot express and the catalogue checks besides.
     */
    end: string;
  };
  ensemble: {
    /**
     * Members the run was computed over. At least two, or there is no spread and the uncertainty field beside this manifest would be a fiction.
     */
    members: number | null;
    /** How the members were combined into the published fields. */
    method: string;
  };
}
