"""Which components can say they are unwell, and which can only say nothing is wrong.

A ratchet, in the shape ``test_mount_coherence.py`` established: the list below records the
debt so that it cannot grow while it is being paid off, and when it reaches zero this stops
being a ratchet and becomes a gate.

The heartbeat is the only channel through which anything downstream learns how a component
is doing. The client draws it (``layout/ComponentDiagram.tsx`` puts ``statusWords`` under
every box), the telemetry branch is scoped to domain reports rather than health, and
Constitution VII forbids the display inferring health from anything else. So a component
whose publish path can only ever produce ``ok`` has exactly two observable states — fine, or
not heard from — and the whole middle of the range, where a process is alive and not working,
is invisible.

That middle is where the interesting failures live. ``services/planner`` shows what the fix
looks like, in a pure function from the component's own state:

    def heartbeat_status(state: PlannerState) -> HeartbeatStatus:
        \"\"\"``no-field`` is degraded rather than ok: the process is alive and is doing
        nothing useful, and saying so is the difference between a component that is
        working and one that is merely running.\"\"\"

Written while a component is being built this costs nothing, because its states are already
in the author's head. Retrofitted afterwards it costs a pass over every service by somebody
who has to learn each one again. That asymmetry is the only reason this file exists: it does
not fail the build for the five that are outstanding, and it does fail the moment a sixth
joins them.

**What this checks is coarse, and deliberately so.** It reads each service's source for a
mention of ``HeartbeatStatus.DEGRADED`` or ``HeartbeatStatus.STALLED``. That is a proxy for
"this component can describe itself as unwell", not proof that it does so correctly or at
the right moment — no test can check that. A service could satisfy this and still map its
states badly. What it cannot do is satisfy it by accident.
"""

from __future__ import annotations

import re
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SERVICES = REPOSITORY_ROOT / "services"

#: A component that publishes heartbeats but whose source never mentions an unwell status.
#: Each entry is debt, not permission. Removing one is a small change to that service alone;
#: adding one needs an argument, because it means shipping a component that cannot report
#: the failures it will have.
NO_UNWELL_STATUS: set[str] = {
    "env_generator",
    "model_runner",
    "publisher",
    "scheduler",
    "sensors",
}

#: A component that publishes no heartbeat at all. ``offload`` (C-17) packages a release
#: when asked rather than running continuously, and the heartbeat contract is explicit that
#: it is what "every long-lived component" publishes — so this is recorded as a question
#: rather than as debt. If C-17 becomes long-lived, it needs a heartbeat and this entry
#: becomes an entry in the set above.
NO_HEARTBEAT: set[str] = {"offload"}

UNWELL = re.compile(r"HeartbeatStatus\.(DEGRADED|STALLED)")


def _source_of(service: str) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8") for path in (SERVICES / service / "src").rglob("*.py")
    )


def _services() -> list[str]:
    return sorted(path.name for path in SERVICES.iterdir() if path.is_dir())


def _heartbeats(service: str) -> bool:
    return "HeartbeatPublisher(" in _source_of(service)


def test_there_are_services_to_read() -> None:
    """The scan has something to scan. A ratchet over an empty list is worth nothing."""
    assert len(_services()) >= 10


def test_no_component_stops_reporting_that_it_is_unwell() -> None:
    """Nothing that could describe itself as unwell has quietly lost the ability."""
    able = {
        service
        for service in _services()
        if _heartbeats(service) and UNWELL.search(_source_of(service))
    }
    regressed = able & NO_UNWELL_STATUS
    assert not regressed, (
        f"{sorted(regressed)} can report an unwell status, so the debt list is stale: "
        "remove them from NO_UNWELL_STATUS"
    )


def test_the_debt_does_not_grow() -> None:
    """A new component arrives able to say it is unwell, or the list gains an argument."""
    unable = {
        service
        for service in _services()
        if _heartbeats(service) and not UNWELL.search(_source_of(service))
    }
    new = unable - NO_UNWELL_STATUS
    assert not new, (
        f"{sorted(new)} publishes heartbeats but can only ever report ok. Map its own states "
        "to a status, as services/planner/src/harness_planner/publish.py does, so that a "
        "process which is alive and not working can say so. If it genuinely has no unwell "
        "state, add it to NO_UNWELL_STATUS with the reason."
    )


def test_every_service_either_heartbeats_or_is_recorded_as_not() -> None:
    """A component that publishes nothing is dark, which is a claim in itself (FR-045)."""
    silent = {service for service in _services() if not _heartbeats(service)}
    assert silent == NO_HEARTBEAT, (
        f"the set of components publishing no heartbeat has changed to {sorted(silent)}; "
        "a component the client can never light is a deliberate decision, not a default"
    )


def test_the_debt_list_names_only_real_services() -> None:
    """A stale name in the list would silently excuse a service that no longer exists."""
    known = set(_services())
    assert known >= NO_UNWELL_STATUS
    assert known >= NO_HEARTBEAT
