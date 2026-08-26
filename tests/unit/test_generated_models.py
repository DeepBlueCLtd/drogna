"""The generated Python models accept what the schema accepts and refuse what it refuses.

A generated model is only worth having if it agrees with the document it came from. These
tests take payloads through both — the schema, with the same validator every component
uses, and the model — and assert they reach the same verdict. Where a master declares
examples, each one is put through its model as well: an example that does not parse is a
generator defect or a stale example, and either way it is better found here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness_types.config.client import DrognaBrowserClientRuntimeConfiguration
from harness_types.config.clock import DrognaClockConfiguration
from harness_types.config.common import DrognaCommonConfigurationSections
from harness_types.config.deployment import DestinationDeploymentValues
from harness_types.config.env_generator import DrognaEnvironmentGeneratorConfiguration
from harness_types.config.features import DrognaFeatureStoreProvisioningConfiguration
from harness_types.config.ingest import DrognaIngestClientConfiguration
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.publisher import DrognaPublisherConfiguration
from harness_types.config.scheduler import DrognaSchedulerConfiguration
from harness_types.config.sensors import DrognaSimulatedSensorsConfiguration
from harness_types.messages.clock import DrognaSimulationTimeSample
from harness_types.messages.divergence import DrognaDivergenceEvent
from harness_types.messages.heartbeat import DrognaComponentHeartbeat
from harness_types.messages.ingest_telemetry import DrognaIngestTelemetry
from harness_types.messages.manifest import DrognaGroundTruthManifest
from harness_types.messages.observation import DrognaObservation
from harness_types.messages.run_manifest import DrognaRunManifest
from harness_types.messages.run_published import DrognaModelRunPublished
from harness_types.messages.run_request import DrognaModelRunRequest
from harness_types.messages.run_started import DrognaModelRunStarted
from pydantic import BaseModel, ValidationError

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = REPO_ROOT / "contracts" / "schemas"

MODELS: dict[str, type[BaseModel]] = {
    "clock.schema.json": DrognaSimulationTimeSample,
    "heartbeat.schema.json": DrognaComponentHeartbeat,
    "manifest.schema.json": DrognaGroundTruthManifest,
    "run-manifest.schema.json": DrognaRunManifest,
    "config.client.schema.json": DrognaBrowserClientRuntimeConfiguration,
    "config.common.schema.json": DrognaCommonConfigurationSections,
    "config.env_generator.schema.json": DrognaEnvironmentGeneratorConfiguration,
    "config.deployment.schema.json": DestinationDeploymentValues,
    "config.clock.schema.json": DrognaClockConfiguration,
    "divergence.schema.json": DrognaDivergenceEvent,
    "run-request.schema.json": DrognaModelRunRequest,
    "run-started.schema.json": DrognaModelRunStarted,
    "run-published.schema.json": DrognaModelRunPublished,
    "config.monitor.schema.json": DrognaMonitorConfiguration,
    "config.scheduler.schema.json": DrognaSchedulerConfiguration,
    "config.model_runner.schema.json": DrognaModelRunnerConfiguration,
    "config.publisher.schema.json": DrognaPublisherConfiguration,
    "observation.schema.json": DrognaObservation,
    "ingest-telemetry.schema.json": DrognaIngestTelemetry,
    "config.sensors.schema.json": DrognaSimulatedSensorsConfiguration,
    "config.ingest.schema.json": DrognaIngestClientConfiguration,
    "config.features.schema.json": DrognaFeatureStoreProvisioningConfiguration,
}

CLOCK_SAMPLE: dict[str, Any] = {
    "run_id": "run-0001",
    "tick": 12,
    "sim_time": "2026-08-26T00:00:12.000000Z",
    "mode": "lockstep",
    "rate": 1.0,
}

HEARTBEAT: dict[str, Any] = {
    "component": "clock",
    "sim_time": "2026-08-26T00:00:12.000000Z",
    "tick": 12,
    "status": "ok",
    "run_id": "run-0001",
}


def test_every_master_has_a_generated_model() -> None:
    """A master without a model here means the chain grew a shape nobody exercised."""
    masters = {path.name for path in SCHEMAS.glob("*.schema.json")}

    assert masters == set(MODELS), (
        "the masters and the models tested here have diverged; add the new master's model"
    )


@pytest.mark.parametrize("name", sorted(MODELS))
def test_each_declared_example_parses_through_its_model(name: str) -> None:
    document = json.loads((SCHEMAS / name).read_text(encoding="utf-8"))
    for index, example in enumerate(document.get("examples", [])):
        try:
            MODELS[name].model_validate(example)
        except ValidationError as error:
            pytest.fail(f"example {index} of {name} does not parse through its model: {error}")


def test_a_clock_sample_parses_and_round_trips() -> None:
    model = DrognaSimulationTimeSample.model_validate(CLOCK_SAMPLE)

    assert model.model_dump(mode="json") == CLOCK_SAMPLE


def test_a_heartbeat_parses_without_its_optional_declarations() -> None:
    model = DrognaComponentHeartbeat.model_validate(HEARTBEAT)

    assert model.component == "clock"
    assert model.heartbeat_interval_seconds is None


def test_a_payload_with_an_unknown_key_is_refused() -> None:
    """The masters forbid unknown properties, and the model has to agree with them."""
    with pytest.raises(ValidationError):
        DrognaSimulationTimeSample.model_validate({**CLOCK_SAMPLE, "typo": 1})


def test_a_payload_missing_a_required_field_is_refused() -> None:
    payload = {key: value for key, value in CLOCK_SAMPLE.items() if key != "sim_time"}

    with pytest.raises(ValidationError):
        DrognaSimulationTimeSample.model_validate(payload)


def test_a_constraint_from_the_schema_survives_into_the_model() -> None:
    """`rate` has a minimum of zero in the master. A generator that dropped it is broken."""
    with pytest.raises(ValidationError):
        DrognaSimulationTimeSample.model_validate({**CLOCK_SAMPLE, "rate": -1.0})


def test_an_enumeration_from_the_schema_survives_into_the_model() -> None:
    with pytest.raises(ValidationError):
        DrognaSimulationTimeSample.model_validate({**CLOCK_SAMPLE, "mode": "sideways"})


def test_the_model_and_the_schema_agree() -> None:
    """The same payloads through the component validator and through the model."""
    from harness_core.config import ConfigInvalidError, validate_document

    schema = json.loads((SCHEMAS / "clock.schema.json").read_text(encoding="utf-8"))
    validate_document(CLOCK_SAMPLE, schema, source="clock")
    DrognaSimulationTimeSample.model_validate(CLOCK_SAMPLE)

    broken = {**CLOCK_SAMPLE, "tick": -1}
    with pytest.raises(ConfigInvalidError):
        validate_document(broken, schema, source="clock")
    with pytest.raises(ValidationError):
        DrognaSimulationTimeSample.model_validate(broken)


def test_a_shape_shared_by_two_masters_has_one_definition() -> None:
    """NFR-02: the configuration modules import the common sections, never restate them."""
    from harness_types.config import common, deployment, env_generator

    assert (
        env_generator.DrognaEnvironmentGeneratorConfiguration.model_fields["component"].annotation
        is common.Component
    )
    assert (
        deployment.DestinationDeploymentValues.model_fields["component"].annotation
        is common.Component
    )


def test_a_shape_referenced_by_the_openapi_document_has_one_definition() -> None:
    """The HTTP surface speaks the message vocabulary; it does not redeclare it."""
    from harness_types.http import harness

    assert harness.DrognaSimulationTimeSample is DrognaSimulationTimeSample

    generated = REPO_ROOT / "libs" / "harness_types" / "src" / "harness_types"
    declarations = sum(
        text.count("class DrognaSimulationTimeSample(")
        for text in (path.read_text(encoding="utf-8") for path in generated.rglob("*.py"))
    )
    assert declarations == 1, "the clock sample is declared more than once in Python"

    client = REPO_ROOT / "client" / "src" / "generated"
    interfaces = sum(
        text.count("interface DrognaSimulationTimeSample")
        for text in (path.read_text(encoding="utf-8") for path in client.rglob("*.ts"))
    )
    assert interfaces == 1, "the clock sample is declared more than once in TypeScript"
