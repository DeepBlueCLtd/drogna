#!/usr/bin/env python3
"""Gate: the two leakage paths SRD FR-42 names, over a candidate release bundle.

    scripts/check_leakage.py                       # the committed corpus, controls included
    scripts/check_leakage.py --bundle DIR --manifest FILE   # scan one candidate bundle
    scripts/check_leakage.py --pair DIR            # score one pair of successive products
    scripts/check_leakage.py --report FILE         # write the leakage report as JSON

Two gates in one command, because they are one question asked of one artefact.

**Provenance.** Every global attribute, variable attribute, variable name, dimension name
and embedded text member is walked against an allow-list of permitted keys and a set of
identifying patterns. An attribute nobody anticipated is a hit whatever its value; so is a
member in a format the scan does not understand, because a bundle that was not examined
must not report zero hits.

**The updated region.** Two successive released products are compared, the change mask is
computed, and its recovery of the buffered measurement geometry is scored. Below the chance
bound the release is not disclosing the shape of its own sampling; a comparison that could
not have recovered anything is inconclusive and fails.

With no arguments the gate runs over the corpus committed under ``tests/leakage/fixtures/``,
which carries six **deliberate controls**. Each is asserted to be caught. That is the half
of this gate that keeps the other half worth running: a scanner reporting nothing is
indistinguishable from a scanner that is no longer running, and the only way to tell them
apart is to keep something in front of it that it is supposed to object to.

The report is printed whether or not anything was found, so a silent pass and a scan that
did not run are distinguishable. It needs no deployment, no network and no service: the
whole corpus is in the repository (FR-018, SC-008).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
LEAKAGE = REPO_ROOT / "tests" / "leakage"
FIXTURES = LEAKAGE / "fixtures"

sys.path.insert(0, str(LEAKAGE))

from scanner import ScanResult, load_rules, scan_bundle  # noqa: E402
from settings import DEFAULT_DESTINATION, Settings, load_settings  # noqa: E402
from updated_region import (  # noqa: E402
    Assessment,
    InvalidGeometryError,
    assess,
    load_geometry,
    load_product,
)

GATE = "leakage"

COVERAGE_MEMBER = "drogna-forecast.nc"

# The measurement geometry is read from the run manifest, which is where FR-015 says it
# lives and where `contracts/schemas/run-manifest.schema.json` declares it. A pair carries
# one beside its two products. A bundle never does: a manifest inside a bundle is the
# `manifest_bundle` control below, so a candidate bundle is scanned against a manifest given
# from outside it.
RUN_MANIFEST = "run-manifest.json"

# The corpus, and what each member of it is for. Six of the eight are deliberate controls,
# and the gate fails if a control stops being caught.
CLEAN_BUNDLES = ("clean_bundle",)
CONTROL_BUNDLES = ("leaky_bundle", "unreadable_bundle", "manifest_bundle")
MITIGATED_PAIRS = ("mitigated_pair",)
CONTROL_PAIRS = ("unmitigated_pair", "age_driven_pair")
INCONCLUSIVE_PAIRS = ("unchanged_pair",)


def scan_one(bundle: Path, settings: Settings, manifest: Path) -> ScanResult:
    return scan_bundle(
        bundle,
        released_variables=settings.released_variables,
        geometry=load_geometry(manifest),
        radius_m=settings.identification_radius_m,
        rules=load_rules(),
    )


def score_one(pair: Path, settings: Settings) -> Assessment:
    return assess(
        load_product(pair / "t0" / COVERAGE_MEMBER),
        load_product(pair / "t1" / COVERAGE_MEMBER),
        load_geometry(pair / RUN_MANIFEST),
        radius_m=settings.identification_radius_m,
        step=settings.quantisation_step,
    )


def corpus_manifest() -> Path:
    return FIXTURES / "mitigated_pair" / RUN_MANIFEST


def check_corpus(settings: Settings) -> tuple[list[str], dict[str, Any]]:
    """Run the whole committed corpus, controls included. Returns complaints and the report."""
    complaints: list[str] = []
    report: dict[str, Any] = {"bundles": {}, "pairs": {}}

    for name in CLEAN_BUNDLES:
        result = scan_one(FIXTURES / name, settings, corpus_manifest())
        report["bundles"][name] = result.as_document()
        if not result.members:
            complaints.append(f"{name}: nothing was scanned, so nothing was checked")
        if not result.clean:
            complaints.append(result.summary())

    for name in CONTROL_BUNDLES:
        result = scan_one(FIXTURES / name, settings, corpus_manifest())
        report["bundles"][name] = result.as_document()
        if result.clean:
            complaints.append(
                f"{name} is a deliberate control and was not flagged. The scanner cannot "
                "detect a leak it was built to detect, so no clean result above it means "
                "anything."
            )

    for name in MITIGATED_PAIRS:
        assessment = score_one(FIXTURES / name, settings)
        report["pairs"][name] = assessment.as_document()
        if not assessment.conclusive:
            complaints.append(f"{name}: inconclusive — {assessment.reason}")
        elif assessment.worst > settings.chance_bound:
            complaints.append(
                f"{name}: the change mask recovers the measurement geometry at "
                f"{assessment.worst:.3f} ({assessment.worst_variable}), above the chance "
                f"bound of {settings.chance_bound}"
            )

    for name in CONTROL_PAIRS:
        assessment = score_one(FIXTURES / name, settings)
        report["pairs"][name] = assessment.as_document()
        if not assessment.conclusive:
            complaints.append(f"{name}: inconclusive — {assessment.reason}")
        elif assessment.worst < settings.discovery_bound:
            complaints.append(
                f"{name} is a deliberate control and scored {assessment.worst:.3f}, below the "
                f"discovery bound of {settings.discovery_bound}. The statistic has stopped "
                "recovering a leak it was built to recover."
            )

    for name in INCONCLUSIVE_PAIRS:
        assessment = score_one(FIXTURES / name, settings)
        report["pairs"][name] = assessment.as_document()
        if assessment.conclusive:
            complaints.append(
                f"{name} carries two products that differ by less than the quantisation step "
                "and must be reported as inconclusive rather than as a pass"
            )

    return complaints, report


def check_candidate(
    bundle: Path | None,
    pair: Path | None,
    settings: Settings,
    manifest_source: Path | None = None,
) -> tuple[list[str], dict[str, Any]]:
    """Run one candidate bundle, one candidate pair, or both.

    The run manifest is where the coordinate check gets something to measure against: it
    carries the measurement geometry, and the coordinate rule is the one rule that needs a
    place to compare a released number with. It is named with ``--manifest`` and is never
    looked for inside the bundle, because a manifest inside a bundle is itself the leak
    ``manifest_bundle`` controls for — requiring one there would mean committing the leak in
    order to scan for it.

    Three things are refused rather than scanned, and they are three different faults: no
    manifest given, a manifest that is not a file, and a manifest that is unreadable, not
    JSON, not a manifest, or carries no measurement geometry. Each says which. A scan
    reporting no coordinate hits because it had no coordinates to compare with would be a
    pass nobody earned, and a scan refused for a reason nobody stated is a fault nobody
    fixes.
    """
    complaints: list[str] = []
    report: dict[str, Any] = {"bundles": {}, "pairs": {}}

    if bundle is not None:
        if manifest_source is None:
            complaints.append(
                f"{bundle}: no run manifest was given with --manifest. The measurement "
                "geometry is read from the run manifest, and the manifest is withheld rather "
                "than released, so it is never inside the bundle — a coordinate in a released "
                "file could not be measured against anything. The scan is refused rather than "
                "run half-blind."
            )
        elif not manifest_source.is_file():
            complaints.append(
                f"{bundle}: the run manifest given with --manifest, {manifest_source}, is not "
                "a file, so the measurement geometry could not be read and a coordinate in a "
                "released file could not be measured against anything. The scan is refused "
                "rather than run half-blind."
            )
        else:
            try:
                result = scan_one(bundle, settings, manifest_source)
            except InvalidGeometryError as error:
                complaints.append(
                    f"{bundle}: the run manifest given with --manifest carries no usable "
                    f"measurement geometry — {error}. The scan is refused rather than run "
                    "half-blind: an invalid geometry buys exactly what a missing one does, "
                    "which is a coordinate rule with nothing to compare against."
                )
            else:
                report["bundles"][bundle.name] = result.as_document()
                if not result.members:
                    complaints.append(f"{bundle}: nothing was scanned, so nothing was checked")
                if not result.clean:
                    complaints.append(result.summary())

    if pair is not None:
        try:
            assessment = score_one(pair, settings)
        except InvalidGeometryError as error:
            return (
                [
                    f"{pair}: carries no usable measurement geometry — {error}. The pair is "
                    "refused rather than scored: a statistic computed against a geometry "
                    "nobody could read is a number, not evidence."
                ],
                report,
            )
        report["pairs"][pair.name] = assessment.as_document()
        if not assessment.conclusive:
            complaints.append(f"{pair}: inconclusive — {assessment.reason}")
        elif assessment.worst > settings.chance_bound:
            complaints.append(
                f"{pair}: the change mask recovers the measurement geometry at "
                f"{assessment.worst:.3f} ({assessment.worst_variable}), above the chance bound "
                f"of {settings.chance_bound}"
            )

    return complaints, report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="The leakage gate (SRD FR-42).")
    parser.add_argument("--bundle", type=Path, default=None, help="a candidate release bundle")
    parser.add_argument("--pair", type=Path, default=None, help="a directory holding t0/ and t1/")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="the run manifest whose measurement geometry coordinates are scored against. "
        "Required with --bundle: the manifest is withheld rather than released, so it is "
        "never inside the bundle. A pair carries its own beside its two products",
    )
    parser.add_argument("--report", type=Path, default=None, help="write the report here, as JSON")
    parser.add_argument("--destination", default=DEFAULT_DESTINATION, help="whose release policy")
    arguments = parser.parse_args(argv)

    settings = load_settings(arguments.destination)
    if arguments.bundle is None and arguments.pair is None:
        complaints, findings = check_corpus(settings)
        subject = "the committed corpus"
    else:
        complaints, findings = check_candidate(
            arguments.bundle, arguments.pair, settings, arguments.manifest
        )
        subject = str(arguments.bundle or arguments.pair)

    report = {"gate": GATE, "subject": subject, "settings": settings.as_document(), **findings}
    report["complaints"] = complaints

    if arguments.report is not None:
        arguments.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    for name, document in report["pairs"].items():
        if document["conclusive"]:
            print(
                f"{GATE}: {name}: recovery {document['worst']:.3f} "
                f"({document['worst_variable']}), union {document['union']['statistic']:.3f}, "
                f"chance {settings.chance_bound}, discovery {settings.discovery_bound}"
            )
        else:
            print(f"{GATE}: {name}: inconclusive — {document['reason']}")
    for name, document in report["bundles"].items():
        members = len(document["members_scanned"])
        print(f"{GATE}: {name}: {document['hits']} hit(s) in {members} member(s)")

    if complaints:
        print(f"\n{GATE}: {len(complaints)} finding(s):", file=sys.stderr)
        for complaint in complaints:
            print(f"  {complaint}", file=sys.stderr)
        return 1

    print(f"{GATE}: clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
