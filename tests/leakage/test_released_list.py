"""What is not released, asserted rather than read off the list and taken on trust (FR-010).

Point observations, measurement locations and planned routes must not be reachable through
the released prefix. The list in ``config/<destination>/proxy.json`` is what makes that true
and it is also what would make it false, so it is checked here against the entity sets and
collections the rest of the harness actually serves — not against a second list written
beside it, which would agree with the first for exactly as long as somebody remembered to
change both.

The upgrade location ADR-0008 added is the other half of this. Path policy at the proxy is
evaluated once, at the upgrade, and the connection then persists carrying traffic the proxy
does not inspect per message, so what a subscriber may receive is settled by the broker's
access control lists. Those are tested at a running broker in
``tests/integration/test_topic_isolation.py``. What is asserted here is the thing that can
be asserted from this side: that the browser identity is granted no rule reaching the
observation branch, where measurement locations travel.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from settings import destination_names, release_policy

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BROKER_ACL = REPOSITORY_ROOT / "deploy" / "broker" / "acl"

sys.path.insert(0, str(REPOSITORY_ROOT / "query"))

from plugins.sensorthings_entities import ENTITY_SETS  # noqa: E402

DESTINATIONS = destination_names()

# What the planner emits. Its route recommendation is a decision about where to sample next,
# which is to say it is a forecast of the measurement geometry, and it is withheld for the
# same reason the geometry itself is.
PLANNER_OUTPUTS = ("plan", "plans", "route", "routes", "waypoints", "recommendations")

# The observation branch as it appears in the query layer, in every spelling somebody might
# reasonably add to a release list.
OBSERVATION_COLLECTIONS = ("observations", "observation", "measurements", "sensors", "things")


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_no_sensorthings_entity_set_is_released(destination: str) -> None:
    """Read from the entity sets the query layer serves, so a new one arrives here as a failure."""
    released = {name.lower() for name in release_policy(destination)["released"]["collections"]}

    overlap = released & {name.lower() for name in ENTITY_SETS}

    assert not overlap, (
        f"{destination}/proxy.json releases {sorted(overlap)}, which are SensorThings entity "
        "sets over the observation store. Point observations and the places they were taken "
        "are what FR-42 withholds."
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_no_observation_or_route_collection_is_released(destination: str) -> None:
    released = {name.lower() for name in release_policy(destination)["released"]["collections"]}

    for withheld in (*OBSERVATION_COLLECTIONS, *PLANNER_OUTPUTS):
        assert withheld not in released, f"{destination}/proxy.json releases {withheld!r}"
        assert not [name for name in released if name.endswith(f"-{withheld}")], (
            f"{destination}/proxy.json releases something ending in {withheld!r}"
        )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_no_age_driven_variable_is_on_the_released_variable_list(destination: str) -> None:
    """A field driven by observation age is a map of measurement locations (FR-014)."""
    variables = {name.lower() for name in release_policy(destination)["released"]["variables"]}

    for driven in ("observation_age", "age", "time_since_observation", "data_age", "staleness"):
        assert driven not in variables, f"{destination}/proxy.json releases {driven!r}"


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_upgrade_prefix_is_not_beneath_the_released_prefix(destination: str) -> None:
    """Two exposure surfaces, held apart so that neither can widen the other (ADR-0008)."""
    policy = release_policy(destination)
    released = policy["released"]["prefix"]
    upgrade = policy["control"]["upgrade_prefix"]

    assert upgrade != released
    assert not upgrade.startswith(f"{released}/")
    assert not released.startswith(f"{upgrade}/")


def test_the_browser_identity_is_granted_nothing_on_the_observation_branch() -> None:
    """ADR-0008: subscribe-only on the control namespace, and no rule reaching obs/.

    The proxy cannot constrain this. Policy on an upgrade location is evaluated once and the
    connection then persists carrying traffic nothing inspects per message, so a viewer that
    could subscribe to ``obs/#`` would be reading the write path over a connection the
    boundary has no further say in. Feature 007 owns the file; this is the assertion feature
    013 owes it, because the upgrade location is what makes the file load-bearing.
    """
    blocks: dict[str, list[str]] = {}
    current = ""
    for line in BROKER_ACL.read_text(encoding="utf-8").splitlines():
        stripped = line.split("#", 1)[0].strip()
        if stripped.startswith("user "):
            current = stripped.removeprefix("user ").strip()
            blocks[current] = []
        elif stripped.startswith("topic ") and current:
            blocks[current].append(stripped)

    assert "drogna_viewer" in blocks, "the browser identity ADR-0008 requires is not in the ACL"
    rules = blocks["drogna_viewer"]

    assert rules, "a role with no rule can do nothing, which is safe but is not what 007 wrote"
    assert not [rule for rule in rules if "obs/" in rule], (
        f"the browser identity is granted {rules} — observation traffic is not proxied to the "
        "browser, and the client reads observations through the query layer (FR-19)"
    )
    assert not [rule for rule in rules if " write " in f" {rule} " or "readwrite" in rule], (
        f"the browser identity is granted {rules} — it must be incapable of publishing anywhere"
    )
