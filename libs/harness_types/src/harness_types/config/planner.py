# DO NOT EDIT.
# Generated from contracts/schemas/config.planner.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from . import common


class DepthBand(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum_depth_m: float = Field(
        ..., description='Shallow edge in metres, positive downwards.', ge=0.0
    )
    maximum_depth_m: float = Field(
        ..., description='Deep edge in metres, positive downwards.', ge=0.0
    )


class Indexing(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    h3_resolution: int = Field(
        ...,
        description='The H3 resolution every planning cell belongs to.',
        ge=0,
        le=15,
    )
    depth_bands: list[DepthBand] = Field(
        ...,
        description='The vertical index, shallowest first. Adjacent bands are expected to meet rather than overlap; the planner refuses a vertical index whose bands are out of order or inverted.',
        min_length=1,
    )
    maximum_cells: int = Field(
        ...,
        description='Bound on the horizontal cells the domain is covered with. A resolution one step too fine multiplies the cell count by seven, and an unbounded cover would turn a misconfiguration into an unbounded search rather than a startup failure.',
        ge=1,
    )


class Variable(StrEnum):
    temperature_spread = 'temperature_spread'
    salinity_spread = 'salinity_spread'


class Uncertainty(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    variable: Variable = Field(
        ...,
        description='Which published per-cell ensemble spread variable the planner scores.',
    )
    usable_threshold: float = Field(
        ...,
        description='Uncertainty above which confidence is no longer usable, in the units of the scored variable. A cell already below it is worth approximately nothing to visit, which is what stops the planner recommending motion for its own sake.',
        gt=0.0,
    )


class Sensing(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    horizontal_decay_m: float = Field(
        ...,
        description='Horizontal e-folding distance of the footprint in metres.',
        gt=0.0,
    )
    vertical_decay_m: float = Field(
        ...,
        description='Vertical e-folding separation of the footprint in metres.',
        gt=0.0,
    )
    peak_reduction: float = Field(
        ...,
        description="The fraction of a cell's uncertainty a visit removes at the visited cell itself. Strictly below one leaves residual uncertainty at a sampled cell, which is honest: an instrument reading does not resolve a cell exactly.",
        gt=0.0,
        le=1.0,
    )
    maximum_rings: int = Field(
        ...,
        description='How many H3 rings out from the visited cell the footprint is evaluated over. The kernel is unbounded and the cover is not, so the extent is stated rather than left to a tolerance.',
        ge=0,
    )
    maximum_band_separation: int = Field(
        ...,
        description='How many depth bands either side of the visited band the footprint is evaluated over.',
        ge=0,
    )


class Start(BaseModel):
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


class Platform(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    horizontal_speed_m_per_s: float = Field(
        ...,
        description="Nominal horizontal speed. The budget is expressed in seconds and converted to distance here, because the SRD says 'under a budget' without fixing its units.",
        gt=0.0,
    )
    vertical_speed_m_per_s: float = Field(
        ...,
        description="Nominal rate of change of depth. Changing band costs time even where it costs no distance, which is why a route's distance and its consumption are reported separately.",
        gt=0.0,
    )
    budget_seconds: float = Field(
        ...,
        description='Traversal budget in seconds of simulation time. A route exceeding it is a defect, not a suggestion.',
        gt=0.0,
    )
    start: Start = Field(
        ...,
        description='Where the platform is when the scenario begins. Later recommendations plan from where it has since been reported to be.',
    )


class Horizon(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    span_seconds: float = Field(
        ...,
        description='Length of the planning horizon in seconds of simulation time.',
        gt=0.0,
    )
    replan_cadence_seconds: float = Field(
        ...,
        description='Simulation time between cadence-driven replans. A new uncertainty field and the arrival of measurements also trigger one, so this is the longest a recommendation may stand rather than the only reason it is replaced.',
        gt=0.0,
    )


class Commitment(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    window_seconds: float = Field(
        ...,
        description="How far forward from a recommendation's start the committed prefix reaches, in seconds of simulation time. Zero commits to nothing, which is a legitimate configuration and a visible one.",
        ge=0.0,
    )
    improvement_margin: float = Field(
        ...,
        description="How much better the freely replanned route must be, in the units of the route's value, before the committed prefix is abandoned. A departure is recorded with this margin so that a reader can see the planner changed its mind and by how much.",
        ge=0.0,
    )


class Projection(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    step_seconds: float = Field(
        ...,
        description="Step of the forward march in seconds of simulation time. A crossing instant is resolved to this step, and the projection's accuracy is stated against it rather than claimed exact.",
        gt=0.0,
    )
    horizon_seconds: float | None = Field(
        None,
        description="How far forward the march runs, in seconds of simulation time. Absent, the planning horizon's own span is used, which is the case where the recommendation and the projection cover the same span.",
        gt=0.0,
    )


class Search(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    restarts: int = Field(
        ...,
        description='How many randomised restarts the search runs. One is a pure greedy insertion with no draw taken at all.',
        ge=1,
    )
    maximum_candidates: int = Field(
        ...,
        description="Bound on the planning cells considered in one search, taken as the most valuable at the horizon's start. The count considered and the count chosen are both published, so the bound is visible in the recommendation rather than hidden in a configuration file.",
        ge=1,
    )
    shortlist: int = Field(
        ...,
        description='How many of the best insertions a randomised restart draws its next move from. One reduces every restart to the same greedy answer, so a restart count above one with a shortlist of one is stated as such rather than silently wasted.',
        ge=1,
    )


class Coverage(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    root_directory: str = Field(
        ..., description='Root of the coverage store.', min_length=1
    )
    current_pointer: str = Field(
        ...,
        description='Name of the text file in the root holding one run identifier on one line (ADR-0011).',
        min_length=1,
    )
    runs_dirname: str = Field(
        ...,
        description='Name of the directory under the root holding the run directories. The pointer names a run, not a path.',
        min_length=1,
    )
    uncertainty_file: str = Field(
        ...,
        description="Name of the per-cell ensemble spread field inside a run's directory.",
        min_length=1,
    )


class Environment(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(
        ...,
        description="Directory holding the environment generator's output.",
        min_length=1,
    )
    manifest_file: str = Field(
        ...,
        description='Name of the ground-truth manifest inside that directory.',
        min_length=1,
    )


class Planner(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    indexing: Indexing = Field(
        ...,
        description="H3 in the horizontal at one resolution, layered with a separate depth index (SRD FR-35). A planning cell is the pairing of an H3 index with a depth band. The resolution is configuration because the domain's size and the sensing footprint's decay length together decide a sensible value, and because the granularity of a recommendation must be visible rather than implied.",
        title='How the domain is indexed',
    )
    uncertainty: Uncertainty = Field(
        ...,
        description='One scalar spread field is scored, not both: combining degrees Celsius with practical salinity units needs a weighting between them that nothing in the requirements supplies. The threshold is the value above which confidence is no longer usable, and the SRD fixes no number for it.',
        title='The field planned against',
    )
    sensing: Sensing = Field(
        ...,
        description='Which cells a visit informs and by how much, in the horizontal and in depth. SRD FR-32 requires this to be an explicit configured model rather than an implicit consequence of the grid resolution, so it is stated here in full and derived in docs/algorithms/informative-path-planning.md.',
        title='The sensing footprint',
    )
    platform: Platform = Field(
        ...,
        description='A position, a depth and a budget, and nothing else (Constitution V). No identity is carried between recommendations, and there is no history here because a recommended route over cells is not a history of anything.',
        title='The sampling platform',
    )
    horizon: Horizon = Field(
        ...,
        description='How far forward a recommendation reasons, and how often it is recomputed. Both are simulation time: a planner pacing itself on the host clock would recommend differently on a fast machine, which is exactly the failure Constitution I exists to prevent.',
        title='The receding horizon',
    )
    commitment: Commitment = Field(
        ...,
        description="SRD FR-33 asks for a single committed route, and commitment without hysteresis is not commitment. The window says how much of the route is held; the margin says what an alternative must beat to justify abandoning it. Both are this feature's choice and both are configuration.",
        title='Holding a commitment',
    )
    projection: Projection = Field(
        ...,
        description='SRD FR-34: every region is reported with the simulation time at which its confidence lapses, or with an explicit statement that it does not within the horizon. The march is stepped rather than solved because a growth law without a closed form would then need no new machinery.',
        title='Projecting confidence forward',
    )
    search: Search = Field(
        ...,
        description='Orienteering is NP-hard and nothing in the requirements asks for optimality. What they ask for is the right formulation (SRD FR-35) and determinism (Constitution II), so the search is a greedy insertion with a fixed number of seeded randomised restarts. Every draw comes through the RNG port; a bare generator anywhere in this package is a constitution violation rather than a shortcut.',
        title='The selection heuristic',
    )
    coverage: Coverage = Field(
        ...,
        description='The planner reads the field through the coverage read port and not through the query layer: it sits inside the boundary SRD 2.2 draws, and routing an internal consumer out through the external read path and back would claim a seam that is not there. It learns that a new field exists from the announcement on the control namespace; nothing here polls anything for freshness.',
        title='Reading the published uncertainty field',
    )
    environment: Environment = Field(
        ...,
        description="ADR-0002 makes tau a field, authored per feature over a domain-wide background and evaluated per location, and its last consequence forbids the authored representation reaching a consumer. The planner therefore reads the generator's ground-truth manifest and asks the generator's own evaluation for a number at a point, rather than blending background and features itself. Every planning cell has a defined tau, background water included, and there is no fallback constant in this component to configure.",
        title='Where the decorrelation timescale is evaluated from',
    )


class DrognaPlannerConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    planner: Planner = Field(..., title='Adaptive sampling planning')
