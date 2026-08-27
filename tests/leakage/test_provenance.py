"""FR-42's first leakage path: what a released file says about how it was made.

The clean bundle must report zero hits and the leaky control must be flagged, on every run.
The second half is the one that matters. A scanner that reports nothing is
indistinguishable from a scanner that is no longer running, and the only way to tell them
apart is to keep a file in front of it that it is supposed to object to.

Four controls for this half of the gate, one per rule that could plausibly stop working:

- ``leaky_bundle`` — a `history` attribute with a command line and input paths, a variable
  comment naming a sensor and a datastream, a global attribute holding a coordinate inside
  the identification radius, and a text member naming a host and a home directory.
- ``unreadable_bundle`` — a member in a format the scan does not understand.
- ``manifest_bundle`` — the run manifest itself, which is the document being withheld.
- an unanticipated attribute with an entirely harmless value, constructed here, because the
  rule is an allow-list and not a search for known-bad strings.
"""

from __future__ import annotations

import json
from array import array
from pathlib import Path

import pytest
from harness_core.netcdf import NC_DOUBLE, NetcdfVariable, encode_netcdf
from scanner import load_rules, scan_bundle
from settings import load_settings
from updated_region import load_geometry

FIXTURES = Path(__file__).resolve().parent / "fixtures"

SETTINGS = load_settings()
GEOMETRY = load_geometry(FIXTURES / "mitigated_pair" / "run-manifest.json")


def scan(bundle: Path, *, variables: tuple[str, ...] | None = None):
    return scan_bundle(
        bundle,
        released_variables=variables if variables is not None else SETTINGS.released_variables,
        geometry=GEOMETRY,
        radius_m=SETTINGS.identification_radius_m,
    )


def rules_of(finding_set) -> set[str]:
    return {finding.rule for finding in finding_set.findings}


# --- the clean bundle ---------------------------------------------------------------------


def test_a_clean_bundle_reports_no_hit() -> None:
    result = scan(FIXTURES / "clean_bundle")

    assert result.clean, result.summary()


def test_a_clean_bundle_was_actually_read() -> None:
    """Zero hits over zero members is not a pass; it is a scan that did not happen."""
    result = scan(FIXTURES / "clean_bundle")

    assert result.members
    assert all(member.endswith(".nc") for member in result.members)


# --- the controls -------------------------------------------------------------------------


def test_the_leaky_control_is_flagged() -> None:
    result = scan(FIXTURES / "leaky_bundle")

    assert not result.clean, "the deliberate control was not flagged, so the scanner is not working"


@pytest.mark.parametrize(
    ("rule", "location"),
    [
        ("attribute-not-on-the-allow-list", "global:history"),
        ("filesystem-path", "global:history"),
        ("command-line", "global:history"),
        ("coordinate-near-a-measurement", "global:nearest_station"),
        ("sensor-or-datastream-identifier", "variable:sea_water_temperature:comment"),
        ("home-directory", "line 1"),
        ("hostname-or-url", "line 1"),
    ],
)
def test_the_leaky_control_is_flagged_by_the_rule_and_at_the_place(
    rule: str, location: str
) -> None:
    """Each rule is named separately, so a rule that silently stopped matching is visible."""
    result = scan(FIXTURES / "leaky_bundle")

    assert [
        finding
        for finding in result.findings
        if finding.rule == rule and finding.location == location
    ], result.summary()


def test_a_flagged_bundle_names_the_offending_attribute() -> None:
    """A report saying 'something was flagged' sends somebody back to the bundle."""
    result = scan(FIXTURES / "leaky_bundle")

    assert any("history" in finding.location for finding in result.findings)
    assert all(finding.detail for finding in result.findings)


def test_a_member_in_an_unrecognised_format_is_a_failure_and_not_a_skip() -> None:
    result = scan(FIXTURES / "unreadable_bundle")

    assert "member-in-an-unrecognised-format" in rules_of(result)
    assert "thumbnail.tiff" in result.members, (
        "the member must be counted as scanned as well as flagged; a member the scan passed "
        "over silently would leave a bundle looking examined when it was not"
    )


def test_a_run_manifest_in_a_bundle_is_flagged() -> None:
    """It carries the seed, the clock configuration and every participant's digest."""
    result = scan(FIXTURES / "manifest_bundle")

    assert "run-manifest-in-a-bundle" in rules_of(result)


def test_a_coverage_that_cannot_be_decoded_is_flagged_rather_than_ignored(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    (bundle / "drogna-forecast.nc").write_bytes(b"CDF\x01not a header at all")

    result = scan(bundle)

    assert "member-cannot-be-read" in rules_of(result)


# --- the allow-list is an allow-list --------------------------------------------------------


def _bundle_with(tmp_path: Path, **attributes: object) -> Path:
    """A minimal, otherwise-clean coverage carrying whatever the test wants to try."""
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    payload = encode_netcdf(
        [("latitude", 2), ("longitude", 2)],
        {
            "Conventions": "CF-1.10",
            "title": "Synthetic released field",
            "source": "synthetic",
            **attributes,
        },
        [
            NetcdfVariable(
                name="latitude",
                nc_type=NC_DOUBLE,
                dimensions=("latitude",),
                values=array("d", [55.0, 55.1]),
                attributes={"standard_name": "latitude", "units": "degrees_north", "axis": "Y"},
            ),
            NetcdfVariable(
                name="longitude",
                nc_type=NC_DOUBLE,
                dimensions=("longitude",),
                values=array("d", [-8.0, -7.9]),
                attributes={"standard_name": "longitude", "units": "degrees_east", "axis": "X"},
            ),
        ],
    )
    (bundle / "drogna-forecast.nc").write_bytes(payload)
    return bundle


def test_an_unanticipated_attribute_is_flagged_whatever_its_value(tmp_path: Path) -> None:
    """FR-012. The rule is an allow-list, not a search for known-bad strings.

    The value here is entirely harmless. That is the point: the leaks worth catching are
    the ones nobody thought to look for, so an attribute nobody anticipated is a hit and
    adding a benign one is an edit to the rules file that somebody reviews.
    """
    result = scan(_bundle_with(tmp_path, project_phase="two"))

    assert "attribute-not-on-the-allow-list" in rules_of(result)
    assert any("project_phase" in finding.location for finding in result.findings)


def test_a_permitted_attribute_with_an_impermissible_value_is_flagged(tmp_path: Path) -> None:
    """`title` is legitimate; `title` carrying a path is not."""
    result = scan(_bundle_with(tmp_path, title="/srv/drogna/coverage/run-0007/field.nc"))

    assert {"attribute-value-outside-its-pattern", "filesystem-path"} & rules_of(result)


def test_a_variable_not_on_the_released_list_is_flagged(tmp_path: Path) -> None:
    """FR-014, and the other half of the age-driven case in test_updated_region.py."""
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    payload = encode_netcdf(
        [("latitude", 2)],
        {"Conventions": "CF-1.10", "title": "Synthetic released field", "source": "synthetic"},
        [
            NetcdfVariable(
                name="observation_age",
                nc_type=NC_DOUBLE,
                dimensions=("latitude",),
                values=array("d", [1.0, 2.0]),
                attributes={"units": "hours"},
            )
        ],
    )
    (bundle / "drogna-forecast.nc").write_bytes(payload)

    result = scan(bundle)

    assert "variable-not-on-the-released-list" in rules_of(result)


def test_a_dimension_named_after_a_sensor_is_flagged(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    payload = encode_netcdf(
        [("sensor", 2)],
        {"Conventions": "CF-1.10", "title": "Synthetic released field", "source": "synthetic"},
        [],
    )
    (bundle / "drogna-forecast.nc").write_bytes(payload)

    result = scan(bundle)

    assert "dimension-not-on-the-allow-list" in rules_of(result)


# --- the rules are data ----------------------------------------------------------------------


def test_the_rules_are_data_and_compile() -> None:
    """A rule change should be reviewable as a diff, not read out of a regular expression."""
    rules = load_rules()

    assert rules.global_attributes
    assert rules.variable_attributes
    assert rules.identifying
    assert rules.manifest_members


def test_the_report_is_written_whether_or_not_anything_was_found() -> None:
    """A silent pass and a scan that did not run must be distinguishable."""
    document = scan(FIXTURES / "clean_bundle").as_document()

    assert json.dumps(document)
    assert document["hits"] == 0
    assert document["members_scanned"]
