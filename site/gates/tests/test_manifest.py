"""The manifest gate, and the manifest's own thresholds, checked against the tree (T023).

Two jobs here.

**The gate.** A page the manifest requires that is missing, that says it is a stub, or
that is below its floor, must be a finding that names the file (FR-011, SC-002). Each of
those is driven through a manifest and a documentation tree built for the purpose, so
the gate is watched reporting each one rather than assumed to.

**The thresholds.** `docs/manifest.yaml` carries three numbers, and a number typed into
a file is a number somebody can retype when it is inconvenient. So the numbers are
re-derived here from `site/docs/` on every run and bounded in both directions: a
threshold may not be raised above work the project has already accepted as finished, and
may not be lowered to or below a page that is on disk announcing itself a stub. Lowering
`narrative` to make a run green fails this file.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

GATES = Path(__file__).resolve().parents[1]
GATE = GATES / "check_manifest.py"
ROOT = GATES.parents[1]
MANIFEST = ROOT / "docs" / "manifest.yaml"
CONTROLS = GATES / "fixtures" / "stub_control"
STUB_BOUND = "above-every-declared-stub"

FRONT_MATTER = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


# --------------------------------------------------------------------------
# Building a documentation tree the gate can be pointed at
# --------------------------------------------------------------------------


def page(directory: Path, name: str, *, words: int, stub: bool = False) -> Path:
    """A page of a known length, optionally announcing itself a stub."""
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["---", "title: Probe", "---", "", "# Probe", ""]
    if stub:
        lines += ['!!! warning "Stub — this page is not written"', "    Not written.", ""]
    # Everything after the front matter is what the gate counts, so the filler is sized
    # against that rather than guessed at.
    counted = "\n".join(lines[3:])
    lines.append(" ".join(["prose"] * max(words - len(counted.split()), 0)))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def manifest_at(tmp_path: Path, docs: Path, pages: dict, **extra: object) -> Path:
    body: dict = {
        "docs_root": str(docs),
        "stub_marker": '^!!!\\s+\\w+\\s+"Stub\\b',
        "kinds": {"page": {"min_words": 210}},
        "pages": pages,
        "adrs": {"published": False},
    }
    body.update(extra)
    path = tmp_path / "probe-manifest.yaml"
    path.write_text(yaml.safe_dump(body), encoding="utf-8")
    return path


@pytest.fixture
def docs(tmp_path: Path) -> Path:
    directory = tmp_path / "docs"
    directory.mkdir()
    return directory


# --------------------------------------------------------------------------
# The gate's rules, each watched reporting
# --------------------------------------------------------------------------


def test_a_written_page_is_clean(tmp_path: Path, docs: Path) -> None:
    """The control. Without it every test below would pass against a gate that always fails."""
    page(docs, "written.md", words=400)
    result = run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest_at(tmp_path, docs, {"written.md": {"kind": "page"}})),
    )
    assert result.returncode == CLEAN, result.stdout + result.stderr
    assert "manifest: 0 findings" in result.stdout


def test_a_missing_page_is_named(tmp_path: Path, docs: Path) -> None:
    result = run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest_at(tmp_path, docs, {"absent.md": {"kind": "page"}})),
    )
    assert result.returncode == FINDINGS, result.stdout
    assert "absent.md" in result.stdout
    assert "manifest.missing" in result.stdout
    assert "manifest: 1 findings" in result.stdout


def test_a_page_that_says_it_is_a_stub_is_named(tmp_path: Path, docs: Path) -> None:
    """Length cannot carry this rule: the page is comfortably above its floor."""
    page(docs, "declared.md", words=900, stub=True)
    result = run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest_at(tmp_path, docs, {"declared.md": {"kind": "page"}})),
    )
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.stub" in result.stdout
    assert "manifest.short" not in result.stdout
    assert "declared.md:7:" in result.stdout, "the finding must name the line of the marker"


def test_a_page_below_its_floor_is_named(tmp_path: Path, docs: Path) -> None:
    """And it is caught without saying anything: a stub that never admitted to being one."""
    page(docs, "thin.md", words=30)
    result = run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest_at(tmp_path, docs, {"thin.md": {"kind": "page"}})),
    )
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.short" in result.stdout
    assert "manifest.stub" not in result.stdout
    assert "below the 210" in result.stdout


def test_a_page_may_override_its_kinds_floor(tmp_path: Path, docs: Path) -> None:
    page(docs, "brief.md", words=100)
    pages = {"brief.md": {"kind": "page", "min_words": 50}}
    result = run("--site", str(tmp_path), "--manifest", str(manifest_at(tmp_path, docs, pages)))
    assert result.returncode == CLEAN, result.stdout


def test_a_page_declaring_an_undefined_kind_is_a_finding(tmp_path: Path, docs: Path) -> None:
    page(docs, "odd.md", words=400)
    pages = {"odd.md": {"kind": "gossamer"}}
    result = run("--site", str(tmp_path), "--manifest", str(manifest_at(tmp_path, docs, pages)))
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.kind" in result.stdout


def test_front_matter_does_not_count_towards_the_floor(tmp_path: Path, docs: Path) -> None:
    thin = docs / "padded.md"
    padding = " ".join(["metadata"] * 400)
    thin.write_text(f"---\ntitle: {padding}\n---\n\n# Padded\n\nOne sentence.\n", encoding="utf-8")
    pages = {"padded.md": {"kind": "page"}}
    result = run("--site", str(tmp_path), "--manifest", str(manifest_at(tmp_path, docs, pages)))
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.short" in result.stdout


def test_a_manifest_recording_adrs_as_published_wants_records_to_publish(
    tmp_path: Path, docs: Path
) -> None:
    """The manifest may not record a decision the source tree cannot honour.

    Whether the records reach the built output is `check_adr.py`'s business, in both
    directions. What is left here is the contradiction this gate can see on its own:
    published records, and nowhere any record lives.
    """
    page(docs, "written.md", words=400)
    pages = {"written.md": {"kind": "page"}}
    empty = tmp_path / "records"
    empty.mkdir()
    published = {"published": True, "source": str(empty)}
    result = run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest_at(tmp_path, docs, pages, adrs=published)),
    )
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.adrs" in result.stdout
    assert "no record here to publish" in result.stdout

    (empty / "0001-a-decision.md").write_text("# A decision\n", encoding="utf-8")
    again = run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest_at(tmp_path, docs, pages, adrs=published)),
    )
    assert again.returncode == CLEAN, again.stdout


def test_a_manifest_that_publishes_nothing_is_not_a_finding(tmp_path: Path, docs: Path) -> None:
    """`published: false` is a decision too, and the gate must accept it as one."""
    page(docs, "written.md", words=400)
    pages = {"written.md": {"kind": "page"}}
    manifest = manifest_at(tmp_path, docs, pages, adrs={"published": False})
    result = run("--site", str(tmp_path), "--manifest", str(manifest))
    assert result.returncode == CLEAN, result.stdout


def test_a_manifest_that_records_no_adr_decision_is_a_finding(tmp_path: Path, docs: Path) -> None:
    """FR-021: unpublished by accident must not be indistinguishable from on purpose."""
    page(docs, "written.md", words=400)
    body = yaml.safe_load(manifest_at(tmp_path, docs, {"written.md": {"kind": "page"}}).read_text())
    del body["adrs"]
    silent = tmp_path / "silent.yaml"
    silent.write_text(yaml.safe_dump(body), encoding="utf-8")
    result = run("--site", str(tmp_path), "--manifest", str(silent))
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.adrs" in result.stdout


def test_a_missing_manifest_cannot_run(tmp_path: Path) -> None:
    result = run("--site", str(tmp_path), "--manifest", str(tmp_path / "nowhere.yaml"))
    assert result.returncode == CANNOT_RUN, result.stdout + result.stderr
    assert "could not run" in result.stderr
    assert "nowhere.yaml" in result.stderr


def test_a_manifest_declaring_no_pages_cannot_run(tmp_path: Path, docs: Path) -> None:
    """An empty declaration would otherwise be reported as a clean site."""
    result = run("--site", str(tmp_path), "--manifest", str(manifest_at(tmp_path, docs, {})))
    assert result.returncode == CANNOT_RUN, result.stdout + result.stderr
    assert "an empty run is not a clean one" in result.stderr


# --------------------------------------------------------------------------
# The thresholds, re-derived from what is on disk
# --------------------------------------------------------------------------


def words_and_stub(path: Path, marker: re.Pattern[str]) -> tuple[int, bool]:
    body = FRONT_MATTER.sub("", path.read_text(encoding="utf-8"))
    return len(body.split()), bool(marker.search(body))


def measured(manifest: dict) -> dict[str, dict[str, list[int]]]:
    """Word counts of the manifest's pages, split by kind and by whether they are stubs.

    The committed controls under `site/gates/fixtures/stub_control/` are counted with the
    stubs. They are why the lower bound survives: within a day of the `narrative` floor
    being set, every stub it was derived from was written, and a derivation that read
    only the live corpus would have found nothing left to clear and passed whatever
    number the manifest carried. The control preserves the worst case the project
    actually produced, so the floor has something to be measured against permanently.
    """
    marker = re.compile(manifest["stub_marker"], re.MULTILINE)
    out: dict[str, dict[str, list[int]]] = {}
    for kind, declared in manifest["kinds"].items():
        out[kind] = {"accepted": [], "stub": []}
        if declared.get("bounded_by") != STUB_BOUND:
            continue
        control = CONTROLS / (kind + ".md")
        if control.is_file():
            count, stub = words_and_stub(control, marker)
            if stub:
                out[kind]["stub"].append(count)

    root = ROOT / manifest["docs_root"]
    for relative, entry in manifest["pages"].items():
        path = root / relative
        if not path.is_file():
            continue
        count, stub = words_and_stub(path, marker)
        bucket = out.setdefault(entry["kind"], {"accepted": [], "stub": []})
        bucket["stub" if stub else "accepted"].append(count)
    return out


def violations(manifest: dict) -> list[str]:
    """Every threshold in `manifest` that its own corpus contradicts.

    Two bounds, each derived rather than typed, and each evaluated only where the
    evidence for it is on disk:

    * a floor may not be **raised** above the shortest page of its kind that the project
      has already accepted as finished, or it would reject work already agreed;
    * a floor may not be **lowered** to or below the longest page of its kind that is on
      disk announcing itself a stub, or it would stop catching what it was set to catch.

    A kind that declares `bounded_by: above-every-declared-stub` keeps a committed
    control under `site/gates/fixtures/stub_control/`, so the second bound survives the
    day the last real stub is written. A kind for which *neither* bound can be derived
    is reported, because a threshold nothing on disk constrains is a number nobody is
    checking.
    """
    out: list[str] = []
    counts = measured(manifest)
    for kind, declared in manifest["kinds"].items():
        floor = declared["min_words"]
        bucket = counts.get(kind, {"accepted": [], "stub": []})
        derived = 0
        if bucket["accepted"]:
            derived += 1
            shortest = min(bucket["accepted"])
            if floor > shortest:
                out.append(
                    f"{kind}: min_words {floor} is above {shortest}, the shortest page of "
                    f"this kind the project has accepted as finished"
                )
        if bucket["stub"]:
            derived += 1
            longest = max(bucket["stub"])
            if floor <= longest:
                out.append(
                    f"{kind}: min_words {floor} does not clear {longest}, the longest page "
                    f"of this kind on disk that says it is a stub"
                )
        if derived == 0:
            out.append(f"{kind}: nothing on disk bounds min_words, so it is unchecked")
    return out


def test_the_thresholds_are_bounded_by_the_corpus() -> None:
    """The numbers in the manifest are re-derived here rather than trusted."""
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    assert violations(manifest) == []


@pytest.mark.parametrize(
    ("kind", "value"),
    [
        # Lowered until it no longer clears the committed control.
        ("narrative", 100),
        ("narrative", 490),
        # Raised until it rejects pages the project has already accepted as finished.
        ("narrative", 9000),
        ("page", 9000),
        ("index", 9000),
    ],
)
def test_a_tuned_threshold_is_caught(kind: str, value: int) -> None:
    """The derivation, watched failing, in both the directions it can see.

    Lowering `page` or `index` is deliberately not among these cases. Neither kind has
    ever had a page on disk announcing itself a stub, so there is no worst case to keep
    a control of and nothing to derive a lower bound from. What holds those kinds is the
    marker rule, which no number can be tuned past.
    """
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    manifest["kinds"][kind]["min_words"] = value
    reported = violations(manifest)
    assert any(line.startswith(f"{kind}:") for line in reported), reported


def test_the_manifest_names_no_page_that_does_not_exist() -> None:
    """Stable whatever state the stub pages are in: a required page must at least exist."""
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    root = ROOT / manifest["docs_root"]
    absent = [name for name in manifest["pages"] if not (root / name).is_file()]
    assert absent == []


def test_every_page_declares_a_kind_the_manifest_defines() -> None:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    kinds = set(manifest["kinds"])
    unknown = {
        name: entry.get("kind")
        for name, entry in manifest["pages"].items()
        if entry.get("kind") not in kinds
    }
    assert unknown == {}


def test_every_kind_bounded_by_stubs_keeps_a_control() -> None:
    """A bound with no evidence behind it is a bound nobody is checking."""
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    wanted = [kind for kind, d in manifest["kinds"].items() if d.get("bounded_by") == STUB_BOUND]
    assert wanted, "no kind claims the stub-derived bound, so this test proves nothing"
    for kind in wanted:
        control = CONTROLS / (kind + ".md")
        assert control.is_file(), f"{kind} claims a stub-derived bound with no control on disk"


def test_the_control_still_declares_itself_a_stub() -> None:
    """A control that no longer demonstrates what it controls for demonstrates nothing."""
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    marker = re.compile(manifest["stub_marker"], re.MULTILINE)
    for control in sorted(CONTROLS.glob("*.md")):
        count, stub = words_and_stub(control, marker)
        assert stub, f"{control} no longer carries the stub marker"
        assert count > 0


def test_the_gate_reports_the_control_as_a_stub(tmp_path: Path) -> None:
    """The marker rule, exercised against the committed control rather than a fixture
    written moments earlier by the same test that checks it."""
    manifest = manifest_at(tmp_path, CONTROLS, {"narrative.md": {"kind": "page"}})
    result = run("--site", str(tmp_path), "--manifest", str(manifest))
    assert result.returncode == FINDINGS, result.stdout
    assert "manifest.stub" in result.stdout
    assert "narrative.md" in result.stdout
