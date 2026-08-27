#!/usr/bin/env python3
"""Gate: no service package depends on another service package.

A component under ``services/`` is one of the harness's C-numbers. It owns a failure mode,
it runs as a process, and the thing that makes it a component rather than a module is that
nothing else in the repository is built on top of it. The moment one service imports
another, the imported one is a library wearing a component's name: it acquires consumers it
cannot see, its private details become somebody else's contract, and the C-number stops
describing what it is.

This is not hypothetical here. ``encode_netcdf`` sat in the environment generator until
three components wrote NetCDF, and ``read_netcdf`` sat in the divergence monitor until three
components read it; both were reached across a service boundary in the meantime, both are in
``harness_core`` now, and in both cases the pull towards a second copy in the third consumer
was real. The remedy each time was to move the shared shape into ``libs/``. This gate exists
so that the next one is noticed at the moment it is introduced rather than three consumers
later, when moving it has become somebody's whole afternoon.

**What is checked.** Each package directly under a services root — ``services/`` by default —
in two ways, because a dependency can be written down in one place and taken in another.

*Declared.* A ``project.dependencies`` entry naming another service package. The line
carrying it is reported.

*Taken but not declared.* An ``import`` or ``from ... import`` anywhere in a service package,
including its tests, whose root module is another service's import package, where that
service is **not** in this package's declared dependencies. That is the worse of the two: the
coupling exists, nothing records it, and it only works at all because the root workspace
installs every member. A dependency that *is* declared is reported once, as a declared one,
so a single coupling never produces two findings and a single exemption settles it.

**Libraries are not services.** ``libs/harness_core`` may be depended on by anything; that is
what it is for. Only packages under a services root count as services, and a service
depending on a library is the shape this gate is pushing work towards.

**Exemptions.** A coupling that is genuinely right is marked in the depending package's
``pyproject.toml``, on the dependency line or the line above it, with
``# harness:allow-service-dependency <reason>``, and appears in the exemption inventory like
any other. A marker without a reason exempts nothing. There are four today and each names
what it borrows: the planner and the sensors evaluate the environment through C-02's own
evaluator rather than reimplementing ADR-0002's blend, the model runner takes C-02's account
of what a stored field is, and telemetry reads the coverage store through C-11's read port
rather than growing a second one. Every one is a decision with a single author and no
library home yet, and the inventory is the list of them.
"""

from __future__ import annotations

import re
import sys
import tomllib
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import (
    PYTHON_SUFFIXES,
    REPO_ROOT,
    Finding,
    exempted,
    marker_index,
    read_text,
    run_gate,
)

GATE = "service-dependency"

# Where services live. Given explicit paths the gate reads those instead, which is how its
# own tests point it at a miniature services tree outside the repository.
SERVICES_ROOT = Path("services")

_REQUIREMENT_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*")
_IMPORT = re.compile(
    r"^\s*(?:from\s+(?P<from>[A-Za-z_][\w.]*)|import\s+(?P<import>[A-Za-z_][\w.]*))"
)


def normalise(name: str) -> str:
    """A distribution name as PEP 503 compares them: `harness_core` and `harness-core` are one."""
    return re.sub(r"[-_.]+", "-", name).lower()


@dataclass(frozen=True)
class ServicePackage:
    """One component: where it is, what it is called, and what it declares."""

    directory: Path
    manifest: Path
    distribution: str
    modules: tuple[str, ...]
    dependencies: tuple[str, ...]

    @property
    def name(self) -> str:
        return self.directory.name


def _modules_of(document: dict, distribution: str) -> tuple[str, ...]:
    """The import packages a distribution ships, from its wheel target."""
    wheel = document.get("tool", {}).get("hatch", {}).get("build", {}).get("targets", {})
    packages = wheel.get("wheel", {}).get("packages", [])
    modules = tuple(Path(entry).name for entry in packages)
    return modules or (distribution.replace("-", "_"),)


def read_package(manifest: Path) -> ServicePackage | None:
    """Read one package manifest, or nothing if it declares no project."""
    try:
        document = tomllib.loads(read_text(manifest))
    except tomllib.TOMLDecodeError:
        return None
    project = document.get("project")
    if not isinstance(project, dict) or "name" not in project:
        return None
    distribution = str(project["name"])
    dependencies = tuple(str(entry) for entry in project.get("dependencies", []))
    return ServicePackage(
        directory=manifest.parent,
        manifest=manifest,
        distribution=distribution,
        modules=_modules_of(document, distribution),
        dependencies=dependencies,
    )


def packages_under(services_root: Path) -> list[ServicePackage]:
    """Every service package directly under a services root, in a stable order."""
    if not services_root.is_dir():
        return []
    found: list[ServicePackage] = []
    for entry in sorted(services_root.iterdir()):
        manifest = entry / "pyproject.toml"
        if not manifest.is_file():
            continue
        package = read_package(manifest)
        if package is not None:
            found.append(package)
    return found


def _requirement_name(requirement: str) -> str:
    match = _REQUIREMENT_NAME.match(requirement.strip())
    return normalise(match.group(0)) if match else ""


def _line_of(text: str, requirement: str) -> int:
    """The line the dependency is written on, so the finding points at something editable."""
    needle = requirement.strip()
    for number, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            return number
    return 1


def _python_files(package: ServicePackage) -> Iterator[Path]:
    for candidate in sorted(package.directory.rglob("*")):
        if candidate.is_file() and candidate.suffix in PYTHON_SUFFIXES:
            if "__pycache__" in candidate.parts:
                continue
            yield candidate


def _imported_roots(text: str) -> Iterator[tuple[int, str]]:
    for number, line in enumerate(text.splitlines(), start=1):
        match = _IMPORT.match(line)
        if match is None:
            continue
        module = match.group("from") or match.group("import")
        yield number, module.split(".")[0]


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    targets = list(paths)
    if targets == [root.resolve()] or targets == [root]:
        targets = [root / SERVICES_ROOT]

    packages: list[ServicePackage] = []
    for services_root in targets:
        packages.extend(packages_under(services_root))

    by_distribution = {normalise(package.distribution): package for package in packages}
    by_module = {module: package for package in packages for module in package.modules}

    for package in packages:
        text = read_text(package.manifest)
        index = marker_index(package.manifest, text)
        declared = {_requirement_name(requirement) for requirement in package.dependencies}

        for requirement in package.dependencies:
            other = by_distribution.get(_requirement_name(requirement))
            if other is None or other.directory == package.directory:
                continue
            number = _line_of(text, requirement)
            allowed, marker = exempted(index, number, GATE)
            if allowed:
                continue
            message = (
                f"{package.name} depends on {other.name}, which is a service and not a "
                f"library: a component other components are built on is a library wearing a "
                f"C-number. Move the shared shape into libs/, or mark the coupling with a "
                f"reason"
            )
            if marker is not None and not marker.has_reason:
                message = "exemption marker carries no reason, so it exempts nothing"
            yield Finding(package.manifest, number, GATE, requirement.strip(), message)

        for path in _python_files(package):
            for number, module in _imported_roots(read_text(path)):
                other = by_module.get(module)
                if other is None or other.directory == package.directory:
                    continue
                if normalise(other.distribution) in declared:
                    # Declared, so the manifest line above is where this coupling is
                    # reported and where an exemption for it belongs. Reporting it twice
                    # would ask for two markers to record one decision.
                    continue
                yield Finding(
                    path,
                    number,
                    GATE,
                    module,
                    f"{package.name} imports {other.name}, another service, and declares no "
                    f"dependency on it: the coupling exists and nothing records it, and it "
                    f"resolves only because the workspace installs every member",
                )


if __name__ == "__main__":
    raise SystemExit(run_gate(GATE, check))
