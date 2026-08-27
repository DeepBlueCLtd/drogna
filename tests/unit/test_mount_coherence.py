"""What a component names and what the deployment mounts, compared.

This was a ratchet and is now a gate. Fourteen container directories were named by
component configurations and mounted by nothing; the list below recorded them so the number
could not grow while somebody decided where they should live. That decision has been taken —
one named volume per store, mounted at the container path ``deployment.container_paths``
declares for it — so the list is empty and ``deploy/lib/mount_lint.py`` is registered in
``scripts/gates.registry``. An empty list is the point: the ratchet stops being a ratchet
when it reaches zero, and what is left is a check that fails on the first regression.

Why it mattered that this was invisible. An unmounted directory still exists inside a
container — it is created on the container's own writable layer — so a component starts,
writes, reads back what it wrote, and passes every test that exercises it on its own. What
it does not do is share the directory with anything. A producer and a consumer in two
containers each get a private copy of a store they both believe is shared. The system looks
assembled and is not connected, and every check that reads one component at a time agrees
that it is fine.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import mount_lint  # noqa: E402

# The directories known to be named and not mounted, as (config file, key). Each was debt,
# not permission; the debt is paid and adding an entry back needs an argument, because a
# directory that is not mounted is private to one container and shared with no other.
KNOWN_UNMOUNTED: set[tuple[str, str]] = set()

DESTINATIONS = ("local", "droplet")


def _reported(destination: str) -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for line in mount_lint.findings(destination, REPOSITORY_ROOT):
        head, _, _ = line.partition(" is ")
        location, _, key = head.partition(": ")
        found.add((location.split("/", 1)[1], key))
    return found


def test_every_named_directory_is_mounted() -> None:
    """The gate. Any container directory under no declared path fails here, named."""
    for destination in DESTINATIONS:
        appeared = sorted(_reported(destination) - KNOWN_UNMOUNTED)
        assert not appeared, (
            f"container directories {destination} names and mounts by nothing: {appeared}. "
            "A directory that is not mounted is private to one container and shared with "
            "no other, however well the component works alone."
        )


def test_the_known_set_is_still_accurate() -> None:
    """A fixed one must be removed from the list, so the debt cannot be overstated."""
    fixed = sorted(KNOWN_UNMOUNTED - _reported("local"))
    assert not fixed, (
        f"these are now mounted and must be removed from KNOWN_UNMOUNTED: {fixed}. A list "
        "of known faults that outlives the faults is how a ratchet stops ratcheting."
    )


def test_both_destinations_are_checked_the_same_way() -> None:
    """Neither destination is exempt from a fault the other is recorded as having."""
    assert sorted(_reported("droplet")) == sorted(_reported("local")), (
        "the two destinations disagree about which directories are unmounted, which means "
        "one of them has a fault the other does not and nobody decided that"
    )


def test_the_check_can_report_something(tmp_path: Path) -> None:
    """It reports nothing here now, so it is shown something it must report.

    This replaces an assertion that the check found fourteen. That assertion was worth
    having while there were fourteen and worth nothing the moment there were none: with an
    empty tree and an empty list it would have passed whatever the check did, including
    nothing at all. So the capability is demonstrated against a destination built for the
    purpose, whose one component names a directory the deployment does not declare.
    """
    directory = tmp_path / "config" / "elsewhere"
    directory.mkdir(parents=True)
    (directory / "deployment.json").write_text(
        json.dumps({"container_paths": {"coverage_root": "/var/lib/drogna/coverage"}}),
        encoding="utf-8",
    )
    (directory / "widget.json").write_text(
        json.dumps({"widget": {"output": {"directory": "/var/lib/drogna/nowhere"}}}),
        encoding="utf-8",
    )

    reported = mount_lint.findings("elsewhere", tmp_path)

    assert len(reported) == 1
    assert "widget.output.directory" in reported[0]
    assert "/var/lib/drogna/nowhere" in reported[0]


def test_a_directory_under_a_declared_path_is_not_reported(tmp_path: Path) -> None:
    """The other half: a check that reported everything would be turned off within a week."""
    directory = tmp_path / "config" / "elsewhere"
    directory.mkdir(parents=True)
    (directory / "deployment.json").write_text(
        json.dumps({"container_paths": {"coverage_root": "/var/lib/drogna/coverage"}}),
        encoding="utf-8",
    )
    (directory / "widget.json").write_text(
        json.dumps({"widget": {"staging": {"directory": "/var/lib/drogna/coverage/staging"}}}),
        encoding="utf-8",
    )

    assert mount_lint.findings("elsewhere", tmp_path) == []


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
