"""The plan contract accepts what a recommendation is and refuses what it is not.

The contract test for `contracts/schemas/plan.schema.json`. It runs the same validator every
component uses, over the master itself rather than over a copy, so a change to the document
is felt here before it is felt by a consumer.

The refusals matter more than the acceptance. A route vertex missing its arrival time is
still a plausible-looking message, and a consumer would render it as a line on a chart rather
than a curve through the forecast volume — which is the difference FR-010 exists to insist on.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness_core.config import ConfigInvalidError, validate_document

REPO_ROOT = Path(__file__).resolve().parents[2]
MASTER = REPO_ROOT / "contracts" / "schemas" / "plan.schema.json"


def schema() -> dict[str, Any]:
    return json.loads(MASTER.read_text(encoding="utf-8"))


def canonical() -> dict[str, Any]:
    """The example the master carries. It is the document's own claim about itself."""
    return json.loads(json.dumps(schema()["examples"][0]))


def validate(document: Any) -> None:
    validate_document(document, schema(), source="ctl/plan")


def test_the_canonical_example_is_accepted() -> None:
    validate(canonical())


@pytest.mark.parametrize("field", sorted(schema()["required"]))
def test_a_payload_missing_a_required_field_is_refused(field: str) -> None:
    payload = {key: value for key, value in canonical().items() if key != field}

    with pytest.raises(ConfigInvalidError):
        validate(payload)


@pytest.mark.parametrize("field", ["h3_index", "depth_band", "arrival_sim_time"])
def test_a_route_vertex_without_its_four_dimensions_is_refused(field: str) -> None:
    """FR-010: a vertex missing any of these is a point on a chart, not a stop on a curve."""
    payload = canonical()
    payload["route"]["vertices"][0] = {
        key: value for key, value in payload["route"]["vertices"][0].items() if key != field
    }

    with pytest.raises(ConfigInvalidError):
        validate(payload)


def test_an_unknown_property_anywhere_is_refused() -> None:
    """Closed at every level, so a typo is a rejection rather than a silent omission."""
    payload = canonical()
    payload["route"]["vertices"][0]["priority"] = 1

    with pytest.raises(ConfigInvalidError):
        validate(payload)

    payload = canonical()
    payload["addressee"] = "the watch officer"

    with pytest.raises(ConfigInvalidError):
        validate(payload)


def test_an_empty_route_with_its_reason_is_accepted() -> None:
    payload = canonical()
    payload["state"] = "nothing-worth-sampling"
    payload["empty_reason"] = "nothing-worth-sampling"
    payload["route"]["vertices"] = []
    payload["route"]["value"] = 0.0
    payload["route"]["value_without_collapse"] = 0.0
    payload["route"]["consumed_seconds"] = 0.0
    payload["route"]["distance_m"] = 0.0
    payload["selection"]["visited_cell_count"] = 0

    validate(payload)


def test_a_region_may_state_that_it_never_lapses() -> None:
    """FR-020: the no-crossing state is representable, so omission is never necessary."""
    payload = canonical()
    payload["projection"]["regions"][0]["state"] = "no-crossing-within-horizon"
    payload["projection"]["regions"][0]["crossing_sim_time"] = None

    validate(payload)


def test_a_first_recommendation_supersedes_nothing_and_says_so() -> None:
    payload = canonical()
    payload["supersedes"] = None

    validate(payload)


def test_a_simulation_instant_shaped_like_a_host_clock_reading_is_refused() -> None:
    """Constitution I: the format itself refuses to admit a value from anywhere else."""
    payload = canonical()
    payload["sim_time"] = "2026-09-01T04:00:00Z"

    with pytest.raises(ConfigInvalidError):
        validate(payload)

    payload = canonical()
    payload["sim_time"] = "2026-09-01T04:00:00.000000+01:00"

    with pytest.raises(ConfigInvalidError):
        validate(payload)


def test_a_plan_identifier_drawn_from_entropy_would_not_match_the_pattern() -> None:
    """FR-027: identifiers are hex derived from the seed, so a uuid is refused by shape."""
    payload = canonical()
    payload["plan_id"] = "3f2a91c4-0e7b-4d68-9a1c-7f04d2b3e558"

    with pytest.raises(ConfigInvalidError):
        validate(payload)


def test_a_negative_value_is_refused_because_sampling_never_costs_information() -> None:
    payload = canonical()
    payload["route"]["value"] = -1.0

    with pytest.raises(ConfigInvalidError):
        validate(payload)


def test_the_two_scoreable_spread_variables_are_the_only_ones() -> None:
    payload = canonical()
    payload["uncertainty_field"]["variable"] = "temperature"

    with pytest.raises(ConfigInvalidError):
        validate(payload)


def test_the_kind_has_exactly_one_value_and_it_is_a_recommendation() -> None:
    """There is deliberately no second value: this component publishes one kind of message."""
    payload = canonical()
    payload["kind"] = "sampling-order"

    with pytest.raises(ConfigInvalidError):
        validate(payload)
