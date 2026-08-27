"""What the planner says, and where it says it.

Two destinations, and what is *not* in either of them is the point.

``ctl/plan``
    The one operational output: a sampling recommendation. It names the planning cells where
    sampling would reduce uncertainty most, states by how much, and states for every region
    in the domain when its confidence will lapse. It carries no addressee, no recipient, no
    priority to be obeyed, and no field naming anything that is to be done. Constitution VIII
    makes the harness headless with respect to decisions; rendering and advice happen
    downstream, and this component is where that boundary is either defended or lost.

    The guarantee is structural rather than editorial. Every string in the payload is an
    enumeration, a constant, an identifier matching a declared pattern, or a simulation
    instant. There is nowhere in this message a sentence addressed to a person could be
    written, which is a stronger property than a promise not to write one, and the
    forbidden-vocabulary test over the schema and over emitted payloads asserts it.

``ctl/heartbeat``
    Liveness, on a **real-time** cadence (ADR-0006). The simulation time it carries is
    payload, not schedule, so pinning the clock rate to zero for a screenshot leaves a
    running planner lit rather than greying out a system that is plainly alive. The
    three-way state — planning, no-field, nothing-worth-sampling — travels in ``detail``
    beside the status the heartbeat schema already defines, and the mapping is stated in
    :func:`heartbeat_status` rather than left for a reader to infer.

The payload is built through the model generated from the master (Constitution III), so the
constraints the schema declares — the identifier pattern, the enumerations, the value being
non-negative — are enforced by the type rather than by whoever remembers to check.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, MessagePublisher
from harness_types.messages.plan import (
    Commitment as CommitmentModel,
)
from harness_types.messages.plan import (
    DepthBand as DepthBandModel,
)
from harness_types.messages.plan import (
    DrognaSamplingRecommendation,
)
from harness_types.messages.plan import (
    Horizon as HorizonModel,
)
from harness_types.messages.plan import (
    Indexing as IndexingModel,
)
from harness_types.messages.plan import (
    Projection as ProjectionModel,
)
from harness_types.messages.plan import (
    ProjectionEntry as ProjectionEntryModel,
)
from harness_types.messages.plan import (
    Route as RouteModel,
)
from harness_types.messages.plan import (
    Selection as SelectionModel,
)
from harness_types.messages.plan import (
    UncertaintyField as UncertaintyFieldModel,
)
from harness_types.messages.plan import (
    Vertex as VertexModel,
)

from harness_planner.cells import CellGeometry
from harness_planner.commitment import Commitment
from harness_planner.projection import ProjectedRegion
from harness_planner.select import FORMULATION, HEURISTIC
from harness_planner.traversal import Position

__all__ = [
    "PLAN_TOPIC",
    "PlannerState",
    "heartbeat_publisher",
    "heartbeat_status",
    "plan_message",
    "publish_plan",
]

PLAN_TOPIC = "ctl/plan"

KIND = "sampling-recommendation"

_MICROS_PER_SECOND = 1_000_000


class PlannerState(StrEnum):
    """What the planner was able to do, as FR-028 requires it to report."""

    PLANNING = "planning"
    NO_FIELD = "no-field"
    NOTHING_WORTH_SAMPLING = "nothing-worth-sampling"


def heartbeat_status(state: PlannerState) -> HeartbeatStatus:
    """The heartbeat status that goes with each planner state.

    ``no-field`` is degraded rather than ok: the process is alive and is doing nothing
    useful, and saying so is the difference between a component that is working and one that
    is merely running. ``nothing-worth-sampling`` is ok, because a planner with nothing to
    recommend and the honesty to say so is a planner doing its job exactly.
    """
    if state is PlannerState.NO_FIELD:
        return HeartbeatStatus.DEGRADED
    return HeartbeatStatus.OK


def plan_message(
    *,
    component: str,
    tick: Tick,
    plan_id: str,
    supersedes: str | None,
    state: PlannerState,
    empty_reason: str | None,
    geometry: CellGeometry,
    platform: Position,
    horizon_micros: tuple[int, int],
    field_run_id: str,
    field_variable: str,
    field_digest: str | None,
    commitment: Commitment,
    budget_seconds: float,
    projection: Sequence[ProjectedRegion],
    projection_step_seconds: float,
    projection_horizon_seconds: float,
    usable_threshold: float,
) -> dict[str, Any]:
    """Build the ``ctl/plan`` payload from what the search and the projection produced."""
    start_micros, end_micros = horizon_micros
    selection = commitment.selection
    route = selection.route

    message = DrognaSamplingRecommendation(
        component=component,
        scenario_run_id=tick.run_id,
        sim_time=_iso(tick.instant.micros),
        tick=tick.index,
        kind=KIND,
        plan_id=plan_id,
        supersedes=supersedes,
        state=state.value,
        empty_reason=empty_reason,
        horizon=HorizonModel(
            start_sim_time=_iso(start_micros),
            end_sim_time=_iso(end_micros),
            span_seconds=(end_micros - start_micros) / _MICROS_PER_SECOND,
        ),
        uncertainty_field=UncertaintyFieldModel(
            run_id=field_run_id, variable=field_variable, digest=field_digest
        ),
        indexing=IndexingModel(
            h3_resolution=geometry.resolution,
            depth_bands=[
                DepthBandModel(
                    index=band.index,
                    minimum_depth_m=band.minimum_depth_m,
                    maximum_depth_m=band.maximum_depth_m,
                )
                for band in geometry.bands
            ],
        ),
        platform=platform,
        route=RouteModel(
            vertices=[
                VertexModel(
                    sequence=vertex.sequence,
                    h3_index=vertex.cell.h3_index,
                    depth_band=vertex.cell.depth_band,
                    arrival_sim_time=_iso(vertex.arrival_micros),
                    latitude=vertex.latitude,
                    longitude=vertex.longitude,
                    depth_m=vertex.depth_m,
                    marginal_value=max(0.0, vertex.marginal_value),
                )
                for vertex in route.vertices
            ],
            value=max(0.0, route.value),
            value_without_collapse=max(0.0, route.value_without_collapse),
            budget_seconds=budget_seconds,
            consumed_seconds=route.consumed_seconds,
            distance_m=route.distance_m,
        ),
        selection=SelectionModel(
            formulation=FORMULATION,
            heuristic=HEURISTIC,
            candidate_cell_count=selection.candidate_cell_count,
            visited_cell_count=selection.visited_cell_count,
            restarts=selection.restarts,
        ),
        commitment=CommitmentModel(
            window_seconds=commitment.window_seconds,
            retained_vertex_count=commitment.retained_vertex_count,
            departed_from_previous=commitment.departed_from_previous,
            improvement_over_retained=commitment.improvement_over_retained,
            margin=commitment.margin,
        ),
        projection=ProjectionModel(
            step_seconds=projection_step_seconds,
            horizon_seconds=projection_horizon_seconds,
            usable_threshold=usable_threshold,
            region_count=len(projection),
            regions=[
                ProjectionEntryModel(
                    h3_index=region.h3_index,
                    depth_band=region.depth_band,
                    state=region.state,
                    crossing_sim_time=(
                        None if region.crossing_micros is None else _iso(region.crossing_micros)
                    ),
                    uncertainty_now=max(0.0, region.uncertainty_now),
                    saturated_uncertainty=max(0.0, region.saturated_uncertainty),
                    timescale_seconds=region.timescale_seconds,
                )
                for region in projection
            ],
        ),
    )
    return message.model_dump(mode="json")


def publish_plan(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
    """Publish one recommendation. Sorted keys, so two replays produce two identical bytes."""
    publisher.publish(PLAN_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8"))


def heartbeat_publisher(
    publisher: MessagePublisher,
    *,
    component: str,
    interval_seconds: float,
    config_digest: str | None,
) -> HeartbeatPublisher:
    """The shared heartbeat publisher, with this component's identity attached."""
    return HeartbeatPublisher(
        publisher,
        component=component,
        interval_seconds=interval_seconds,
        config_digest=config_digest,
    )


def _iso(micros: int) -> str:
    return SimInstant(micros).iso()
