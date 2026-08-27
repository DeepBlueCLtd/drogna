// DO NOT EDIT.
// Generated from contracts/schemas/telemetry.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { DrognaIngestTelemetry } from "./ingest_telemetry";
import type { DrognaOffloadTelemetry } from "./offload_telemetry";

/**
 * Every payload on the ctl/telemetry branch, defined once and discriminated by kind. The telemetry component (C-16) owns this document, which inverts the repository's usual rule that the earlier feature owns a shared file: features 007, 009 and 013 publish here first, and the alternative was each of them defining a telemetry shape that C-16 would immediately have had to widen. The shapes recorded here are therefore descriptions of what is already published, not proposals — residual-summary, scheduler-decision, run-failed and publication-refused were read out of the four control-loop services and transcribed. residual-sample, residual-statistics and forecast-skill are new: the first is the per-residual report a producer sends when a consumer needs the individual numbers rather than a count, and the last two are what C-16 itself publishes. The ingest client's report carries no kind at all, and rather than force a discriminator onto a shape already in use it is admitted by reference to its own master.
 */
export type DrognaTelemetry = ResidualSampleReport | ResidualSummary | SchedulerDecision | RunFailed | PublicationRefused | ResidualStatistics | ForecastSkill | DrognaIngestTelemetry | DrognaOffloadTelemetry;

/** The component reporting, matching config /component/id. */
export type ComponentId = string;

/** The scenario run this report belongs to, as carried on every clock sample. */
export type ScenarioRunId = string;

/**
 * A simulation instant, ISO-8601 UTC with microsecond precision. Simulation time, never host time: every interval in this branch except heartbeat cadence is measured on the clock port (Constitution I, ADR-0006).
 */
export type SimInstant = string;

/**
 * A simulation instant, or null where the thing it would date has not happened yet. Null rather than a zero instant: a default here would read as a real moment.
 */
export type NullableSimInstant = string | null;

/** The tick index the reporter had observed when it composed the message. */
export type TickIndex = number;

/**
 * The model run whose field the residuals were scored against. Attribution is to the run scored against, not to whichever run happens to be current when the message is read.
 */
export type ForecastRunId = string;

/**
 * The named sound-speed fit that produced the numbers, from the single implementation in libs/harness_core (ADR-0005). Carried so a stored residual can say which equation made it.
 */
export type SoundSpeedEquation = string;

/**
 * Whether the figure beside it was updated within the configured staleness window of simulation time. A statistic whose input has dried up says stale and keeps saying its last update time; it does not go on presenting its last value as current.
 */
export type Freshness = "fresh" | "stale";

/**
 * The geographic extent of one region-level scope. A region is an area of water, given by its bounds and by its index in the configured grid. It says where residuals were scored and says nothing whatever about what was in the water (Constitution V).
 */
export interface RegionBounds {
  minimum_latitude: number;
  maximum_latitude: number;
  minimum_longitude: number;
  maximum_longitude: number;
}

/**
 * What one running statistic is about: the whole scenario, or one cell of the region grid. Region-level figures below the minimum sample count are reported per region rather than folded silently into the scenario figure.
 */
export interface StatisticsScope {
  /** scenario covers every residual seen; region covers one grid cell. */
  level: "scenario" | "region";
  /**
   * The grid index of the region, row then column, within the bounded grid the configuration declares. The grid has a fixed number of rows and columns, so the number of region scopes a run can hold is fixed before it starts and cannot grow with the scenario. Null at scenario level.
   */
  region_id: string | null;
  /**
   * The cell's extent, so a reader need not hold the grid definition to know where the figure came from. Null at scenario level.
   */
  bounds: RegionBounds | null;
}

/**
 * A single measured-minus-forecast difference on sound speed, at the four-dimensional position it was taken at. The measured value travels beside the difference because a consumer scoring the same measurement against a second field — a persistence reference, say — needs the measurement and not only the residual.
 */
export interface ResidualPoint {
  sim_time: SimInstant;
  latitude: number;
  longitude: number;
  /** Depth in metres, positive downwards. */
  depth_m: number;
  /**
   * Measured sound speed minus forecast sound speed, signed, in metres per second. Signed rather than absolute: a bias and a scatter are different faults and averaging magnitudes hides the first.
   */
  residual_m_per_s: number;
  /**
   * The measured sound speed itself, derived from the observed temperature, salinity and pressure by the one implementation in libs/harness_core.
   */
  measured_m_per_s: number;
  /**
   * The sampling platform the observation came from: an instrument and a coordinate. Carried so a residual can be attributed to the sensor that produced it, and carrying nothing further about the platform (Constitution V).
   */
  platform?: string;
}

/**
 * One residual or a short batch of them, with position and the run scored against. This is the shape a consumer needs to maintain root-mean-square, extremes and a skill score against a second field; a count and a mean of magnitudes cannot be turned back into any of the three. Feature 009's monitor publishes residual-summary today and not this, which is recorded in the telemetry component's README as a gap rather than papered over here.
 */
export interface ResidualSampleReport {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "residual-sample";
  forecast_run_id: ForecastRunId;
  /**
   * A short batch. Bounded by the producer, because a batch that grows with the clock rate would move the cost of acceleration into the broker.
   */
  samples: ResidualPoint[];
  sound_speed_equation: SoundSpeedEquation;
}

/**
 * What the monitor (C-11) has seen since its last summary: counts and the mean magnitude, reset each time. Published at forecast-run boundaries on ctl/run-published rather than on a timer, which is why the monitor needs no reporting-cadence knob. The summary describes the field being superseded, because the monitor reports before it takes the new one.
 */
export interface ResidualSummary {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "residual-summary";
  /**
   * The run the summarised residuals were scored against. Optional, and null or absent in what the monitor publishes today: the summary is emitted at a run boundary and the shape carried no attribution when it was transcribed here. A consumer that receives one without it attributes it to the run open when it arrived, which is a guess where residual-sample carries a fact. Declared so the attribution has somewhere to go when the monitor is ready to carry it.
   */
  forecast_run_id?: string | null;
  /** Soundings scored against the forecast in the interval just ended. */
  scored: number;
  /** Of those, how many exceeded the monitor's residual threshold. */
  exceeding: number;
  /**
   * Soundings the forecast did not cover. Counted rather than absorbed: a sample that could not be scored is not a sample that agreed.
   */
  outside_domain: number;
  /**
   * Observations dropped at the monitor's bounds. A reported drop is better than falling behind unboundedly.
   */
  shed: number;
  /**
   * Mean residual magnitude over the scored samples, in metres per second, or zero when none were scored. Magnitudes, so this carries no bias and no scatter.
   */
  mean_absolute_m_per_s: number;
  sound_speed_equation: SoundSpeedEquation;
}

/**
 * The accepted-or-declined outcome the scheduler (C-12) records for every divergence, so that a declined divergence is visible rather than merely absent.
 */
export interface SchedulerDecision {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "scheduler-decision";
  /** The divergence this decision was about. */
  divergence_id: string;
  /**
   * accepted means a run was requested. The other two name the rule that declined it, rather than collapsing every refusal into one word.
   */
  decision: "accepted" | "minimum-interval" | "duplicate-outstanding";
  /** Enough of why for the record to stand alone. */
  detail: string;
  /**
   * The run requested, or null when the divergence was declined. Null rather than an empty string, because a declined divergence has no run and should not appear to name one.
   */
  run_id: string | null;
}

/**
 * A run the model runner (C-13) could not complete. Recorded rather than merely absent: the one thing worse than a run that fails is a run that fails silently.
 */
export interface RunFailed {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "run-failed";
  run_id: string;
  /** What went wrong, in one line. */
  detail: string;
}

/**
 * A completed run the publisher (C-14) would not announce, with every reason it would not. All the reasons, not the first: a run that fails two checks and reports one gets fixed once and fails again.
 */
export interface PublicationRefused {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "publication-refused";
  run_id: string;
  /** Every check the run failed. */
  refusals: string[];
}

/**
 * The running aggregate of one scope's residuals, maintained incrementally in bounded memory by C-16 and attributed to the forecast run the residuals were scored against. Every field that cannot be derived from the inputs actually seen is null and says so through `basis`, because a zero standing in for an unknown is the failure this component exists to prevent.
 */
export interface ResidualStatistics {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "residual-statistics";
  /**
   * The run these residuals were scored against, or null when no forecast has ever been published.
   */
  forecast_run_id: string | null;
  /**
   * warming follows a restart: running statistics live in memory, are lost with the process, and are not reconstructed from any store. insufficient-samples is a scope below the configured minimum count, reported as such rather than folded into a larger scope.
   */
  state: "reporting" | "insufficient-samples" | "warming" | "no-forecast";
  /**
   * True when this is the completed record of a superseded run. A closed record is retained as it stood and never merged into the run that replaced it.
   */
  closed: boolean;
  scope: StatisticsScope;
  /**
   * Which inputs the figures were built from. A per-residual sample supports every moment; a producer's own summary supports a count and a mean magnitude and nothing else, so a statistic built partly or wholly from summaries reports null for the moments it cannot honestly claim.
   */
  basis: "samples" | "summaries" | "mixed" | "none";
  /** Residuals folded in. */
  count: number;
  /**
   * Signed mean, which is the bias. Null unless every input was a per-residual sample: a mean of magnitudes is not a bias and must not be published as one.
   */
  mean_m_per_s: number | null;
  /** Mean residual magnitude. Available from either kind of input. */
  mean_absolute_m_per_s: number | null;
  /** Root mean square, or null when the inputs did not carry the second moment. */
  root_mean_square_m_per_s: number | null;
  /** Smallest signed residual seen, or null when the inputs did not carry extremes. */
  minimum_m_per_s: number | null;
  /** Largest signed residual seen, or null when the inputs did not carry extremes. */
  maximum_m_per_s: number | null;
  first_sim_time: NullableSimInstant;
  last_sim_time: NullableSimInstant;
  /**
   * The simulation instant of the last real update. It does not move when a statistic is republished unchanged, which is what makes staleness detectable.
   */
  last_updated_sim_time: string | null;
  freshness: Freshness;
  /**
   * How long, in seconds of simulation time, this statistic was most recently stale, measured from the instant the staleness window expired to the instant an input revived it. Null until it has been stale once. Recorded so that a recovery is visible as a recovery rather than as a figure that quietly started moving again.
   */
  stale_span_seconds: number | null;
  /**
   * Set when the figures are arithmetically fine and physically suspect — a root mean square of exactly zero in a harness with seeded noise almost certainly means the residual stream is a constant rather than a measurement. Flagged for review, never suppressed.
   */
  implausible: boolean;
  /** Why, in one line. Null when the figures are not flagged. */
  implausible_reason: string | null;
}

/**
 * Skill against a persistence reference — the forecast field that was current immediately before the latest publication, held constant, which is the claim that conditions stay the same. Both mean-square errors and the sample count travel with the score so that a reader can recompute it rather than believe it (Constitution IX). Below the configured minimum sample count no score is published at all: no default, no zero, no carried-forward previous value. A model that loses to the reference says so in a state and in words, rather than leaving a negative number to be interpreted downstream.
 */
export type ForecastSkill = {
  component: ComponentId;
  scenario_run_id: ScenarioRunId;
  sim_time: SimInstant;
  tick: TickIndex;
  kind: "forecast-skill";
  /** The run being scored, or null when none has been published. */
  forecast_run_id: string | null;
  /**
   * The run whose field is held constant as the persistence reference, or null when only one run has ever been published and there is nothing prior to hold.
   */
  reference_run_id: string | null;
  /**
   * True in the first message published after the reference moved, so that the comparison is never ambiguous about which field it was against.
   */
  reference_changed: boolean;
  /**
   * Measurements scored against both fields. The denominator of both mean-square errors, carried so the score is checkable.
   */
  sample_count: number;
  /**
   * The configured count below which no score is published. Carried so a reader can see the rule that was applied rather than infer it.
   */
  minimum_sample_count: number;
  /** Mean square of measured minus forecast sound speed, in (m/s) squared. */
  model_mean_square_error: number | null;
  /**
   * Mean square of measured minus reference sound speed, over the same samples, in (m/s) squared.
   */
  persistence_mean_square_error: number | null;
  /**
   * The score, or null when there is no score to give. Never zero as a stand-in: zero means the model matched the reference exactly.
   */
  skill_score: number | null;
  /**
   * The stated formula, carried in the message rather than only in documentation, so that the arithmetic a reader checks is the arithmetic that was done.
   */
  formula: "1 - model_mean_square_error / persistence_mean_square_error";
  /**
   * not-beating-persistence is set whenever the model's error is not smaller than the reference's, including when they are equal. insufficient-reference is the state immediately after the first ever publication, when there is no prior field to hold constant. reference-without-error is the degenerate case in which the persistence reference reproduced every measurement exactly: the ratio the formula takes has a zero denominator, so there is no score to publish and an infinity is not one.
   */
  state: "beating-persistence" | "not-beating-persistence" | "insufficient-samples" | "insufficient-reference" | "reference-without-error" | "no-forecast";
  /**
   * The plain-language sentence that goes with the state. Emitted here rather than assembled by the display, so that every consumer says the same thing about a model that is not earning its compute.
   */
  statement: string;
  last_updated_sim_time: NullableSimInstant;
  freshness: Freshness;
  sound_speed_equation: SoundSpeedEquation;
} & ({
  state: "beating-persistence" | "not-beating-persistence";
  skill_score: number;
  model_mean_square_error: number;
  persistence_mean_square_error: number;
  forecast_run_id: string;
  reference_run_id: string;
} | {
  state: "insufficient-samples" | "insufficient-reference" | "reference-without-error" | "no-forecast";
  skill_score: null;
});
