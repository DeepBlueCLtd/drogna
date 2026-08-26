#!/usr/bin/env python3
"""Gate: no literal path, host, port or URL in component source (Constitution IV, NFR-04).

Every component reads exactly one environment variable, ``HARNESS_CONFIG``, naming its
configuration file, and everything about where things are comes from that file. A literal
smuggled into source is how local and droplet quietly diverge, and it is invisible until
the day it matters.

Flagged, in component source: strings that look like URLs, absolute or relative
filesystem paths, host-and-port pairs, bare IP addresses, or filenames with a
recognisable extension; and any environment variable read other than ``HARNESS_CONFIG``.

Not scanned, because none of it is component source: the gates themselves, tests, the
per-destination configuration values under ``config/``, and deployment definitions —
which are the places whose whole job is to name locations. The exclusions are declared in
``_gate_lib`` with the rest.

A genuine exception — a resource shipped inside a package, say — is marked inline with
``# harness:allow-literal-path <reason>`` and appears in the exemption inventory.
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
    is_test_path,
    iter_files,
    marker_index,
    read_text,
    run_gate,
)

GATE = "literal-path"

CONFIG_VARIABLE = "HARNESS_CONFIG"

LITERAL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("url", re.compile(r"^[a-z][a-z0-9+.\-]*://\S")),
    ("absolute path", re.compile(r"^(?:/[^/\s]+)+/?$")),
    ("relative path", re.compile(r"^(?:~|\.{1,2})/\S+$")),
    ("windows path", re.compile(r"^[A-Za-z]:\\\\?\S+$")),
    ("host and port", re.compile(r"^[a-z0-9][a-z0-9.\-]*:\d{2,5}(?:/\S*)?$", re.IGNORECASE)),
    ("ip address", re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")),
    (
        "filename",
        re.compile(
            r"^[\w.\-]+\.(?:nc|nc4|zarr|json|ya?ml|sql|db|sqlite|conf|cfg|ini|env|pem|key|"
            r"crt|sock|log|csv|toml|xml|html|txt)$",
            re.IGNORECASE,
        ),
    ),
)

MESSAGE = (
    "literal location in component source; it belongs in the component's config file, "
    f"named by {CONFIG_VARIABLE}"
)
ENVIRONMENT_MESSAGE = (
    f"reads an environment variable other than {CONFIG_VARIABLE}; no other variable "
    "carries operational meaning (NFR-04)"
)


def classify(value: str) -> str | None:
    """Return what kind of location this string looks like, or ``None``."""
    candidate = value.strip()
    if len(candidate) < 4 or " " in candidate or "\n" in candidate:
        return None
    for label, pattern in LITERAL_PATTERNS:
        if pattern.search(candidate):
            return label
    return None


def docstring_nodes(tree: ast.Module) -> set[int]:
    """Constant nodes that are docstrings, which are prose and not locations."""
    identifiers: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        body = getattr(node, "body", [])
        if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
            identifiers.add(id(body[0].value))
    return identifiers


def dotted_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return ""


def _literal(node: ast.AST) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def environment_reads(tree: ast.Module) -> Iterable[tuple[int, str]]:
    """Yield (line, variable) for every environment read that is not HARNESS_CONFIG."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Subscript):
            if dotted_name(node.value) in {"os.environ", "environ"}:
                name = _literal(node.slice)
                if name is not None and name != CONFIG_VARIABLE:
                    yield node.lineno, name
        elif isinstance(node, ast.Call):
            spelling = dotted_name(node.func)
            if spelling in {"os.getenv", "getenv", "os.environ.get", "environ.get"} and node.args:
                name = _literal(node.args[0])
                if name is not None and name != CONFIG_VARIABLE:
                    yield node.lineno, name


def check_python(path: Path, text: str) -> Iterable[Finding]:
    try:
        tree = ast.parse(text)
    except SyntaxError as error:
        yield Finding(path, error.lineno or 1, GATE, "<unparsable>", f"cannot be parsed: {error}")
        return

    index = marker_index(path, text)
    prose = docstring_nodes(tree)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        if id(node) in prose:
            continue
        label = classify(node.value)
        if label is None:
            continue
        allowed, marker = exempted(index, node.lineno, GATE)
        if allowed:
            continue
        message = MESSAGE
        if marker is not None and not marker.has_reason:
            message = "exemption marker carries no reason, so it exempts nothing"
        yield Finding(path, node.lineno, GATE, f"{label} {node.value!r}", message)

    for line, variable in environment_reads(tree):
        allowed, marker = exempted(index, line, GATE)
        if allowed:
            continue
        yield Finding(path, line, GATE, f"environment {variable!r}", ENVIRONMENT_MESSAGE)


_STRING_LITERAL = re.compile(r"""(['"`])(?P<value>(?:\\.|(?!\1).)*)\1""")
_MODULE_SPECIFIER = re.compile(r"^\s*(?:import\b|export\b.*\bfrom\b|.*\brequire\s*\()")


def check_text(path: Path, text: str) -> Iterable[Finding]:
    """Pattern scan for TypeScript and SQL, over string literals rather than whole lines."""
    index = marker_index(path, text)
    for number, line in enumerate(text.splitlines(), start=1):
        if _MODULE_SPECIFIER.match(line):
            continue  # a module specifier is a name in the build graph, not a location
        for match in _STRING_LITERAL.finditer(line):
            value = match.group("value")
            label = classify(value)
            if label is None:
                continue
            allowed, marker = exempted(index, number, GATE)
            if allowed:
                continue
            message = MESSAGE
            if marker is not None and not marker.has_reason:
                message = "exemption marker carries no reason, so it exempts nothing"
            yield Finding(path, number, GATE, f"{label} {value!r}", message)


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    suffixes = PYTHON_SUFFIXES + TYPESCRIPT_SUFFIXES + SQL_SUFFIXES
    for path in iter_files(paths, gate=GATE, suffixes=suffixes, root=root):
        if is_test_path(path):
            continue  # a test names its own fixtures; it is not component source
        text = read_text(path)
        if path.suffix in PYTHON_SUFFIXES:
            yield from check_python(path, text)
        else:
            yield from check_text(path, text)


if __name__ == "__main__":
    raise SystemExit(run_gate(GATE, check))
