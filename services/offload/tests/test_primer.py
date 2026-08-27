"""The primer's worked example, run against a bundle the packager actually wrote.

SC-007 asks for an example that opens a produced bundle and renders a profile, running in
CI so the primer cannot drift from the file. The code below is not a copy of the example:
it is extracted from the Markdown and executed, so an example that stops working fails
here and an example someone edits without checking fails here too.

SC-008 asks that a reader can tell from the primer alone what the export emits and what it
deliberately omits. That is checked by comparing the primer's two lists against the file
and against the allow-list, which is the only way that claim can be kept true.
"""

from __future__ import annotations

import re
from pathlib import Path

from harness_core.clock import SimInstant
from harness_core.netcdf import read_netcdf
from harness_offload.attributes import NEVER_EMITTED
from harness_offload.profiles import profiles_from_observations
from harness_offload.writer import ExportInputs, encode_bundle
from offload_support import EPOCH, configuration, observations_for

PRIMER = Path(__file__).resolve().parents[3] / "site" / "docs" / "standards" / "cf-conventions.md"


def produced(tmp_path) -> bytes:
    epoch = SimInstant.from_iso(EPOCH)
    return encode_bundle(
        ExportInputs(
            bundle_id="b-0123456789abcdef",
            run_reference="9c1d4e6f8a0b2c3d4e5f60718293a4b5",
            epoch=epoch,
            window_start=epoch,
            window_end=epoch.plus_micros(7200 * 1_000_000),
            profiles=profiles_from_observations(observations_for()).profiles,
            allowlist=tuple(configuration(tmp_path)["offload"]["attributes"]["allowlist"]),
        )
    )


def python_blocks() -> list[str]:
    text = PRIMER.read_text(encoding="utf-8")
    return re.findall(r"```python\n(.*?)```", text, flags=re.DOTALL)


def test_the_primer_carries_a_worked_example() -> None:
    assert python_blocks(), "the primer's worked example has gone missing"


def test_the_worked_example_opens_a_produced_bundle_and_renders_a_profile(tmp_path) -> None:
    """The example, executed. If it stops working the primer is wrong, and this says so."""
    namespace: dict[str, object] = {}
    for block in python_blocks():
        exec(block, namespace)

    lines = namespace["first_profile"](produced(tmp_path))

    assert lines[0] == f"time axis: seconds since {EPOCH}"
    assert lines[1].split() == ["depth_m", "temperature_degC"]
    # The first profile of the fixture has five levels at ten-metre spacing.
    assert len(lines) == 2 + 5
    assert [line.split()[0] for line in lines[2:]] == ["0.0", "10.0", "20.0", "30.0", "40.0"]


def test_the_primer_names_every_variable_the_export_carries(tmp_path) -> None:
    """SC-008, one half: nothing in the file is unexplained."""
    text = PRIMER.read_text(encoding="utf-8")
    document = read_netcdf(produced(tmp_path))

    missing = [name for name in document.variables if f"`{name}`" not in text]

    assert missing == []


def test_the_primer_names_every_attribute_the_export_carries(tmp_path) -> None:
    text = PRIMER.read_text(encoding="utf-8")
    document = read_netcdf(produced(tmp_path))
    names = set(document.attributes)
    for variable in document.variables.values():
        names.update(variable.attributes)

    missing = [name for name in sorted(names) if f"`{name}`" not in text]

    assert missing == []


def test_the_primer_lists_every_attribute_deliberately_omitted_with_its_reason() -> None:
    """SC-008, the other half. The omissions read as decisions because they are written down."""
    text = PRIMER.read_text(encoding="utf-8")

    for name, _ in NEVER_EMITTED:
        assert f"`{name}`" in text, name
    assert "FR-42" in text


def test_the_primer_says_the_trajectory_is_not_an_entity() -> None:
    """Constitution V. "Trajectory" is a word a reader can arrive at with an expectation."""
    text = PRIMER.read_text(encoding="utf-8").lower()

    assert "ordering of measurements and nothing else" in text
    assert "no heading, no speed and no platform" in text
