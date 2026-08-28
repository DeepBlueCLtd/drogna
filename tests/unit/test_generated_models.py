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
from harness_types.config.capture import DrognaVisualCaptureConfiguration
from harness_types.config.client import DrognaBrowserClientRuntimeConfiguration
from harness_types.config.clock import DrognaClockConfiguration
from harness_types.config.common import DrognaCommonConfigurationSections
from harness_types.config.deployment import DestinationDeploymentValues
from harness_types.config.env_generator import DrognaEnvironmentGeneratorConfiguration
from harness_types.config.features import DrognaFeatureStoreProvisioningConfiguration
from harness_types.config.ingest import DrognaIngestClientConfiguration
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.offload import DrognaOffloadPackagerConfiguration
from harness_types.config.planner import DrognaPlannerConfiguration
from harness_types.config.proxy import DrognaReverseProxyConfiguration
from harness_types.config.publisher import DrognaPublisherConfiguration
from harness_types.config.scheduler import DrognaSchedulerConfiguration
from harness_types.config.sensors import DrognaSimulatedSensorsConfiguration
from harness_types.config.telemetry import DrognaTelemetryConfiguration
from harness_types.messages.bundle_manifest import DrognaBundleManifest
from harness_types.messages.clock import DrognaSimulationTimeSample
from harness_types.messages.coverage_run_manifest import DrognaCoverageRunManifest
from harness_types.messages.divergence import DrognaDivergenceEvent
from harness_types.messages.heartbeat import DrognaComponentHeartbeat
from harness_types.messages.ingest_telemetry import DrognaIngestTelemetry
from harness_types.messages.manifest import DrognaGroundTruthManifest
from harness_types.messages.observation import DrognaObservation
from harness_types.messages.offload_receipt import DrognaOffloadReceipt
from harness_types.messages.offload_telemetry import DrognaOffloadTelemetry
from harness_types.messages.plan import DrognaSamplingRecommendation
from harness_types.messages.run_manifest import DrognaRunManifest
from harness_types.messages.run_published import DrognaModelRunPublished
from harness_types.messages.run_request import DrognaModelRunRequest
from harness_types.messages.run_started import DrognaModelRunStarted
from harness_types.messages.telemetry import DrognaTelemetry
from pydantic import BaseModel, ValidationError

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = REPO_ROOT / "contracts" / "schemas"

MODELS: dict[str, type[BaseModel]] = {
    "clock.schema.json": DrognaSimulationTimeSample,
    "heartbeat.schema.json": DrognaComponentHeartbeat,
    "manifest.schema.json": DrognaGroundTruthManifest,
    "run-manifest.schema.json": DrognaRunManifest,
    "coverage-run-manifest.schema.json": DrognaCoverageRunManifest,
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
    "config.planner.schema.json": DrognaPlannerConfiguration,
    "plan.schema.json": DrognaSamplingRecommendation,
    "config.scheduler.schema.json": DrognaSchedulerConfiguration,
    "config.model_runner.schema.json": DrognaModelRunnerConfiguration,
    "config.publisher.schema.json": DrognaPublisherConfiguration,
    "config.proxy.schema.json": DrognaReverseProxyConfiguration,
    "config.telemetry.schema.json": DrognaTelemetryConfiguration,
    "telemetry.schema.json": DrognaTelemetry,
    "observation.schema.json": DrognaObservation,
    "ingest-telemetry.schema.json": DrognaIngestTelemetry,
    "config.sensors.schema.json": DrognaSimulatedSensorsConfiguration,
    "config.ingest.schema.json": DrognaIngestClientConfiguration,
    "config.features.schema.json": DrognaFeatureStoreProvisioningConfiguration,
    "config.offload.schema.json": DrognaOffloadPackagerConfiguration,
    "bundle-manifest.schema.json": DrognaBundleManifest,
    "offload-receipt.schema.json": DrognaOffloadReceipt,
    "offload-telemetry.schema.json": DrognaOffloadTelemetry,
    "config.capture.schema.json": DrognaVisualCaptureConfiguration,
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


# --- the run manifest's measurement geometry (FR-015, FR-42) ---------------------------------
#
# `measurement_geometry` is optional in the master, and a model has to preserve both halves of
# that. C-01 writes the run's own manifest and holds no observations, so a manifest without
# the block is a complete manifest and a model that made it required would refuse every one of
# them. The offload packager writes the copy that travels beside a bundle and does know the
# geometry, so a model that dropped the block's constraints would let a geometry with no
# measurements through — and a geometry with no measurements makes every leakage comparison
# inconclusive, which is the failure `tests/leakage/` is arranged against.

RUN_MANIFEST: dict[str, Any] = {
    "schema_version": 1,
    "run_id": "run-0007",
    "root_seed": 20260826,
    "seed_derivation": {"rule": "harness-rng", "version": 1},
    "clock": {
        "epoch": "2026-01-01T00:00:00.000000Z",
        "tick_interval_us": 1000000,
        "mode": "lockstep",
        "rate": 1.0,
    },
    "code_version": {"revision": "0000000", "dirty": False},
    "participants": [],
    "exit_state": {"state": "completed"},
    "non_reproducible": [],
}

MEASUREMENT_GEOMETRY: dict[str, Any] = {
    "identification_radius_m": 2000.0,
    "interval_seconds": 3600,
    "measurements": [
        {"longitude": -7.95, "latitude": 55.05, "simulation_seconds": 0},
        {"longitude": -7.6, "latitude": 55.22, "simulation_seconds": 3300},
    ],
}


def with_geometry(**changes: Any) -> dict[str, Any]:
    """The manifest the offload packager writes, with one thing about its geometry changed."""
    return {**RUN_MANIFEST, "measurement_geometry": {**MEASUREMENT_GEOMETRY, **changes}}


def test_a_run_manifest_without_a_measurement_geometry_parses() -> None:
    """What C-01 writes. The block is absent, not empty, and the manifest is complete."""
    model = DrognaRunManifest.model_validate(RUN_MANIFEST)

    assert model.measurement_geometry is None


def test_a_run_manifest_with_a_measurement_geometry_parses() -> None:
    """What the offload packager writes beside a bundle."""
    model = DrognaRunManifest.model_validate(with_geometry())

    assert model.measurement_geometry is not None
    assert len(model.measurement_geometry.measurements) == 2
    assert model.measurement_geometry.measurements[0].simulation_seconds == 0


def test_a_measurement_geometry_with_no_measurements_is_refused() -> None:
    """`minItems: 1` in the master. An empty geometry is not a geometry."""
    with pytest.raises(ValidationError):
        DrognaRunManifest.model_validate(with_geometry(measurements=[]))


def test_a_measurement_missing_a_coordinate_is_refused() -> None:
    incomplete = [{"longitude": -7.95, "simulation_seconds": 0}]

    with pytest.raises(ValidationError):
        DrognaRunManifest.model_validate(with_geometry(measurements=incomplete))


def test_a_measurement_with_a_misspelt_key_is_refused() -> None:
    """The closed shape catches the typo. Left open it would score against a coordinate short
    of a geometry and report a clean release."""
    misspelt = [{"longitude": -7.95, "lattitude": 55.05, "simulation_seconds": 0}]

    with pytest.raises(ValidationError):
        DrognaRunManifest.model_validate(with_geometry(measurements=misspelt))


def test_a_longitude_outside_the_signed_range_is_refused() -> None:
    """A longitude written 0-360 is a geometry a third of a turn from the products."""
    elsewhere = [{"longitude": 352.05, "latitude": 55.05, "simulation_seconds": 0}]

    with pytest.raises(ValidationError):
        DrognaRunManifest.model_validate(with_geometry(measurements=elsewhere))


def test_an_identification_radius_of_zero_is_refused() -> None:
    """A radius of nothing buffers to nothing, and a mask recovers nothing from it."""
    with pytest.raises(ValidationError):
        DrognaRunManifest.model_validate(with_geometry(identification_radius_m=0))


def test_the_model_and_the_schema_agree_about_the_measurement_geometry() -> None:
    """The same three payloads through the component validator and through the model."""
    from harness_core.config import ConfigInvalidError, validate_document

    schema = json.loads((SCHEMAS / "run-manifest.schema.json").read_text(encoding="utf-8"))

    for accepted in (RUN_MANIFEST, with_geometry()):
        validate_document(accepted, schema, source="run-manifest")
        DrognaRunManifest.model_validate(accepted)

    refused = with_geometry(measurements=[])
    with pytest.raises(ConfigInvalidError):
        validate_document(refused, schema, source="run-manifest")
    with pytest.raises(ValidationError):
        DrognaRunManifest.model_validate(refused)
