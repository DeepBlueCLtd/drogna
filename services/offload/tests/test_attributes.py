"""What the exported file says about itself, and the four things it deliberately does not.

FR-42 names provenance metadata in exported files as a leakage path. The four attributes it
leaks through are ``history``, ``source``, ``comment`` and ``institution`` — the four CF
suggests a well-behaved producer should write — so those four are what these tests go
looking for, by name, in a file produced by the real writer.

The allow-list is asserted from both ends. A file is scanned for anything off the list, and
the list is scanned for the four names, so a future contributor who adds ``history`` to
``config/local/offload.json`` fails here rather than shipping a file that says where it was
made.
"""

from __future__ import annotations

import pytest
from harness_core.clock import SimInstant
from harness_monitor.netcdf import read_netcdf
from harness_offload.attributes import NEVER_EMITTED, DisallowedAttributeError, checked
from harness_offload.profiles import profiles_from_observations
from harness_offload.writer import ExportInputs, encode_bundle
from offload_support import (
    DEFAULT_PROFILES,
    EPOCH,
    configuration,
    observations_for,
    write_run,
)

FORBIDDEN_NAMES = ("history", "source", "comment", "institution")


def allowlist(tmp_path) -> tuple[str, ...]:
    return tuple(configuration(tmp_path)["offload"]["attributes"]["allowlist"])


def produced(tmp_path) -> bytes:
    profiles = profiles_from_observations(observations_for(DEFAULT_PROFILES))
    epoch = SimInstant.from_iso(EPOCH)
    return encode_bundle(
        ExportInputs(
            bundle_id="b-0123456789abcdef",
            run_reference="9c1d4e6f8a0b2c3d4e5f60718293a4b5",
            epoch=epoch,
            window_start=epoch,
            window_end=epoch.plus_micros(7200 * 1_000_000),
            profiles=profiles.profiles,
            allowlist=allowlist(tmp_path),
        )
    )


def every_attribute(payload: bytes):
    document = read_netcdf(payload)
    for name, value in document.attributes.items():
        yield "global", name, value
    for variable_name, variable in document.variables.items():
        for name, value in variable.attributes.items():
            yield variable_name, name, value


def test_every_attribute_in_a_produced_bundle_is_on_the_allow_list(tmp_path) -> None:
    permitted = set(allowlist(tmp_path))

    off_list = [
        (where, name)
        for where, name, _ in every_attribute(produced(tmp_path))
        if name not in permitted
    ]

    assert off_list == []


@pytest.mark.parametrize("forbidden", FORBIDDEN_NAMES)
def test_the_four_provenance_attributes_are_absent_from_the_file(tmp_path, forbidden) -> None:
    """FR-42's leakage path, checked by name in the bytes rather than by argument."""
    present = [where for where, name, _ in every_attribute(produced(tmp_path)) if name == forbidden]

    assert present == []


@pytest.mark.parametrize("forbidden", FORBIDDEN_NAMES)
def test_the_four_are_absent_from_the_configured_allow_list_too(tmp_path, forbidden) -> None:
    """Absent from the file because absent from the list, not because nobody wrote one."""
    assert forbidden not in allowlist(tmp_path)


def test_the_reasons_for_the_four_omissions_are_recorded_beside_the_code(tmp_path) -> None:
    """SC-008: a reader can tell from the omission list what is omitted and why."""
    recorded = dict(NEVER_EMITTED)

    assert set(recorded) == set(FORBIDDEN_NAMES)
    assert all(len(reason) > 40 for reason in recorded.values())


def test_no_attribute_value_carries_a_path_a_host_or_an_instrument(tmp_path) -> None:
    """The names are allow-listed; the values still have to be looked at."""
    suspicious = []
    for where, name, value in every_attribute(produced(tmp_path)):
        if not isinstance(value, str):
            continue
        lowered = value.lower()
        for needle in ("://", "/var/", "/home/", "glider-alpha", "ctd-", "foi-", str(tmp_path)):
            if needle.lower() in lowered:
                suspicious.append((where, name, needle))

    assert suspicious == []


def test_the_observation_vocabulary_does_not_reach_the_file(tmp_path) -> None:
    """A thing, a sensor and a datastream go in; none of the three comes out (FR-017)."""
    text = produced(tmp_path).decode("latin-1")

    for identifier in ("glider-alpha", "ctd-temperature", "foi-0001", "obs-000000"):
        assert identifier not in text


def test_the_run_is_carried_as_an_opaque_reference(tmp_path) -> None:
    document = read_netcdf(produced(tmp_path))

    assert document.attributes["run_reference"] == "9c1d4e6f8a0b2c3d4e5f60718293a4b5"
    for name in ("run_id", "root_seed", "run_manifest_digest"):
        assert name not in document.attributes


# ----------------------------------------------------- the allow-list refuses at write time


@pytest.mark.parametrize("forbidden", FORBIDDEN_NAMES)
def test_a_disallowed_attribute_is_refused_before_it_is_written(tmp_path, forbidden) -> None:
    """Refused, not stripped afterwards: a stripping pass has a day it does not run."""
    with pytest.raises(DisallowedAttributeError, match=forbidden):
        checked({forbidden: "anything"}, allowlist=allowlist(tmp_path), where="a test")


def test_the_refusal_says_why_the_attribute_is_never_emitted(tmp_path) -> None:
    with pytest.raises(DisallowedAttributeError, match="command line"):
        checked({"history": "x"}, allowlist=allowlist(tmp_path), where="a test")


@pytest.mark.parametrize(
    "value",
    [
        "written by http://packager.internal:8110/run",
        "/var/lib/drogna/offload/staging/b-1.nc",
        "~/runs/latest",
        "operator: someone",
        "sensor_id ctd-temperature",
        "192.168.1.10",
    ],
)
def test_an_allow_listed_attribute_carrying_a_location_is_refused(tmp_path, value) -> None:
    """``title`` is a string like any other, so the values are scanned as well as the names."""
    with pytest.raises(DisallowedAttributeError):
        checked({"title": value}, allowlist=allowlist(tmp_path), where="a test")


def test_an_allow_list_that_permits_nothing_produces_no_bundle(tmp_path) -> None:
    """An empty allow-list is coherent configuration: it refuses the first attribute."""
    profiles = profiles_from_observations(observations_for(DEFAULT_PROFILES))
    epoch = SimInstant.from_iso(EPOCH)

    with pytest.raises(DisallowedAttributeError):
        encode_bundle(
            ExportInputs(
                bundle_id="b-0123456789abcdef",
                run_reference="0" * 32,
                epoch=epoch,
                window_start=epoch,
                window_end=epoch.plus_micros(3600 * 1_000_000),
                profiles=profiles.profiles,
                allowlist=(),
            )
        )


# ------------------------------------------------------------------- the staging area


def test_the_staging_area_is_not_reachable_through_the_released_prefix(tmp_path) -> None:
    """FR-018, at both destinations, from the destination files themselves."""
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    for destination in ("local", "droplet"):
        document = json.loads(
            (root / "config" / destination / "offload.json").read_text(encoding="utf-8")
        )["offload"]
        staging = Path(document["staging"]["directory"]).parts
        released = Path(document["release"]["directory"]).parts

        assert staging[: len(released)] != released, destination
        assert released[: len(staging)] != staging, destination


def test_a_configuration_putting_staging_inside_the_released_area_refuses_to_start(
    tmp_path,
) -> None:
    """It would be public the instant a bundle was written, and nothing would notice."""
    import json

    from harness_core.config import ConfigInvalidError
    from harness_offload.config import load

    write_run(tmp_path / "run")
    document = configuration(tmp_path)
    document["offload"]["staging"]["directory"] = str(tmp_path / "released" / "staging")
    path = tmp_path / "offload.json"
    path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ConfigInvalidError, match="released"):
        load(env={"HARNESS_CONFIG": str(path)})
