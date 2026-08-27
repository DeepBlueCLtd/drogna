#!/usr/bin/env python3
"""Gate: no capture path waits on a fixed delay (016-visual-capture FR-019, SC-011).

Every wait in every capture mechanism is on an application readiness signal. A fixed sleep
is a host-clock dependency wearing a different hat, and it fails in three ways of ascending
unpleasantness: it makes a fast machine wait for nothing, it makes a slow machine fail, and
on a machine that is slow only sometimes it succeeds by photographing a half-drawn page. The
third one is the reason this is a gate. Nothing fails; the picture is simply wrong, and
nobody notices until it is on a blog.

Scanned, when the gate is run with no arguments: ``client/e2e/`` and ``scripts/capture/``.
Deliberately narrow. This is not a general prohibition on ``setTimeout`` — a browser client
has legitimate uses for one — it is a rule about the two directories where a wait must be on
the application rather than on the clock. Test files inside those directories are scanned
like everything else: ``client/e2e/tests/`` and the ``.spec.ts`` files *are* the capture
paths, so exempting them by path would exempt exactly what needs checking.

A genuine exception is marked inline with ``# harness:allow-fixed-sleep <reason>`` and
appears in the exemption inventory like any other. There are none today.
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
    TYPESCRIPT_SUFFIXES,
    Finding,
    exempted,
    iter_files,
    marker_index,
    read_text,
    run_gate,
)

GATE = "fixed-sleep"

# The directories this gate is about. Given explicit paths it scans those instead, which is
# how its own test points it at a planted violation outside the repository walk.
CAPTURE_PATHS = (Path("client") / "e2e", Path("scripts") / "capture")

PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    # Playwright's own spelling. The one that would actually be reached for.
    ("waitForTimeout", re.compile(r"\bwaitForTimeout\s*\(")),
    # A promise that resolves on a timer is the same thing written out longhand.
    ("setTimeout", re.compile(r"\bsetTimeout\s*\(")),
    ("setInterval", re.compile(r"\bsetInterval\s*\(")),
    # A helper called sleep or delay is a sleep whatever it is implemented with.
    ("sleep", re.compile(r"\bsleep\s*\(")),
    ("delay", re.compile(r"\bdelay\s*\(")),
    ("time.sleep", re.compile(r"\btime\s*\.\s*sleep\s*\(")),
    # Shelling out for one.
    ("shell sleep", re.compile(r"""["'`]\s*sleep\s+\d""")),
)

MESSAGE = (
    "a fixed delay in a capture path; every wait must be on the client's readiness "
    "signal, because a sleep passes on a fast machine, fails on a slow one, and on an "
    "occasionally slow one succeeds by photographing a half-drawn page (FR-019)"
)


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    targets = list(paths)
    if targets == [root.resolve()] or targets == [root]:
        targets = [root / directory for directory in CAPTURE_PATHS]
    suffixes = TYPESCRIPT_SUFFIXES + PYTHON_SUFFIXES
    for path in iter_files(targets, gate=GATE, suffixes=suffixes, root=root):
        text = read_text(path)
        index = marker_index(path, text)
        for number, line in enumerate(text.splitlines(), start=1):
            for label, pattern in PATTERNS:
                match = pattern.search(line)
                if match is None:
                    continue
                allowed, marker = exempted(index, number, GATE)
                if allowed:
                    continue
                message = MESSAGE
                if marker is not None and not marker.has_reason:
                    message = "exemption marker carries no reason, so it exempts nothing"
                yield Finding(path, number, GATE, label, message)


if __name__ == "__main__":
    raise SystemExit(run_gate(GATE, check))
