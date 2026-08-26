"""The monitor as a running component: subscribe, score, and say so once.

The wiring, and only the wiring. Every rule this component is judged on lives in a module
of its own — the window's bounds, the residual's definition, the persistence rules — and
this class puts them in the order the requirements put them:

1. an observation arrives on ``obs/#`` and becomes a measurement;
2. three measurements at one place and one instant become a sounding;
3. the sounding enters the bounded window;
4. warm-up must be complete, or nothing is raised;
5. a forecast must be published, or nothing is raised;
6. the sounding is scored against that forecast on sound speed;
7. the sample is offered to the persistence rules, and only they can produce a divergence.

Two subscriptions, not one. ``ctl/run-published`` tells the monitor a new field exists,
which is how it learns to score against something else; nothing polls the query layer to
ask (FR-025). That message also invalidates the persistence evidence, because evidence
against a superseded field is evidence about nothing.

The heartbeat is the only thing in this component on a real-time cadence (ADR-0006). Every
other interval — the window, the persistence span, the warm-up — is simulation time from
the clock port.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import RandomStreams
from harness_types.config.monitor import DrognaMonitorConfiguration

from harness_monitor import publish
from harness_monitor.catchup import CatchupQuery, WarmUp, WarmUpMode
from harness_monitor.coverage import ForecastField, ForecastSource
from harness_monitor.observations import (
    ObservationError,
    Sounding,
    SoundingAssembler,
    measurement_from,
)
from harness_monitor.persistence import Evidence, PersistenceTracker
from harness_monitor.publish import MonitorState
from harness_monitor.residual import residual_for
from harness_monitor.window import RollingWindow

__all__ = ["OBSERVATION_PREFIX", "RUN_PUBLISHED_TOPIC", "MonitorService"]

OBSERVATION_PREFIX = "obs/"
RUN_PUBLISHED_TOPIC = "ctl/run-published"

_DIVERGENCE_STREAM = "monitor.divergence"
_MICROS_PER_SECOND = 1_000_000


class MonitorService:
    """One monitor process, minus the transport."""

    def __init__(
        self,
        settings: DrognaMonitorConfiguration,
        *,
        clock: Clock,
        forecasts: ForecastSource,
        publisher: MessagePublisher | None = None,
        config_digest: str | None = None,
        catchup: CatchupQuery | None = None,
    ) -> None:
        monitor = settings.monitor
        self._settings = settings
        self._component = settings.component.id
        self._clock = clock
        self._forecasts = forecasts
        self._publisher = publisher
        self._randomness = RandomStreams(settings.seed.root)
        self._window = RollingWindow(
            span_seconds=monitor.window.span_seconds,
            maximum_samples=monitor.window.maximum_samples,
        )
        self._assembler = SoundingAssembler(maximum_pending=monitor.window.maximum_pending)
        self._tracker = PersistenceTracker(
            threshold_m_per_s=monitor.residual.threshold_m_per_s,
            neighbourhood_radius_m=monitor.persistence.neighbourhood_radius_m,
            spatial_sample_count=monitor.persistence.spatial_sample_count,
            temporal_sample_count=monitor.persistence.temporal_sample_count,
            temporal_span_seconds=monitor.persistence.temporal_span_seconds,
            retention_micros=self._window.span_micros,
        )
        self._warmup = WarmUp(
            mode=WarmUpMode(monitor.warmup.mode.value),
            span_seconds=monitor.warmup.span_seconds,
            sample_limit=monitor.warmup.catchup_sample_limit or 1000,
            query=catchup,
        )
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
        self._field: ForecastField | None = None
        self._raised = 0
        self._scored = 0
        self._exceeding = 0
        self._outside_domain = 0
        self._unreadable = 0
        self._absolute_total = 0.0

    # ------------------------------------------------------------------ state

    @property
    def state(self) -> MonitorState:
        """What the monitor would report in its next heartbeat."""
        if not self._warmup.complete:
            return MonitorState.WARMING
        if self._field is None:
            return MonitorState.NO_FORECAST
        return MonitorState.SCORING

    @property
    def window(self) -> RollingWindow:
        return self._window

    @property
    def store_queries(self) -> int:
        """Queries issued against the observation store. One at startup, then none."""
        return self._warmup.queries_issued

    @property
    def raised(self) -> int:
        return self._raised

    @property
    def outside_domain(self) -> int:
        """Soundings the current forecast does not cover. Counted, never silently absorbed."""
        return self._outside_domain

    @property
    def unreadable(self) -> int:
        """Messages that did not parse as observations. A fault in the sender, counted here."""
        return self._unreadable

    @property
    def shed(self) -> int:
        return self._assembler.shed + self._window.evicted_by_count

    # ------------------------------------------------------------------ life

    def start(self) -> None:
        """Take the current forecast if there is one, and begin warming."""
        self._field = self._forecasts.current()
        for sounding in self._warmup.begin(self._now_micros()):
            self._window.add(sounding)

    def reconnected(self) -> None:
        """A dropped subscription is a gap in the window, so warm up again (FR-23)."""
        self._tracker.invalidate("broker reconnection")
        self._warmup.restart(self._now_micros(), "broker reconnection")

    # ------------------------------------------------------------- messages

    def handle(self, topic: str, payload: bytes | str | Mapping[str, Any]) -> dict[str, Any] | None:
        """Route one message. Returns the divergence published, if one was."""
        if topic.startswith(OBSERVATION_PREFIX):
            return self.handle_observation(payload)
        if topic == RUN_PUBLISHED_TOPIC:
            self.handle_run_published(payload)
            return None
        return None

    def handle_run_published(self, payload: bytes | str | Mapping[str, Any]) -> None:
        """A new field exists. Take it, and discard evidence gathered against the old one.

        The residual summary for the field being replaced goes out here, which is why this
        component needs no reporting interval of its own: a summary is per forecast run, and
        a run ending is a boundary in simulation time rather than a moment on a timer.
        """
        _ = _decode(payload)
        self.report()
        previous = None if self._field is None else self._field.run_id
        self._field = self._forecasts.current()
        if self._field is not None and self._field.run_id != previous:
            self._tracker.invalidate("a new forecast was published")

    def handle_observation(self, payload: bytes | str | Mapping[str, Any]) -> dict[str, Any] | None:
        """Take one observation message through the whole chain."""
        try:
            message = _decode(payload)
            instant = SimInstant.from_iso(str(message["sim_time"]))
            measurement = measurement_from(message, sim_micros=instant.micros)
        except (KeyError, ValueError, ObservationError):
            self._unreadable += 1
            return None

        sounding = self._assembler.accept(measurement)
        if sounding is None:
            return None
        return self.score(sounding)

    def score(self, sounding: Sounding) -> dict[str, Any] | None:
        """Window it, score it, and let the persistence rules decide."""
        self._window.add(sounding)
        if not self._warmup.observe(sounding.sim_micros):
            return None
        if self._field is None:
            self._field = self._forecasts.current()
        if self._field is None:
            return None

        sample = residual_for(sounding, self._field)
        if sample is None:
            self._outside_domain += 1
            return None

        self._scored += 1
        self._absolute_total += sample.magnitude
        if sample.exceeds(self._settings.monitor.residual.threshold_m_per_s):
            self._exceeding += 1

        evidence = self._tracker.observe(sample)
        if evidence is None:
            return None
        return self._raise(evidence)

    def _raise(self, evidence: Evidence) -> dict[str, Any]:
        tick = self._tick()
        message = publish.divergence_message(
            evidence,
            component=self._component,
            tick=tick,
            divergence_id=self._randomness.identifier_for(_DIVERGENCE_STREAM, self._raised),
            threshold_m_per_s=self._settings.monitor.residual.threshold_m_per_s,
        )
        self._raised += 1
        if self._publisher is not None:
            publish.publish_divergence(self._publisher, message)
        return message

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

    def report(self) -> Mapping[str, Any] | None:
        """Publish the residual summary feature 010 consumes, and reset the counters."""
        if self._publisher is None:
            return None
        mean = self._absolute_total / self._scored if self._scored else 0.0
        message = publish.publish_residual_summary(
            self._publisher,
            component=self._component,
            tick=self._tick(),
            scored=self._scored,
            exceeding=self._exceeding,
            outside_domain=self._outside_domain,
            shed=self.shed,
            mean_absolute_m_per_s=mean,
        )
        self._scored = 0
        self._exceeding = 0
        self._absolute_total = 0.0
        return message

    # ------------------------------------------------------------ internals

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
