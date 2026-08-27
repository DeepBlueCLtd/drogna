# DO NOT EDIT.
# Generated from contracts/schemas/plan.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import Enum, StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class State(StrEnum):
    planning = 'planning'
    no_field = 'no-field'
    nothing_worth_sampling = 'nothing-worth-sampling'


class EmptyReason(Enum):
    no_field = 'no-field'
    budget_too_small = 'budget-too-small'
    nothing_worth_sampling = 'nothing-worth-sampling'
    NoneType_None = None


class SimTime(RootModel[str]):
    root: str = Field(
        ...,
        description='A simulation instant, ISO-8601 UTC with microsecond precision, taken from the clock port. Never a host clock value, and never a format that would invite one (Constitution I).',
        pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
        title='Simulation instant',
    )


class H3Index(RootModel[str]):
    root: str = Field(
        ...,
        description='An H3 cell index in its usual lower-case hexadecimal spelling. The resolution it belongs to is stated once, under indexing, rather than implied per vertex.',
        pattern='^[0-9a-f]{15,16}$',
        title='H3 cell index',
    )


class Horizon(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    start_sim_time: SimTime
    end_sim_time: SimTime
    span_seconds: float = Field(
        ..., description="The horizon's length in seconds of simulation time.", gt=0.0
    )


class Variable(StrEnum):
    temperature_spread = 'temperature_spread'
    salinity_spread = 'salinity_spread'


class UncertaintyField(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    run_id: str = Field(
        ...,
        description='The model run whose per-cell ensemble spread was read.',
        pattern='^[A-Za-z0-9][A-Za-z0-9_.-]*$',
    )
    variable: Variable = Field(
        ...,
        description='Which published spread variable the planner scored. One scalar field is scored, not both: combining degrees Celsius with practical salinity units needs a weighting between them that nothing in the requirements supplies, so none is invented here.',
    )
    digest: str | None = Field(
        ...,
        description="Digest of the field's bytes where the announcement carried one, so a reader with the same bytes can say it read the same field. Null when the field was supplied without one.",
        pattern='^sha256:[0-9a-f]{64}$',
    )


class DepthBand(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    index: int = Field(
        ...,
        description="Position in the vertical index, shallowest first. This is what a vertex's depth_band refers to.",
        ge=0,
    )
    minimum_depth_m: float = Field(
        ...,
        description='Shallow edge of the band in metres, positive downwards.',
        ge=0.0,
    )
    maximum_depth_m: float = Field(
        ..., description='Deep edge of the band in metres, positive downwards.', ge=0.0
    )


class Platform(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: float = Field(
        ..., description='Degrees north, WGS 84.', ge=-90.0, le=90.0
    )
    longitude: float = Field(
        ..., description='Degrees east, WGS 84.', ge=-180.0, le=180.0
    )
    depth_m: float = Field(
        ...,
        description='Depth below the surface in metres, positive downwards.',
        ge=0.0,
    )


class Vertex(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    sequence: int = Field(
        ...,
        description='Position along the route, counting from zero. Carried explicitly so that array order is not the only thing asserting it.',
        ge=0,
    )
    h3_index: H3Index
    depth_band: int = Field(..., description='Index into indexing/depth_bands.', ge=0)
    arrival_sim_time: SimTime
    latitude: float = Field(
        ..., description='Centre of the H3 cell, degrees north.', ge=-90.0, le=90.0
    )
    longitude: float = Field(
        ..., description='Centre of the H3 cell, degrees east.', ge=-180.0, le=180.0
    )
    depth_m: float = Field(
        ...,
        description='Centre of the depth band in metres, positive downwards.',
        ge=0.0,
    )
    marginal_value: float = Field(
        ...,
        description="What this vertex adds to the route's value, measured against the field as it stands when the vertex is reached. A vertex reached after a nearer one has already resolved the water around it carries a small number here, and that is the whole of the diminishing-returns behaviour, visible per vertex.",
        ge=0.0,
    )


class Selection(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    formulation: Literal['orienteering-prize-collecting'] = Field(
        ...,
        description='The problem this is a solution to. There is deliberately no second value: a tour formulation would be a different component.',
    )
    heuristic: Literal['greedy-insertion-seeded-restarts'] = Field(
        ...,
        description='Orienteering is NP-hard and nothing here requires optimality. What it requires is the right formulation and determinism, so the search is a greedy insertion with a fixed number of seeded randomised restarts and seeded tie-breaks.',
    )
    candidate_cell_count: int = Field(
        ..., description='How many planning cells were considered.', ge=0
    )
    visited_cell_count: int = Field(
        ...,
        description='How many were chosen. Smaller than candidate_cell_count whenever the budget binds, which is what prize-collecting looks like from outside.',
        ge=0,
    )
    restarts: int = Field(
        ...,
        description='How many randomised restarts the search ran, every draw taken from the seeded generator so the same field, budget and seed give the same route.',
        ge=1,
    )


class Commitment(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    window_seconds: float = Field(
        ...,
        description="The commitment window in seconds of simulation time, measured forward from this recommendation's start.",
        ge=0.0,
    )
    retained_vertex_count: int = Field(
        ...,
        description='How many vertices of the previous route survive unchanged at the head of this one.',
        ge=0,
    )
    departed_from_previous: bool = Field(
        ...,
        description='Whether the committed prefix was abandoned. False for a first recommendation, which has no predecessor to depart from.',
    )
    improvement_over_retained: float = Field(
        ...,
        description='Value of the freely replanned route minus the value of the route that keeps the committed prefix. Zero when there was no predecessor.',
        ge=0.0,
    )
    margin: float = Field(
        ...,
        description='The improvement the free route had to beat to justify departing, as an absolute value in the same units as route/value.',
        ge=0.0,
    )


class State1(StrEnum):
    crossing = 'crossing'
    already_lapsed = 'already-lapsed'
    no_crossing_within_horizon = 'no-crossing-within-horizon'


class ProjectionEntry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    h3_index: H3Index
    depth_band: int = Field(
        ...,
        description='The band whose confidence lapses first, or the band with the largest projected uncertainty where none lapses.',
        ge=0,
    )
    state: State1 = Field(
        ...,
        description='crossing: confidence falls below usable at crossing_sim_time. already-lapsed: it is already below now, which is what arriving cold looks like. no-crossing-within-horizon: it does not lapse before the horizon ends, stated explicitly rather than by absence.',
    )
    crossing_sim_time: SimTime | None = Field(
        ...,
        description='The simulation instant at which confidence falls below usable, resolved to one projection step. Null when the state is no-crossing-within-horizon.',
    )
    uncertainty_now: float = Field(
        ...,
        description="The region's uncertainty at sim_time, in the units of the scored spread variable.",
        ge=0.0,
    )
    saturated_uncertainty: float = Field(
        ...,
        description="What the region's uncertainty grows back to given unlimited time without a measurement: the published ensemble spread there. A region whose saturated uncertainty is below the threshold never lapses however long it is left, and says so.",
        ge=0.0,
    )
    timescale_seconds: float = Field(
        ...,
        description='The decorrelation timescale evaluated at this region, in seconds. It is a field with a domain-wide background, so every region has one — including open water outside every seeded feature — and there is no fallback constant anywhere in this message (ADR-0002, SRD FR-05).',
        gt=0.0,
    )


class Indexing(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    h3_resolution: int = Field(
        ...,
        description='The H3 resolution every h3_index in this message belongs to.',
        ge=0,
        le=15,
    )
    depth_bands: list[DepthBand] = Field(
        ...,
        description='The vertical index, shallowest first. A planning cell is the pairing of an H3 index with one of these bands.',
        min_length=1,
    )


class Route(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    vertices: list[Vertex] = Field(
        ...,
        description='The route in order. Empty when there is nothing worth recommending, in which case empty_reason says why.',
    )
    value: float = Field(
        ...,
        description="The route's collapse-aware value: the sum of the marginal uncertainty reductions in traversal order, each measured against the field as it stands after every earlier visit has collapsed it and after regrowth to that arrival instant. Diminishing returns are already inside this number and must not be applied again by a consumer.",
        ge=0.0,
    )
    value_without_collapse: float = Field(
        ...,
        description="What the same route would have been worth had each vertex been scored against the field as it stood at the horizon's start, with no earlier visit having collapsed it — the sum a consumer would reach from standalone per-cell values. It is carried because the gap between the two is the size of the error the arrival-time scoring avoids, and a number nobody can see is a number nobody checks. On a field that does not change across the horizon it is never smaller than value. Where it is smaller, the field itself grew between the horizon's start and the arrivals, and the gap is the same error in the other direction: a planner scoring against the present would have undervalued the route. That case is why the naive figure is published beside the collapse-aware one rather than left to be inferred.",
        ge=0.0,
    )
    budget_seconds: float = Field(
        ...,
        description='The traversal budget in seconds of simulation time, at the configured nominal speeds.',
        ge=0.0,
    )
    consumed_seconds: float = Field(
        ...,
        description='What the route consumes of that budget. A route consuming more than its budget is a defect, not a suggestion.',
        ge=0.0,
    )
    distance_m: float = Field(
        ...,
        description='Great-circle distance along the route, in metres. Horizontal only; the vertical component of the cost is in consumed_seconds.',
        ge=0.0,
    )


class Projection(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    step_seconds: float = Field(
        ...,
        description="The forward march's step in seconds of simulation time. A crossing instant is resolved to this step: the growth law has a closed form, but the projection is marched so that a growth law without one would need no new machinery.",
        gt=0.0,
    )
    horizon_seconds: float = Field(
        ...,
        description='How far forward the march ran, in seconds of simulation time.',
        gt=0.0,
    )
    usable_threshold: float = Field(
        ...,
        description='The uncertainty above which confidence is no longer usable, in the units of the scored spread variable. Scenario configuration; nothing in the requirements fixes a value.',
        gt=0.0,
    )
    region_count: int = Field(
        ...,
        description='How many regions the domain has. Equal to the length of regions, carried so that a truncated message is detectable rather than merely shorter.',
        ge=0,
    )
    regions: list[ProjectionEntry] = Field(
        ...,
        description='One entry per region, ordered by H3 index so two replays produce the same bytes.',
    )


class DrognaSamplingRecommendation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The component id of the planner that produced it, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(
        ...,
        description='The scenario run this recommendation belongs to, as carried on every clock sample.',
        pattern='^[A-Za-z0-9][A-Za-z0-9_.-]*$',
    )
    sim_time: SimTime = Field(
        ..., description='Simulation time at which the recommendation was produced.'
    )
    tick: int = Field(
        ...,
        description='The tick index the planner had observed. A tick is the unit of causality; an instant is not.',
        ge=0,
    )
    kind: Literal['sampling-recommendation'] = Field(
        ...,
        description='What this message is, stated in the payload so that a reader who has only the bytes knows it is a recommendation. There is deliberately no second value.',
    )
    plan_id: str = Field(
        ...,
        description="Deterministic identifier derived from the run's root seed and this recommendation's ordinal, never from entropy or a host clock (Constitution II).",
        pattern='^[0-9a-f]{8,64}$',
    )
    supersedes: str | None = Field(
        ...,
        description='The plan_id this recommendation replaces, or null for the first of a scenario. Carried so a consumer can tell a replan from a first plan without keeping a history of its own.',
        pattern='^[0-9a-f]{8,64}$',
    )
    state: State = Field(
        ...,
        description="What the planner was able to do. The same three states the planner's heartbeat carries, so a reader of either can say why a route is empty.",
    )
    empty_reason: EmptyReason | None = Field(
        ...,
        description='Why the route is empty, or null when it is not. An empty route is stated with its reason rather than replaced by the nearest cell as a consolation: a planner that always recommends motion is a planner nobody can trust when it recommends motion.',
    )
    horizon: Horizon
    uncertainty_field: UncertaintyField
    indexing: Indexing
    platform: Platform
    route: Route
    selection: Selection
    commitment: Commitment
    projection: Projection
