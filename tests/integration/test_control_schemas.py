"""The four control-namespace masters accept what they should and refuse what they should not.

Constitution III makes these documents the single definition of four message shapes, and
FR-029 puts them here rather than in any component. A schema that accepts anything is not a
contract, so each is tested twice: a canonical example validates, and a payload missing each
required field in turn is refused by name.

The canonical examples are the ones the services actually publish, built through the
generated models, so an example that drifted from the master would fail to construct before
it failed to validate.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from control_loop import SCHEMA_DIRECTORY, divergence_payload
from harness_core.config import ConfigInvalidError, validate_document

MASTERS = ("divergence", "run-request", "run-started", "run-published")


def master(name: str) -> dict[str, Any]:
    return json.loads((SCHEMA_DIRECTORY / f"{name}.schema.json").read_text(encoding="utf-8"))


def referenced() -> list[dict[str, Any]]:
    return [master(name) for name in MASTERS]


def example(name: str) -> dict[str, Any]:
    divergence = divergence_payload()
    if name == "divergence":
        return divergence
    if name == "run-request":
        return {
            "component": "scheduler",
            "scenario_run_id": "scenario-009",
            "sim_time": "2026-08-26T00:10:00.000000Z",
            "tick": 10,
            "run_id": "run-000003-8f2b1c0d4e5a",
            "run_sequence": 3,
            "initialisation_sim_time": "2026-08-26T00:10:00.000000Z",
            "ensemble_size": 8,
            "region": divergence["region"],
            "divergence": divergence,
        }
    if name == "run-started":
        return {
            "component": "model_runner",
            "scenario_run_id": "scenario-009",
            "sim_time": "2026-08-26T00:10:00.000000Z",
            "tick": 10,
            "run_id": "run-abc",
            "divergence_id": "divergence-1",
            "member_count": 8,
            "kernel": "analytic",
            "initialisation_sim_time": "2026-08-26T00:10:00.000000Z",
        }
    return {
        "component": "publisher",
        "scenario_run_id": "scenario-009",
        "sim_time": "2026-08-26T00:12:00.000000Z",
        "tick": 12,
        "run_id": "run-abc",
        "current": True,
        "valid_time": {
            "start_sim_time": "2026-08-26T00:10:00.000000Z",
            "end_sim_time": "2026-08-26T06:10:00.000000Z",
        },
        "grid_bounds": {
            "minimum_latitude": 48.5,
            "maximum_latitude": 49.5,
            "minimum_longitude": -5.5,
            "maximum_longitude": -4.5,
            "minimum_depth_m": 0.0,
            "maximum_depth_m": 200.0,
        },
        "collections": {"forecast": "forecast"},
        "digests": {"forecast": "sha256:" + "a" * 64, "uncertainty": "sha256:" + "b" * 64},
    }


@pytest.mark.parametrize("name", MASTERS)
def test_the_canonical_example_validates(name: str) -> None:
    validate_document(example(name), master(name), source=name, referenced_schemas=referenced())


@pytest.mark.parametrize("name", MASTERS)
def test_a_payload_missing_any_required_field_is_refused(name: str) -> None:
    document = master(name)
    for required in document["required"]:
        payload = {key: value for key, value in example(name).items() if key != required}
        with pytest.raises(ConfigInvalidError) as raised:
            validate_document(payload, document, source=name, referenced_schemas=referenced())
        assert required in str(raised.value)


@pytest.mark.parametrize("name", MASTERS)
def test_an_unknown_key_is_refused(name: str) -> None:
    """Message schemas forbid unknown properties: a typo is a fault, not a new field."""
    payload = {**example(name), "plausible_looking_extra": 1}

    with pytest.raises(ConfigInvalidError):
        validate_document(payload, master(name), source=name, referenced_schemas=referenced())


def test_a_divergence_may_not_claim_a_single_sample() -> None:
    """The one constraint in these masters that is load-bearing rather than hygienic."""
    payload = divergence_payload()
    payload["residual"] = {**payload["residual"], "sample_count": 1}

    with pytest.raises(ConfigInvalidError):
        validate_document(
            payload, master("divergence"), source="divergence", referenced_schemas=referenced()
        )


def test_every_master_is_committed_where_the_generator_looks_for_it() -> None:
    for name in MASTERS:
        assert (Path(SCHEMA_DIRECTORY) / f"{name}.schema.json").is_file()
