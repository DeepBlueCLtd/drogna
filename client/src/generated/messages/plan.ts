// DO NOT EDIT.
// Generated from contracts/schemas/plan.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * What the planner publishes on ctl/plan. It names the planning cells where sampling would reduce uncertainty most, states by how much, and states for every region in the domain when its confidence will lapse. What it is not is worth saying in the document rather than leaving to convention: it is not an instruction. There is no addressee, no recipient, no priority to be obeyed and no field naming anything that is to be done, because the harness is headless with respect to decisions and rendering and advice happen downstream (SRD FR-36, Constitution VIII). The stronger form of that guarantee is structural: every string property in this document is an enumeration, a constant, an identifier matching a declared pattern, or a simulation instant, so there is nowhere a sentence addressed to a person could be written. The route's value is collapse-aware — it already accounts for the sampling the route does on its way, so a consumer that summed the vertices' standalone values would obtain a larger and wrong number (SRD FR-32, FR-33).
 */
export interface DrognaSamplingRecommendation {
  /** The component id of the planner that produced it, matching config /component/id. */
  component: string;
  /** The scenario run this recommendation belongs to, as carried on every clock sample. */
  scenario_run_id: string;
  /** Simulation time at which the recommendation was produced. */
  sim_time: SimTime;
  /**
   * The tick index the planner had observed. A tick is the unit of causality; an instant is not.
   */
  tick: number;
  /**
   * What this message is, stated in the payload so that a reader who has only the bytes knows it is a recommendation. There is deliberately no second value.
   */
  kind: "sampling-recommendation";
  /**
   * Deterministic identifier derived from the run's root seed and this recommendation's ordinal, never from entropy or a host clock (Constitution II).
   */
  plan_id: string;
  /**
   * The plan_id this recommendation replaces, or null for the first of a scenario. Carried so a consumer can tell a replan from a first plan without keeping a history of its own.
   */
  supersedes: string | null;
  /**
   * What the planner was able to do. The same three states the planner's heartbeat carries, so a reader of either can say why a route is empty.
   */
  state: "planning" | "no-field" | "nothing-worth-sampling";
  /**
   * Why the route is empty, or null when it is not. An empty route is stated with its reason rather than replaced by the nearest cell as a consolation: a planner that always recommends motion is a planner nobody can trust when it recommends motion.
   */
  empty_reason: "no-field" | "budget-too-small" | "nothing-worth-sampling" | null;
  horizon: Horizon;
  uncertainty_field: UncertaintyField;
  indexing: Indexing;
  platform: Platform;
  route: Route;
  selection: Selection;
  commitment: Commitment;
  projection: Projection;
}

/**
 * A simulation instant, ISO-8601 UTC with microsecond precision, taken from the clock port. Never a host clock value, and never a format that would invite one (Constitution I).
 */
export type SimTime = string;

/**
 * An H3 cell index in its usual lower-case hexadecimal spelling. The resolution it belongs to is stated once, under indexing, rather than implied per vertex.
 */
export type H3Index = string;

/**
 * The span of simulation time this recommendation reasons over. The horizon recedes: each replan moves both ends forward, and the projection is computed to its far end.
 */
export interface Horizon {
  start_sim_time: SimTime;
  end_sim_time: SimTime;
  /** The horizon's length in seconds of simulation time. */
  span_seconds: number;
}

/**
 * Which published uncertainty field this recommendation was computed from, read through the coverage read port. A recommendation is never produced against a field that has already been superseded, and naming the field here is what lets a reader check that rather than trust it.
 */
export interface UncertaintyField {
  /** The model run whose per-cell ensemble spread was read. */
  run_id: string;
  /**
   * Which published spread variable the planner scored. One scalar field is scored, not both: combining degrees Celsius with practical salinity units needs a weighting between them that nothing in the requirements supplies, so none is invented here.
   */
  variable: "temperature_spread" | "salinity_spread";
  /**
   * Digest of the field's bytes where the announcement carried one, so a reader with the same bytes can say it read the same field. Null when the field was supplied without one.
   */
  digest: string | null;
}

/**
 * H3 in the horizontal at one stated resolution, layered with a separate depth index (SRD FR-35). The resolution is stated in every recommendation so the granularity of a recommendation is visible rather than implied: a route through resolution-6 cells is a coarser claim than one through resolution-9 cells, and the difference is not recoverable from the vertices.
 */
export interface Indexing {
  /** The H3 resolution every h3_index in this message belongs to. */
  h3_resolution: number;
  /**
   * The vertical index, shallowest first. A planning cell is the pairing of an H3 index with one of these bands.
   */
  depth_bands: DepthBand[];
}

export interface DepthBand {
  /**
   * Position in the vertical index, shallowest first. This is what a vertex's depth_band refers to.
   */
  index: number;
  /** Shallow edge of the band in metres, positive downwards. */
  minimum_depth_m: number;
  /** Deep edge of the band in metres, positive downwards. */
  maximum_depth_m: number;
}

/**
 * A position, a depth and a budget. Nothing else: no heading, no speed, no identity carried between one recommendation and the next, and no history. A sampling platform in drogna is a coordinate and a sampler (Constitution V).
 */
export interface Platform {
  /** Degrees north, WGS 84. */
  latitude: number;
  /** Degrees east, WGS 84. */
  longitude: number;
  /** Depth below the surface in metres, positive downwards. */
  depth_m: number;
}

/**
 * One ordered sequence of planning cells, chosen under a budget. It is not a tour: most candidates are deliberately left unvisited, there is no return to the origin, and the count of what was considered against what was chosen is carried under selection so that the difference is checkable. Each vertex is four-dimensional — an H3 index, a depth band and an arrival instant — so the recommendation is a curve through the forecast volume rather than a line on a chart.
 */
export interface Route {
  /**
   * The route in order. Empty when there is nothing worth recommending, in which case empty_reason says why.
   */
  vertices: Vertex[];
  /**
   * The route's collapse-aware value: the sum of the marginal uncertainty reductions in traversal order, each measured against the field as it stands after every earlier visit has collapsed it and after regrowth to that arrival instant. Diminishing returns are already inside this number and must not be applied again by a consumer.
   */
  value: number;
  /**
   * What the same route would have been worth had each vertex been scored against the field as it stood at the horizon's start, with no earlier visit having collapsed it — the sum a consumer would reach from standalone per-cell values. It is carried because the gap between the two is the size of the error the arrival-time scoring avoids, and a number nobody can see is a number nobody checks. On a field that does not change across the horizon it is never smaller than value. Where it is smaller, the field itself grew between the horizon's start and the arrivals, and the gap is the same error in the other direction: a planner scoring against the present would have undervalued the route. That case is why the naive figure is published beside the collapse-aware one rather than left to be inferred.
   */
  value_without_collapse: number;
  /** The traversal budget in seconds of simulation time, at the configured nominal speeds. */
  budget_seconds: number;
  /**
   * What the route consumes of that budget. A route consuming more than its budget is a defect, not a suggestion.
   */
  consumed_seconds: number;
  /**
   * Great-circle distance along the route, in metres. Horizontal only; the vertical component of the cost is in consumed_seconds.
   */
  distance_m: number;
}

/**
 * One planning cell on the route, with the simulation instant at which it would be reached. The instant is what makes the collapse simulation reproducible by a reader: regrowth between two vertices is a function of the interval between their arrival instants and the local decorrelation timescale.
 */
export interface Vertex {
  /**
   * Position along the route, counting from zero. Carried explicitly so that array order is not the only thing asserting it.
   */
  sequence: number;
  h3_index: H3Index;
  /** Index into indexing/depth_bands. */
  depth_band: number;
  arrival_sim_time: SimTime;
  /** Centre of the H3 cell, degrees north. */
  latitude: number;
  /** Centre of the H3 cell, degrees east. */
  longitude: number;
  /** Centre of the depth band in metres, positive downwards. */
  depth_m: number;
  /**
   * What this vertex adds to the route's value, measured against the field as it stands when the vertex is reached. A vertex reached after a nearer one has already resolved the water around it carries a small number here, and that is the whole of the diminishing-returns behaviour, visible per vertex.
   */
  marginal_value: number;
}

/**
 * The problem formulation and the heuristic, carried so that a reader can say what kind of answer this is. Route selection is orienteering — cells carry prizes, traversal carries cost, a subset is chosen under a budget — and explicitly not travelling-salesman: there is no requirement that every candidate be visited and no tour to close.
 */
export interface Selection {
  /**
   * The problem this is a solution to. There is deliberately no second value: a tour formulation would be a different component.
   */
  formulation: "orienteering-prize-collecting";
  /**
   * Orienteering is NP-hard and nothing here requires optimality. What it requires is the right formulation and determinism, so the search is a greedy insertion with a fixed number of seeded randomised restarts and seeded tie-breaks.
   */
  heuristic: "greedy-insertion-seeded-restarts";
  /** How many planning cells were considered. */
  candidate_cell_count: number;
  /**
   * How many were chosen. Smaller than candidate_cell_count whenever the budget binds, which is what prize-collecting looks like from outside.
   */
  visited_cell_count: number;
  /**
   * How many randomised restarts the search ran, every draw taken from the seeded generator so the same field, budget and seed give the same route.
   */
  restarts: number;
}

/**
 * The planner replans on a receding horizon and holds its commitment: the part of the previous route falling inside the commitment window is retained unless changing it improves the value by more than the configured margin. Commitment without hysteresis is not commitment, and a departure is recorded with its margin so that a reader can see the planner changed its mind and by how much.
 */
export interface Commitment {
  /**
   * The commitment window in seconds of simulation time, measured forward from this recommendation's start.
   */
  window_seconds: number;
  /** How many vertices of the previous route survive unchanged at the head of this one. */
  retained_vertex_count: number;
  /**
   * Whether the committed prefix was abandoned. False for a first recommendation, which has no predecessor to depart from.
   */
  departed_from_previous: boolean;
  /**
   * Value of the freely replanned route minus the value of the route that keeps the committed prefix. Zero when there was no predecessor.
   */
  improvement_over_retained: number;
  /**
   * The improvement the free route had to beat to justify departing, as an absolute value in the same units as route/value.
   */
  margin: number;
}

/**
 * Uncertainty projected forward from the current field to the end of the horizon, region by region, so the output is schedulable rather than merely reactive: a consumer can reason about a stated future instant instead of waiting for a present condition. Every region in the domain appears here. Omission is not permitted, because an absent region reads as a healthy one.
 */
export interface Projection {
  /**
   * The forward march's step in seconds of simulation time. A crossing instant is resolved to this step: the growth law has a closed form, but the projection is marched so that a growth law without one would need no new machinery.
   */
  step_seconds: number;
  /** How far forward the march ran, in seconds of simulation time. */
  horizon_seconds: number;
  /**
   * The uncertainty above which confidence is no longer usable, in the units of the scored spread variable. Scenario configuration; nothing in the requirements fixes a value.
   */
  usable_threshold: number;
  /**
   * How many regions the domain has. Equal to the length of regions, carried so that a truncated message is detectable rather than merely shorter.
   */
  region_count: number;
  /** One entry per region, ordered by H3 index so two replays produce the same bytes. */
  regions: ProjectionEntry[];
}

/**
 * A region is one H3 cell. Its state is decided by whichever of its depth bands lapses first, and that band is named, because a region that is usable at the surface and blind at depth is not a usable region.
 */
export interface ProjectionEntry {
  h3_index: H3Index;
  /**
   * The band whose confidence lapses first, or the band with the largest projected uncertainty where none lapses.
   */
  depth_band: number;
  /**
   * crossing: confidence falls below usable at crossing_sim_time. already-lapsed: it is already below now, which is what arriving cold looks like. no-crossing-within-horizon: it does not lapse before the horizon ends, stated explicitly rather than by absence.
   */
  state: "crossing" | "already-lapsed" | "no-crossing-within-horizon";
  /**
   * The simulation instant at which confidence falls below usable, resolved to one projection step. Null when the state is no-crossing-within-horizon.
   */
  crossing_sim_time: SimTime | null;
  /** The region's uncertainty at sim_time, in the units of the scored spread variable. */
  uncertainty_now: number;
  /**
   * What the region's uncertainty grows back to given unlimited time without a measurement: the published ensemble spread there. A region whose saturated uncertainty is below the threshold never lapses however long it is left, and says so.
   */
  saturated_uncertainty: number;
  /**
   * The decorrelation timescale evaluated at this region, in seconds. It is a field with a domain-wide background, so every region has one — including open water outside every seeded feature — and there is no fallback constant anywhere in this message (ADR-0002, SRD FR-05).
   */
  timescale_seconds: number;
}
