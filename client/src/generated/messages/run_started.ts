// DO NOT EDIT.
// Generated from contracts/schemas/run-started.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The message the model runner publishes on ctl/run-started before it computes anything. It is published first so that a run which then fails is still visible as a run that was attempted: a loop whose second step leaves no trace is a loop nobody can debug. It names the kernel that will do the work, because the kernel is a port with more than one implementation and which one ran is not otherwise recoverable from the output.
 */
export interface DrognaModelRunStarted {
  /** The model runner, matching config /component/id. */
  component: string;
  /** The scenario run this belongs to. */
  scenario_run_id: string;
  /** Simulation time at which work began, ISO-8601 UTC with microsecond precision. */
  sim_time: string;
  /** The tick index the runner had observed. */
  tick: number;
  /** The model run identifier from the request that caused this run. */
  run_id: string;
  /**
   * The divergence that justified the request, so the chain from observation to field is followable through the control namespace alone.
   */
  divergence_id: string;
  /**
   * Ensemble members this run will execute. A member that fails invalidates the run rather than shrinking it.
   */
  member_count: number;
  /** The model kernel implementation selected by configuration, behind the kernel port. */
  kernel: string;
  /** The simulation instant the run initialises from, echoed from the request. */
  initialisation_sim_time: string;
}
