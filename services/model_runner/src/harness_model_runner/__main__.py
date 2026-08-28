"""The model runner as a process: configuration, then time, then the ground truth it advects.

The order in :func:`main` is Constitution IV's: one environment variable names the
configuration; that file is validated before the clock is reached and before the
ground-truth manifest is opened. The broker client may be injected, and where it is not this
component builds one from the ``broker`` section of its own configuration. A component whose
configuration names no broker publishes nothing and says so rather than publishing to a stub
that would light it in the client (Constitution VII); a named broker that cannot be reached
is reported in full on stderr and this component carries on with nothing to publish to.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from harness_core.broker import (
    FROM_CONFIGURATION,
    FROM_CONFIGURATION_MESSAGES,
    idle_interval,
    resolve_publisher,
    resolve_subscriber,
)
from harness_core.clock import (
    CLOCK_TOPIC,
    ClockError,
    FollowedClock,
    SimInstant,
    resolve_clock,
)
from harness_core.config import ConfigError
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import configure_run

from harness_model_runner.config import load_or_exit_with
from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
from harness_model_runner.version import RUNNER_NAME

__all__ = ["INITIALISE_STORE", "main"]

_NO_CLOCK = 70
_NO_GROUND_TRUTH = 71
_INITIAL_RUN_FAILED = 72

INITIALISE_STORE = "--initialise-store"
"""Stage the scenario's first forecast and stop, instead of running the loop.

Seeding asks for this once per destination, through the ordinary image and the ordinary
entry point, because the alternative is a second thing that can produce a forecast field.
``deploy/seed.d/030-coverage.sh`` is the caller and says why the store needs seeding at all;
in short, the loop cannot start itself — a monitor with no published field has nothing to
compute a residual against and raises nothing, which the specification states as its
cold-start edge case.
"""


def main(
    *,
    env: Mapping[str, str] | None = None,
    clock: Clock | FollowedClock | None = None,
    publisher: MessagePublisher | None = FROM_CONFIGURATION,
    ground_truth: Mapping[str, Any] | None = None,
    messages: Iterable[tuple[str, bytes]] = FROM_CONFIGURATION_MESSAGES,
    initialise: bool = False,
    stderr: Any = None,
) -> int:
    """Run the model runner over ``messages``. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    # Simulation time reaches this component by subscription (ADR-0009), and its own loop is
    # what hands each sample over. `following` is None where a caller supplied a plain clock,
    # which decides its own time and has nothing here to keep current.
    try:
        active_clock, following = resolve_clock(clock, config.document)
        active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{RUNNER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    truth = ground_truth
    if truth is None:
        section = settings.model_runner.ground_truth
        path = Path(section.directory) / section.manifest_file
        try:
            truth = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(
                f"{RUNNER_NAME}: the ground-truth manifest cannot be read ({exc}); there is "
                "nothing to advect and a run would be invention",
                file=out,
            )
            return _NO_GROUND_TRUTH

    # Before the broker, and deliberately. Seeding runs this in a second container beside
    # the one already serving the loop, and MQTT identifies a client by an identifier that
    # is per role rather than per container — a second connection under the same name has
    # the incumbent closed by the broker, silently, and what the running component then sees
    # is its own connection failing. The initial run needs no broker: it writes into staging
    # and the running publisher announces it, which is the ordinary path.
    if initialise:
        service = ModelRunnerService(
            settings,
            clock=active_clock,
            ground_truth=truth,
            publisher=None,
            config_digest=config.digest,
        )
        return _stage_initial_run(service, settings, truth, out)

    publisher, owned = resolve_publisher(
        publisher, config.document, component=RUNNER_NAME, report=out
    )
    # The one route by which a model run begins. Until this existed the parameter defaulted
    # to an empty tuple, so the container ran its loop over nothing and exited 0 — a run was
    # never requested of it however many the scheduler published.
    messages, subscribed = resolve_subscriber(
        messages,
        config.document,
        component=RUNNER_NAME,
        topic=(RUN_REQUEST_TOPIC, (CLOCK_TOPIC, 0)),
        report=out,
        purpose="model-runner",
        idle_seconds=idle_interval(settings.component.heartbeat_interval_seconds),
    )

    try:
        if publisher is None:
            print(
                f"{RUNNER_NAME}: no publisher was supplied, so nothing is announced and nothing "
                "lights up. That is truthful, not a degradation",
                file=out,
            )

        service = ModelRunnerService(
            settings,
            clock=active_clock,
            ground_truth=truth,
            publisher=publisher,
            config_digest=config.digest,
        )
        service.beat(force=True)
        # An idle turn carries no topic and routes nowhere; it is what keeps this component
        # saying it is alive between requests, which on a quiet branch is most of the time.
        for topic, payload in messages:
            # A clock sample is a turn like any other. It carries no work for this
            # component's own handler, and it is why every other turn has a current
            # simulation time to do its work at.
            if topic == CLOCK_TOPIC:
                if following is not None:
                    following.take(payload)
            elif topic:
                service.handle(topic, payload)
            service.beat()
    finally:
        if owned is not None:
            owned.close()
        if subscribed is not None:
            subscribed.close()
    return 0


def _stage_initial_run(
    service: ModelRunnerService,
    settings: Any,
    truth: Mapping[str, Any],
    out: Any,
) -> int:
    """Produce the scenario's first forecast into staging, for the publisher to take.

    Initialised at the ground truth's own time origin rather than at whatever the clock says
    now. The initial field has to be a function of the seed and of nothing else, or two
    instances seeded identically would hold different first runs and no replay could be
    diffed against another (Constitution II) — and "now" is precisely the value that differs.
    """
    initial = settings.model_runner.initial_run
    origin = SimInstant.from_iso(str(truth["grid"]["time"]["origin_sim_time"]))
    staged = service.stage_run(
        run_id=initial.run_id,
        # No sequence. This run is not the nth of the scenario in the loop's sense — the
        # scheduler is about to name that one — and the store's manifest records the absence
        # rather than a number that would look like a fact about how it was produced.
        run_sequence=None,
        size=initial.ensemble_size,
        initialisation_micros=origin.micros,
    )
    if staged is None:
        print(
            f"{RUNNER_NAME}: the initial run could not be staged, so the coverage store stays "
            "empty and the control loop has nothing to diverge from",
            file=out,
        )
        return _INITIAL_RUN_FAILED
    print(
        f"{RUNNER_NAME}: staged {initial.run_id} at {origin.iso()}; the publisher makes it "
        "visible and the loop can start",
        file=out,
    )
    return 0


def _run() -> int:
    try:
        return main(initialise=INITIALISE_STORE in sys.argv[1:])
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
