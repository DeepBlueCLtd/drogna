"""The model runner as a running component: a request in, a staged run out.

The order in :meth:`ModelRunnerService.handle_run_request` is the requirement, not a
preference. ``ctl/run-started`` goes out before any computation (FR-016). The ensemble runs
in ordinal order, each member drawing only from its own stream. A member that fails fails
the run, and the failure is recorded rather than left as an absence (FR-021). Only a
complete run reaches staging, and staging is the only place this component writes.

The kernel is chosen by name from configuration, which is what makes SC-011 checkable:
selecting a different implementation is a configuration change with no source edit outside
this package.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from harness_core.clock import SimInstant
from harness_core.heartbeat import HeartbeatStatus, MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import RandomStreams
from harness_types.config.model_runner import DrognaModelRunnerConfiguration

from harness_model_runner import publish
from harness_model_runner.analytic_kernel import kernel_for
from harness_model_runner.ensemble import MEMBER_STREAM, MemberFailedError, run_ensemble
from harness_model_runner.kernel import InitialisationState, ModelKernel
from harness_model_runner.staging import StagedRun, Staging
from harness_model_runner.truth import background_from, features_from, grid_for

__all__ = ["RUN_REQUEST_TOPIC", "ModelRunnerService"]

RUN_REQUEST_TOPIC = "ctl/run-request"


class ModelRunnerService:
    """One model runner process, minus the transport."""

    def __init__(
        self,
        settings: DrognaModelRunnerConfiguration,
        *,
        clock: Clock,
        ground_truth: Mapping[str, Any],
        staging: Staging | None = None,
        kernel: ModelKernel | None = None,
        publisher: MessagePublisher | None = None,
        config_digest: str | None = None,
    ) -> None:
        runner = settings.model_runner
        self._settings = settings
        self._component = settings.component.id
        self._clock = clock
        self._publisher = publisher
        self._config_digest = config_digest
        self._ground_truth = ground_truth
        self._randomness = RandomStreams(settings.seed.root)
        self._kernel = kernel if kernel is not None else kernel_for(runner.kernel.name.value)
        self._staging = staging or Staging(
            Path(runner.staging.directory),
            forecast_file=runner.staging.forecast_file,
            uncertainty_file=runner.staging.uncertainty_file,
            manifest_file=runner.staging.manifest_file,
            stored_dtype=runner.stored_dtype.value,
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
        self._completed = 0
        self._failed = 0

    # ------------------------------------------------------------------ state

    @property
    def kernel_name(self) -> str:
        return self._kernel.name

    @property
    def completed(self) -> int:
        return self._completed

    @property
    def failed(self) -> int:
        return self._failed

    # ------------------------------------------------------------- messages

    def handle(self, topic: str, payload: bytes | str | Mapping[str, Any]) -> StagedRun | None:
        if topic == RUN_REQUEST_TOPIC:
            return self.handle_run_request(payload)
        return None

    def handle_run_request(self, payload: bytes | str | Mapping[str, Any]) -> StagedRun | None:
        """Execute one run. Returns the staged run, or nothing if the run failed."""
        request = _decode(payload)
        runner = self._settings.model_runner
        size = int(request["ensemble_size"])
        run_id = str(request["run_id"])
        tick = self._clock.tick()

        started = publish.run_started_message(
            request,
            component=self._component,
            tick=tick,
            kernel=self._kernel.name,
            member_count=size,
        )
        if self._publisher is not None:
            publish.publish_run_started(self._publisher, started)

        if size > runner.ensemble.maximum_size:
            return self._fail(
                run_id,
                f"a run of {size} members was requested and this runner is configured for "
                f"at most {runner.ensemble.maximum_size}; truncating would publish a spread "
                "over fewer members than were asked for, under the name of the larger one",
            )

        initialisation = SimInstant.from_iso(str(request["initialisation_sim_time"])).micros
        state = InitialisationState(
            grid=grid_for(
                self._ground_truth,
                initialisation_micros=initialisation,
                step_seconds=runner.forecast.step_seconds,
                steps=runner.forecast.step_count,
            ),
            background=background_from(self._ground_truth),
            features=features_from(self._ground_truth),
            initialisation_micros=initialisation,
            noise_temperature_c=runner.kernel.noise_temperature_c,
            noise_salinity_psu=runner.kernel.noise_salinity_psu,
        )

        try:
            outcome = run_ensemble(
                self._kernel,
                state,
                self._randomness,
                size=size,
                temperature_c=runner.ensemble.perturbation_temperature_c,
                salinity_psu=runner.ensemble.perturbation_salinity_psu,
                drift_fraction=runner.ensemble.perturbation_drift_fraction,
                stream_prefix=f"{MEMBER_STREAM}.{run_id}",
            )
        except MemberFailedError as exc:
            return self._fail(run_id, str(exc))

        staged = self._staging.write(
            outcome,
            run_id=run_id,
            scenario_run_id=tick.run_id,
            kernel=self._kernel.name,
            root_seed=self._settings.seed.root,
            config_digest=self._config_digest,
            initialisation_micros=initialisation,
        )
        self._completed += 1
        return staged

    def _fail(self, run_id: str, detail: str) -> None:
        """Record the failure. Nothing is staged, so nothing can be published."""
        self._failed += 1
        message = publish.failure_message(
            component=self._component, tick=self._clock.tick(), run_id=run_id, detail=detail
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
        detail = f"kernel {self._kernel.name}, {self._completed} run(s) staged"
        if force:
            return self._heartbeat.publish(tick, status=HeartbeatStatus.OK, detail=detail)
        return self._heartbeat.maybe_publish(tick, status=HeartbeatStatus.OK, detail=detail)


def _decode(payload: bytes | str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(payload, Mapping):
        return payload
    raw = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    document = json.loads(raw)
    if not isinstance(document, Mapping):
        raise ValueError("a control message is a JSON object")
    return document
