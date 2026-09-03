/**
 * What the coverage store says about the forecast that stands, in the shape the run's own
 * announcement carries (feature 125).
 *
 * `run_published` is the only statement that a forecast stands, and four components hold
 * nothing but what it told them: the scheduler its remaining validity, the offload packager
 * the run it would stage, the analyst the spread field its next background covariance is
 * built from, and telemetry the run its skill is scored against. Each learns it once, from
 * the model runner, and keeps it in memory — so any component that was not listening when
 * the run was published has no way back to it.
 *
 * Two ordinary things put a component in that position. A reader restarts one from the
 * Operator tab. Or a start condition's artefact carries the forecast eras, which holds the
 * model runner back for the whole pre-roll while the snapshot source replays the holdings it
 * would have authored — so the announcement is never made at all, and every consumer above
 * spends the visit believing no forecast exists. Measured before this existed: `returning`
 * opened with **zero** staged bundles against a live run's five, its card promising "a
 * package staged for offload" while the Offload surface told the reader nothing had been
 * released and the timeline drew eight forecasts beside it.
 *
 * **This is a reading of the store, not a new claim about the run.** Every field comes off
 * the descriptor the model runner published and the manifest embedded in it: the run id, the
 * two collection ids, their digests, the grid bounds, and the time axis the validity window
 * is read from. Nothing is recomputed and no forecast is re-run. That is what separates it
 * from the thing ADR-0041 forbids — a snapshot source composing an announcement no component
 * ever made — and it is the rule the environment generator already resumes under: the
 * store's inventory, descriptors only, never a truth-derived field.
 */
import type { CoverageStore } from '../coverage-store/store.js';
import type { RunPublished } from '../../generated/types.js';

/** Seconds added to an ISO instant, preserving the microsecond precision the seam uses. */
function isoPlusSeconds(iso: string, seconds: number): string {
  const millis = Date.parse(iso.slice(0, 23) + 'Z') + seconds * 1000;
  return `${new Date(millis).toISOString().replace('Z', '')}000Z`;
}

/**
 * The standing forecast as its announcement would read, or undefined where the store holds
 * no forecast — or holds one without the spread field that travels with it, which is a pair
 * a run always publishes together and so means the store is mid-publication rather than
 * standing on something.
 */
export function standingRunFromStore(
  store: CoverageStore,
  component: string,
  scenarioRunId: string,
  simTime: { value: string; tick: number },
): RunPublished | undefined {
  const standing = store.currentInstance();
  if (!standing) return undefined;
  const spread = store.holding(`${standing.descriptor.holding_id}-spread`);
  if (!spread) return undefined;
  const grid = standing.descriptor.manifest.grid;
  const start = isoPlusSeconds(grid.time.origin_sim_time, grid.time.start_offset_seconds);
  return {
    component,
    scenario_run_id: scenarioRunId,
    sim_time: simTime.value,
    tick: simTime.tick,
    run_id: standing.descriptor.run_id,
    current: true,
    valid_time: {
      start_sim_time: start,
      end_sim_time: isoPlusSeconds(start, (grid.time.count - 1) * grid.time.step_seconds),
    },
    grid_bounds: {
      minimum_latitude: grid.latitude.minimum,
      maximum_latitude: grid.latitude.maximum,
      minimum_longitude: grid.longitude.minimum,
      maximum_longitude: grid.longitude.maximum,
      minimum_depth_m: grid.depth.minimum,
      maximum_depth_m: grid.depth.maximum,
    },
    collections: { forecast: standing.descriptor.holding_id, uncertainty: spread.descriptor.holding_id },
    digests: { forecast: standing.descriptor.field.sha256, uncertainty: spread.descriptor.field.sha256 },
  };
}
