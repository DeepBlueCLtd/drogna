"""Every host the served configuration names must exist wherever it is served.

nginx resolves a literal host in ``proxy_pass`` when it starts, not when a request
arrives, and it refuses to start if the name does not resolve. That makes an upstream
nobody thought about into a boundary that never comes up at all — and the symptom is not
"the control location is broken", it is every request failing, because there is no server
listening.

That is what happened. ``tests/support/proxy_boundary.py`` settles the document it renders
so the query upstream points at its stub, and for a long time it settled only that one.
The control-namespace location still named the broker, which has no container on the
fixture's network, so nginx died before serving anything and all thirty-four cases in the
request matrix failed with the boundary never answering.

These tests need no container. They read what the renderer produces and check a property
of it, which is the level at which this fault was always visible.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from proxy.render_config import render_from_document  # noqa: E402

_PROXY_PASS_HOST = re.compile(r"proxy_pass\s+https?://([^/:;\s]+)")

STUB = "stub-upstream"
PAGE_STUB = "stub-page"


def _document() -> dict[str, Any]:
    path = REPOSITORY_ROOT / "config" / "local" / "proxy.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _settled_as_the_fixture_settles_it() -> dict[str, Any]:
    """The same repointing tests/support/proxy_boundary.py performs, kept in step.

    Two stubs since the one-door change: the page goes to its own, so the matrix can tell
    "the page's server answered it" from "the query layer saw it", and everything else —
    the clock included — goes to the recording stub.
    """
    settled = _document()
    for name, upstream in settled["proxy"]["upstream"].items():
        if isinstance(upstream, dict) and "url" in upstream:
            behind = PAGE_STUB if name == "page" else STUB
            upstream["url"] = f"http://{behind}:8080"
    settled["proxy"]["credentials"]["file"] = "/etc/drogna/proxy.htpasswd"
    settled["proxy"]["tls"]["enabled"] = False
    settled["proxy"]["listen"]["port"] = 8080
    return settled


def test_every_declared_upstream_carries_a_url() -> None:
    """The loop in the fixture settles what declares a url; this says what that covers."""
    upstreams = _document()["proxy"]["upstream"]
    assert upstreams, "the proxy declares no upstream at all"
    without = sorted(
        name
        for name, upstream in upstreams.items()
        if not (isinstance(upstream, dict) and "url" in upstream)
    )
    assert not without, (
        f"upstream(s) {without} declare no 'url', so the fixture cannot repoint them and "
        "whatever host they do name will have to resolve on the fixture's network"
    )


def test_settling_the_upstreams_leaves_no_other_host_named() -> None:
    """The property that was violated: after settling, only the stubs are named.

    Another host here is a host that must exist on the fixture's network, and the
    fixture's network carries exactly the proxy and its two stubs.
    """
    rendered = render_from_document(_settled_as_the_fixture_settles_it())
    hosts = sorted(set(_PROXY_PASS_HOST.findall(rendered)))
    assert hosts == sorted([PAGE_STUB, STUB]), (
        f"the rendered configuration proxies to {hosts}. Every one of those must resolve "
        "when nginx starts or it will not start at all; only the two stubs exist on the "
        "fixture's network."
    )


def test_the_unsettled_document_names_a_host_the_fixture_would_not_have() -> None:
    """Proof the check above is not vacuous.

    If the deployment's own configuration named only one upstream host, the assertion
    above would pass no matter what the fixture did. It names more than one, so settling
    is doing real work and the test is testing it.
    """
    rendered = render_from_document(_document())
    hosts = sorted(set(_PROXY_PASS_HOST.findall(rendered)))
    assert len(hosts) > 1, (
        "the deployment configuration now names a single upstream host, so "
        "test_settling_the_upstreams_leaves_no_other_host_named no longer proves anything. "
        f"Hosts found: {hosts}"
    )
