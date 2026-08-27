# DO NOT EDIT.
# Generated from contracts/schemas/telemetry.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel

from . import ingest_telemetry, offload_telemetry


class ComponentId(RootModel[str]):
    root: str = Field(
        ...,
        description='The component reporting, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )


class ScenarioRunId(RootModel[str]):
    root: str = Field(
        ...,
        description='The scenario run this report belongs to, as carried on every clock sample.',
        min_length=1,
    )


class SimInstant(RootModel[str]):
    root: str = Field(
        ...,
        description='A simulation instant, ISO-8601 UTC with microsecond precision. Simulation time, never host time: every interval in this branch except heartbeat cadence is measured on the clock port (Constitution I, ADR-0006).',
    )


class NullableSimInstant(RootModel[str | None]):
    root: str | None = Field(
        ...,
        description='A simulation instant, or null where the thing it would date has not happened yet. Null rather than a zero instant: a default here would read as a real moment.',
    )


class TickIndex(RootModel[int]):
    root: int = Field(
        ...,
        description='The tick index the reporter had observed when it composed the message.',
        ge=0,
    )


class ForecastRunId(RootModel[str]):
    root: str = Field(
        ...,
        description='The model run whose field the residuals were scored against. Attribution is to the run scored against, not to whichever run happens to be current when the message is read.',
        min_length=1,
    )


class SoundSpeedEquation(RootModel[str]):
    root: str = Field(
        ...,
        description='The named sound-speed fit that produced the numbers, from the single implementation in libs/harness_core (ADR-0005). Carried so a stored residual can say which equation made it.',
        min_length=1,
    )


class Freshness(StrEnum):
    fresh = 'fresh'
    stale = 'stale'


class RegionBounds(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum_latitude: float = Field(..., ge=-90.0, le=90.0)
    maximum_latitude: float = Field(..., ge=-90.0, le=90.0)
    minimum_longitude: float = Field(..., ge=-180.0, le=180.0)
    maximum_longitude: float = Field(..., ge=-180.0, le=180.0)


class Level(StrEnum):
    scenario = 'scenario'
    region = 'region'


class StatisticsScope(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    level: Level = Field(
        ...,
        description='scenario covers every residual seen; region covers one grid cell.',
    )
    region_id: str | None = Field(
        ...,
        description='The grid index of the region, row then column, within the bounded grid the configuration declares. The grid has a fixed number of rows and columns, so the number of region scopes a run can hold is fixed before it starts and cannot grow with the scenario. Null at scenario level.',
        pattern='^r[0-9]+c[0-9]+$',
    )
    bounds: RegionBounds | None = Field(
        ...,
        description="The cell's extent, so a reader need not hold the grid definition to know where the figure came from. Null at scenario level.",
    )


class ResidualPoint(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    sim_time: SimInstant
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    depth_m: float = Field(
        ..., description='Depth in metres, positive downwards.', ge=0.0
    )
    residual_m_per_s: float = Field(
        ...,
        description='Measured sound speed minus forecast sound speed, signed, in metres per second. Signed rather than absolute: a bias and a scatter are different faults and averaging magnitudes hides the first.',
    )
    measured_m_per_s: float = Field(
        ...,
        description='The measured sound speed itself, derived from the observed temperature, salinity and pressure by the one implementation in libs/harness_core.',
    )
    platform: str | None = Field(
        None,
        description='The sampling platform the observation came from: an instrument and a coordinate. Carried so a residual can be attributed to the sensor that produced it, and carrying nothing further about the platform (Constitution V).',
        min_length=1,
    )


class ResidualSampleReport(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['residual-sample']
    forecast_run_id: ForecastRunId
    samples: list[ResidualPoint] = Field(
        ...,
        description='A short batch. Bounded by the producer, because a batch that grows with the clock rate would move the cost of acceleration into the broker.',
        min_length=1,
    )
    sound_speed_equation: SoundSpeedEquation


class ResidualSummary(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['residual-summary']
    forecast_run_id: str | None = Field(
        None,
        description='The run the summarised residuals were scored against. Optional, and null or absent in what the monitor publishes today: the summary is emitted at a run boundary and the shape carried no attribution when it was transcribed here. A consumer that receives one without it attributes it to the run open when it arrived, which is a guess where residual-sample carries a fact. Declared so the attribution has somewhere to go when the monitor is ready to carry it.',
    )
    scored: int = Field(
        ...,
        description='Soundings scored against the forecast in the interval just ended.',
        ge=0,
    )
    exceeding: int = Field(
        ...,
        description="Of those, how many exceeded the monitor's residual threshold.",
        ge=0,
    )
    outside_domain: int = Field(
        ...,
        description='Soundings the forecast did not cover. Counted rather than absorbed: a sample that could not be scored is not a sample that agreed.',
        ge=0,
    )
    shed: int = Field(
        ...,
        description="Observations dropped at the monitor's bounds. A reported drop is better than falling behind unboundedly.",
        ge=0,
    )
    mean_absolute_m_per_s: float = Field(
        ...,
        description='Mean residual magnitude over the scored samples, in metres per second, or zero when none were scored. Magnitudes, so this carries no bias and no scatter.',
        ge=0.0,
    )
    sound_speed_equation: SoundSpeedEquation


class Decision(StrEnum):
    accepted = 'accepted'
    minimum_interval = 'minimum-interval'
    duplicate_outstanding = 'duplicate-outstanding'


class SchedulerDecision(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['scheduler-decision']
    divergence_id: str = Field(
        ..., description='The divergence this decision was about.', min_length=1
    )
    decision: Decision = Field(
        ...,
        description='accepted means a run was requested. The other two name the rule that declined it, rather than collapsing every refusal into one word.',
    )
    detail: str = Field(..., description='Enough of why for the record to stand alone.')
    run_id: str | None = Field(
        ...,
        description='The run requested, or null when the divergence was declined. Null rather than an empty string, because a declined divergence has no run and should not appear to name one.',
    )


class RunFailed(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['run-failed']
    run_id: str = Field(..., min_length=1)
    detail: str = Field(..., description='What went wrong, in one line.')


class PublicationRefused(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['publication-refused']
    run_id: str = Field(..., min_length=1)
    refusals: list[str] = Field(..., description='Every check the run failed.')


class State(StrEnum):
    reporting = 'reporting'
    insufficient_samples = 'insufficient-samples'
    warming = 'warming'
    no_forecast = 'no-forecast'


class Basis(StrEnum):
    samples = 'samples'
    summaries = 'summaries'
    mixed = 'mixed'
    none = 'none'


class ResidualStatistics(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['residual-statistics']
    forecast_run_id: str | None = Field(
        ...,
        description='The run these residuals were scored against, or null when no forecast has ever been published.',
    )
    state: State = Field(
        ...,
        description='warming follows a restart: running statistics live in memory, are lost with the process, and are not reconstructed from any store. insufficient-samples is a scope below the configured minimum count, reported as such rather than folded into a larger scope.',
    )
    closed: bool = Field(
        ...,
        description='True when this is the completed record of a superseded run. A closed record is retained as it stood and never merged into the run that replaced it.',
    )
    scope: StatisticsScope
    basis: Basis = Field(
        ...,
        description="Which inputs the figures were built from. A per-residual sample supports every moment; a producer's own summary supports a count and a mean magnitude and nothing else, so a statistic built partly or wholly from summaries reports null for the moments it cannot honestly claim.",
    )
    count: int = Field(..., description='Residuals folded in.', ge=0)
    mean_m_per_s: float | None = Field(
        ...,
        description='Signed mean, which is the bias. Null unless every input was a per-residual sample: a mean of magnitudes is not a bias and must not be published as one.',
    )
    mean_absolute_m_per_s: float | None = Field(
        ..., description='Mean residual magnitude. Available from either kind of input.'
    )
    root_mean_square_m_per_s: float | None = Field(
        ...,
        description='Root mean square, or null when the inputs did not carry the second moment.',
    )
    minimum_m_per_s: float | None = Field(
        ...,
        description='Smallest signed residual seen, or null when the inputs did not carry extremes.',
    )
    maximum_m_per_s: float | None = Field(
        ...,
        description='Largest signed residual seen, or null when the inputs did not carry extremes.',
    )
    first_sim_time: NullableSimInstant | None
    last_sim_time: NullableSimInstant | None
    last_updated_sim_time: str | None = Field(
        ...,
        description='The simulation instant of the last real update. It does not move when a statistic is republished unchanged, which is what makes staleness detectable.',
    )
    freshness: Freshness
    stale_span_seconds: float | None = Field(
        ...,
        description='How long, in seconds of simulation time, this statistic was most recently stale, measured from the instant the staleness window expired to the instant an input revived it. Null until it has been stale once. Recorded so that a recovery is visible as a recovery rather than as a figure that quietly started moving again.',
        ge=0.0,
    )
    implausible: bool = Field(
        ...,
        description='Set when the figures are arithmetically fine and physically suspect — a root mean square of exactly zero in a harness with seeded noise almost certainly means the residual stream is a constant rather than a measurement. Flagged for review, never suppressed.',
    )
    implausible_reason: str | None = Field(
        ..., description='Why, in one line. Null when the figures are not flagged.'
    )


class State4(StrEnum):
    beating_persistence = 'beating-persistence'
    not_beating_persistence = 'not-beating-persistence'
    insufficient_samples = 'insufficient-samples'
    insufficient_reference = 'insufficient-reference'
    reference_without_error = 'reference-without-error'
    no_forecast = 'no-forecast'
    beating_persistence_1 = 'beating-persistence'
    not_beating_persistence_1 = 'not-beating-persistence'


class ForecastSkill1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['forecast-skill']
    forecast_run_id: str = Field(
        ...,
        description='The run being scored, or null when none has been published.',
        min_length=1,
    )
    reference_run_id: str = Field(
        ...,
        description='The run whose field is held constant as the persistence reference, or null when only one run has ever been published and there is nothing prior to hold.',
        min_length=1,
    )
    reference_changed: bool = Field(
        ...,
        description='True in the first message published after the reference moved, so that the comparison is never ambiguous about which field it was against.',
    )
    sample_count: int = Field(
        ...,
        description='Measurements scored against both fields. The denominator of both mean-square errors, carried so the score is checkable.',
        ge=0,
    )
    minimum_sample_count: int = Field(
        ...,
        description='The configured count below which no score is published. Carried so a reader can see the rule that was applied rather than infer it.',
        ge=1,
    )
    model_mean_square_error: float = Field(
        ...,
        description='Mean square of measured minus forecast sound speed, in (m/s) squared.',
        ge=0.0,
    )
    persistence_mean_square_error: float = Field(
        ...,
        description='Mean square of measured minus reference sound speed, over the same samples, in (m/s) squared.',
        ge=0.0,
    )
    skill_score: float = Field(
        ...,
        description='The score, or null when there is no score to give. Never zero as a stand-in: zero means the model matched the reference exactly.',
    )
    formula: Literal['1 - model_mean_square_error / persistence_mean_square_error'] = (
        Field(
            ...,
            description='The stated formula, carried in the message rather than only in documentation, so that the arithmetic a reader checks is the arithmetic that was done.',
        )
    )
    state: State4 = Field(
        ...,
        description="not-beating-persistence is set whenever the model's error is not smaller than the reference's, including when they are equal. insufficient-reference is the state immediately after the first ever publication, when there is no prior field to hold constant. reference-without-error is the degenerate case in which the persistence reference reproduced every measurement exactly: the ratio the formula takes has a zero denominator, so there is no score to publish and an infinity is not one.",
    )
    statement: str = Field(
        ...,
        description='The plain-language sentence that goes with the state. Emitted here rather than assembled by the display, so that every consumer says the same thing about a model that is not earning its compute.',
        min_length=1,
    )
    last_updated_sim_time: NullableSimInstant | None
    freshness: Freshness
    sound_speed_equation: SoundSpeedEquation


class State5(StrEnum):
    beating_persistence = 'beating-persistence'
    not_beating_persistence = 'not-beating-persistence'
    insufficient_samples = 'insufficient-samples'
    insufficient_reference = 'insufficient-reference'
    reference_without_error = 'reference-without-error'
    no_forecast = 'no-forecast'
    insufficient_samples_1 = 'insufficient-samples'
    insufficient_reference_1 = 'insufficient-reference'
    reference_without_error_1 = 'reference-without-error'
    no_forecast_1 = 'no-forecast'


class ForecastSkill2(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: ComponentId
    scenario_run_id: ScenarioRunId
    sim_time: SimInstant
    tick: TickIndex
    kind: Literal['forecast-skill']
    forecast_run_id: str | None = Field(
        ..., description='The run being scored, or null when none has been published.'
    )
    reference_run_id: str | None = Field(
        ...,
        description='The run whose field is held constant as the persistence reference, or null when only one run has ever been published and there is nothing prior to hold.',
    )
    reference_changed: bool = Field(
        ...,
        description='True in the first message published after the reference moved, so that the comparison is never ambiguous about which field it was against.',
    )
    sample_count: int = Field(
        ...,
        description='Measurements scored against both fields. The denominator of both mean-square errors, carried so the score is checkable.',
        ge=0,
    )
    minimum_sample_count: int = Field(
        ...,
        description='The configured count below which no score is published. Carried so a reader can see the rule that was applied rather than infer it.',
        ge=1,
    )
    model_mean_square_error: float | None = Field(
        ...,
        description='Mean square of measured minus forecast sound speed, in (m/s) squared.',
        ge=0.0,
    )
    persistence_mean_square_error: float | None = Field(
        ...,
        description='Mean square of measured minus reference sound speed, over the same samples, in (m/s) squared.',
        ge=0.0,
    )
    skill_score: None = Field(
        ...,
        description='The score, or null when there is no score to give. Never zero as a stand-in: zero means the model matched the reference exactly.',
    )
    formula: Literal['1 - model_mean_square_error / persistence_mean_square_error'] = (
        Field(
            ...,
            description='The stated formula, carried in the message rather than only in documentation, so that the arithmetic a reader checks is the arithmetic that was done.',
        )
    )
    state: State5 = Field(
        ...,
        description="not-beating-persistence is set whenever the model's error is not smaller than the reference's, including when they are equal. insufficient-reference is the state immediately after the first ever publication, when there is no prior field to hold constant. reference-without-error is the degenerate case in which the persistence reference reproduced every measurement exactly: the ratio the formula takes has a zero denominator, so there is no score to publish and an infinity is not one.",
    )
    statement: str = Field(
        ...,
        description='The plain-language sentence that goes with the state. Emitted here rather than assembled by the display, so that every consumer says the same thing about a model that is not earning its compute.',
        min_length=1,
    )
    last_updated_sim_time: NullableSimInstant | None
    freshness: Freshness
    sound_speed_equation: SoundSpeedEquation


class ForecastSkill(RootModel[ForecastSkill1 | ForecastSkill2]):
    root: ForecastSkill1 | ForecastSkill2 = Field(
        ...,
        description='Skill against a persistence reference — the forecast field that was current immediately before the latest publication, held constant, which is the claim that conditions stay the same. Both mean-square errors and the sample count travel with the score so that a reader can recompute it rather than believe it (Constitution IX). Below the configured minimum sample count no score is published at all: no default, no zero, no carried-forward previous value. A model that loses to the reference says so in a state and in words, rather than leaving a negative number to be interpreted downstream.',
        title='Forecast skill',
    )


class DrognaTelemetry(
    RootModel[
        ResidualSampleReport
        | ResidualSummary
        | SchedulerDecision
        | RunFailed
        | PublicationRefused
        | ResidualStatistics
        | ForecastSkill
        | ingest_telemetry.DrognaIngestTelemetry
        | offload_telemetry.DrognaOffloadTelemetry
    ]
):
    root: (
        ResidualSampleReport
        | ResidualSummary
        | SchedulerDecision
        | RunFailed
        | PublicationRefused
        | ResidualStatistics
        | ForecastSkill
        | ingest_telemetry.DrognaIngestTelemetry
        | offload_telemetry.DrognaOffloadTelemetry
    ) = Field(
        ...,
        description="Every payload on the ctl/telemetry branch, defined once and discriminated by kind. The telemetry component (C-16) owns this document, which inverts the repository's usual rule that the earlier feature owns a shared file: features 007, 009 and 013 publish here first, and the alternative was each of them defining a telemetry shape that C-16 would immediately have had to widen. The shapes recorded here are therefore descriptions of what is already published, not proposals — residual-summary, scheduler-decision, run-failed and publication-refused were read out of the four control-loop services and transcribed. residual-sample, residual-statistics and forecast-skill are new: the first is the per-residual report a producer sends when a consumer needs the individual numbers rather than a count, and the last two are what C-16 itself publishes. The ingest client's report carries no kind at all, and rather than force a discriminator onto a shape already in use it is admitted by reference to its own master.",
        examples=[
            {
                'component': 'monitor',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:20:00.000000Z',
                'tick': 560,
                'kind': 'residual-summary',
                'scored': 412,
                'exceeding': 17,
                'outside_domain': 3,
                'shed': 0,
                'mean_absolute_m_per_s': 0.8134,
                'sound_speed_equation': 'mackenzie-1981',
            },
            {
                'component': 'monitor',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:20:00.000000Z',
                'tick': 560,
                'kind': 'residual-sample',
                'forecast_run_id': 'forecast-0003',
                'samples': [
                    {
                        'sim_time': '2026-09-01T02:19:58.000000Z',
                        'latitude': 48.5,
                        'longitude': -8.25,
                        'depth_m': 120.0,
                        'residual_m_per_s': 1.92,
                        'measured_m_per_s': 1503.44,
                        'platform': 'glider-a',
                    }
                ],
                'sound_speed_equation': 'mackenzie-1981',
            },
            {
                'component': 'scheduler',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:20:05.000000Z',
                'tick': 561,
                'kind': 'scheduler-decision',
                'divergence_id': 'divergence-0007',
                'decision': 'minimum-interval',
                'detail': 'a run was requested 240.0 s of simulation time ago and the minimum interval is 900.0 s',
                'run_id': None,
            },
            {
                'component': 'model_runner',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:21:00.000000Z',
                'tick': 572,
                'kind': 'run-failed',
                'run_id': 'forecast-0004',
                'detail': 'two of four members did not complete; truncating the ensemble would misreport spread',
            },
            {
                'component': 'publisher',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:21:30.000000Z',
                'tick': 578,
                'kind': 'publication-refused',
                'run_id': 'forecast-0004',
                'refusals': [
                    'the uncertainty field is absent',
                    'the forecast field declares no run_id',
                ],
            },
            {
                'component': 'telemetry',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:22:00.000000Z',
                'tick': 584,
                'kind': 'residual-statistics',
                'forecast_run_id': 'forecast-0003',
                'state': 'reporting',
                'closed': False,
                'scope': {
                    'level': 'region',
                    'region_id': 'r2c5',
                    'bounds': {
                        'minimum_latitude': 48.5,
                        'maximum_latitude': 49.0,
                        'minimum_longitude': -8.5,
                        'maximum_longitude': -8.0,
                    },
                },
                'basis': 'samples',
                'count': 412,
                'mean_m_per_s': 0.2114,
                'mean_absolute_m_per_s': 0.8134,
                'root_mean_square_m_per_s': 1.0442,
                'minimum_m_per_s': -2.81,
                'maximum_m_per_s': 3.06,
                'first_sim_time': '2026-09-01T02:05:00.000000Z',
                'last_sim_time': '2026-09-01T02:21:58.000000Z',
                'last_updated_sim_time': '2026-09-01T02:21:58.000000Z',
                'freshness': 'fresh',
                'stale_span_seconds': None,
                'implausible': False,
                'implausible_reason': None,
            },
            {
                'component': 'telemetry',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:22:00.000000Z',
                'tick': 584,
                'kind': 'forecast-skill',
                'forecast_run_id': 'forecast-0003',
                'reference_run_id': 'forecast-0002',
                'reference_changed': False,
                'sample_count': 412,
                'minimum_sample_count': 30,
                'model_mean_square_error': 1.9,
                'persistence_mean_square_error': 1.2,
                'skill_score': -0.5833333333333333,
                'formula': '1 - model_mean_square_error / persistence_mean_square_error',
                'state': 'not-beating-persistence',
                'statement': "the forecast is not beating persistence: its mean square error of 1.9 (m/s)^2 over 412 samples is above the persistence reference's 1.2 (m/s)^2, so this run is not earning its compute",
                'last_updated_sim_time': '2026-09-01T02:21:58.000000Z',
                'freshness': 'fresh',
                'sound_speed_equation': 'mackenzie-1981',
            },
            {
                'component': 'telemetry',
                'scenario_run_id': 'run-20260901-a',
                'sim_time': '2026-09-01T02:05:00.000000Z',
                'tick': 300,
                'kind': 'forecast-skill',
                'forecast_run_id': 'forecast-0003',
                'reference_run_id': 'forecast-0002',
                'reference_changed': True,
                'sample_count': 4,
                'minimum_sample_count': 30,
                'model_mean_square_error': None,
                'persistence_mean_square_error': None,
                'skill_score': None,
                'formula': '1 - model_mean_square_error / persistence_mean_square_error',
                'state': 'insufficient-samples',
                'statement': '4 samples have been scored against both fields and 30 are required, so no skill score is published',
                'last_updated_sim_time': '2026-09-01T02:04:52.000000Z',
                'freshness': 'fresh',
                'sound_speed_equation': 'mackenzie-1981',
            },
        ],
        title='drogna telemetry',
    )
