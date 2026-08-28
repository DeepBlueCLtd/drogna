"""The measurement geometry producer, and the run-manifest sibling it writes (014 T047).

The decision under test is recorded in ``specs/014-offload-export/tasks.md``: the
geometry travels *beside* the bundle as its own staged ``run-manifest.json``, named by
the sidecar without membership, and never as a bundle member. So these tests assert
three separable things: the block is built correctly from a window's profiles; the
document refuses everything the master refuses — an empty measurements list first among
them — rather than staging it; and the packager stages the sibling with the sidecar
naming it outside ``members``.
"""

from __future__ import annotations

import hashlib
import json

import pytest
from harness_core.clock import SimInstant
from harness_offload.geometry import (
    EmptyGeometryError,
    measurement_geometry,
    run_manifest_sibling,
)
from harness_offload.profiles import Level, Profile, ProfileSet
from harness_types.messages.run_manifest import DrognaRunManifest
from offload_support import (
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    run_manifest,
    write_run,
)

EPOCH = SimInstant.from_iso("2026-09-01T00:00:00.000000Z")

RADIUS_M = 2000.0
INTERVAL_SECONDS = 3600.0


def profile(offset_seconds: int, latitude: float, longitude: float) -> Profile:
    return Profile(
        when=EPOCH.plus_micros(offset_seconds * 1_000_000),
        latitude=latitude,
        longitude=longitude,
        levels=(Level(0.0, (12.0, 35.0, 0.0)),),
    )


def window(*profiles: Profile) -> ProfileSet:
    return ProfileSet(tuple(profiles))


# --- the block --------------------------------------------------------------------------------


def test_the_block_holds_every_position_and_the_terms_it_is_scored_on() -> None:
    block = measurement_geometry(
        window(profile(0, 50.0, -4.0), profile(1800, 50.1, -4.1)),
        window_start=EPOCH,
        identification_radius_m=RADIUS_M,
        interval_seconds=INTERVAL_SECONDS,
    )

    assert block["identification_radius_m"] == RADIUS_M
    assert block["interval_seconds"] == 3600
    assert block["measurements"] == [
        {"longitude": -4.0, "latitude": 50.0, "simulation_seconds": 0},
        {"longitude": -4.1, "latitude": 50.1, "simulation_seconds": 1800},
    ]


def test_simulation_seconds_count_from_the_window_start_not_the_epoch() -> None:
    """A profile an hour into the run, in the second window, is at second zero of it."""
    start = EPOCH.plus_micros(3_600_000_000)
    block = measurement_geometry(
        window(profile(3600, 50.2, -4.2)),
        window_start=start,
        identification_radius_m=RADIUS_M,
        interval_seconds=INTERVAL_SECONDS,
    )

    assert block["measurements"][0]["simulation_seconds"] == 0


def test_an_empty_window_is_refused_rather_than_serialised() -> None:
    """The master's minItems: 1, enforced before a byte exists to mislead anyone."""
    with pytest.raises(EmptyGeometryError):
        measurement_geometry(
            window(),
            window_start=EPOCH,
            identification_radius_m=RADIUS_M,
            interval_seconds=INTERVAL_SECONDS,
        )


def test_a_fractional_interval_is_refused() -> None:
    with pytest.raises(ValueError, match="whole number"):
        measurement_geometry(
            window(profile(0, 50.0, -4.0)),
            window_start=EPOCH,
            identification_radius_m=RADIUS_M,
            interval_seconds=1800.5,
        )


# --- the sibling ------------------------------------------------------------------------------


def _sibling(*profiles: Profile) -> bytes:
    return run_manifest_sibling(
        run_manifest(),
        window(*profiles),
        window_start=EPOCH,
        identification_radius_m=RADIUS_M,
        interval_seconds=INTERVAL_SECONDS,
    )


def test_the_sibling_is_the_manifest_plus_the_geometry_and_validates() -> None:
    payload = _sibling(profile(0, 50.0, -4.0))

    document = json.loads(payload.decode("utf-8"))
    model = DrognaRunManifest.model_validate(document)

    assert model.measurement_geometry is not None
    assert model.measurement_geometry.identification_radius_m == RADIUS_M
    source = run_manifest()
    assert document["run_id"] == source["run_id"]
    assert document["root_seed"] == source["root_seed"]
    assert document["clock"] == source["clock"]
    assert payload.endswith(b"\n")


def test_a_position_the_master_refuses_is_refused_here() -> None:
    """A latitude of 95 is a pair written the wrong way round, and it goes no further."""
    with pytest.raises(ValueError, match="does not validate"):
        _sibling(profile(0, 95.0, -4.0))


def test_a_source_document_that_is_not_a_manifest_is_refused() -> None:
    with pytest.raises(ValueError, match="does not validate"):
        run_manifest_sibling(
            {"schema_version": 1},
            window(profile(0, 50.0, -4.0)),
            window_start=EPOCH,
            identification_radius_m=RADIUS_M,
            interval_seconds=INTERVAL_SECONDS,
        )


# --- through the packager ---------------------------------------------------------------------


def test_the_packager_stages_the_sibling_and_the_sidecar_names_it_without_membership(
    tmp_path,
) -> None:
    """The whole decision, observed on disk: beside the bundle, named, never a member."""
    write_run(tmp_path / "run")
    document = configuration(tmp_path)
    packager = packager_for(
        tmp_path, destination=StubDestination(), clock=manual_clock(), document=document
    )

    report = packager.cycle()

    assert report.staged
    for bundle_id in report.staged:
        staging = packager.settings.staging
        sidecar = json.loads(staging.sidecar_path(bundle_id).read_text(encoding="utf-8"))
        sibling_path = staging.run_manifest_path(bundle_id)

        named = sidecar["run_manifest"]
        assert named["name"] == sibling_path.name
        assert named["name"] not in {member["name"] for member in sidecar["members"]}

        payload = sibling_path.read_bytes()
        assert named["byte_length"] == len(payload)
        assert named["digest"] == "sha256:" + hashlib.sha256(payload).hexdigest()

        model = DrognaRunManifest.model_validate(json.loads(payload.decode("utf-8")))
        geometry = model.measurement_geometry
        assert geometry is not None
        assert (
            geometry.identification_radius_m
            == (document["offload"]["export"]["identification_radius_m"])
        )
        assert geometry.interval_seconds == 3600
        assert len(geometry.measurements) >= 1


def test_each_sibling_carries_its_own_windows_measurements(tmp_path) -> None:
    """Window 0 has two profiles, window 1 has one, and each sibling says so."""
    write_run(tmp_path / "run")
    packager = packager_for(
        tmp_path,
        destination=StubDestination(),
        clock=manual_clock(),
        document=configuration(tmp_path),
    )

    report = packager.cycle()

    counts = []
    for bundle_id in report.staged:
        payload = packager.settings.staging.run_manifest_path(bundle_id).read_bytes()
        model = DrognaRunManifest.model_validate(json.loads(payload.decode("utf-8")))
        assert model.measurement_geometry is not None
        counts.append(len(model.measurement_geometry.measurements))
    assert counts == [2, 1]
