"""What runs is decided by a profile. What is *shown as alive* is decided by heartbeats.

This is the constitutional hazard specific to this feature. Compose profiles are a
deployment mechanism; the moment the client consults one — or the Compose file, or the
generated environment file, or a configuration key naming a list of components — the display
has begun claiming that something exists because a file said so, which is precisely the
failure Constitution VII exists to prevent (SRD FR-45, FR-52).

The guard is tested against a fabricated offender as well as against the real client, so
that it still means something on the day `client/` exists.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

from destination import COMPOSE_FILENAME, ENV_FILENAME  # noqa: E402

# Reading any of these from the client would make the display configuration-driven.
FORBIDDEN_REFERENCES = (
    COMPOSE_FILENAME,
    # The bare name is too loose to match on: `import.meta.env` is not the environment file.
    f"deploy/{ENV_FILENAME}",
    "COMPOSE_PROFILES",
    "profiles.active",
    "deployment.json",
    "HARNESS_CONFIG_PATH_",
)

SOURCE_SUFFIXES = frozenset({".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css"})


def liveness_findings(client_dir: Path) -> list[str]:
    """Every place the client reads an artefact of the deployment."""
    findings: list[str] = []
    if not client_dir.is_dir():
        return findings
    for path in sorted(client_dir.rglob("*")):
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        if "generated" in path.parts or "node_modules" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for reference in FORBIDDEN_REFERENCES:
            if reference in text:
                findings.append(
                    f"{path}: reads '{reference}'. Illumination comes from heartbeats, "
                    f"never from a deployment artefact (Constitution VII)"
                )
    return findings


def test_the_guard_catches_a_client_that_reads_the_profile(tmp_path: Path) -> None:
    source = tmp_path / "src"
    source.mkdir(parents=True)
    (source / "layout.ts").write_text(
        "const live = import.meta.env.COMPOSE_PROFILES.split(',');\n", encoding="utf-8"
    )

    findings = liveness_findings(tmp_path)

    assert len(findings) == 1
    assert "COMPOSE_PROFILES" in findings[0]


def test_the_guard_passes_a_client_that_reads_heartbeats(tmp_path: Path) -> None:
    source = tmp_path / "src"
    source.mkdir(parents=True)
    (source / "layout.ts").write_text(
        "const live = heartbeats.within(component.livenessWindow);\n", encoding="utf-8"
    )

    assert liveness_findings(tmp_path) == []


def test_the_real_client_consults_no_deployment_artefact() -> None:
    """Vacuous while `client/` does not exist, and deliberately kept so that it stops being
    vacuous the moment 003-component-shell-client lands."""
    assert liveness_findings(REPOSITORY_ROOT / "client") == []


def test_no_profile_exists_whose_purpose_is_to_populate_a_display() -> None:
    """No demo mode, no fixture mode, no populate-for-the-screenshot path."""
    compose = (REPOSITORY_ROOT / "deploy" / COMPOSE_FILENAME).read_text(encoding="utf-8")
    for forbidden in ("demo", "fixture", "mock", "sample-data"):
        assert f"profiles: [{forbidden}" not in compose
        assert f", {forbidden}]" not in compose
