"""The telemetry contract accepts what it should and — the harder half — refuses what it should.

``contracts/schemas/telemetry.schema.json`` is one document discriminated by ``kind``, and
this feature owns it even though features 007, 009 and 013 publish against it first. That
inversion of the repository's usual ownership rule is recorded in the specification; this is
the test that keeps the document honest about it, by exercising every kind that travels on
the branch rather than only the two this component publishes.

The refusals matter more than the acceptances. In particular a ``forecast-skill`` payload
carrying a score without both mean-square errors and a sample count must be rejected: that
is Constitution IX expressed in the contract rather than left to whoever writes the producer,
and it is the reason the payload is split into a scored branch and an unscored one.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness_core.config import ConfigError, validate_document
from harness_types.messages.telemetry import DrognaTelemetry
from pydantic import ValidationError

SCHEMAS = Path(__file__).resolve().parents[2] / "contracts" / "schemas"
MASTER = json.loads((SCHEMAS / "telemetry.schema.json").read_text(encoding="utf-8"))
# Every component-owned telemetry master the union references by $id. A master joins the
# oneOf by reference and stays its own document, so the registry this test validates
# against has to hold each one; a missing entry makes the whole union unresolvable rather
# than making one branch fail, which is why they are listed rather than assumed.
REFERENCED = [
    json.loads((SCHEMAS / name).read_text(encoding="utf-8"))
    for name in ("ingest-telemetry.schema.json", "offload-telemetry.schema.json")
]

EXAMPLES: list[dict[str, Any]] = MASTER["examples"]
KINDS = sorted({example["kind"] for example in EXAMPLES if "kind" in example})


def check(message: dict[str, Any]) -> None:
    validate_document(message, MASTER, source="ctl/telemetry", referenced_schemas=REFERENCED)


def example_of(kind: str) -> dict[str, Any]:
    return json.loads(json.dumps(next(one for one in EXAMPLES if one.get("kind") == kind)))


def test_every_kind_the_contract_declares_carries_a_canonical_example() -> None:
    declared = {
        MASTER["$defs"][name]["properties"]["kind"]["const"]
        for name in MASTER["$defs"]
        if "properties" in MASTER["$defs"][name]
        and "kind" in MASTER["$defs"][name]["properties"]
        and "const" in MASTER["$defs"][name]["properties"]["kind"]
    }

    assert declared == set(KINDS), "a kind without an example is a kind nobody exercised"


@pytest.mark.parametrize("kind", KINDS)
def test_each_canonical_example_is_accepted_by_schema_and_model(kind: str) -> None:
    message = example_of(kind)

    check(message)
    DrognaTelemetry.model_validate(message)


@pytest.mark.parametrize("kind", KINDS)
def test_removing_any_required_field_is_refused(kind: str) -> None:
    message = example_of(kind)
    for field in list(message):
        without = {name: value for name, value in message.items() if name != field}
        with pytest.raises(ConfigError):
            check(without)
        with pytest.raises(ValidationError):
            DrognaTelemetry.model_validate(without)


@pytest.mark.parametrize("kind", KINDS)
def test_an_unknown_field_is_refused(kind: str) -> None:
    message = example_of(kind)
    message["smoothed"] = True

    with pytest.raises(ConfigError):
        check(message)


def test_a_score_without_both_errors_and_a_count_is_refused() -> None:
    """Constitution IX in the contract: a figure nobody can recompute is not publishable."""
    message = example_of("forecast-skill")
    assert message["skill_score"] is not None
    message["persistence_mean_square_error"] = None

    with pytest.raises(ConfigError):
        check(message)

    with pytest.raises(ValidationError):
        DrognaTelemetry.model_validate(message)


def test_an_unscored_state_carrying_a_score_is_refused() -> None:
    message = example_of("forecast-skill")
    message["state"] = "insufficient-samples"

    with pytest.raises(ConfigError):
        check(message)


def test_a_scored_state_carrying_no_score_is_refused() -> None:
    message = next(
        one
        for one in EXAMPLES
        if one.get("kind") == "forecast-skill" and one.get("skill_score") is None
    )
    message = json.loads(json.dumps(message))
    message["state"] = "beating-persistence"

    with pytest.raises(ConfigError):
        check(message)


def test_the_formula_is_carried_in_the_message_and_is_not_free_text() -> None:
    formula = MASTER["$defs"]["forecast_skill"]["properties"]["formula"]

    assert formula["const"] == "1 - model_mean_square_error / persistence_mean_square_error"


def test_the_ingest_client_report_is_admitted_by_reference_rather_than_rewritten() -> None:
    """A shape already in use is referenced, not restated with a discriminator bolted on."""
    references = {branch.get("$ref") for branch in MASTER["oneOf"]}

    assert "https://schemas.harness.invalid/ingest-telemetry.schema.json" in references
