// DO NOT EDIT.
// Generated from contracts/schemas/config.planner.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-15, the adaptive sampling planner. Every number that decides where sampling would most reduce uncertainty is here, because the sensing model is required to be explicit rather than an accident of the grid resolution (SRD FR-32) and because a decay length buried in source is a decay length nobody tunes. The common sections are referenced from config.common.schema.json rather than restated, and unknown keys are rejected so that a typo is a startup failure rather than a silent default. Nothing here names an addressee or a recipient: this component recommends, and configuring it to command would be a change to Constitution VIII rather than a change to this document.
 */
export interface DrognaPlannerConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  planner: {
    /**
     * H3 in the horizontal at one resolution, layered with a separate depth index (SRD FR-35). A planning cell is the pairing of an H3 index with a depth band. The resolution is configuration because the domain's size and the sensing footprint's decay length together decide a sensible value, and because the granularity of a recommendation must be visible rather than implied.
     */
    indexing: {
      /** The H3 resolution every planning cell belongs to. */
      h3_resolution: number;
      /**
       * The vertical index, shallowest first. Adjacent bands are expected to meet rather than overlap; the planner refuses a vertical index whose bands are out of order or inverted.
       */
      depth_bands: ({
        /** Shallow edge in metres, positive downwards. */
        minimum_depth_m: number;
        /** Deep edge in metres, positive downwards. */
        maximum_depth_m: number;
      })[];
      /**
       * Bound on the horizontal cells the domain is covered with. A resolution one step too fine multiplies the cell count by seven, and an unbounded cover would turn a misconfiguration into an unbounded search rather than a startup failure.
       */
      maximum_cells: number;
    };
    /**
     * One scalar spread field is scored, not both: combining degrees Celsius with practical salinity units needs a weighting between them that nothing in the requirements supplies. The threshold is the value above which confidence is no longer usable, and the SRD fixes no number for it.
     */
    uncertainty: {
      /** Which published per-cell ensemble spread variable the planner scores. */
      variable: "temperature_spread" | "salinity_spread";
      /**
       * Uncertainty above which confidence is no longer usable, in the units of the scored variable. A cell already below it is worth approximately nothing to visit, which is what stops the planner recommending motion for its own sake.
       */
      usable_threshold: number;
    };
    /**
     * Which cells a visit informs and by how much, in the horizontal and in depth. SRD FR-32 requires this to be an explicit configured model rather than an implicit consequence of the grid resolution, so it is stated here in full and derived in docs/algorithms/informative-path-planning.md.
     */
    sensing: {
      /** Horizontal e-folding distance of the footprint in metres. */
      horizontal_decay_m: number;
      /** Vertical e-folding separation of the footprint in metres. */
      vertical_decay_m: number;
      /**
       * The fraction of a cell's uncertainty a visit removes at the visited cell itself. Strictly below one leaves residual uncertainty at a sampled cell, which is honest: an instrument reading does not resolve a cell exactly.
       */
      peak_reduction: number;
      /**
       * How many H3 rings out from the visited cell the footprint is evaluated over. The kernel is unbounded and the cover is not, so the extent is stated rather than left to a tolerance.
       */
      maximum_rings: number;
      /** How many depth bands either side of the visited band the footprint is evaluated over. */
      maximum_band_separation: number;
    };
    /**
     * A position, a depth and a budget, and nothing else (Constitution V). No identity is carried between recommendations, and there is no history here because a recommended route over cells is not a history of anything.
     */
    platform: {
      /**
       * Nominal horizontal speed. The budget is expressed in seconds and converted to distance here, because the SRD says 'under a budget' without fixing its units.
       */
      horizontal_speed_m_per_s: number;
      /**
       * Nominal rate of change of depth. Changing band costs time even where it costs no distance, which is why a route's distance and its consumption are reported separately.
       */
      vertical_speed_m_per_s: number;
      /**
       * Traversal budget in seconds of simulation time. A route exceeding it is a defect, not a suggestion.
       */
      budget_seconds: number;
      /**
       * Where the platform is when the scenario begins. Later recommendations plan from where it has since been reported to be.
       */
      start: {
        /** Degrees north, WGS 84. */
        latitude: number;
        /** Degrees east, WGS 84. */
        longitude: number;
        /** Depth below the surface in metres, positive downwards. */
        depth_m: number;
      };
    };
    /**
     * How far forward a recommendation reasons, and how often it is recomputed. Both are simulation time: a planner pacing itself on the host clock would recommend differently on a fast machine, which is exactly the failure Constitution I exists to prevent.
     */
    horizon: {
      /** Length of the planning horizon in seconds of simulation time. */
      span_seconds: number;
      /**
       * Simulation time between cadence-driven replans. A new uncertainty field and the arrival of measurements also trigger one, so this is the longest a recommendation may stand rather than the only reason it is replaced.
       */
      replan_cadence_seconds: number;
    };
    /**
     * SRD FR-33 asks for a single committed route, and commitment without hysteresis is not commitment. The window says how much of the route is held; the margin says what an alternative must beat to justify abandoning it. Both are this feature's choice and both are configuration.
     */
    commitment: {
      /**
       * How far forward from a recommendation's start the committed prefix reaches, in seconds of simulation time. Zero commits to nothing, which is a legitimate configuration and a visible one.
       */
      window_seconds: number;
      /**
       * How much better the freely replanned route must be, in the units of the route's value, before the committed prefix is abandoned. A departure is recorded with this margin so that a reader can see the planner changed its mind and by how much.
       */
      improvement_margin: number;
    };
    /**
     * SRD FR-34: every region is reported with the simulation time at which its confidence lapses, or with an explicit statement that it does not within the horizon. The march is stepped rather than solved because a growth law without a closed form would then need no new machinery.
     */
    projection: {
      /**
       * Step of the forward march in seconds of simulation time. A crossing instant is resolved to this step, and the projection's accuracy is stated against it rather than claimed exact.
       */
      step_seconds: number;
      /**
       * How far forward the march runs, in seconds of simulation time. Absent, the planning horizon's own span is used, which is the case where the recommendation and the projection cover the same span.
       */
      horizon_seconds?: number;
    };
    /**
     * Orienteering is NP-hard and nothing in the requirements asks for optimality. What they ask for is the right formulation (SRD FR-35) and determinism (Constitution II), so the search is a greedy insertion with a fixed number of seeded randomised restarts. Every draw comes through the RNG port; a bare generator anywhere in this package is a constitution violation rather than a shortcut.
     */
    search: {
      /**
       * How many randomised restarts the search runs. One is a pure greedy insertion with no draw taken at all.
       */
      restarts: number;
      /**
       * Bound on the planning cells considered in one search, taken as the most valuable at the horizon's start. The count considered and the count chosen are both published, so the bound is visible in the recommendation rather than hidden in a configuration file.
       */
      maximum_candidates: number;
      /**
       * How many of the best insertions a randomised restart draws its next move from. One reduces every restart to the same greedy answer, so a restart count above one with a shortlist of one is stated as such rather than silently wasted.
       */
      shortlist: number;
    };
    /**
     * The planner reads the field through the coverage read port and not through the query layer: it sits inside the boundary SRD 2.2 draws, and routing an internal consumer out through the external read path and back would claim a seam that is not there. It learns that a new field exists from the announcement on the control namespace; nothing here polls anything for freshness.
     */
    coverage: {
      /** Root of the coverage store. */
      root_directory: string;
      /** Name of the text file in the root holding one run identifier on one line (ADR-0011). */
      current_pointer: string;
      /**
       * Name of the directory under the root holding the run directories. The pointer names a run, not a path.
       */
      runs_dirname: string;
      /** Name of the per-cell ensemble spread field inside a run's directory. */
      uncertainty_file: string;
    };
    /**
     * ADR-0002 makes tau a field, authored per feature over a domain-wide background and evaluated per location, and its last consequence forbids the authored representation reaching a consumer. The planner therefore reads the generator's ground-truth manifest and asks the generator's own evaluation for a number at a point, rather than blending background and features itself. Every planning cell has a defined tau, background water included, and there is no fallback constant in this component to configure.
     */
    environment: {
      /** Directory holding the environment generator's output. */
      directory: string;
      /** Name of the ground-truth manifest inside that directory. */
      manifest_file: string;
    };
  };
}
