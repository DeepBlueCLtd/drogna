"""The service-dependency gate, run against planted couplings and against a clean tree.

The rule is that a package under ``services/`` may not depend on another package under
``services/``: a component other components are built on is a library wearing a C-number.
A gate for that is easy to write and easy to leave passing for the wrong reason — the
services set could come out empty, the dependency names could stop matching, the import
scan could stop finding imports — and all three failures look exactly like a clean
repository. So each of the gate's two halves is watched catching something.

**The tree is built here rather than found.** Unlike the file-at-a-time gates, this one
reasons about a *set* of packages: which distributions are services is decided by what is
under the services root it is given. So the fixtures are two package manifests and a module,
assembled into a miniature ``services/`` tree in a temporary directory, and the gate is
pointed at that. The gate's default — the repository's own ``services/`` — is exercised
separately by the last test.

Fixtures keep the ``.fixture`` suffix and live under ``scripts/tests/fixtures/``, which is
in the shared exclusion list, for the usual two reasons: a planted violation must not fail
the real gate run, and the exempted fixture must not appear in the repository's exemption
inventory as though somebody had argued for it.

A separate file from ``test_gates_fail.py`` on purpose: that one is shared, several agents
work on this tree at once, and a gate's own tests are the last thing that should be lost to
a merge.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "gates"
GATE = SCRIPTS / "check_service_dependencies.py"


def plant(tmp_path: Path, borrower: str, *, module: str | None = None) -> Path:
    """Build a two-package services tree: a lender, and a borrower reaching for it."""
    services = tmp_path / "services"
    lender = services / "lender" / "src" / "probe_lender"
    lender.mkdir(parents=True)
    (lender / "__init__.py").write_text("", encoding="utf-8")
    (lender / "evaluator.py").write_text("class Evaluator: ...\n", encoding="utf-8")
    shutil.copyfile(
        FIXTURES / "service_dependency_lender.toml.fixture",
        services / "lender" / "pyproject.toml",
    )

    package = services / "borrower" / "src" / "probe_borrower"
    package.mkdir(parents=True)
    (package / "__init__.py").write_text("", encoding="utf-8")
    shutil.copyfile(FIXTURES / f"{borrower}.fixture", services / "borrower" / "pyproject.toml")
    if module is not None:
        shutil.copyfile(FIXTURES / f"{module}.fixture", package / "field.py")
    return services


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
    )


def test_a_declared_dependency_on_another_service_is_reported(tmp_path: Path) -> None:
    services = plant(tmp_path, "service_dependency_violation.toml")

    result = run(str(services))

    assert result.returncode != 0, "the gate passed a service that depends on another service"
    assert "probe-lender" in result.stdout
    assert "borrower depends on lender" in result.stdout


def test_an_import_across_services_that_nothing_declares_is_reported(tmp_path: Path) -> None:
    """The worse half: the coupling is real and no manifest records it."""
    services = plant(
        tmp_path,
        "service_dependency_clean.toml",
        module="service_dependency_undeclared_import.py",
    )

    result = run(str(services))

    assert result.returncode != 0, "the gate passed an undeclared import across a service boundary"
    assert "declares no dependency" in result.stdout
    assert "field.py" in result.stdout


def test_a_service_depending_only_on_libraries_is_permitted(tmp_path: Path) -> None:
    """A gate that fails correct code is worse than no gate: it teaches people to ignore it."""
    services = plant(tmp_path, "service_dependency_clean.toml")

    result = run(str(services))

    assert result.returncode == 0, f"{result.stdout}{result.stderr}"


def test_an_exemption_with_a_reason_is_honoured(tmp_path: Path) -> None:
    services = plant(tmp_path, "service_dependency_exempt_with_reason.toml")

    result = run(str(services))

    assert result.returncode == 0, (
        f"an argued coupling was rejected:\n{result.stdout}{result.stderr}"
    )


def test_an_exemption_without_a_reason_exempts_nothing(tmp_path: Path) -> None:
    """The marker is a place to record why, not a way to switch the gate off."""
    services = plant(tmp_path, "service_dependency_exempt_bare.toml")

    result = run(str(services))

    assert result.returncode != 0, "a bare marker silently disabled the gate"
    assert "no reason" in result.stdout


def test_a_declared_dependency_is_reported_once(tmp_path: Path) -> None:
    """One coupling, one finding, one place to put one marker.

    A borrower that both declares the dependency and imports it must not be reported twice:
    two findings would ask for two markers to record one decision, and the second marker
    would have nowhere natural to live.
    """
    services = plant(
        tmp_path,
        "service_dependency_violation.toml",
        module="service_dependency_undeclared_import.py",
    )

    result = run(str(services))

    findings = [line for line in result.stdout.splitlines() if "[service-dependency]" in line]
    assert len(findings) == 1, f"expected one finding, got:\n{result.stdout}"
    assert "pyproject.toml" in findings[0]


def test_the_repository_services_are_clean() -> None:
    """The rule over the real tree, which is what the gate is registered for."""
    result = run()

    assert result.returncode == 0, f"{result.stdout}{result.stderr}"
    assert "clean" in result.stdout
