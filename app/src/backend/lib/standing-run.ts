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
 * released and the timeline drew all four beside it.
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
import { isoPlusSeconds } from './sim-time.js';

/**
 * The standing forecast as its announcement would read, or undefined where the store holds
 * no forecast — or holds one without the spread field that travels with it, which is a pair
 * a run always publishes together and so means the store is mid-publication rather than
 * standing on something.
 */
export type StandingRun = Pick<
  RunPublished,
  'run_id' | 'current' | 'sim_time' | 'tick' | 'valid_time' | 'grid_bounds' | 'collections' | 'digests'
>;

/**
 * The facts about the standing forecast, without the announcement's envelope.
 *
 * Split from the announcement because only one of the two readers publishes. The offload
 * packager needs the run's id, its forecast collection and its validity window and nothing
 * else; handed a whole `RunPublished` it had to invent a `component`, and the only value it
 * has to hand is its own id — a packager claiming to have published a forecast. It never
 * reached the wire, which is why nothing broke, but a field that is false wherever it is
 * cheapest to fill in is a field waiting to be logged or forwarded.
 */
export function standingRunFacts(store: CoverageStore): StandingRun | undefined {
  const standing = store.currentInstance();
  if (!standing) return undefined;
  const spread = store.holding(`${standing.descriptor.holding_id}-spread`);
  if (!spread) return undefined;
  const grid = standing.descriptor.manifest.grid;
  const start = isoPlusSeconds(grid.time.origin_sim_time, grid.time.start_offset_seconds);
  return {
    /**
     * **The instant the run was published, not the instant it is being restated at.**
     *
     * A first version dated the restatement at the moment it was said, on the analogy of the
     * forecast-features restatement, and amended the master to say that nothing reasoning
     * about the forecast reads this field. Two panels did. The Forecast timeline overwrites a
     * run's `publishedAtTick` from it and then renders "published at tick N, X tick(s) after
     * it began" — a run that took its declared 9 ticks was drawn as taking 510. The consumers
     * frame renders it as "published <instant>" and was out by the distance from the run's
     * real publication to the console opening, which in a replayed pre-roll is thousands of
     * ticks.
     *
     * The harness had already settled this one file away: `CoverageStore.announce()`
     * re-announces a standing holding on an operator prompt carrying
     * `descriptor.published_at.sim_time` — the original instant. A restatement is a statement
     * about when the run happened, and the run happened when it happened.
     */
    sim_time: standing.descriptor.published_at.sim_time,
    tick: standing.descriptor.published_at.tick,
    // The holding id, not the descriptor's `run_id`. A coverage holding carries both and
    // they are not the same thing: `run_id` on the descriptor is the **scenario** run
    // (`loiter-loitering-pahv`), while the model run this announcement is about is the
    // holding's own id (`loiter-loitering-pahv-run-t1800`), because the runner publishes its
    // forecast under `forecastId = request.run_id`. Two fields, one name, and the first draft
    // took the wrong one — telemetry keys its skill ledger by this and dropped every residual
    // sample for the rest of the visit, which is the surface reporting silence where the
    // monitor was publishing the whole time.
    run_id: standing.descriptor.holding_id,
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

/**
 * The same facts as the announcement the model runner publishes, for the model runner to
 * restate. Only the addressing is the restating component's own — `component` and
 * `scenario_run_id`; the run's instant comes off the descriptor, for the reason recorded
 * above.
 */
export function standingRunFromStore(
  store: CoverageStore,
  component: string,
  scenarioRunId: string,
): RunPublished | undefined {
  const facts = standingRunFacts(store);
  if (!facts) return undefined;
  return { component, scenario_run_id: scenarioRunId, ...facts };
}
