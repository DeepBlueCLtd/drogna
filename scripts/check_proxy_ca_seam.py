#!/usr/bin/env python3
"""Gate: every network-reaching build step takes the ``proxy_ca`` secret.

The deployment is meant to build inside an ephemeral agent session (SRD NFR-06), where the
package index is reached through a proxy that terminates TLS with a certificate authority
the base images do not know. Each image definition therefore mounts an optional build
secret named ``proxy_ca``, and ``deploy/README.md`` says how to name the bundle.

The seam is only worth as much as its coverage, and coverage is what went wrong. It was
written at the step in each image that *looks* like a fetch, and two steps that also reach
the network were left outside it: ``apk add`` in the proxy image, which is the first thing
that image does, so that image could never be built behind such a proxy at all; and
``pip install ./libs/harness_core`` in the query image, which looks like a local copy and
is not — pip resolves a build backend from the index before it can build a local package.
Both were found one at a time, each after a full rebuild, each looking like a fresh
problem. This gate is what finds them together, and it was watched reporting exactly those
two against the tree as it stood before they were fixed.

Scanned, when the gate is run with no arguments: ``deploy/images/``. A step that genuinely
must not take the secret is marked inline with ``# harness:allow-proxy-ca-seam <reason>``
on the line above it, and appears in the exemption inventory like any other. There are none
today.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Iterable, Iterator, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import (
    REPO_ROOT,
    Finding,
    exempted,
    iter_files,
    marker_index,
    read_text,
    run_gate,
)

GATE = "proxy-ca-seam"

DOCKERFILE_SUFFIXES = (".Dockerfile",)

# Where the image definitions live. Given explicit paths the gate scans those instead,
# which is how its own test points it at a planted violation.
IMAGE_PATHS = (Path("deploy") / "images",)

# The package managers these images actually use. Narrow on purpose: this gate is about
# fetching from an index, not about every command that could in principle open a socket.
FETCHES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("apk add", re.compile(r"\bapk\s+add\b")),
    ("apt-get", re.compile(r"\bapt-get\s+(install|update)\b")),
    ("pip install", re.compile(r"\bpip\s+install\b")),
    ("uv sync", re.compile(r"\buv\s+sync\b")),
    ("uv pip", re.compile(r"\buv\s+pip\s+install\b")),
    ("pnpm install", re.compile(r"\bpnpm\s+(install|add)\b")),
    ("npm install", re.compile(r"\bnpm\s+(install|ci|i)\b")),
)

SECRET = re.compile(r"--mount=type=secret,id=proxy_ca\b")

RUN_START = re.compile(r"^\s*RUN\s")

MESSAGE = (
    "a build step that reaches the package index without mounting the proxy_ca secret; "
    "behind a TLS-terminating egress proxy this cannot fetch and the image cannot be "
    "built, which is the environment the deployment is meant to build in (SRD NFR-06). "
    "See 'Building behind a TLS-terminating proxy' in deploy/README.md"
)


def _run_instructions(text: str) -> Iterator[tuple[int, str]]:
    """Yield (first line number, whole instruction) for every RUN, continuations joined.

    A RUN is one instruction however many lines it is written over, and the secret mount
    sits on the first of them while the fetch sits on the last. Reading line by line would
    report every seam in the repository as a violation and miss every real one.
    """
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        if not RUN_START.match(lines[index]):
            index += 1
            continue
        start = index
        collected = [lines[index]]
        while collected[-1].rstrip().endswith("\\") and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
        yield start + 1, "\n".join(collected)
        index += 1


def check(paths: Sequence[Path], root: Path = REPO_ROOT) -> Iterable[Finding]:
    targets = list(paths)
    if targets == [root.resolve()] or targets == [root]:
        targets = [root / directory for directory in IMAGE_PATHS]
    for path in iter_files(targets, gate=GATE, suffixes=DOCKERFILE_SUFFIXES, root=root):
        text = read_text(path)
        index = marker_index(path, text)
        for number, instruction in _run_instructions(text):
            if SECRET.search(instruction):
                continue
            for label, pattern in FETCHES:
                if pattern.search(instruction) is None:
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
