"""The deployment scripts run on an interpreter with nothing installed, and must say so.

`deploy/README.md` states what a destination needs, and the list is short:

    A destination needs a container runtime and a Python interpreter, and nothing else from
    this project. ... Python 3.11 or later on the path, for the configuration checks and the
    environment renderer. They use the standard library only, so no virtual environment is
    required to bring the stack up.

That is a real design property rather than a preference: the droplet is provisioned with
Docker and a system Python, and `scripts/up.sh` runs five of these modules before the first
container starts. A third-party import anywhere in that path turns a documented prerequisite
into a false one, and the failure lands as a traceback at the first step of a bring-up.

Which is what happened. `validate_config.py` deferred `import jsonschema` into a function and
fell back to a built-in validator when it was absent — the property held, deliberately and
with a comment saying why. But the registry helper beside it imported `referencing` with no
guard at all, and jsonschema below 4.18 carried its own resolver and did not depend on it. So
an interpreter could satisfy the guard and die on the line after it:

    == Checking the configuration for destination 'local'
    ModuleNotFoundError: No module named 'referencing'
    error: the destination's configuration is not valid; nothing was started

Every bring-up in the capture workflow ended there, eight seconds in, and the job went on to
photograph a bare client instead of a running stack.

This test asks the property of the whole directory rather than of the module that broke it.
An import is acceptable if it names the standard library, a sibling module in `deploy/lib`,
or if it sits inside a `try` that catches `ImportError` — the third being how a module may
use a package when it is there and still work when it is not.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
LIB = REPOSITORY_ROOT / "deploy" / "lib"

# Modules that are siblings rather than dependencies: `deploy/lib` is put on the path by the
# scripts that run it, so its members import each other by bare name.
SIBLINGS = frozenset(path.stem for path in LIB.glob("*.py"))


def _modules() -> list[Path]:
    found = sorted(LIB.glob("*.py"))
    assert found, f"no modules under {LIB}; this test would pass over an empty set"
    return found


def _guarded_import_lines(tree: ast.AST) -> set[int]:
    """Line numbers of every import sitting inside a `try` that catches ImportError."""
    guarded: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Try):
            continue
        catches = any(
            handler.type is not None
            and any(
                name.id == "ImportError"
                for name in ast.walk(handler.type)
                if isinstance(name, ast.Name)
            )
            for handler in node.handlers
        )
        if not catches:
            continue
        for statement in node.body:
            for inner in ast.walk(statement):
                if isinstance(inner, (ast.Import, ast.ImportFrom)):
                    guarded.add(inner.lineno)
    return guarded


def _imported_roots(tree: ast.AST) -> list[tuple[str, int]]:
    """Every imported top-level module name, with the line it is imported on."""
    roots: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.extend((alias.name.split(".")[0], node.lineno) for alias in node.names)
        # A relative import names no module of its own, so `node.module` is skipped for it.
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            roots.append((node.module.split(".")[0], node.lineno))
    return roots


def test_no_deployment_module_needs_a_package_the_destination_does_not_have() -> None:
    findings: list[str] = []
    for module in _modules():
        tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
        guarded = _guarded_import_lines(tree)
        for root, line in _imported_roots(tree):
            if root in sys.stdlib_module_names or root in SIBLINGS or root == "__future__":
                continue
            if line in guarded:
                continue
            findings.append(
                f"deploy/lib/{module.name}:{line} imports {root!r}, which is neither the "
                "standard library nor a sibling, and is not inside a try that catches "
                "ImportError. deploy/README.md promises a destination needs no virtual "
                "environment, and scripts/up.sh runs this before the first container starts"
            )
    assert not findings, "\n".join(findings)


def test_the_guarded_imports_are_still_guarded_together() -> None:
    """The specific pair, named so that separating them again is a test failure.

    jsonschema and referencing are one capability. Guarding only the first is what made the
    fallback answer a narrower question than the one being asked, and the two must be
    reached by the same `try` for the fallback to mean what it says.
    """
    module = LIB / "validate_config.py"
    tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
    guarded = _guarded_import_lines(tree)
    unguarded = sorted(
        f"{root} (line {line})"
        for root, line in _imported_roots(tree)
        if root in {"jsonschema", "referencing"} and line not in guarded
    )
    assert not unguarded, (
        "these are reachable without an ImportError guard in validate_config.py: "
        + ", ".join(unguarded)
        + ". A destination with only one of the two is a real configuration — jsonschema "
        "below 4.18 does not depend on referencing — and it must fall back, not crash"
    )
