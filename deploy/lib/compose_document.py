"""A small, dependency-free reader for the Compose file this feature owns.

The deployment path must work on a freshly provisioned host carrying a container runtime
and nothing else, so nothing here may depend on a YAML library being installed. The reader
understands only the shape of `deploy/compose.yaml` — two-space indentation, no tabs, no
flow mappings at the top two levels — which is a shape this feature writes and a test
enforces. Anything more ambitious belongs to `docker compose config`, which is what the run
scripts use once a runtime is present.
"""

from __future__ import annotations

import re
from pathlib import Path

_TOP_LEVEL_KEY = re.compile(r"^([A-Za-z0-9_.-]+):\s*(.*)$")
_SECOND_LEVEL_KEY = re.compile(r"^  ([A-Za-z0-9][A-Za-z0-9_.-]*):\s*(.*)$")


def _is_ignorable(line: str) -> bool:
    return not line.strip() or line.lstrip().startswith("#")


def top_level_blocks(text: str) -> dict[str, str]:
    """Every top-level key of the document, mapped to the raw text beneath it."""
    blocks: dict[str, str] = {}
    current: str | None = None
    collected: list[str] = []
    for line in text.splitlines():
        match = _TOP_LEVEL_KEY.match(line) if not _is_ignorable(line) else None
        if match:
            if current is not None:
                blocks[current] = "\n".join(collected)
            current = match.group(1)
            collected = []
            continue
        if current is not None:
            collected.append(line)
    if current is not None:
        blocks[current] = "\n".join(collected)
    return blocks


def service_blocks(text: str) -> dict[str, str]:
    """Every service in the file, mapped to the raw text of its definition."""
    services = top_level_blocks(text).get("services", "")
    blocks: dict[str, str] = {}
    current: str | None = None
    collected: list[str] = []
    for line in services.splitlines():
        match = _SECOND_LEVEL_KEY.match(line) if not _is_ignorable(line) else None
        if match:
            if current is not None:
                blocks[current] = "\n".join(collected)
            current = match.group(1)
            collected = []
            continue
        if current is not None:
            collected.append(line)
    if current is not None:
        blocks[current] = "\n".join(collected)
    return blocks


def service_names(text: str) -> list[str]:
    return sorted(service_blocks(text))


def volume_names(text: str) -> list[str]:
    """Every named volume the file declares."""
    volumes = top_level_blocks(text).get("volumes", "")
    names = []
    for line in volumes.splitlines():
        if _is_ignorable(line):
            continue
        match = _SECOND_LEVEL_KEY.match(line)
        if match:
            names.append(match.group(1))
    return sorted(names)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")
