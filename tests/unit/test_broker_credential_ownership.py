"""The broker's password file is given to the broker, and the README says to whom.

Producing this file needs a container runtime or a host mosquitto, so the test that proves
it works is an integration test that skips where there is neither — and CLAUDE.md names the
trap: a container-backed test that skips locally is untested until CI says otherwise.

What needs no runtime is whether the code and the document still agree. `deploy/broker/
README.md` has carried the recipe since the broker was written:

    chown 1883:1883 /work/passwd && chmod 0600 /work/passwd

and it says why both halves are there — the broker reads its password file after dropping
to its own unprivileged user, so a file it does not own is a file it cannot open, and
`allow_anonymous false` then stops it dead. Only the chmod half was ever implemented:

    broker-1  | Error: Unable to open pwfile "/mosquitto/config/passwd".

with exit 13, which is EACCES. It passed on macOS for as long as it only ran there, because
a Docker Desktop bind mount enforces neither owner nor mode.

The uid and the pair of operations are both read out of the README rather than repeated, so
the code and the document cannot drift apart without this failing.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import render_credentials  # noqa: E402

README = REPOSITORY_ROOT / "deploy" / "broker" / "README.md"
SOURCE = REPOSITORY_ROOT / "deploy" / "lib" / "render_credentials.py"


def _documented_owner() -> str:
    """The owner the README's recipe gives the file, taken from the recipe itself."""
    match = re.search(r"chown\s+(\d+:\d+)\s", README.read_text(encoding="utf-8"))
    assert match, (
        f"{README.name} no longer contains a `chown <uid>:<gid>` line. It is the only "
        "statement of the user the broker drops to, and the renderer is written against it"
    )
    return match.group(1)


def test_the_renderer_gives_the_file_the_ownership_the_readme_documents() -> None:
    configured = f"{render_credentials.BROKER_UID}:{render_credentials.BROKER_GID}"
    assert _documented_owner() == configured, (
        "render_credentials and deploy/broker/README.md disagree about the user the broker "
        "runs as. The broker cannot read a file it does not own, and says so by exiting 13 "
        "at startup, which is several layers away from this line"
    )


def test_the_renderer_sets_the_owner_and_not_only_the_mode() -> None:
    """The half that was missing, asserted as a pair rather than as two separate facts.

    Setting the mode without the owner is not a partial success: 0600 belonging to the wrong
    user is strictly worse than leaving the file alone, because the mode is the part that
    locks the broker out.
    """
    source = SOURCE.read_text(encoding="utf-8")
    assert re.search(r"chown \{BROKER_UID\}:\{BROKER_GID\} \{seen_at\} && chmod 0600", source), (
        "render_credentials no longer gives the password file its owner and its mode in one "
        "step. deploy/broker/README.md: 'Create the file with its final owner and mode "
        "inside the container, and do not touch it from the host afterwards'"
    )
    assert "os.chown(target, BROKER_UID, BROKER_GID)" in source, (
        "the host route must set the owner too; it is the one taken where there is no "
        "container runtime, and the mode alone is what caused this"
    )
