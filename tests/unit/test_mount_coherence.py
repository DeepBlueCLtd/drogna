"""What a component names and what the deployment mounts, compared.

This is a ratchet, not a gate. Fourteen container directories are named by component
configurations and mounted by nothing; that is recorded here rather than fixed here,
because choosing where they should live is a decision about the deployment's filesystem
layout and it touches six components. What this file guarantees meanwhile is that the
number cannot grow: a fifteenth fails immediately, with the component and the key named.

Why it matters that this was invisible. An unmounted directory still exists inside a
container — it is created on the container's own writable layer — so a component starts,
writes, reads back what it wrote, and passes every test that exercises it on its own. What
it does not do is share the directory with anything. A producer and a consumer in two
containers each get a private copy of a store they both believe is shared. The system looks
assembled and is not connected, and every check that reads one component at a time agrees
that it is fine.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import mount_lint  # noqa: E402

# The directories known to be named and not mounted, as (config file, key). Each is debt,
# not permission. Removing an entry is the fix; adding one needs an argument.
KNOWN_UNMOUNTED = {
    ("clock.json", "clock_service.manifest.directory"),
    ("env_generator.json", "env_generator.output.directory"),
    ("model_runner.json", "model_runner.ground_truth.directory"),
    ("model_runner.json", "model_runner.staging.directory"),
    ("monitor.json", "monitor.coverage.root_directory"),
    ("offload.json", "offload.source.directory"),
    ("offload.json", "offload.staging.directory"),
    ("offload.json", "offload.release.directory"),
    ("offload.json", "offload.ledger.directory"),
    ("planner.json", "planner.coverage.root_directory"),
    ("planner.json", "planner.environment.directory"),
    ("publisher.json", "publisher.staging.directory"),
    ("sensors.json", "sensors.field.directory"),
    ("telemetry.json", "telemetry.coverage.root_directory"),
}


def _reported(destination: str) -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for line in mount_lint.findings(destination, REPOSITORY_ROOT):
        head, _, _ = line.partition(" is ")
        location, _, key = head.partition(": ")
        found.add((location.split("/", 1)[1], key))
    return found


def test_no_new_unmounted_directory_appears() -> None:
    """A fifteenth is a regression and fails here, named."""
    appeared = sorted(_reported("local") - KNOWN_UNMOUNTED)
    assert not appeared, (
        "container directories named by a component and mounted by nothing, beyond the "
        f"known set: {appeared}. A directory that is not mounted is private to one "
        "container and shared with no other, however well the component works alone."
    )


def test_the_known_set_is_still_accurate() -> None:
    """A fixed one must be removed from the list, so the debt cannot be overstated."""
    fixed = sorted(KNOWN_UNMOUNTED - _reported("local"))
    assert not fixed, (
        f"these are now mounted and must be removed from KNOWN_UNMOUNTED: {fixed}. A list "
        "of known faults that outlives the faults is how a ratchet stops ratcheting."
    )


def test_both_destinations_are_checked_the_same_way() -> None:
    """The droplet is not exempt from a fault the local destination is recorded as having."""
    assert sorted(_reported("droplet")) == sorted(_reported("local")), (
        "the two destinations disagree about which directories are unmounted, which means "
        "one of them has a fault the other does not and nobody decided that"
    )


def test_the_check_can_report_something() -> None:
    """It currently reports fourteen; a check reporting nothing here would be broken."""
    assert len(_reported("local")) == len(KNOWN_UNMOUNTED)


def test_a_url_path_is_not_mistaken_for_a_directory() -> None:
    """The narrowness that keeps this check believable."""
    document = {
        "proxy": {
            "released": {"prefix": "/released"},
            "upstream": {"collection_path": "/query/collections"},
            "logs": {"directory": "/var/log/drogna"},
        }
    }
    named = dict(mount_lint.named_directories(document))
    assert named == {"proxy.logs.directory": "/var/log/drogna"}
