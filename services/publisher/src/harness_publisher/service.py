"""The publisher as a running component: take a finished run, make it visible, say so.

The order is the requirement. Inspect first — a run that fails inspection never moves, so the
previous current run is untouched by construction rather than by rollback. Write the store's
manifest second, into staging, so the run arrives in the store complete in one rename. Move
third, into the catalogue under the run's own name. Repoint fourth, in one operation.
Announce last, because an announcement that preceded visibility would send every consumer to
a field that is not there yet.

The publisher takes finished runs from staging. It does not watch the coverage store and does
not poll anything: the model runner leaves a complete directory in staging, and
:meth:`PublisherService.take` is called with the run's name — by the loop, or by a test.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from harness_core.heartbeat import HeartbeatStatus, MessagePublisher
from harness_core.ports import Clock
from harness_types.config.publisher import DrognaPublisherConfiguration

from harness_publisher import publish
from harness_publisher.atomic import AtomicPublishError, discard, make_current, move_into_catalogue
from harness_publisher.catalogue import Catalogue
from harness_publisher.manifest import write_run_manifest
from harness_publisher.validate import StagedInspection, inspect_staged

__all__ = ["RUN_STARTED_TOPIC", "PublisherService"]

RUN_STARTED_TOPIC = "ctl/run-started"
"""What the model runner announces before it begins assembling a run.

Named here rather than imported from the model runner, as every other component in this loop
names the topics it watches: the scheduler and the monitor each state ``ctl/run-published``
in their own module, and a shared constants module would be a dependency between services
that exchange nothing but messages.

It is a wake-up and not the thing itself. A run is announced started before its ensemble is
computed, so a directory in staging is what says a run is *finished*; this topic only says
one is coming, which is why the loop below drains staging on the idle turn as well.
"""


class PublisherService:
    """One publisher process, minus the transport."""

    def __init__(
        self,
        settings: DrognaPublisherConfiguration,
        *,
        clock: Clock,
        publisher: MessagePublisher | None = None,
        config_digest: str | None = None,
    ) -> None:
        section = settings.publisher
        self._settings = settings
        self._component = settings.component.id
        self._clock = clock
        self._publisher = publisher
        self._staging = Path(section.staging.directory)
        self._partial_suffix = section.catalogue.partial_suffix
        self._catalogue = Catalogue(
            root=Path(section.catalogue.root_directory),
            runs_dirname=section.catalogue.runs_dirname,
            current_pointer=section.catalogue.current_pointer,
        )
        self._forecast_collection = section.collections.forecast
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
        self._published = 0
        self._refused = 0

    # ------------------------------------------------------------------ state

    @property
    def catalogue(self) -> Catalogue:
        return self._catalogue

    @property
    def published(self) -> int:
        return self._published

    @property
    def refused(self) -> int:
        return self._refused

    @property
    def current_run_id(self) -> str | None:
        return self._catalogue.current_run_id()

    def waiting(self) -> tuple[str, ...]:
        """Finished runs sitting in staging, oldest name first."""
        if not self._staging.is_dir():
            return ()
        return tuple(
            sorted(
                entry.name
                for entry in self._staging.iterdir()
                if entry.is_dir() and not entry.name.endswith(self._partial_suffix)
            )
        )

    # ------------------------------------------------------------- publishing

    def inspect(self, run_id: str) -> StagedInspection:
        section = self._settings.publisher.staging
        return inspect_staged(
            self._staging / run_id,
            forecast_file=section.forecast_file,
            uncertainty_file=section.uncertainty_file,
            manifest_file=section.manifest_file,
        )

    def take(self, run_id: str, *, current: bool = True) -> dict[str, Any] | None:
        """Publish one staged run, or refuse it. Returns the announcement, if there was one."""
        inspection = self.inspect(run_id)
        if not inspection.complete:
            return self._refuse(run_id, inspection.refusals)

        catalogue = self._settings.publisher.catalogue
        destination = self._catalogue.run_directory(inspection.run_id)
        try:
            write_run_manifest(
                inspection.directory,
                name=catalogue.manifest_file,
                descriptor=inspection.descriptor,
            )
            move_into_catalogue(inspection.directory, destination)
            if current:
                make_current(
                    self._catalogue.pointer(),
                    inspection.run_id,
                    partial_suffix=self._partial_suffix,
                )
        except (AtomicPublishError, OSError) as exc:
            return self._refuse(run_id, (str(exc),))

        message = publish.announcement(
            inspection.descriptor,
            component=self._component,
            tick=self._clock.tick(),
            forecast_collection=self._forecast_collection,
            current=current,
        )
        self._published += 1
        if self._publisher is not None:
            publish.publish_announcement(self._publisher, message)
        return message

    def _refuse(self, run_id: str, refusals: tuple[str, ...]) -> None:
        """Record the refusal and discard the staging. The current run is untouched."""
        self._refused += 1
        discard(self._staging / run_id)
        message = publish.failure_message(
            component=self._component,
            tick=self._clock.tick(),
            run_id=run_id,
            refusals=refusals,
        )
        if self._publisher is not None:
            publish.publish_failure(self._publisher, message)
        return None

    # ----------------------------------------------------------- liveness

    def beat(self, *, force: bool = False) -> Mapping[str, Any] | None:
        """Publish a heartbeat if the real-time interval has elapsed (ADR-0006)."""
        if self._heartbeat is None:
            return None
        tick = self._clock.tick()
        current = self.current_run_id
        detail = "nothing published yet" if current is None else f"current {current}"
        if force:
            return self._heartbeat.publish(tick, status=HeartbeatStatus.OK, detail=detail)
        return self._heartbeat.maybe_publish(tick, status=HeartbeatStatus.OK, detail=detail)
