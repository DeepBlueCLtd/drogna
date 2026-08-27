"""Two packaging runs over one recorded run produce the same bytes and the same names.

Constitution II claims byte-identity for a fixed code and library version. This repository
writes the classic NetCDF format directly, so there is no NetCDF library version to pin —
the encoder is a pure function in ``harness_core`` and the version that fixes an export's
bytes is :data:`harness_offload.version.FORMAT_VERSION`. That is what these tests pin, and
they pin it deliberately rather than by omission: a change to the writer's layout must
change the format version, and the assertion below is what says so.

The two runs are two separate packagers over two separate staging areas, so nothing is
shared between them but the recorded run and the code.
"""

from __future__ import annotations

from harness_offload.bundle import bundle_id_for
from harness_offload.version import FORMAT_VERSION
from offload_support import (
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    run_manifest,
    snapshot,
    write_run,
)


def package(tmp_path, name: str):
    """Package the same recorded run into a staging area of its own."""
    root = tmp_path / name
    write_run(root / "run")
    document = configuration(root)
    packager = packager_for(
        root, destination=StubDestination(), clock=manual_clock(), document=document
    )
    report = packager.cycle()
    return packager, report


def test_two_packaging_runs_produce_byte_identical_bundles(tmp_path) -> None:
    first, first_report = package(tmp_path, "first")
    second, second_report = package(tmp_path, "second")

    assert first_report.staged == second_report.staged
    assert snapshot(first.settings.staging.directory) == snapshot(second.settings.staging.directory)


def test_two_packaging_runs_name_the_same_bundles(tmp_path) -> None:
    """Identity from the run and the window, so a replay is comparable bundle for bundle."""
    first, _ = package(tmp_path, "first")
    second, _ = package(tmp_path, "second")

    assert first.ledger.bundles() == second.ledger.bundles()
    assert list(first.ledger.bundles()) == [
        bundle_id_for(run_manifest(), index) for index in (0, 1)
    ]


def test_the_sidecar_is_byte_identical_too(tmp_path) -> None:
    """The sidecar carries the digests; if it varied the identity claim would be hollow."""
    first, report = package(tmp_path, "first")
    second, _ = package(tmp_path, "second")

    for bundle_id in report.staged:
        assert (
            first.settings.staging.sidecar_path(bundle_id).read_bytes()
            == second.settings.staging.sidecar_path(bundle_id).read_bytes()
        )


def test_the_bundles_declare_the_format_version_the_identity_claim_names(tmp_path) -> None:
    """Byte-identity is claimed for a fixed code and format version. This is the version."""
    import json

    packager, report = package(tmp_path, "only")

    for bundle_id in report.staged:
        sidecar = json.loads(
            packager.settings.staging.sidecar_path(bundle_id).read_text(encoding="utf-8")
        )
        assert sidecar["format_version"] == FORMAT_VERSION
        payload = packager.settings.staging.bundle_path(bundle_id).read_bytes()
        assert FORMAT_VERSION.encode() in payload


def test_a_replay_of_a_bundle_the_ledger_already_holds_is_not_a_duplicate_fault(
    tmp_path,
) -> None:
    """The same seed names the same bundle. It is the same logical bundle, and it is left."""
    root = tmp_path / "replay"
    write_run(root / "run")
    document = configuration(root)
    destination = StubDestination()
    packager = packager_for(root, destination=destination, clock=manual_clock(), document=document)

    first = packager.cycle()
    before = snapshot(packager.settings.staging.directory)
    second = packager.cycle()

    assert first.staged
    assert second.staged == []
    assert second.failures == []
    assert snapshot(packager.settings.staging.directory) == before
