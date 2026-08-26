"""Shared machinery for drogna's constitution gates.

A gate walks a set of files, reports findings with file, line, expression and rule id,
and exits non-zero if there are any. Four gates use this: the wall-clock gate
(Principle I), the seeded-RNG gate (Principle II), the literal-path gate (Principle IV)
and the forbidden-vocabulary gate (Principle V).

Three things live here rather than in the gates, so that adding a gate later does not
mean editing the ones that exist.

**One exclusion list.** Generated code, throwaway spikes and the gates' own violation
fixtures are declared once, in :data:`SHARED_EXCLUSIONS`. Where a single gate needs more
than that, its extra exclusions are declared beside the others in :data:`GATE_EXCLUSIONS`
rather than scattered through the tree.

**Exemption markers.** An exemption is an inline comment, ``harness:allow-<gate>
<reason>``, on the offending line or the line above it. A marker without a reason is
itself a violation: an exemption nobody had to justify is an exemption nobody reviewed.
Python markers are read from comment tokens, not from raw text, so a marker quoted inside
a docstring is prose and not permission.

**The inventory.** Every marker in the repository, with file, line, gate and reason, in
one list a reviewer reads in one place.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import tokenize
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import TypeAlias

REPO_ROOT = Path(__file__).resolve().parent.parent

EXIT_CLEAN = 0
EXIT_VIOLATIONS = 1
EXIT_USAGE = 2

PYTHON_SUFFIXES = (".py",)
TYPESCRIPT_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
SQL_SUFFIXES = (".sql",)
TEXT_SUFFIXES = (".md", ".json", ".yaml", ".yml", ".toml", ".sh", ".cfg", ".ini")

# Directories that are never scanned by anything: version control, dependency trees,
# build output, caches.
NEVER_SCANNED = frozenset(
    {
        ".git",
        ".venv",
        "venv",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".ruff_cache",
        ".mypy_cache",
        "dist",
        "build",
        ".pnpm-store",
    }
)

# The single exclusion list Constitution III and IV ask for: generated code, throwaway
# investigations, and the deliberate violations the gates are tested against.
SHARED_EXCLUSIONS: tuple[str, ...] = (
    "libs/harness_types",
    "client/src/generated",
    "spikes",
    "scripts/tests/fixtures",
)

# Extra exclusions, per gate, declared here rather than in the gates so that the whole
# picture is in one place.
GATE_EXCLUSIONS: dict[str, tuple[str, ...]] = {
    # The gates themselves name the constructs they hunt for. Scanning build-time tooling
    # for deployment locations or forbidden nouns finds the hunter, not the quarry.
    "wallclock": (),
    "seeded-rng": ("scripts",),
    "literal-path": ("scripts", "tests", "config", "deploy"),
    # Documents that discuss the prohibition necessarily use the words. Code, contracts
    # and configuration are where the data model lives, and that is what is scanned.
    "forbidden-vocabulary": (
        "scripts",
        "specs",
        "docs",
        ".specify",
        "harness-srd.md",
        "README.md",
    ),
}

GateFunction: TypeAlias = Callable[[Sequence[Path], Path], Iterable["Finding"]]

MARKER_PATTERN = re.compile(r"harness:allow-(?P<gate>[a-z0-9][a-z0-9-]*)(?P<reason>.*)$")
_COMMENT_PREFIXES = ("#", "//", "--", "/*", "*")


@dataclass(frozen=True)
class Finding:
    """One violation: where it is, what it says, and which rule caught it."""

    path: Path
    line: int
    rule: str
    expression: str
    message: str

    def render(self, root: Path = REPO_ROOT) -> str:
        try:
            location = self.path.relative_to(root)
        except ValueError:
            location = self.path
        return f"{location}:{self.line}: [{self.rule}] {self.expression} — {self.message}"


@dataclass(frozen=True)
class Marker:
    """An inline exemption: which gate, what reason, and where."""

    path: Path
    line: int
    gate: str
    reason: str

    @property
    def has_reason(self) -> bool:
        return bool(self.reason.strip())

    def render(self, root: Path = REPO_ROOT) -> str:
        try:
            location = self.path.relative_to(root)
        except ValueError:
            location = self.path
        reason = self.reason.strip() or "NO REASON GIVEN"
        return f"{location}:{self.line}: harness:allow-{self.gate} — {reason}"


def is_excluded(path: Path, gate: str, root: Path = REPO_ROOT) -> bool:
    """Whether ``path`` is outside what ``gate`` scans."""
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    if any(part in NEVER_SCANNED for part in relative.parts):
        return True
    prefixes = SHARED_EXCLUSIONS + GATE_EXCLUSIONS.get(gate, ())
    text = relative.as_posix()
    return any(text == prefix or text.startswith(prefix + "/") for prefix in prefixes)


def is_test_path(path: Path) -> bool:
    """Whether this file is test scaffolding.

    Constitution I permits test harness setup to read a host clock, and this is how the
    gate recognises it. It is deliberately a path rule and not an intent rule: a gate
    cannot read intent, and a permitted zone that is hard to describe is a permitted zone
    that will be abused.
    """
    parts = path.as_posix().split("/")
    if "tests" in parts or "test" in parts:
        return True
    name = path.name
    return name.startswith("test_") or name.endswith(("_test.py", ".test.ts", ".spec.ts"))


def iter_files(
    paths: Sequence[Path],
    *,
    gate: str,
    suffixes: Sequence[str],
    root: Path = REPO_ROOT,
) -> Iterator[Path]:
    """Yield the files a gate should scan.

    A file named explicitly on the command line is always scanned — that is how the gates'
    own tests point them at fixtures the repository-wide walk excludes. A directory is
    walked with the exclusions applied.
    """
    for entry in paths:
        if entry.is_file():
            if entry.suffix in suffixes:
                yield entry
            continue
        for candidate in sorted(entry.rglob("*")):
            if not candidate.is_file() or candidate.suffix not in suffixes:
                continue
            if is_excluded(candidate, gate, root):
                continue
            yield candidate


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _comment_bodies(path: Path, text: str) -> Iterator[tuple[int, str]]:
    """Yield (line, comment text) for every comment in the file.

    Python is tokenised, so a marker quoted inside a string or a docstring is not mistaken
    for permission. Other languages are read line by line, which is coarser but adequate:
    the marker has to appear in something that looks like a comment.
    """
    if path.suffix in PYTHON_SUFFIXES:
        try:
            tokens = tokenize.generate_tokens(io.StringIO(text).readline)
            for token in tokens:
                if token.type == tokenize.COMMENT:
                    yield token.start[0], token.string
            return
        except (tokenize.TokenError, IndentationError, SyntaxError):
            pass  # fall through to the line scan for a file that will not tokenise
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith(_COMMENT_PREFIXES):
            yield number, stripped
        elif "#" in line or "//" in line or "--" in line:
            yield number, line


def markers_in(path: Path, text: str | None = None) -> list[Marker]:
    """Every exemption marker in one file."""
    content = read_text(path) if text is None else text
    found: list[Marker] = []
    for number, comment in _comment_bodies(path, content):
        match = MARKER_PATTERN.search(comment)
        if match is None:
            continue
        found.append(
            Marker(
                path=path,
                line=number,
                gate=match.group("gate"),
                reason=match.group("reason").strip(" \t:,-*/"),
            )
        )
    return found


def marker_index(path: Path, text: str | None = None) -> dict[int, Marker]:
    """Markers by the line they cover: their own line and the line below."""
    index: dict[int, Marker] = {}
    for marker in markers_in(path, text):
        index.setdefault(marker.line, marker)
        index.setdefault(marker.line + 1, marker)
    return index


def exempted(
    index: dict[int, Marker], line: int, gate: str
) -> tuple[bool, Marker | None]:
    """Whether ``line`` carries a marker for ``gate``, and the marker if it does.

    A marker without a reason does not exempt anything. The gate reports it instead, which
    is the point: an exemption nobody had to justify is an exemption nobody reviewed.
    """
    marker = index.get(line)
    if marker is None or marker.gate != gate:
        return False, None
    return marker.has_reason, marker


def inventory(paths: Sequence[Path], root: Path = REPO_ROOT) -> list[Marker]:
    """Every exemption marker in the repository, for the reviewer's one list."""
    suffixes = PYTHON_SUFFIXES + TYPESCRIPT_SUFFIXES + SQL_SUFFIXES + TEXT_SUFFIXES
    found: list[Marker] = []
    for path in iter_files(paths, gate="inventory", suffixes=suffixes, root=root):
        found.extend(markers_in(path))
    return sorted(found, key=lambda marker: (marker.path.as_posix(), marker.line))


def render_inventory(markers: Iterable[Marker], root: Path = REPO_ROOT) -> str:
    lines = ["Exemption inventory:"]
    listed = list(markers)
    if not listed:
        lines.append("  (none)")
    lines.extend(f"  {marker.render(root)}" for marker in listed)
    return "\n".join(lines)


def parse_arguments(gate: str, argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=f"drogna {gate} gate")
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="files or directories to scan; the repository root by default",
    )
    parser.add_argument(
        "--inventory",
        action="store_true",
        help="print the exemption inventory as well as the findings",
    )
    return parser.parse_args(argv)


def run_gate(
    gate: str,
    check: GateFunction,
    argv: Sequence[str] | None = None,
    *,
    root: Path = REPO_ROOT,
    stream: object = None,
) -> int:
    """Run one gate over the given paths and return its exit code."""
    arguments = parse_arguments(gate, argv)
    out = stream or sys.stdout
    targets = [path.resolve() for path in arguments.paths] or [root]

    findings = sorted(check(targets, root), key=lambda item: (item.path.as_posix(), item.line))
    for finding in findings:
        print(finding.render(root), file=out)

    if arguments.inventory:
        print(render_inventory(inventory(targets, root), root), file=out)

    if findings:
        print(
            f"{gate}: {len(findings)} violation(s). "
            "Fix them, or mark a genuine exemption inline with a reason.",
            file=out,
        )
        return EXIT_VIOLATIONS
    print(f"{gate}: clean.", file=out)
    return EXIT_CLEAN


if __name__ == "__main__":  # pragma: no cover - convenience for the runner
    arguments = parse_arguments("inventory")
    targets = [path.resolve() for path in arguments.paths] or [REPO_ROOT]
    print(render_inventory(inventory(targets)))
    raise SystemExit(EXIT_CLEAN)
