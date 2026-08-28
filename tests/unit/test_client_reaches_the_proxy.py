"""The browser's control connection points at the proxy, not at the page's own server.

ADR-0008 decided that control messages reach the client by WebSocket upgrade at the
reverse proxy, so everything stays behind one access policy and the component count stays
at eighteen. Three documents have to agree for that to be true of a running destination:
the client's served configuration says where to connect, the destination's port map says
which host port each container is published on, and the proxy's own configuration says
which path it will upgrade.

Nothing checks that agreement at run time. The failure is a page that loads perfectly,
draws the whole layout, lights nothing and reports "not connected" — which is
indistinguishable, to a reader, from a system that is genuinely not running. That is the
same class of failure Constitution VII exists to prevent, arriving through a port number
instead of through a fixture.

This test lives here rather than beside the client because answering the question needs
the deployment's own artefacts, and ``test_profile_not_liveness`` forbids anything under
``client/`` from reading one. That prohibition is worth keeping blunt: a display must
never learn what exists from a deployment file. Reading the port map in order to check a
URL is a different thing from reading it in order to decide what is alive, and the way to
keep the difference visible is to keep the two in different directories.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DESTINATION = "local"


def _document(*parts: str) -> dict:
    return json.loads((REPOSITORY_ROOT.joinpath(*parts)).read_text(encoding="utf-8"))


def _published() -> dict:
    return _document("config", DESTINATION, "deployment.json")["network"]["publish"]


def test_the_client_connects_to_the_proxys_published_port() -> None:
    served = _document("client", "public", "config.json")
    published = _published()

    port = urlsplit(served["broker"]["url"]).port

    assert port == published["proxy"]["host_port"], (
        "the client's broker URL must name the port the proxy is published on; "
        "the page would otherwise try to upgrade against whatever is there instead"
    )


def test_the_client_does_not_connect_to_its_own_server() -> None:
    """The specific mistake this test exists for.

    The client and the proxy are both nginx and both listen on 8080 inside their
    containers, so the two are easy to confuse and the confusion is invisible until a
    browser tries to open the socket.
    """
    served = _document("client", "public", "config.json")
    published = _published()

    port = urlsplit(served["broker"]["url"]).port

    assert port != published["client"]["host_port"], (
        "the client's broker URL names the port the client itself is served on, so the "
        "page would be trying to upgrade against the server that served it"
    )


def test_the_client_uses_the_path_the_proxy_will_upgrade() -> None:
    served = _document("client", "public", "config.json")
    proxy = _document("config", DESTINATION, "proxy.json")["proxy"]

    path = urlsplit(served["broker"]["url"]).path

    assert path == proxy["control"]["upgrade_prefix"], (
        "ADR-0008 renders the upgrade as one exact location, not a subtree, so the "
        "client's path must equal the configured prefix rather than merely start with it"
    )


def test_the_client_reads_the_query_layer_at_its_own_origin() -> None:
    """One door: the page is served through the proxy, and its reads stay same-origin.

    An empty endpoint makes every query URL relative, so the request goes wherever the
    page came from — which is the proxy, the only server that serves the page — whatever
    host name the viewer arrived by. An absolute URL here broke the captures the day the
    page went behind the clearance: the capture loads the page by 127.0.0.1, the document
    named localhost, and the cross-origin request was refused at the boundary (a preflight
    carries no credential) before anything upstream was ever asked.
    """
    served = _document("client", "public", "config.json")

    assert served["query"]["endpoint"] == "", (
        "the query endpoint must be the page's own origin. Naming any absolute host makes "
        "the read cross-origin for a viewer who arrived by a different name for the same "
        "door, and the boundary refuses what a browser will not send credentials for"
    )


def test_the_clock_is_read_at_the_pages_own_origin_too() -> None:
    """FR-74's strand (ADR-0025): the clock is behind the same door, addressed the same way."""
    served = _document("client", "public", "config.json")

    assert served["clock"]["endpoint"] == ""
    assert served["clock"]["routes"]["snapshot"].startswith("/")


def test_the_clients_collection_path_is_a_released_prefix() -> None:
    """The client addresses collections under a prefix the proxy actually serves.

    This is the weakest of the five and the one to watch. The proxy releases a fixed list
    of collection identifiers beneath its released prefix, while a run announcement names
    the collections it published (SRD FR-31) — so a collection announced but not released
    has no location and cannot be read. That is deliberate on the proxy's side and it is
    a coordination this feature cannot settle on its own; what is asserted here is only
    that the prefix agrees.
    """
    served = _document("client", "public", "config.json")
    proxy = _document("config", DESTINATION, "proxy.json")["proxy"]

    assert served["query"]["collections_path"] == proxy["released"]["prefix"]
