"""Both bespoke providers refuse to serve against a pygeoapi they have not been tested with.

This feature carries two provider plugins written against pygeoapi's provider base classes:
two compatibility surfaces against one third-party interface, with no compatibility promise
behind either. They share one pin so they cannot drift apart, and both check it before they
serve anything (FR-031, SC-016).

The consequence of not checking is not a crash. It is a collection that advertises the wrong
query types, or a provider handed a ``query_args`` dict whose keys have moved — both of which
produce a running service that answers wrongly.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from plugins import edr_coverage, sensorthings_provider  # noqa: E402
from plugins.edr_composer import DrognaComposerEDRProvider  # noqa: E402
from plugins.edr_trajectory import DrognaTrajectoryEDRProvider  # noqa: E402
from plugins.pygeoapi_version import (  # noqa: E402
    PINNED_PYGEOAPI_VERSION,
    PygeoapiVersionError,
    check_pygeoapi_version,
    installed_pygeoapi_version,
)

REQUIREMENTS = REPO_ROOT / "deploy" / "images" / "query-layer.requirements.txt"


def test_the_pin_is_one_value_and_it_is_the_one_the_image_installs() -> None:
    """One pin, in one place, agreeing with the artefact. Two would drift."""
    text = REQUIREMENTS.read_text(encoding="utf-8")
    match = re.search(r"^pygeoapi==(?P<version>\S+)\s*$", text, re.MULTILINE)
    assert match is not None, f"{REQUIREMENTS.name} does not pin pygeoapi to an exact version"
    assert match.group("version") == PINNED_PYGEOAPI_VERSION


@pytest.mark.parametrize("found", ["0.19.0", "0.21.0", "0.25.dev0", "not installed", "unknown"])
def test_any_version_other_than_the_pin_is_refused_naming_both(found: str) -> None:
    with pytest.raises(PygeoapiVersionError) as refusal:
        check_pygeoapi_version(found)
    message = str(refusal.value)
    assert found in message
    assert PINNED_PYGEOAPI_VERSION in message


def test_the_pin_itself_is_accepted() -> None:
    check_pygeoapi_version(PINNED_PYGEOAPI_VERSION)


@pytest.mark.parametrize(
    "construct",
    [
        pytest.param(
            lambda: DrognaTrajectoryEDRProvider(
                {"name": "edr", "type": "edr", "data": "store", "options": {}}
            ),
            id="edr-trajectory",
        ),
        pytest.param(
            lambda: sensorthings_provider.DrognaSensorThingsProvider(
                {"name": "sta", "type": "feature", "data": "dsn", "options": {}}
            ),
            id="sensorthings",
        ),
        pytest.param(
            lambda: DrognaComposerEDRProvider(
                {"name": "edr", "type": "edr", "data": "store", "options": {}}
            ),
            id="edr-composer",
        ),
    ],
)
def test_both_providers_refuse_to_start_against_an_untested_version(construct) -> None:
    """The check is in the constructor, so nothing is served before it has been made."""
    if installed_pygeoapi_version() == PINNED_PYGEOAPI_VERSION:
        pytest.skip("the pinned pygeoapi is installed, so there is no untested version to meet")
    with pytest.raises(PygeoapiVersionError) as refusal:
        construct()
    assert PINNED_PYGEOAPI_VERSION in str(refusal.value)


def test_the_trajectory_collection_advertises_position_cube_and_trajectory() -> None:
    """All three query types, asserted through both mechanisms pygeoapi has used.

    Feature 002 measured a pygeoapi line in which ``BaseEDRProvider.__init_subclass__``
    builds the advertised types from the subclass's own ``__dict__``: a plugin that adds only
    ``trajectory`` advertises *only* trajectory, and position and cube vanish from the
    collection in silence. The pinned release instead reads a ``query_types`` list. Getting
    either wrong produces a collection that quietly stops advertising what it can do, so both
    are asserted here.
    """
    own = DrognaTrajectoryEDRProvider.__dict__
    for query_type in ("position", "cube", "trajectory"):
        assert query_type in own, (
            f"{query_type} is not a method of the provider's own class. Under the "
            f"__init_subclass__ mechanism it would stop being advertised, silently."
        )
        assert query_type in DrognaTrajectoryEDRProvider.query_types

    # The list is set on this class rather than appended to the base's shared one, which in
    # the pinned release is a mutable class attribute every provider in the process shares.
    base = edr_coverage.DrognaCoverageEDRProvider
    assert "query_types" in DrognaTrajectoryEDRProvider.__dict__
    assert "trajectory" not in base.query_types


def test_the_composer_collection_advertises_all_eight_query_types() -> None:
    """Feature 023's widening, held to the same two mechanisms as the trajectory provider.

    The advertised set is what the emitted OpenAPI document and the composer's offer are
    built from, so a type missing from either mechanism is a capability that silently
    stops being claimed — or worse, one claimed and not served (FR-78: the advertised
    types, the document and the served account widen together).
    """
    own = DrognaComposerEDRProvider.__dict__
    expected = (
        "position",
        "radius",
        "area",
        "cube",
        "trajectory",
        "corridor",
        "locations",
        "instances",
    )
    for query_type in expected:
        assert query_type in own, (
            f"{query_type} is not a method of the composer provider's own class. Under "
            f"the __init_subclass__ mechanism it would stop being advertised, silently."
        )
        assert query_type in DrognaComposerEDRProvider.query_types

    assert "query_types" in DrognaComposerEDRProvider.__dict__
    assert list(DrognaComposerEDRProvider.query_types) == list(expected)
    # The widening is additive: the providers beneath keep their own narrower lists, so
    # nothing this class does reaches back into what 008 advertises.
    assert "radius" not in DrognaTrajectoryEDRProvider.query_types
    assert "radius" not in edr_coverage.DrognaCoverageEDRProvider.query_types
