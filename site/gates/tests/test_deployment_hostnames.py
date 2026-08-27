"""The deployment-hostname gate is run against a planted violation and asserted to name it.

Three things are asserted here that a "reports nothing" run cannot tell you: that the
hostnames come from configuration rather than from a list retyped inside the gate, that an
absent manifest is a refusal rather than a pass, and that an acknowledgement with no reason
acknowledges nothing.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
REPO_ROOT = GATES.parents[1]
SEEDED = GATES / "fixtures" / "seeded_violation" / "built"

sys.path.insert(0, str(GATES))

import check_deployment_hostnames as gate  # noqa: E402

DECLARED = REPO_ROOT / "config" / "droplet" / "deployment.json"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Run the gate as the contract says it is run."""
    return subprocess.run(
        [sys.executable, str(GATES / "check_deployment_hostnames.py"), *arguments],
        capture_output=True,
        text=True,
        check=False,
    )


def manifest_at(path: Path, body: str) -> Path:
    path.write_text(body, encoding="utf-8")
    return path


@pytest.fixture
def empty_manifest(tmp_path: Path) -> Path:
    return manifest_at(tmp_path / "manifest.yaml", "acknowledged_hostnames: []\n")


@pytest.fixture(scope="session")
def built_site(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The real built site, built here if it is not already on disk."""
    existing = REPO_ROOT / "site" / "build"
    if existing.is_dir():
        return existing
    if importlib.util.find_spec("mkdocs") is None:
        pytest.skip(
            "no built site on disk and MkDocs is not installed in this interpreter, so "
            "the real site cannot be built to gate it. The publishing workflow builds it "
            "and runs this assertion there; locally, build it first and re-run."
        )
    built = tmp_path_factory.mktemp("built")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mkdocs",
            "build",
            "--strict",
            "--config-file",
            str(REPO_ROOT / "site" / "mkdocs.yml"),
            "--site-dir",
            str(built),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return built


# --- where the hostnames come from ----------------------------------------------------


def test_the_hostnames_are_read_from_configuration_not_retyped() -> None:
    """Change the destination's hostname and the gate changes with it, or it is a copy."""
    declared = json.loads(DECLARED.read_text(encoding="utf-8"))
    expected = {
        declared["public_url"]["host"].lower(),
        declared["tls"]["hostname"].lower(),
    } - {""}
    assert expected <= gate.declared_hostnames()


def test_the_local_destination_is_not_a_deployment(tmp_path: Path) -> None:
    """`localhost` on a page is an instruction to a reader, not an access surface."""
    (tmp_path / "local").mkdir()
    (tmp_path / "local" / "deployment.json").write_text(
        json.dumps({"public_url": {"host": "localhost"}, "tls": {"hostname": ""}}),
        encoding="utf-8",
    )
    (tmp_path / "elsewhere").mkdir()
    (tmp_path / "elsewhere" / "deployment.json").write_text(
        json.dumps({"public_url": {"host": "Somewhere.Invalid"}, "tls": {"hostname": ""}}),
        encoding="utf-8",
    )
    assert gate.declared_hostnames(tmp_path) == {"somewhere.invalid"}


# --- the real site --------------------------------------------------------------------


def test_the_real_built_site_reports_no_findings(built_site: Path, empty_manifest: Path) -> None:
    result = run("--site", str(built_site), "--manifest", str(empty_manifest))
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"{gate.GATE}: 0 findings" in result.stdout


def test_the_real_manifest_is_readable_and_the_site_passes_against_it(built_site: Path) -> None:
    """The manifest another feature owns is read as it stands, not as this gate wishes."""
    manifest = REPO_ROOT / "docs" / "manifest.yaml"
    if not manifest.is_file():
        pytest.skip("docs/manifest.yaml does not exist yet; T004 owns it")
    result = run("--site", str(built_site), "--manifest", str(manifest))
    assert result.returncode == 0, result.stdout + result.stderr


# --- the seeded fixture ---------------------------------------------------------------


def test_the_fixture_fails_and_names_the_hostname(empty_manifest: Path) -> None:
    result = run("--site", str(SEEDED), "--manifest", str(empty_manifest))
    assert result.returncode == 1, result.stdout + result.stderr
    assert "drogna.invalid" in result.stdout
    assert "index.html" in result.stdout


def test_the_fixture_fails_and_names_the_address(empty_manifest: Path) -> None:
    result = run("--site", str(SEEDED), "--manifest", str(empty_manifest))
    assert result.returncode == 1
    assert "203.0.113.7" in result.stdout
    assert "address-literal" in result.stdout


# --- acknowledging, and failing to ----------------------------------------------------


def test_an_acknowledgement_with_a_reason_lets_it_through(tmp_path: Path) -> None:
    manifest = manifest_at(
        tmp_path / "manifest.yaml",
        "acknowledged_hostnames:\n"
        "  - host: drogna.invalid\n"
        "    reason: the placeholder in the destination config; nothing resolves it\n"
        "  - host: 203.0.113.7\n"
        "    reason: TEST-NET-3, reserved for documentation and routed nowhere\n",
    )
    result = run("--site", str(SEEDED), "--manifest", str(manifest))
    assert result.returncode == 0, result.stdout + result.stderr


def test_an_acknowledgement_with_no_reason_acknowledges_nothing(tmp_path: Path) -> None:
    """The same rule `_gate_lib.exempted` applies to a marker: no reason, no exemption."""
    manifest = manifest_at(
        tmp_path / "manifest.yaml",
        "acknowledged_hostnames:\n  - host: drogna.invalid\n    reason: ''\n",
    )
    result = run("--site", str(SEEDED), "--manifest", str(manifest))
    assert result.returncode == 1, result.stdout
    assert "no reason" in result.stdout


# --- the refusals ---------------------------------------------------------------------


def test_an_absent_manifest_is_a_refusal_to_run(tmp_path: Path) -> None:
    """Not 0. A missing acknowledgement list is not an empty one."""
    result = run("--site", str(SEEDED), "--manifest", str(tmp_path / "nowhere.yaml"))
    assert result.returncode == 2, result.stdout + result.stderr
    assert "cannot run" in result.stdout
    assert "nowhere.yaml" in result.stdout
    assert "0 findings" not in result.stdout


def test_a_manifest_that_is_not_yaml_is_a_refusal_to_run(tmp_path: Path) -> None:
    manifest = manifest_at(tmp_path / "manifest.yaml", "acknowledged_hostnames: [oops\n")
    result = run("--site", str(SEEDED), "--manifest", str(manifest))
    assert result.returncode == 2, result.stdout
    assert "cannot run" in result.stdout


def test_a_site_that_is_not_there_is_a_refusal_to_run(tmp_path: Path, empty_manifest: Path) -> None:
    result = run("--site", str(tmp_path / "nowhere"), "--manifest", str(empty_manifest))
    assert result.returncode == 2
    assert "cannot run" in result.stdout


# --- the pieces the rules stand on ----------------------------------------------------


@pytest.mark.parametrize(
    ("candidate", "reported"),
    [
        ("203.0.113.7", True),
        ("192.168.1.10", True),
        ("8.8.8.8", True),
        ("127.0.0.1", False),
        ("0.0.0.0", False),
        ("169.254.1.1", False),
        ("1.042.75.75", False),
    ],
)
def test_which_dotted_quads_are_addresses(candidate: str, reported: bool) -> None:
    assert gate._address_finding(candidate) is reported


def test_an_address_at_the_end_of_a_sentence_is_still_an_address(tmp_path: Path) -> None:
    """Found by planting, not by reading. The first draft refused any trailing dot.

    `<p>Running at the deployment, or 198.51.100.4.</p>` was planted into a real built
    page and reported by nothing, because the full stop closing the sentence looked to the
    pattern like a fifth octet beginning. A trailing dot is part of the number only when a
    digit follows it.
    """
    (tmp_path / "index.html").write_text(
        "<html><body><p>Running there, or 198.51.100.4.</p></body></html>", encoding="utf-8"
    )
    assert {matched for _, _, _, matched, _ in gate.scan(tmp_path, [])} == {"198.51.100.4"}


def test_decimal_runs_in_minified_code_are_not_addresses(tmp_path: Path) -> None:
    """Both of these are in today's build, and both used to be reported.

    `POSIX.2 2.8.3.2` is a clause number in a comment in the theme's vendored tokenizer.
    `1.7.75.75` is `1.7 .75 .75` inside SVG path data in a CSS data URI. Neither is an
    address; both are preceded by a space, and nothing introduces them as a value.
    """
    (tmp_path / "theme.js").write_text(
        "// first in the list. -- POSIX.2 2.8.3.2\nconst host = '198.51.100.4';\n",
        encoding="utf-8",
    )
    (tmp_path / "theme.css").write_text(
        "a{mask-image:url('data:image/svg+xml,<path d=\"M1-.75.75h-2.5a.75.75 "
        "0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05\"/>')}",
        encoding="utf-8",
    )
    reported = {matched for _, _, _, matched, _ in gate.scan(tmp_path, [])}
    assert reported == {"198.51.100.4"}, reported
