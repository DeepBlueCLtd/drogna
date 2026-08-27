"""Every tracked broker URL names the role it authenticates as.

`deploy/broker/mosquitto.conf` sets `allow_anonymous false`, so a client that presents no
identity is refused. `deploy/broker/README.md` states the contract that follows:

    Components receive their credentials in the broker URL their configuration carries —
    `mqtt://<role>:<secret>@<host>:<port>`. The tracked configuration files carry the role
    and no secret; the render supplies the secret.

The database side of the tree already obeys it — `postgresql://drogna_ingest@observations`
carries the role and no password — and the broker side did not. All twenty-eight tracked
broker URLs read `mqtt://broker:1883`, naming neither. Nothing noticed, because the
integration tests that would have are container-backed and skip wherever there is no
container runtime, and because a URL with no role is a well-formed URL.

This was a ratchet in the shape `tests/unit/test_mount_coherence.py` used before it, and
it reached zero on the day it was written, so it is a gate now. The list below is empty and
the tests below are the whole of what holds it there.

The three that were outstanding were settled by looking rather than deciding. The feature
store opens no broker connection — `provision.py` mentions it nowhere and its schema does
not require one — so its section was vestigial. The query layer does open one, publishing a
heartbeat and subscribing to nothing, so it has a role of its own with a single write rule
(ADR-0015's shape, not `drogna_control`'s). And `common.json` turned out to be read by one
caller for one field: nothing merges it into anything, so the broker section it carried was
a default that could never have applied (ADR-0018).

What this test does not check, because it is not true yet: that a secret ever reaches the
URL. Producing `passwd` at deploy time is reported in `deploy/broker/README.md` as work
feature 007 did not own and feature 005 never did, and ADR-0016 records where that stands.
A role with no secret still cannot authenticate. Naming the role is the half that makes the
render's job well defined, and the half a test can hold.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_ROOT = REPO_ROOT / "config"

# The roles `deploy/broker/acl` defines. A URL naming anything else is a URL naming a role
# the broker will refuse, which is worse than naming none: it looks settled.
ROLES = frozenset(
    {
        "drogna_sensor",
        "drogna_ingest",
        "drogna_control",
        "drogna_viewer",
        "drogna_query",
    }
)

# Components whose broker URL still names no role, and why. Shrinking this list is the
# work; adding to it fails the test.
OUTSTANDING: dict[str, str] = {}


def _broker_urls() -> dict[tuple[str, str], str]:
    """Every (destination, component) that names a broker, and the URL it names."""
    found: dict[tuple[str, str], str] = {}
    for destination in sorted(p.name for p in CONFIG_ROOT.iterdir() if p.is_dir()):
        for path in sorted((CONFIG_ROOT / destination).glob("*.json")):
            document = json.loads(path.read_text(encoding="utf-8"))
            url = document.get("broker", {}).get("url")
            if url:
                found[(destination, path.stem)] = url
    return found


def test_every_broker_url_names_a_role_or_is_a_listed_exception() -> None:
    unnamed = sorted(
        f"{destination}/{component}"
        for (destination, component), url in _broker_urls().items()
        if urlparse(url).username is None and component not in OUTSTANDING
    )
    assert not unnamed, (
        "these broker URLs name no role, and the broker refuses anonymous clients: "
        + ", ".join(unnamed)
        + ". Add the role the component authenticates as, as deploy/broker/README.md "
        "describes and as the database DSNs in the same files already do, or add it to "
        "OUTSTANDING with the reason it cannot be settled yet"
    )


def test_no_url_names_a_role_the_access_control_list_does_not_define() -> None:
    wrong = sorted(
        f"{destination}/{component}={urlparse(url).username}"
        for (destination, component), url in _broker_urls().items()
        if urlparse(url).username is not None and urlparse(url).username not in ROLES
    )
    assert not wrong, (
        "these broker URLs name a role deploy/broker/acl does not define, so the broker "
        "would refuse them: " + ", ".join(wrong)
    )


def test_no_tracked_url_carries_a_secret() -> None:
    """The role is tracked; the secret never is. This is the half that must not regress."""
    leaked = sorted(
        f"{destination}/{component}"
        for (destination, component), url in _broker_urls().items()
        if urlparse(url).password is not None
    )
    assert not leaked, (
        "these tracked broker URLs carry a password: "
        + ", ".join(leaked)
        + ". The render supplies the secret at deploy time and it appears in no tracked file"
    )


def test_the_outstanding_list_is_shrinking_and_every_entry_carries_a_reason() -> None:
    """A list nobody had to justify justifies nothing, and one that grows is not a ratchet."""
    urls = _broker_urls()
    components = {component for _, component in urls}
    stale = sorted(set(OUTSTANDING) - components)
    assert not stale, (
        "OUTSTANDING names components with no broker configuration: "
        + ", ".join(stale)
        + ". An exception for something that no longer exists hides the next one"
    )
    unreasoned = sorted(name for name, reason in OUTSTANDING.items() if not reason.strip())
    assert not unreasoned, "no reason recorded for: " + ", ".join(unreasoned)

    still_unnamed = {
        component for (_, component), url in urls.items() if urlparse(url).username is None
    }
    settled = sorted(set(OUTSTANDING) - still_unnamed)
    assert not settled, (
        "these are listed as outstanding but now name a role: "
        + ", ".join(settled)
        + ". Remove them from OUTSTANDING; the ratchet only turns one way"
    )
