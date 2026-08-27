"""The bring-up's failure message, tested against the failure that made it necessary.

`report_unhealthy` runs at the one moment nobody can afford it to be wrong: the stack did
not come up, and this is what the operator reads. On 27 August 2026 it printed three lines,
all of them false, immediately below the Compose output that contradicted them:

      broker: no container was created
      proxy: no container was created
      query: no container was created

Every container named there had been created and started, and `container drogna-proxy-1
exited (1)` was four lines above. The reporter had two faults and each alone was enough:
`compose ps` was called without `--all`, so an exited container is simply absent from the
listing; and the shell case that classified what came back matched `*healthy*`, which
matches `unhealthy`, so a failing health check was read as a passing one.

The half that needs a container runtime is producing this input. The half that decides what
it means does not, and this is that half — so the classification is exercised here, on a
machine with no daemon, rather than skipping until CI and being wrong in front of a person.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import service_states  # noqa: E402


def _record(service: str, state: str, health: str = "", exit_code: int = 0) -> dict:
    """One `docker compose ps --format json` record, with the keys Compose emits."""
    return {
        "Name": f"drogna-{service}-1",
        "Service": service,
        "State": state,
        "Health": health,
        "ExitCode": exit_code,
    }


def test_a_healthy_service_is_not_reported() -> None:
    records = [_record("clock", "running", "healthy")]
    assert service_states.describe("clock", records) is None


def test_a_service_with_no_health_check_is_judged_on_running_alone() -> None:
    """Compose reports an empty health for a container that declares no check."""
    records = [_record("broker", "running", "")]
    assert service_states.describe("broker", records) is None


def test_an_unhealthy_service_is_reported_rather_than_matching_healthy() -> None:
    """The substring that swallowed the commonest failure there is.

    `*healthy*` matches `unhealthy`, so the branch meant to report a failing health check
    was the branch that hid it. This is the assertion that fails if anyone reaches for a
    substring test again.
    """
    records = [_record("query", "running", "unhealthy")]

    problem = service_states.describe("query", records)

    assert problem is not None, (
        "an unhealthy container must be reported; matching it as healthy is what left the "
        "operator with three false lines and no failing service named"
    )
    assert "health check" in problem


def test_an_exited_container_is_reported_with_its_status() -> None:
    """The proxy's actual state on the run that prompted this: exited (1)."""
    records = [_record("proxy", "exited", "", exit_code=1)]

    problem = service_states.describe("proxy", records)

    assert problem is not None
    assert "1" in problem, f"the exit status is the diagnostic; got {problem!r}"
    assert "no container was created" not in problem


def test_a_container_that_never_existed_is_still_reported_as_such() -> None:
    """The one thing the old reporter could say, which must go on being sayable."""
    assert service_states.describe("edge", []) == "no container was created"


def test_a_container_still_starting_is_not_mistaken_for_one_that_is_up() -> None:
    records = [_record("observations", "running", "starting")]

    problem = service_states.describe("observations", records)

    assert problem is not None
    assert "starting" in problem


def test_a_created_but_never_started_container_is_reported() -> None:
    records = [_record("client", "created", "")]

    problem = service_states.describe("client", records)

    assert problem is not None
    assert "never began running" in problem


# --- the two shapes Compose has emitted -------------------------------------------------


def test_records_parse_from_a_json_array() -> None:
    text = json.dumps([_record("clock", "running", "healthy")])
    assert [r["Service"] for r in service_states.parse_records(text)] == ["clock"]


def test_records_parse_from_one_object_per_line() -> None:
    """Compose v2.21 and later emit JSONL here, and older versions emit an array."""
    text = "\n".join(
        json.dumps(_record(name, "running", "healthy")) for name in ("clock", "broker")
    )
    assert [r["Service"] for r in service_states.parse_records(text)] == ["clock", "broker"]


def test_no_output_at_all_does_not_crash_the_reporter() -> None:
    """`compose ps` failing outright must not cost the message that follows it."""
    assert service_states.parse_records("") == []
    assert service_states.describe("broker", []) == "no container was created"


def test_the_whole_report_names_every_failing_service_and_no_healthy_one(capsys) -> None:
    """End to end, on the exact run that produced the three false lines."""
    records = [
        _record("observations", "running", "healthy"),
        _record("client", "running", "healthy"),
        _record("clock", "running", "healthy"),
        _record("broker", "exited", "", exit_code=1),
        _record("proxy", "exited", "", exit_code=1),
        _record("query", "running", "unhealthy"),
    ]
    monkeyed = json.dumps(records)
    original = sys.stdin
    try:
        import io

        sys.stdin = io.StringIO(monkeyed)
        service_states.main(["broker", "client", "clock", "observations", "proxy", "query"])
    finally:
        sys.stdin = original

    reported = capsys.readouterr().out
    for healthy in ("client", "clock", "observations"):
        assert healthy not in reported, f"{healthy} was healthy and must not be listed"
    for failing in ("broker", "proxy", "query"):
        assert failing in reported, f"{failing} was failing and must be named"
    assert "no container was created" not in reported, (
        "every one of these containers existed; that phrase is what made the old report "
        "impossible to act on"
    )


# --- the names the shell loops over to fetch logs ---------------------------------------


def test_names_only_lists_the_failing_services_and_nothing_else(capsys) -> None:
    """`report_unhealthy` fetches a log tail per failing service, and this is the list.

    The description and the name list must agree: a service named here gets its logs
    printed, and one that is healthy must not, or the report buries its own finding.
    """
    import io

    records = [
        _record("clock", "running", "healthy"),
        _record("broker", "exited", "", exit_code=3),
        _record("query", "running", "unhealthy"),
    ]
    original = sys.stdin
    try:
        sys.stdin = io.StringIO(json.dumps(records))
        service_states.main(["--names-only", "broker", "clock", "query"])
    finally:
        sys.stdin = original

    assert capsys.readouterr().out.split() == ["broker", "query"]
