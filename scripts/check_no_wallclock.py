#!/usr/bin/env python3
"""Gate: no component reads time from the operating system (Constitution I, FR-09).

Deterministic replay dies the moment one component reads the host clock, and it dies
quietly — nothing fails, the numbers are simply not the same twice. That is why this is
a gate and not a review note.

Python is checked by syntax tree, so an aliased import (``from time import time as t``)
is caught along with the obvious spelling. TypeScript and SQL are checked by pattern.

Permitted, per Constitution I as amended by ADR-0006 and ADR-0007:

- the clock service's own real-time driver;
- heartbeat emission and liveness evaluation, which answer "is this process alive?", a
  question about the host and not about the simulated world;
- interpolation between received clock samples in the client's render path;
- log line decoration and process-level metrics;
- test harness setup.

The first three are marked inline with ``# harness:allow-wallclock <reason>`` and appear
in the exemption inventory. Test files are recognised by path. Log decoration through the
logging module involves no call for this gate to see; a component that reaches for the
clock to build a log line marks it like anything else.
"""

from __future__ import annotations

import ast
import re
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import (  # noqa: E402
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

GATE = "wallclock"

# Dotted names whose call reads a host clock.
PROHIBITED_CALLS: frozenset[str] = frozenset(
    {
        "time.time",
        "time.time_ns",
        "time.monotonic",
        "time.monotonic_ns",
        "time.perf_counter",
        "time.perf_counter_ns",
        "time.process_time",
        "time.process_time_ns",
        "time.localtime",
        "time.gmtime",
        "time.ctime",
        "time.asctime",
        "datetime.now",
        "datetime.utcnow",
        "datetime.today",
        "datetime.datetime.now",
        "datetime.datetime.utcnow",
        "datetime.datetime.today",
        "date.today",
        "datetime.date.today",
        "pandas.Timestamp.now",
        "numpy.datetime64",
    }
)

PROHIBITED_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Date.now", re.compile(r"\bDate\s*\.\s*now\s*\(")),
    ("new Date()", re.compile(r"\bnew\s+Date\s*\(\s*\)")),
    ("performance.now", re.compile(r"\bperformance\s*\.\s*now\s*\(")),
    ("Date.getTime", re.compile(r"\bnew\s+Date\s*\(\s*\)\s*\.\s*getTime")),
)

SQL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("now()", re.compile(r"\bnow\s*\(\s*\)", re.IGNORECASE)),
    ("current_timestamp", re.compile(r"\bcurrent_timestamp\b", re.IGNORECASE)),
    ("current_date", re.compile(r"\bcurrent_date\b", re.IGNORECASE)),
    ("current_time", re.compile(r"\bcurrent_time\b", re.IGNORECASE)),
    ("localtimestamp", re.compile(r"\blocaltimestamp\b", re.IGNORECASE)),
    ("clock_timestamp()", re.compile(r"\bclock_timestamp\s*\(", re.IGNORECASE)),
    ("statement_timestamp()", re.compile(r"\bstatement_timestamp\s*\(", re.IGNORECASE)),
    ("transaction_timestamp()", re.compile(r"\btransaction_timestamp\s*\(", re.IGNORECASE)),
)

MESSAGE = (
    "reads the host clock; simulation time comes from harness_core.clock.Clock, "
    "which is a subscriber to ctl/clock"
)


def dotted_name(node: ast.AST) -> str:
    """The dotted spelling of an attribute or name expression, or an empty string."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return ""


def import_aliases(tree: ast.Module) -> dict[str, str]:
    """Map local names to their origin, so an aliased import is still recognised."""
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
    """Rewrite a dotted call through the file's imports."""
    if not name:
        return name
    head, _, tail = name.partition(".")
    origin = aliases.get(head)
    if origin is None:
        return name
    return f"{origin}.{tail}" if tail else origin


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
        if resolved not in PROHIBITED_CALLS and spelling not in PROHIBITED_CALLS:
            continue
        allowed, marker = exempted(index, node.lineno, GATE)
        if allowed:
            continue
        message = MESSAGE
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
            message = MESSAGE
            if marker is not None and not marker.has_reason:
                message = "exemption marker carries no reason, so it exempts nothing"
            yield Finding(path, number, GATE, label, message)


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    suffixes = PYTHON_SUFFIXES + TYPESCRIPT_SUFFIXES + SQL_SUFFIXES
    for path in iter_files(paths, gate=GATE, suffixes=suffixes, root=root):
        if is_test_path(path):
            continue  # test harness setup is a permitted zone (Constitution I)
        text = read_text(path)
        if path.suffix in PYTHON_SUFFIXES:
            yield from check_python(path, text)
        elif path.suffix in TYPESCRIPT_SUFFIXES:
            yield from check_patterns(path, text, PROHIBITED_PATTERNS)
        else:
            yield from check_patterns(path, text, SQL_PATTERNS)


if __name__ == "__main__":
    raise SystemExit(run_gate(GATE, check))
