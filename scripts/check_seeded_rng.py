#!/usr/bin/env python3
"""Gate: no unseeded randomness anywhere (Constitution II, FR-11).

Every stochastic choice in drogna comes from the run's root seed, through
``harness_core.rng.rng_for(stream)``. A module-level generator, a global one, or an
identifier drawn from entropy makes a run unreproducible, and — worse — makes it
unreproducible without saying so.

Flagged: the free functions of ``random`` and ``numpy.random``; constructing a generator
directly (``random.Random(...)``, ``numpy.random.default_rng(...)``), because even a
seeded one bypasses the port and so is absent from the manifest; entropy sources
(``os.urandom``, ``secrets``); and entropy-derived identifiers (``uuid.uuid1``,
``uuid.uuid4``). In TypeScript, ``Math.random`` and ``crypto.getRandomValues``. In SQL,
``random()`` and the UUID generators.

The one declared exemption zone is ``harness_core.rng`` itself, which is where the
derivation rule lives and therefore the one place a generator may be constructed.
"""

from __future__ import annotations

import ast
import re
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import (
    PYTHON_SUFFIXES,
    REPO_ROOT,
    SQL_SUFFIXES,
    TYPESCRIPT_SUFFIXES,
    Finding,
    exempted,
    iter_files,
    marker_index,
    read_text,
    run_gate,
)

GATE = "seeded-rng"

REQUIRED_ROUTE = "harness_core.rng.rng_for"

# The module that owns the derivation rule, and so the only place a generator is built.
DECLARED_ZONE = "libs/harness_core/src/harness_core/rng.py"

PROHIBITED_PREFIXES: tuple[str, ...] = (
    "random.",
    "numpy.random.",
    "np.random.",
    "secrets.",
)

PROHIBITED_CALLS: frozenset[str] = frozenset(
    {
        "os.urandom",
        "uuid.uuid1",
        "uuid.uuid4",
        "uuid4",
        "uuid1",
        "numpy.random.default_rng",
        "numpy.random.Generator",
        "numpy.random.RandomState",
        "numpy.random.SeedSequence",
        "random.Random",
        "random.SystemRandom",
    }
)

TYPESCRIPT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Math.random", re.compile(r"\bMath\s*\.\s*random\s*\(")),
    ("crypto.getRandomValues", re.compile(r"\bcrypto\s*\.\s*getRandomValues\s*\(")),
    ("crypto.randomUUID", re.compile(r"\bcrypto\s*\.\s*randomUUID\s*\(")),
    ("uuidv4", re.compile(r"\buuidv4\s*\(")),
)

SQL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("random()", re.compile(r"\brandom\s*\(\s*\)", re.IGNORECASE)),
    ("gen_random_uuid()", re.compile(r"\bgen_random_uuid\s*\(", re.IGNORECASE)),
    ("uuid_generate_v4()", re.compile(r"\buuid_generate_v4\s*\(", re.IGNORECASE)),
)

MESSAGE = (
    f"unseeded or unregistered randomness; draw from {REQUIRED_ROUTE}(stream), "
    "which derives from the run's root seed and appears in the manifest"
)
IDENTIFIER_MESSAGE = (
    "identifier drawn from entropy; derive it from seed and logical position with "
    "harness_core.rng.identifier_for or uuid_for"
)


def dotted_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return ""


def import_aliases(tree: ast.Module) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                aliases[alias.asname or alias.name] = alias.name
        elif isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                aliases[alias.asname or alias.name] = f"{node.module}.{alias.name}"
    return aliases


def resolve(name: str, aliases: dict[str, str]) -> str:
    if not name:
        return name
    head, _, tail = name.partition(".")
    origin = aliases.get(head)
    if origin is None:
        return name
    return f"{origin}.{tail}" if tail else origin


def is_prohibited(name: str) -> bool:
    if name in PROHIBITED_CALLS:
        return True
    return any(name.startswith(prefix) for prefix in PROHIBITED_PREFIXES)


def in_declared_zone(path: Path, root: Path) -> bool:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix() == DECLARED_ZONE
    except ValueError:
        return False


def check_python(path: Path, text: str) -> Iterable[Finding]:
    try:
        tree = ast.parse(text)
    except SyntaxError as error:
        yield Finding(path, error.lineno or 1, GATE, "<unparsable>", f"cannot be parsed: {error}")
        return

    aliases = import_aliases(tree)
    index = marker_index(path, text)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        spelling = dotted_name(node.func)
        resolved = resolve(spelling, aliases)
        if not (is_prohibited(resolved) or is_prohibited(spelling)):
            continue
        allowed, marker = exempted(index, node.lineno, GATE)
        if allowed:
            continue
        message = IDENTIFIER_MESSAGE if "uuid" in resolved.lower() else MESSAGE
        if marker is not None and not marker.has_reason:
            message = "exemption marker carries no reason, so it exempts nothing"
        yield Finding(path, node.lineno, GATE, f"{spelling}()", message)


def check_patterns(
    path: Path, text: str, patterns: Sequence[tuple[str, re.Pattern[str]]]
) -> Iterable[Finding]:
    index = marker_index(path, text)
    for number, line in enumerate(text.splitlines(), start=1):
        for label, pattern in patterns:
            if not pattern.search(line):
                continue
            allowed, marker = exempted(index, number, GATE)
            if allowed:
                continue
            message = IDENTIFIER_MESSAGE if "uuid" in label.lower() else MESSAGE
            if marker is not None and not marker.has_reason:
                message = "exemption marker carries no reason, so it exempts nothing"
            yield Finding(path, number, GATE, label, message)


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    suffixes = PYTHON_SUFFIXES + TYPESCRIPT_SUFFIXES + SQL_SUFFIXES
    for path in iter_files(paths, gate=GATE, suffixes=suffixes, root=root):
        if in_declared_zone(path, root):
            continue
        text = read_text(path)
        if path.suffix in PYTHON_SUFFIXES:
            yield from check_python(path, text)
        elif path.suffix in TYPESCRIPT_SUFFIXES:
            yield from check_patterns(path, text, TYPESCRIPT_PATTERNS)
        else:
            yield from check_patterns(path, text, SQL_PATTERNS)


if __name__ == "__main__":
    raise SystemExit(run_gate(GATE, check))
