"""The first leakage path in SRD FR-42: what a released file says about how it was made.

A derived product leaves the harness. It should carry the field and the metadata a reader
needs to interpret it, and nothing that says where the measurements behind it were taken,
which sensor took them, what the input files were called, or which host produced them.

Three rules, in the order they matter.

**An allow-list, not a search for known-bad strings.** An attribute key nobody anticipated
is a hit whatever its value (FR-012). A deny-list would find the leaks somebody thought of,
and the interesting leaks are in the other category. Adding a benign attribute is therefore
a deliberate edit to ``rules/attribute_allowlist.yaml``, reviewable as a diff, rather than
something that happens on the way through a packager.

**Every value is checked as well as every key.** ``comment`` is a legitimate attribute and
``comment`` naming a datastream is a leak, so the identifying patterns run over the values
of permitted keys too. A value that parses as a coordinate pair is measured against the
measurement geometry and is a hit when it falls within the identification radius.

**An unrecognised member is a failure, not a skip.** A scanner that skipped what it could
not read would report zero hits on a bundle it had not examined, which is the most
dangerous result a leakage gate can produce.

The report is written whether or not anything was found, so that a silent pass and a scan
that did not run are distinguishable (spec.md, "Leakage report").
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RULES = Path(__file__).resolve().parent / "rules"

if str(REPOSITORY_ROOT / "query") not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT / "query"))

from plugins.errors import CoverageStoreError  # noqa: E402
from plugins.netcdf_reader import read_netcdf  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

from updated_region import (  # noqa: E402
    METRES_PER_DEGREE_LATITUDE,
    Measurement,
)

__all__ = [
    "Finding",
    "Rules",
    "ScanResult",
    "load_rules",
    "scan_bundle",
]


@dataclass(frozen=True)
class Finding:
    """One hit: where it was, which rule found it, and enough of the value to act on.

    The value is recorded, not only the rule. A report saying "an attribute was flagged"
    sends somebody back to the bundle; a report saying which attribute and what it said is
    one they can act on without opening it.
    """

    member: str
    location: str
    rule: str
    detail: str

    def as_document(self) -> dict[str, str]:
        return {
            "member": self.member,
            "location": self.location,
            "rule": self.rule,
            "detail": self.detail,
        }


@dataclass(frozen=True)
class Rules:
    """The two rule files, compiled. Data on disk, patterns here."""

    global_attributes: Mapping[str, re.Pattern[str]]
    variable_attributes: Mapping[str, re.Pattern[str]]
    dimensions: frozenset[str]
    coordinates: frozenset[str]
    identifying: tuple[tuple[str, str, re.Pattern[str]], ...]
    coordinate_pair: re.Pattern[str]
    coverage_suffixes: frozenset[str]
    text_suffixes: frozenset[str]
    manifest_members: frozenset[str]


def load_rules(directory: Path = RULES) -> Rules:
    """Read and compile the rule files. A rule that will not compile is a startup failure."""
    allowlist = yaml.safe_load((directory / "attribute_allowlist.yaml").read_text(encoding="utf-8"))
    patterns = yaml.safe_load((directory / "identifying_patterns.yaml").read_text(encoding="utf-8"))
    recognised = patterns["recognised_members"]
    return Rules(
        global_attributes={key: re.compile(value) for key, value in allowlist["global"].items()},
        variable_attributes={
            key: re.compile(value) for key, value in allowlist["variable"].items()
        },
        dimensions=frozenset(allowlist["dimensions"]),
        coordinates=frozenset(allowlist["coordinates"]),
        identifying=tuple(
            (entry["name"], entry["reason"], re.compile(entry["pattern"]))
            for entry in patterns["patterns"]
        ),
        coordinate_pair=re.compile(patterns["coordinate_pair"]),
        coverage_suffixes=frozenset(recognised["coverage"]),
        text_suffixes=frozenset(recognised["text"]),
        manifest_members=frozenset(patterns["manifest_members"]),
    )


@dataclass(frozen=True)
class ScanResult:
    """Everything the scan looked at and everything it found.

    ``members`` is here because it is the difference between a clean bundle and a bundle
    nobody read. A report with no findings and no members scanned is not a pass.
    """

    bundle: str
    members: tuple[str, ...]
    findings: tuple[Finding, ...]

    @property
    def clean(self) -> bool:
        return not self.findings

    def as_document(self) -> dict[str, Any]:
        return {
            "bundle": self.bundle,
            "members_scanned": list(self.members),
            "hits": len(self.findings),
            "findings": [finding.as_document() for finding in self.findings],
        }

    def summary(self) -> str:
        if not self.members:
            return f"{self.bundle}: no member was scanned, so nothing was checked"
        if self.clean:
            return f"{self.bundle}: {len(self.members)} member(s) scanned, no hit"
        lines = [f"{self.bundle}: {len(self.findings)} hit(s) in {len(self.members)} member(s)"]
        lines.extend(
            f"  {finding.member}: {finding.location}: [{finding.rule}] {finding.detail}"
            for finding in self.findings
        )
        return "\n".join(lines)


# --- checking one value ----------------------------------------------------------------------


def _metres_per_degree_longitude(latitude: float) -> float:
    return METRES_PER_DEGREE_LATITUDE * math.cos(math.radians(latitude))


def _distance_m(longitude: float, latitude: float, measurement: Measurement) -> float:
    northing = (latitude - measurement.latitude) * METRES_PER_DEGREE_LATITUDE
    easting = (longitude - measurement.longitude) * _metres_per_degree_longitude(latitude)
    return math.hypot(northing, easting)


def _coordinate_hits(
    value: str,
    rules: Rules,
    geometry: Sequence[Measurement],
    radius_m: float,
) -> list[str]:
    """Coordinate pairs in a value that fall within the identification radius of a measurement.

    Both orderings are tried, because a value carrying two decimal degrees does not say
    which is which and a leak does not become safe by being written the other way round.
    """
    hits = []
    for match in rules.coordinate_pair.finditer(value):
        first, second = float(match.group(1)), float(match.group(2))
        for latitude, longitude in ((first, second), (second, first)):
            if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
                continue
            for measurement in geometry:
                distance = _distance_m(longitude, latitude, measurement)
                if distance <= radius_m:
                    hits.append(
                        f"{match.group(0)!r} is {distance:.0f} m from a measurement, "
                        f"inside the {radius_m:.0f} m identification radius"
                    )
                    break
            else:
                continue
            break
    return hits


def _value_findings(
    member: str,
    location: str,
    value: Any,
    rules: Rules,
    geometry: Sequence[Measurement],
    radius_m: float,
) -> Iterable[Finding]:
    text = value if isinstance(value, str) else json.dumps(value)
    for name, reason, pattern in rules.identifying:
        match = pattern.search(text)
        if match is None:
            continue
        yield Finding(member, location, name, f"{match.group(0).strip()!r}: {reason}")
    for detail in _coordinate_hits(text, rules, geometry, radius_m):
        yield Finding(member, location, "coordinate-near-a-measurement", detail)


def _attribute_findings(
    member: str,
    prefix: str,
    attributes: Mapping[str, Any],
    permitted: Mapping[str, re.Pattern[str]],
    rules: Rules,
    geometry: Sequence[Measurement],
    radius_m: float,
) -> Iterable[Finding]:
    for key in sorted(attributes):
        value = attributes[key]
        location = f"{prefix}{key}"
        pattern = permitted.get(key)
        if pattern is None:
            yield Finding(
                member,
                location,
                "attribute-not-on-the-allow-list",
                f"{str(value)[:120]!r}: the rule is an allow-list, so an attribute nobody "
                "anticipated is a hit whatever it says",
            )
        elif not pattern.fullmatch(str(value)):
            yield Finding(
                member,
                location,
                "attribute-value-outside-its-pattern",
                f"{str(value)[:120]!r} does not match {pattern.pattern!r}",
            )
        yield from _value_findings(member, location, value, rules, geometry, radius_m)


# --- one member ---------------------------------------------------------------------------------


def _coverage_findings(
    member: str,
    payload: bytes,
    rules: Rules,
    released_variables: frozenset[str],
    geometry: Sequence[Measurement],
    radius_m: float,
) -> Iterable[Finding]:
    try:
        dataset = read_netcdf(payload, source=member)
    except CoverageStoreError as refusal:
        yield Finding(
            member,
            "<file>",
            "member-cannot-be-read",
            f"{refusal}: a member the scan cannot read is a failure, not a skip",
        )
        return

    yield from _attribute_findings(
        member, "global:", dataset.attributes, rules.global_attributes, rules, geometry, radius_m
    )

    for name in sorted(dataset.dimensions):
        if name not in rules.dimensions:
            yield Finding(
                member,
                f"dimension:{name}",
                "dimension-not-on-the-allow-list",
                "a dimension is a name as much as an attribute is, and a bundle whose "
                "dimension is called after a sensor has disclosed one",
            )

    for name in sorted(dataset.variables):
        variable = dataset.variables[name]
        if name not in released_variables and name not in rules.coordinates:
            yield Finding(
                member,
                f"variable:{name}",
                "variable-not-on-the-released-list",
                "FR-014: a released product carries the variables the release policy names "
                "and no others",
            )
        yield from _value_findings(member, f"variable:{name}", name, rules, geometry, radius_m)
        yield from _attribute_findings(
            member,
            f"variable:{name}:",
            variable.attributes,
            rules.variable_attributes,
            rules,
            geometry,
            radius_m,
        )


def _text_findings(
    member: str,
    text: str,
    rules: Rules,
    geometry: Sequence[Measurement],
    radius_m: float,
) -> Iterable[Finding]:
    for number, line in enumerate(text.splitlines(), start=1):
        yield from _value_findings(member, f"line {number}", line, rules, geometry, radius_m)


# --- the bundle -----------------------------------------------------------------------------------


def scan_bundle(
    bundle: Path,
    *,
    released_variables: Iterable[str],
    geometry: Sequence[Measurement] = (),
    radius_m: float = 0.0,
    rules: Rules | None = None,
) -> ScanResult:
    """Walk every member of a bundle and report what it found, or that it found nothing.

    ``geometry`` and ``radius_m`` are what the coordinate check needs. Without them a
    coordinate pair cannot be measured against anything, and the scan says so by finding no
    coordinate hits rather than by pretending the check ran — which is why the caller passes
    them explicitly and why the gate refuses to run without a geometry document.
    """
    settled = rules if rules is not None else load_rules()
    understood = sorted(settled.coverage_suffixes | settled.text_suffixes)
    permitted_variables = frozenset(released_variables)
    findings: list[Finding] = []
    members: list[str] = []

    for path in sorted(bundle.rglob("*")):
        if not path.is_file():
            continue
        member = str(path.relative_to(bundle))
        members.append(member)
        if path.name in settled.manifest_members:
            findings.append(
                Finding(
                    member,
                    "<file>",
                    "run-manifest-in-a-bundle",
                    "a run manifest holds the root seed, the clock configuration and the "
                    "digest of every participant's configuration; it is the document the "
                    "release is withholding, and it arrives here by somebody being helpful",
                )
            )
            continue
        if path.suffix in settled.coverage_suffixes:
            findings.extend(
                _coverage_findings(
                    member,
                    path.read_bytes(),
                    settled,
                    permitted_variables,
                    geometry,
                    radius_m,
                )
            )
        elif path.suffix in settled.text_suffixes:
            findings.extend(
                _text_findings(
                    member,
                    path.read_text(encoding="utf-8", errors="replace"),
                    settled,
                    geometry,
                    radius_m,
                )
            )
        else:
            findings.append(
                Finding(
                    member,
                    "<file>",
                    "member-in-an-unrecognised-format",
                    f"the scan understands {understood} and nothing else. An unrecognised "
                    "member is a failure rather than a skip: a bundle that was not examined "
                    "must not report zero hits.",
                )
            )

    return ScanResult(bundle=str(bundle), members=tuple(members), findings=tuple(findings))
