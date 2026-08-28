"""The rendered configuration directory keeps its identity when it is rendered again.

Every container in the deployment bind-mounts ``deploy/.runtime/config/<destination>`` at
its configuration directory, and ``scripts/run_local.sh`` renders that directory twice:
``up.sh`` renders it and starts the containers, and ``seed.sh`` renders it again. A bind
mount resolves to an inode rather than to a path, so a renderer that removes the directory
and makes a new one leaves every running container holding the old, unlinked one — which it
sees as empty.

That is what it did. On a stack brought up by the repository's own one command, the clock,
query and proxy containers each saw zero files in a directory that held nineteen on the
host, and the only container that saw them was the one that had been restarted afterwards
for an unrelated reason. Only the clock ever reported it, because its health check re-reads
its document on every probe; everything else had read its own at start-up and went on
reporting healthy against a directory that was no longer there.

It is invisible on macOS, where Docker Desktop shares a bind mount by path through a VM, so
the containers follow the replacement. This is the third fault in this repository that is
certain on Linux and unobservable on a developer's machine.

**The assertion holds an open directory descriptor across the second render**, because that
is what a bind mount is: a handle to a directory, not a path resolved afresh on each access.
The first version of this test compared the directory's inode number before and after, and
passed against the unfixed renderer — the kernel had simply handed the freed inode straight
back to the ``mkdir``. An inode number is not an identity once it has been released, and a
test that cannot fail on the defect it was written for is worth nothing.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import render_credentials  # noqa: E402

DESTINATION = "probe"


def _root(tmp_path: Path, documents: dict[str, dict[str, object]]) -> Path:
    """A repository-shaped tree carrying one destination's configuration."""
    source = tmp_path / "config" / DESTINATION
    source.mkdir(parents=True)
    for name, document in documents.items():
        (source / name).write_text(json.dumps(document) + "\n", encoding="utf-8")
    return tmp_path


def test_a_second_render_keeps_the_directory_a_container_is_mounting(tmp_path: Path) -> None:
    root = _root(tmp_path, {"clock.json": {"component": {"id": "clock"}}})

    rendered = render_credentials.render_destination(DESTINATION, {}, root=root)

    # The container's view, modelled honestly: a handle opened before the second render and
    # read after it. This is what a running container holds — not a path it looks up again.
    held = os.open(rendered, os.O_RDONLY)
    try:
        render_credentials.render_destination(DESTINATION, {}, root=root)
        through_the_mount = sorted(os.listdir(held))
    finally:
        os.close(held)

    assert through_the_mount == ["clock.json"], (
        "a container that mounted the rendered configuration directory before it was "
        f"rendered a second time now sees {through_the_mount}. Every container in the "
        "deployment bind-mounts this directory and scripts/run_local.sh renders it twice, "
        "so removing and recreating it leaves the whole stack running against a "
        "configuration directory that is no longer there — which only the clock's health "
        "check, alone in re-reading its document, ever reports"
    )


def test_a_second_render_still_clears_what_the_first_one_left(tmp_path: Path) -> None:
    """Keeping the directory must not turn the render into an append.

    Without this, the assertion above could be satisfied by never removing anything, and a
    document deleted from a destination would go on being served to the containers.
    """
    root = _root(tmp_path, {"clock.json": {"component": {"id": "clock"}}})
    rendered = render_credentials.render_destination(DESTINATION, {}, root=root)

    stale = rendered / "withdrawn.json"
    stale.write_text("{}\n", encoding="utf-8")
    (rendered / "leftovers").mkdir()

    render_credentials.render_destination(DESTINATION, {}, root=root)

    assert not stale.exists(), "a document the destination no longer declares survived a render"
    assert not (rendered / "leftovers").exists(), "a directory left behind survived a render"
    assert (rendered / "clock.json").exists(), (
        "the render did not write the destination's own document"
    )
