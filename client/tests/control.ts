/**
 * Control messages, built from the generated types, as inputs to pure functions.
 *
 * FR-023 draws the line these values sit on the right side of: constructing a message
 * and handing it to a reducer is testing a reducer. Nothing in the built client can
 * reach this file, no page is rendered from it and called a running system, and the
 * `no-mock` test asserts as much by reading `src/` and finding no path here.
 *
 * Every builder returns a value typed as the generated interface for its master, so the
 * compiler refuses a message the contract does not describe, and `control.test.ts` puts
 * each one through the client's own validator so a drifted master fails here rather than
 * silently weakening every test that builds on these.
 */
import type { DrognaDivergenceEvent } from "../src/generated/messages/divergence";
import type { DrognaSamplingRecommendation, Vertex } from "../src/generated/messages/plan";
import type { DrognaModelRunPublished } from "../src/generated/messages/run_published";
import type { DrognaModelRunRequest } from "../src/generated/messages/run_request";
import type { DrognaModelRunStarted } from "../src/generated/messages/run_started";
import type { ForecastSkill } from "../src/generated/messages/telemetry";

export const SCENARIO = "scenario-0001";
export const RUN = "run-0007";
export const DIVERGENCE = "divergence-0003";
const DIGEST = `sha256:${"b".repeat(64)}`;

export function divergenceEvent(
  overrides: Partial<DrognaDivergenceEvent> = {},
): DrognaDivergenceEvent {
  return {
    component: "monitor",
    scenario_run_id: SCENARIO,
    sim_time: "2026-08-26T00:10:00.000000Z",
    tick: 600,
    divergence_id: DIVERGENCE,
    forecast_run_id: RUN,
    region: {
      centre_latitude: 50.1,
      centre_longitude: -3.2,
      radius_m: 12000,
      minimum_depth_m: 0,
      maximum_depth_m: 200,
    },
    residual: {
      mean_m_per_s: 2.4,
      peak_m_per_s: 3.1,
      threshold_m_per_s: 1.8,
      sample_count: 24,
    },
    persistence: {
      rule: "temporal",
      sample_count: 24,
      span_seconds: 900,
      first_sim_time: "2026-08-26T00:00:00.000000Z",
      last_sim_time: "2026-08-26T00:10:00.000000Z",
    },
    sound_speed_equation: "mackenzie-1981",
    ...overrides,
  };
}

export function runRequest(overrides: Partial<DrognaModelRunRequest> = {}): DrognaModelRunRequest {
  return {
    component: "scheduler",
    scenario_run_id: SCENARIO,
    sim_time: "2026-08-26T00:10:05.000000Z",
    tick: 605,
    run_id: RUN,
    // Required since 009 T053: the run ordinal travels on the request, so the coverage
    // store's manifest records which run of the scenario a field is rather than a null.
    run_sequence: 0,
    initialisation_sim_time: "2026-08-26T00:10:00.000000Z",
    ensemble_size: 12,
    region: {
      centre_latitude: 50.1,
      centre_longitude: -3.2,
      radius_m: 12000,
      minimum_depth_m: 0,
      maximum_depth_m: 200,
    },
    divergence: divergenceEvent(),
    ...overrides,
  };
}

export function runStarted(overrides: Partial<DrognaModelRunStarted> = {}): DrognaModelRunStarted {
  return {
    component: "model_runner",
    scenario_run_id: SCENARIO,
    sim_time: "2026-08-26T00:10:06.000000Z",
    tick: 606,
    run_id: RUN,
    divergence_id: DIVERGENCE,
    member_count: 12,
    kernel: "analytic-advection",
    initialisation_sim_time: "2026-08-26T00:10:00.000000Z",
    ...overrides,
  };
}

export function runPublished(
  overrides: Partial<DrognaModelRunPublished> = {},
): DrognaModelRunPublished {
  return {
    component: "publisher",
    scenario_run_id: SCENARIO,
    sim_time: "2026-08-26T00:12:00.000000Z",
    tick: 720,
    run_id: RUN,
    current: true,
    valid_time: {
      start_sim_time: "2026-08-26T00:10:00.000000Z",
      end_sim_time: "2026-08-26T06:10:00.000000Z",
    },
    grid_bounds: {
      minimum_latitude: 49.5,
      maximum_latitude: 50.5,
      minimum_longitude: -4,
      maximum_longitude: -2.5,
      minimum_depth_m: 0,
      maximum_depth_m: 500,
    },
    collections: { forecast: "forecast-run-0007", uncertainty: "uncertainty-run-0007" },
    digests: { forecast: DIGEST, uncertainty: DIGEST },
    ...overrides,
  };
}

export const PLAN = "0a1b2c3d4e5f6071";
const CELLS = ["8a1fb46622dffff", "8a1fb46622d7fff", "8a1fb46622c7fff"];

/** Four vertices, half an hour apart, descending. Enough to move a time control along. */
export function routeVertices(): Vertex[] {
  return [
    ["2026-08-26T00:20:00.000000Z", 50.0, -3.4, 20],
    ["2026-08-26T00:50:00.000000Z", 50.1, -3.3, 60],
    ["2026-08-26T01:20:00.000000Z", 50.2, -3.2, 120],
    ["2026-08-26T01:50:00.000000Z", 50.3, -3.1, 180],
  ].map(([arrival, latitude, longitude, depth], index) => ({
    sequence: index,
    h3_index: CELLS[index % CELLS.length] as string,
    depth_band: index % 2,
    arrival_sim_time: arrival as string,
    latitude: latitude as number,
    longitude: longitude as number,
    depth_m: depth as number,
    marginal_value: 1 / (index + 1),
  }));
}

export function samplingRecommendation(
  overrides: Partial<DrognaSamplingRecommendation> = {},
): DrognaSamplingRecommendation {
  const vertices = routeVertices();
  return {
    component: "planner",
    scenario_run_id: SCENARIO,
    sim_time: "2026-08-26T00:15:00.000000Z",
    tick: 900,
    kind: "sampling-recommendation",
    plan_id: PLAN,
    supersedes: null,
    state: "planning",
    empty_reason: null,
    horizon: {
      start_sim_time: "2026-08-26T00:15:00.000000Z",
      end_sim_time: "2026-08-26T06:15:00.000000Z",
      span_seconds: 21600,
    },
    uncertainty_field: { run_id: RUN, variable: "temperature_spread", digest: null },
    indexing: {
      h3_resolution: 10,
      depth_bands: [
        { index: 0, minimum_depth_m: 0, maximum_depth_m: 100 },
        { index: 1, minimum_depth_m: 100, maximum_depth_m: 300 },
      ],
    },
    platform: { latitude: 49.9, longitude: -3.5, depth_m: 0 },
    route: {
      vertices,
      value: 2.5,
      value_without_collapse: 3.4,
      budget_seconds: 7200,
      consumed_seconds: 6600,
      distance_m: 48000,
    },
    selection: {
      formulation: "orienteering-prize-collecting",
      heuristic: "greedy-insertion-seeded-restarts",
      candidate_cell_count: 64,
      visited_cell_count: vertices.length,
      restarts: 8,
    },
    commitment: {
      window_seconds: 1800,
      retained_vertex_count: 0,
      departed_from_previous: false,
      improvement_over_retained: 0,
      margin: 0.25,
    },
    projection: {
      step_seconds: 300,
      horizon_seconds: 21600,
      usable_threshold: 0.8,
      region_count: 3,
      regions: [
        {
          h3_index: CELLS[0] as string,
          depth_band: 0,
          state: "already-lapsed",
          crossing_sim_time: null,
          uncertainty_now: 1.1,
          saturated_uncertainty: 1.4,
          timescale_seconds: 3600,
        },
        {
          h3_index: CELLS[1] as string,
          depth_band: 1,
          state: "crossing",
          crossing_sim_time: "2026-08-26T01:00:00.000000Z",
          uncertainty_now: 0.4,
          saturated_uncertainty: 1.2,
          timescale_seconds: 5400,
        },
        {
          h3_index: CELLS[2] as string,
          depth_band: 0,
          state: "no-crossing-within-horizon",
          crossing_sim_time: null,
          uncertainty_now: 0.2,
          saturated_uncertainty: 0.5,
          timescale_seconds: 9000,
        },
      ],
    },
    ...overrides,
  };
}

/** A plan with nothing worth recommending, which is a result and not a failure. */
export function emptyRecommendation(reason: DrognaSamplingRecommendation["empty_reason"] = "budget-too-small"): DrognaSamplingRecommendation {
  const full = samplingRecommendation();
  return {
    ...full,
    state: reason === "no-field" ? "no-field" : "nothing-worth-sampling",
    empty_reason: reason,
    route: { ...full.route, vertices: [], value: 0, value_without_collapse: 0, consumed_seconds: 0, distance_m: 0 },
    selection: { ...full.selection, visited_cell_count: 0 },
  };
}

export function forecastSkill(overrides: Partial<ForecastSkill> = {}): ForecastSkill {
  return {
    component: "telemetry",
    scenario_run_id: SCENARIO,
    sim_time: "2026-08-26T00:14:00.000000Z",
    tick: 840,
    kind: "forecast-skill",
    forecast_run_id: RUN,
    reference_run_id: "run-0006",
    reference_changed: false,
    sample_count: 120,
    minimum_sample_count: 30,
    model_mean_square_error: 4.2,
    persistence_mean_square_error: 3.1,
    skill_score: -0.3548387096774194,
    formula: "1 - model_mean_square_error / persistence_mean_square_error",
    state: "not-beating-persistence",
    statement:
      "The forecast is not beating a persistence reference: holding the previous field constant would have been at least as accurate over these samples.",
    last_updated_sim_time: "2026-08-26T00:14:00.000000Z",
    freshness: "fresh",
    sound_speed_equation: "mackenzie-1981",
    ...overrides,
  } as ForecastSkill;
}

/** The bytes a message arrives as, which is what every reducer under test takes. */
export function wire(message: unknown): string {
  return JSON.stringify(message);
}
