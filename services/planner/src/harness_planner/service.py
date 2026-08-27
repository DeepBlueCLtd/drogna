"""The planner as a running component: subscribe, plan, and recommend.

The wiring, and only the wiring. Every rule this component is judged on lives in a module of
its own — the sensing footprint, the collapse and regrowth, the value function, the
selection, the commitment, the projection — and this class puts them in the order the
requirements put them:

1. an announcement on ``ctl/run-published`` says a new uncertainty field exists;
2. the field is read through the coverage read port, never through the query layer;
3. observations arriving on ``obs/#`` collapse the cells their measurements informed;
4. a trigger — the cadence in simulation time, a new field, or a measurement — starts a
   replan from where the platform now is;
5. the part of the previous route inside the commitment window is held unless the free
   alternative beats it by more than the margin;
6. the route and the projection go out together on ``ctl/plan`` as one recommendation.

Two subscriptions, not one, and neither is a poll. Nothing here asks the query layer whether
anything has changed (SRD FR-31), and nothing here queries the observation store: the
planner keeps the last-informed simulation time per planning cell and nothing else of the
observation traffic.

A recommendation is never produced against a field that has already been superseded
(FR-017). The mechanism is that there is nothing left of the old field to produce one
against: taking a new field replaces the object the state reads through, and a search whose
field has been replaced mid-flight discovers it when it goes to publish and is discarded.

The heartbeat is the only thing in this component on a real-time cadence (ADR-0006). Every
other interval — the horizon, the replan cadence, the commitment window, the projection step
— is simulation time from the clock port.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import RandomStreams
from harness_types.config.planner import DrognaPlannerConfiguration

from harness_planner import publish
from harness_planner.cells import CellGeometry, PlanningCell, depth_bands_from
from harness_planner.commitment import Trigger, committed_prefix, hold_or_depart
from harness_planner.field import FieldSource, GriddedPlanningField, TimescaleSource
from harness_planner.projection import project
from harness_planner.publish import PlannerState
from harness_planner.select import EmptyReason, Selection, select_route
from harness_planner.sensing import SensingFootprint
from harness_planner.traversal import Position, TraversalCost
from harness_planner.uncertainty_state import UncertaintyState
from harness_planner.value import ValuedVertex, evaluate_route

__all__ = [
    "OBSERVATION_PREFIX",
    "RUN_PUBLISHED_TOPIC",
    "PlannerService",
]

OBSERVATION_PREFIX = "obs/"
RUN_PUBLISHED_TOPIC = "ctl/run-published"

_PLAN_STREAM = "planner.plan"
_SEARCH_STREAM = "planner.search"
_MICROS_PER_SECOND = 1_000_000


class PlannerService:
    """One planner process, minus the transport."""

    def __init__(
        self,
        settings: DrognaPlannerConfiguration,
        *,
        clock: Clock,
        fields: FieldSource,
        timescales: TimescaleSource,
        publisher: MessagePublisher | None = None,
        config_digest: str | None = None,
    ) -> None:
        planner = settings.planner
        self._settings = settings
        self._component = settings.component.id
        self._clock = clock
        self._fields = fields
        self._timescales = timescales
        self._publisher = publisher
        self._randomness = RandomStreams(settings.seed.root)

        self._geometry = CellGeometry(
            resolution=planner.indexing.h3_resolution,
            bands=depth_bands_from(planner.indexing.depth_bands),
        )
        self._footprint = SensingFootprint(
            self._geometry,
            horizontal_decay_m=planner.sensing.horizontal_decay_m,
            vertical_decay_m=planner.sensing.vertical_decay_m,
            peak_reduction=planner.sensing.peak_reduction,
            maximum_rings=planner.sensing.maximum_rings,
            maximum_band_separation=planner.sensing.maximum_band_separation,
        )
        self._traversal = TraversalCost(
            geometry=self._geometry,
            horizontal_speed_m_per_s=planner.platform.horizontal_speed_m_per_s,
            vertical_speed_m_per_s=planner.platform.vertical_speed_m_per_s,
        )
        self._platform = Position(
            latitude=planner.platform.start.latitude,
            longitude=planner.platform.start.longitude,
            depth_m=planner.platform.start.depth_m,
        )
        self._threshold = planner.uncertainty.usable_threshold
        self._variable = planner.uncertainty.variable.value

        self._state: UncertaintyState | None = None
        self._field: GriddedPlanningField | None = None
        self._indices: tuple[str, ...] = ()
        self._cells: tuple[PlanningCell, ...] = ()
        self._previous: tuple[ValuedVertex, ...] = ()
        self._plan_id: str | None = None
        self._published = 0
        self._last_plan_micros: int | None = None
        self._unreadable = 0
        self._measurements = 0
        self._last_measurement: tuple[PlanningCell, int] | None = None
        self._nothing_worth_sampling = False

        self._heartbeat = (
            None
            if publisher is None
            else publish.heartbeat_publisher(
                publisher,
                component=self._component,
                interval_seconds=settings.component.heartbeat_interval_seconds or 5.0,
                config_digest=config_digest,
            )
        )

    # ------------------------------------------------------------------ state

    @property
    def state(self) -> PlannerState:
        """What the planner would report in its next heartbeat and in its next plan."""
        if self._field is None:
            return PlannerState.NO_FIELD
        if self._nothing_worth_sampling:
            return PlannerState.NOTHING_WORTH_SAMPLING
        return PlannerState.PLANNING

    @property
    def geometry(self) -> CellGeometry:
        return self._geometry

    @property
    def published(self) -> int:
        return self._published

    @property
    def measurements(self) -> int:
        """Observations that informed a planning cell. Not stored; counted."""
        return self._measurements

    @property
    def unreadable(self) -> int:
        """Messages that did not parse. A fault in the sender, counted here."""
        return self._unreadable

    @property
    def platform(self) -> Position:
        return self._platform

    # ------------------------------------------------------------------- life

    def start(self) -> None:
        """Take the current uncertainty field if there is one, and index the domain."""
        self._take_field()

    def _take_field(self, *, digest: str | None = None) -> bool:
        """Read the announced field through the coverage port. True if anything changed.

        Eager at startup as well as on an announcement, because a planner restarting into a
        running scenario has a current field to catch up to and no announcement is coming for
        it. The digest arrives with the announcement rather than with the bytes, so a field
        first read at startup gains its digest when the next announcement names it.
        """
        spread = self._fields.current()
        if spread is None:
            return False
        unchanged = (
            self._field is not None
            and self._field.run_id == spread.run_id
            and (digest is None or self._field.digest == digest)
        )
        if unchanged:
            return False
        field = GriddedPlanningField(
            spread,
            geometry=self._geometry,
            timescales=self._timescales,
            digest=digest if digest is not None else self._digest_for(spread.run_id),
        )
        self._indices = self._geometry.cover(
            spread.bounds(), maximum_cells=self._settings.planner.indexing.maximum_cells
        )
        self._cells = self._geometry.cells(self._indices)
        self._field = field
        self._state = UncertaintyState(field) if self._state is None else self._state.rebased(field)
        return True

    def _digest_for(self, run_id: str) -> str | None:
        """The digest already held for this run, or nothing where none was announced."""
        if self._field is not None and self._field.run_id == run_id:
            return self._field.digest
        return None

    # --------------------------------------------------------------- messages

    def handle(self, topic: str, payload: bytes | str | Mapping[str, Any]) -> dict[str, Any] | None:
        """Route one message. Returns the recommendation published, if one was."""
        if topic.startswith(OBSERVATION_PREFIX):
            return self.handle_observation(payload)
        if topic == RUN_PUBLISHED_TOPIC:
            return self.handle_run_published(payload)
        return None

    def handle_run_published(
        self, payload: bytes | str | Mapping[str, Any]
    ) -> dict[str, Any] | None:
        """A new uncertainty field exists. Take it, and replan against it.

        The announcement carries the digest of what was published, and it is carried through
        into the recommendation so that a reader with the same bytes can say the planner read
        the same field rather than take its word for it.

        An announcement always produces a replan where there is a field to plan against. It
        is one of FR-014's three triggers, and the trigger is the announcement rather than
        the change: a run announced twice is announced for a reason, and a planner that
        stayed silent the second time would be silent for a reason nobody could see.
        """
        try:
            message = _decode(payload)
        except ValueError:
            self._unreadable += 1
            return None
        digests = message.get("digests")
        digest = None
        if isinstance(digests, Mapping):
            announced = digests.get("uncertainty")
            digest = None if announced is None else str(announced)
        self._take_field(digest=digest)
        if self._field is None:
            self._beat()
            return None
        return self.replan(Trigger.NEW_FIELD)

    def handle_observation(self, payload: bytes | str | Mapping[str, Any]) -> dict[str, Any] | None:
        """Collapse the cells one measurement informed, and note where the platform is.

        Nothing of the observation is kept. The cell it informed and the simulation instant
        it informed it at are the whole of what a planner needs from an observation, and
        keeping more would be keeping a history of a sampling platform (Constitution V).
        """
        try:
            message = _decode(payload)
            instant = SimInstant.from_iso(str(message["sim_time"]))
            location = message["location"]
            latitude = float(location["latitude"])
            longitude = float(location["longitude"])
            depth_m = float(location["depth_m"])
        except (KeyError, TypeError, ValueError):
            self._unreadable += 1
            return None

        self._platform = Position(latitude=latitude, longitude=longitude, depth_m=depth_m)
        self._measurements += 1
        if self._state is None:
            return None

        cell = self._geometry.cell_at(latitude, longitude, depth_m)
        if (cell, instant.micros) == self._last_measurement:
            # One sounding is three observations — temperature, salinity and pressure at one
            # place and one instant — and it is one measurement of that water. Collapsing the
            # cell once per observation would treat it as three, tripling the reduction and
            # under-valuing every later visit for a reason no reader could find; replanning
            # once per observation would run the same search three times for the same fact.
            # Both are avoided by noticing this is the same measurement, which the cell and
            # the instant say between them. The planner assembles no sounding and keeps no
            # observation: it holds the last cell and instant it was informed of, and that
            # is all this needs.
            return None
        self._last_measurement = (cell, instant.micros)
        self._state.measured(cell, instant.micros, footprint=self._footprint)
        return self.replan(Trigger.MEASUREMENT)

    def due(self) -> bool:
        """Whether the replan cadence has elapsed in simulation time."""
        if self._last_plan_micros is None:
            return True
        cadence = self._settings.planner.horizon.replan_cadence_seconds
        elapsed = (self._now_micros() - self._last_plan_micros) / _MICROS_PER_SECOND
        return elapsed >= cadence

    def tick(self) -> dict[str, Any] | None:
        """Replan if the cadence has elapsed. The only schedule in this component."""
        if not self.due():
            return None
        return self.replan(Trigger.CADENCE)

    # --------------------------------------------------------------- planning

    def replan(self, trigger: Trigger) -> dict[str, Any] | None:
        """Recompute the recommendation from where the platform now is, and publish it."""
        if self._field is None or self._state is None:
            self._beat()
            return None

        tick = self._clock.tick()
        start_micros = tick.instant.micros
        planner = self._settings.planner
        span_micros = round(planner.horizon.span_seconds * _MICROS_PER_SECOND)
        rng = self._randomness.rng_for(_SEARCH_STREAM)

        prefix = committed_prefix(
            self._previous,
            start_micros=start_micros,
            window_seconds=planner.commitment.window_seconds,
        )
        free = self._search(start_micros, rng, prefix=())
        held = self._search(start_micros, rng, prefix=prefix) if prefix else free
        commitment = hold_or_depart(
            free=free,
            held=held,
            prefix_length=len(prefix),
            window_seconds=planner.commitment.window_seconds,
            margin=planner.commitment.improvement_margin,
        )

        projection_horizon = (
            planner.projection.horizon_seconds
            if planner.projection.horizon_seconds is not None
            else planner.horizon.span_seconds
        )
        regions = project(
            self._indices,
            state=self._state,
            geometry=self._geometry,
            micros=start_micros,
            step_seconds=planner.projection.step_seconds,
            horizon_seconds=projection_horizon,
            threshold=self._threshold,
        )

        selection = commitment.selection
        self._nothing_worth_sampling = selection.empty_reason == EmptyReason.NOTHING_WORTH_SAMPLING
        plan_id = self._randomness.identifier_for(_PLAN_STREAM, self._published)
        message = publish.plan_message(
            component=self._component,
            tick=tick,
            plan_id=plan_id,
            supersedes=self._plan_id,
            state=self.state,
            empty_reason=selection.empty_reason,
            geometry=self._geometry,
            platform=self._platform,
            horizon_micros=(start_micros, start_micros + span_micros),
            field_run_id=self._field.run_id,
            field_variable=self._variable,
            field_digest=self._field.digest,
            commitment=commitment,
            budget_seconds=planner.platform.budget_seconds,
            projection=regions,
            projection_step_seconds=planner.projection.step_seconds,
            projection_horizon_seconds=projection_horizon,
            usable_threshold=self._threshold,
        )

        self._previous = selection.route.vertices
        self._plan_id = plan_id
        self._published += 1
        self._last_plan_micros = start_micros
        if self._publisher is not None:
            publish.publish_plan(self._publisher, message)
        self._beat()
        return message

    def _search(self, start_micros: int, rng: Any, *, prefix: Sequence[PlanningCell]) -> Selection:
        assert self._state is not None
        planner = self._settings.planner
        return select_route(
            self._cells,
            state=self._state,
            start=self._platform,
            start_micros=start_micros,
            traversal=self._traversal,
            footprint=self._footprint,
            threshold=self._threshold,
            budget_seconds=planner.platform.budget_seconds,
            restarts=planner.search.restarts,
            maximum_candidates=planner.search.maximum_candidates,
            shortlist=planner.search.shortlist,
            rng=rng,
            prefix=prefix,
        )

    def value_of(self, cells: Sequence[PlanningCell], *, start_micros: int):
        """What one candidate route would be worth. Exposed for the optimality-gap figure."""
        assert self._state is not None
        return evaluate_route(
            cells,
            state=self._state,
            start=self._platform,
            start_micros=start_micros,
            traversal=self._traversal,
            footprint=self._footprint,
            threshold=self._threshold,
        )

    # ---------------------------------------------------------------- liveness

    def beat(self, *, force: bool = False) -> Mapping[str, Any] | None:
        """Publish a heartbeat if the real-time interval has elapsed (ADR-0006)."""
        if self._heartbeat is None:
            return None
        tick = self._clock.tick()
        state = self.state
        status = publish.heartbeat_status(state)
        if force:
            return self._heartbeat.publish(tick, status=status, detail=state.value)
        return self._heartbeat.maybe_publish(tick, status=status, detail=state.value)

    def _beat(self) -> None:
        self.beat()

    # --------------------------------------------------------------- internals

    def _tick(self) -> Tick:
        return self._clock.tick()

    def _now_micros(self) -> int:
        return self._clock.now().micros


def _decode(payload: bytes | str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(payload, Mapping):
        return payload
    raw = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    document = json.loads(raw)
    if not isinstance(document, Mapping):
        raise ValueError("a control or observation message is a JSON object")
    return document
