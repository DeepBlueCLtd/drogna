// DO NOT EDIT.
// Generated from contracts/schemas/run-request.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { DrognaDivergenceEvent, Region } from "./divergence";

/**
 * The message the scheduler publishes on ctl/run-request, and the only route by which a model run begins. It carries the divergence that justified it in full rather than by reference, so that the reason a run was spent is legible from the request alone and does not depend on another message still being retained. The run identifier is derived from the root seed and the run ordinal, so a replay requests the same run under the same name.
 */
export interface DrognaModelRunRequest {
  /** The scheduler that published the request, matching config /component/id. */
  component: string;
  /** The scenario run this request belongs to, as carried on every clock sample. */
  scenario_run_id: string;
  /**
   * Simulation time at which the request was published, ISO-8601 UTC with microsecond precision.
   */
  sim_time: string;
  /** The tick index the scheduler had observed. */
  tick: number;
  /**
   * Deterministic model run identifier, derived from the root seed and the logical run ordinal. It names the run in every later message and in the coverage store.
   */
  run_id: string;
  /** The simulation instant the run initialises from. The forecast is valid forward of it. */
  initialisation_sim_time: string;
  /**
   * How many perturbed members the run is asked for. At least two, or there is no spread to publish and the uncertainty field would be a fiction.
   */
  ensemble_size: number;
  /**
   * The region that diverged. It does not bound the run's domain, which is the whole grid; it records where the disagreement was.
   */
  region: Region;
  /** The divergence event that justified this request, carried whole. */
  divergence: DrognaDivergenceEvent;
}
