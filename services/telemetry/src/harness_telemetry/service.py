"""Telemetry as a running component: subscribe, aggregate, score, and say so on an interval.

The wiring, and only the wiring. Every rule this component is judged on lives in a module
of its own — the incremental moments, the scoping and attribution, the freshness state
machine, the persistence reference, the skill arithmetic — and this class puts them in the
order the requirements put them:

1. a residual report arrives on the telemetry branch;
2. each residual is folded into the scenario scope and into the grid cell it falls in, in
   the record of the forecast run it was *scored against*;
3. where that run is the current one and a persistence reference is held, the same
   measurement is scored a second time against the reference, and both squared errors go
   into the skill reduction;
4. when the publication interval has elapsed *in simulation time*, every scope is published
   with its freshness, and the skill report is published with the evidence that makes it
   checkable.

Two subscriptions and one refusal. ``ctl/telemetry/#`` brings the residual reports and the
scheduler's decision records — MQTT's multi-level wildcard matches the parent level too, so
this receives both the subtopic convention and the flat topic the control-loop services
publish on. ``ctl/run-published`` is what tells this component a new field exists, which is
what moves the persistence reference and closes the superseded run's record. The refusal is
that nothing here queries the observation store or the query layer: :attr:`store_queries`
is zero by construction and SC-003 is asserted against it.

Publication is on simulation time and heartbeats are on real time, and the difference is
load-bearing (ADR-0006). Under acceleration the residual arrival rate rises but the
interval does not shorten, so what grows is the number of samples per message rather than
the number of messages per second. At a rate of zero simulation time stops and publication
stops with it, correctly — while the heartbeat carries on, because the process is alive.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_types.config.telemetry import DrognaTelemetryConfiguration

from harness_telemetry import publish, skill
from harness_telemetry.freshness import FreshnessTracker
from harness_telemetry.persistence_reference import ForecastSource, PersistenceReference
from harness_telemetry.publish import ScopeState, TelemetryState
from harness_telemetry.scopes import RegionGrid, ScopeLevel, ScopeStatistic, StatisticsBook
from harness_telemetry.skill import SkillAccumulator

__all__ = ["RUN_PUBLISHED_TOPIC", "TELEMETRY_PREFIX", "TelemetryService"]

TELEMETRY_PREFIX = "ctl/telemetry"
RUN_PUBLISHED_TOPIC = "ctl/run-published"

_MICROS_PER_SECOND = 1_000_000


class TelemetryService:
    """One telemetry process, minus the transport."""

    def __init__(
        self,
        settings: DrognaTelemetryConfiguration,
        *,
        clock: Clock,
        forecasts: ForecastSource,
        publisher: MessagePublisher | None = None,
        config_digest: str | None = None,
    ) -> None:
        telemetry = settings.telemetry
        self._settings = settings
        self._component = settings.component.id
        self._clock = clock
        self._publisher = publisher
        self._minimum_samples = telemetry.minimum_sample_count
        self._interval_micros = round(telemetry.publication_interval_seconds * _MICROS_PER_SECOND)
        self._window_micros = round(telemetry.staleness_window_seconds * _MICROS_PER_SECOND)
        self._book = StatisticsBook(
            grid=RegionGrid.from_config(telemetry.regions),
            staleness_window_micros=self._window_micros,
        )
        self._reference = PersistenceReference(forecasts)
        self._skill = SkillAccumulator()
        self._skill_freshness = FreshnessTracker(self._window_micros)
        self._reference_changed = False
        self._last_publication_micros: int | None = None
        self._unreadable = 0
        self._unattributable_summaries = 0
        self._decisions = 0
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
    def state(self) -> TelemetryState:
        """What the next heartbeat would report (FR-017)."""
        if not self._reference.has_forecast and self._book.open_run_id is None:
            return TelemetryState.NO_FORECAST
        scenario = self._open_scenario_scope()
        if scenario is None or scenario.statistic.count < self._minimum_samples:
            return TelemetryState.WARMING
        return TelemetryState.REPORTING

    @property
    def store_queries(self) -> int:
        """Queries issued to the observation store or the query layer. Zero, by construction.

        Kept as a property rather than left implicit because SC-003 is a number, and a
        number nothing reports is a number nobody checks. Every figure this component
        publishes came from a message it subscribed to or from the coverage read port.
        """
        return 0

    @property
    def unreadable(self) -> int:
        """Messages that did not parse against the telemetry contract. A fault, counted."""
        return self._unreadable

    @property
    def unattributable(self) -> int:
        """Reports for a forecast run no longer held, or for none at all. Never reassigned."""
        return self._book.unattributable + self._unattributable_summaries

    @property
    def decisions_seen(self) -> int:
        """Scheduler decision records observed. Consumed, and never acted on (FR-013)."""
        return self._decisions

    @property
    def book(self) -> StatisticsBook:
        return self._book

    @property
    def skill_sample_count(self) -> int:
        return self._skill.count

    # ------------------------------------------------------------------- life

    def start(self) -> None:
        """Take whatever forecast is current and set the publication clock running."""
        self._reference.start()
        if self._reference.current_run_id is not None:
            self._book.supersede(self._reference.current_run_id)
        self._last_publication_micros = self._clock.now().micros

    # --------------------------------------------------------------- messages

    def handle(self, topic: str, payload: bytes | str | Mapping[str, Any]) -> None:
        """Route one message. Telemetry publishes nothing in response to a single message."""
        if topic == RUN_PUBLISHED_TOPIC:
            self.handle_run_published(payload)
            return
        if topic == TELEMETRY_PREFIX or topic.startswith(f"{TELEMETRY_PREFIX}/"):
            self.handle_telemetry(payload)

    def handle_run_published(self, payload: bytes | str | Mapping[str, Any]) -> None:
        """A new field exists: move the reference, close the superseded record.

        The reference becomes the field that was current immediately before this
        publication, held constant, and the skill reduction starts again — the errors
        gathered against the old pair of fields say nothing about the new one.
        """
        try:
            document = _decode(payload)
            announced = str(document["run_id"])
        except (KeyError, ValueError):
            self._unreadable += 1
            return
        if self._reference.published():
            self._skill.reset()
            self._skill_freshness = FreshnessTracker(self._window_micros)
            self._reference_changed = True
        self._book.supersede(self._reference.current_run_id or announced)

    def handle_telemetry(self, payload: bytes | str | Mapping[str, Any]) -> None:
        """Take one message off the telemetry branch, whatever kind it is."""
        try:
            document = _decode(payload)
            publish.validate(document)
        except (ValueError, TypeError):
            self._unreadable += 1
            return
        if document.get("component") == self._component:
            # This component's own output, echoed back by a wildcard subscription. Folding
            # a published statistic into the statistics it came from would be a feedback
            # loop wearing a number as a disguise.
            return
        kind = document.get("kind")
        if kind == "residual-sample":
            self._take_samples(document)
        elif kind == "residual-summary":
            self._take_summary(document)
        elif kind == "scheduler-decision":
            self._decisions += 1

    def _take_samples(self, document: Mapping[str, Any]) -> None:
        run_id = str(document["forecast_run_id"])
        for point in document["samples"]:
            when = SimInstant.from_iso(str(point["sim_time"])).micros
            residual = float(point["residual_m_per_s"])
            latitude = float(point["latitude"])
            longitude = float(point["longitude"])
            self._book.observe_sample(
                run_id,
                residual=residual,
                sim_micros=when,
                latitude=latitude,
                longitude=longitude,
            )
            self._score_against_reference(run_id, point, when, residual)

    def _score_against_reference(
        self, run_id: str, point: Mapping[str, Any], when: int, residual: float
    ) -> None:
        """Score the same measurement a second time, against the field held constant.

        Only for the run that is current: a residual scored against a superseded field says
        nothing about whether the *current* forecast is earning its compute. And only where
        the reference covers the position, so that every sample in one mean-square error is
        present in the other and the ratio compares like with like.
        """
        if run_id != self._reference.current_run_id or not self._reference.has_reference:
            return
        persistence_error = self._reference.error_against_reference(
            latitude=float(point["latitude"]),
            longitude=float(point["longitude"]),
            depth_m=float(point["depth_m"]),
            when_micros=when,
            measured=float(point["measured_m_per_s"]),
        )
        if persistence_error is None:
            return
        self._skill.add(model_error=residual, persistence_error=persistence_error)
        self._skill_freshness.updated(when)

    def _take_summary(self, document: Mapping[str, Any]) -> None:
        """Fold a producer's interval summary in, and say what it can and cannot support.

        The shape carries no position and, in what the monitor publishes today, no forecast
        run either, so it lands at scenario level against the run open when it arrived. The
        aggregate records that its basis was a summary, which is how the moments a summary
        cannot carry come out null rather than confident.
        """
        run_id = document.get("forecast_run_id") or self._book.open_run_id
        if run_id is None:
            self._unattributable_summaries += 1
            return
        self._book.observe_summary(
            str(run_id),
            count=int(document["scored"]),
            mean_absolute_m_per_s=float(document["mean_absolute_m_per_s"]),
            sim_micros=SimInstant.from_iso(str(document["sim_time"])).micros,
        )

    # ------------------------------------------------------------ publication

    def due(self) -> bool:
        """Whether the publication interval has elapsed in *simulation* time."""
        if self._last_publication_micros is None:
            return False
        return self._clock.now().micros - self._last_publication_micros >= self._interval_micros

    def publish_reports(self, *, force: bool = False) -> list[dict[str, Any]]:
        """Publish every scope's statistics and the skill report, if the interval has come."""
        if self._publisher is None:
            return []
        if not force and not self.due():
            return []
        now = self._clock.now().micros
        self._last_publication_micros = now
        tick = self._clock.tick()

        messages: list[dict[str, Any]] = []
        for record in self._book.records():
            for scope in record.scopes():
                message = publish.statistics_message(
                    scope,
                    component=self._component,
                    tick=tick,
                    forecast_run_id=record.run_id,
                    state=self._scope_state(scope),
                    closed=record.closed,
                    now_micros=now,
                )
                publish.publish_message(self._publisher, self._component, message)
                messages.append(message)

        report = skill.assess(
            count=self._skill.count,
            minimum_sample_count=self._minimum_samples,
            model_mean_square_error=self._skill.model_mean_square_error,
            persistence_mean_square_error=self._skill.persistence_mean_square_error,
            has_forecast=self._reference.has_forecast,
            has_reference=self._reference.has_reference,
        )
        message = publish.skill_message(
            report,
            component=self._component,
            tick=tick,
            forecast_run_id=self._reference.current_run_id,
            reference_run_id=self._reference.reference_run_id,
            reference_changed=self._reference_changed,
            freshness=self._skill_freshness,
            now_micros=now,
        )
        publish.publish_message(self._publisher, self._component, message)
        messages.append(message)
        self._reference_changed = False
        return messages

    def _scope_state(self, scope: ScopeStatistic) -> ScopeState:
        """Which of the four things one published statistic is.

        ``warming`` is the whole component still below the minimum count after a start or a
        restart: running statistics live in memory, are lost with the process, and are not
        reconstructed from any store. ``insufficient-samples`` is one scope below the
        minimum while others are above it, reported per scope rather than folded into the
        scenario figure.
        """
        component_state = self.state
        if component_state is TelemetryState.NO_FORECAST:
            return ScopeState.NO_FORECAST
        if scope.statistic.count < self._minimum_samples:
            if component_state is TelemetryState.WARMING:
                return ScopeState.WARMING
            return ScopeState.INSUFFICIENT_SAMPLES
        return ScopeState.REPORTING

    def _open_scenario_scope(self) -> ScopeStatistic | None:
        run_id = self._book.open_run_id
        if run_id is None:
            return None
        record = self._book.record_for(run_id)
        if record is None:
            return None
        return record.scope(ScopeLevel.SCENARIO, None)

    # ----------------------------------------------------------- liveness

    def beat(self, *, force: bool = False) -> Mapping[str, Any] | None:
        """Publish a heartbeat if the real-time interval has elapsed (ADR-0006)."""
        if self._heartbeat is None:
            return None
        tick = self._tick()
        state = self.state
        status = publish.heartbeat_status(state)
        if force:
            return self._heartbeat.publish(tick, status=status, detail=state.value)
        return self._heartbeat.maybe_publish(tick, status=status, detail=state.value)

    def _tick(self) -> Tick:
        return self._clock.tick()


def _decode(payload: bytes | str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(payload, Mapping):
        return payload
    raw = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    document = json.loads(raw)
    if not isinstance(document, Mapping):
        raise ValueError("a control message is a JSON object")
    return document
