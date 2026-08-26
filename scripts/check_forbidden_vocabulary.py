#!/usr/bin/env python3
"""Gate: no tracked-entity vocabulary in drogna's code or contracts (Constitution V).

drogna holds environmental measurements, forecast fields, uncertainty fields, sampling
recommendations and system telemetry. Nothing else. The data model admits no tracked
entity, contact, detection or track, and the vocabulary is policed because vocabulary is
how a data model acquires one by accident: a field named ``contact_id`` is a tracked
entity whatever the commentary says.

What is scanned: code, contracts, configuration and tests — the places where a data model
lives. What is not: the specifications, the SRD, the ADRs and the constitution itself,
which necessarily discuss the prohibition in order to state it. That exclusion is
declared with the others in ``_gate_lib``.

The word list carries no customer or project name. Constitution V forbids such a name
appearing anywhere in the repository, and a gate that listed them would itself be the
violation. Customer vocabulary is caught by review, and by the fact that nothing in
drogna has a customer in it.

A word that has an ordinary English use as well as a prohibited one — "tracks" as a verb,
"tracked" in the version-control sense — is handled by :data:`PERMITTED_PHRASES`, in one
place, rather than by markers scattered through the tree. Anything else genuine is marked
inline with ``# harness:allow-forbidden-vocabulary <reason>``.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import (
    PYTHON_SUFFIXES,
    REPO_ROOT,
    SQL_SUFFIXES,
    TEXT_SUFFIXES,
    TYPESCRIPT_SUFFIXES,
    Finding,
    exempted,
    iter_files,
    marker_index,
    read_text,
    run_gate,
)

GATE = "forbidden-vocabulary"

FORBIDDEN: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("tracked entity", re.compile(r"\btracked\s+entit(?:y|ies)\b", re.IGNORECASE)),
    ("track", re.compile(r"\btracks?\b", re.IGNORECASE)),
    ("tracking", re.compile(r"\btracking\b", re.IGNORECASE)),
    ("tracklet", re.compile(r"\btracklets?\b", re.IGNORECASE)),
    ("contact", re.compile(r"\bcontacts?\b", re.IGNORECASE)),
    ("detection", re.compile(r"\bdetections?\b", re.IGNORECASE)),
)

# Ordinary English and version-control usage that happens to share a word with the
# prohibition. Declared here, in one place, so the list can be read and argued with.
PERMITTED_PHRASES: tuple[re.Pattern[str], ...] = (
    re.compile(r"\btracked\s+(?:file|files|in git|template|source)\b", re.IGNORECASE),
    re.compile(r"\b(?:git-)?tracked\b(?=[^.]*\bgit\b)", re.IGNORECASE),
    re.compile(r"\bis\s+tracked\s+and\b", re.IGNORECASE),
    re.compile(r"\btracks?\s+the\s+local\s+decorrelation\s+timescale\b", re.IGNORECASE),
    re.compile(r"\bcomplexity\s+tracking\b", re.IGNORECASE),
    re.compile(r"\bsampling\s+track\b", re.IGNORECASE),
    re.compile(r"\bnot\s+a\s+track\b", re.IGNORECASE),
    re.compile(r"\bno\s+(?:entity|tracked\s+entity)[^.]*\btracks?\b", re.IGNORECASE),
)

MESSAGE = (
    "tracked-entity vocabulary; drogna holds measurements, fields, recommendations and "
    "telemetry, and nothing that is or implies a track (Constitution V)"
)


def permitted(line: str) -> bool:
    return any(pattern.search(line) for pattern in PERMITTED_PHRASES)


def check_file(path: Path, text: str) -> Iterable[Finding]:
    index = marker_index(path, text)
    for number, line in enumerate(text.splitlines(), start=1):
        if permitted(line):
            continue
        for label, pattern in FORBIDDEN:
            match = pattern.search(line)
            if match is None:
                continue
            allowed, marker = exempted(index, number, GATE)
            if allowed:
                continue
            message = MESSAGE
            if marker is not None and not marker.has_reason:
                message = "exemption marker carries no reason, so it exempts nothing"
            yield Finding(path, number, GATE, f"{label}: {match.group(0)!r}", message)
            break


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    suffixes = PYTHON_SUFFIXES + TYPESCRIPT_SUFFIXES + SQL_SUFFIXES + TEXT_SUFFIXES
    for path in iter_files(paths, gate=GATE, suffixes=suffixes, root=root):
        yield from check_file(path, read_text(path))


if __name__ == "__main__":
    raise SystemExit(run_gate(GATE, check))
