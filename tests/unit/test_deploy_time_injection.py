"""What the render puts into the rendered tree that the tracked tree deliberately lacks.

Two injections ride the same seam as the broker secrets (``deploy/lib/render_credentials
.py``), and each exists because a value must reach the running deployment without ever
reaching the repository's history.

**The destination's real hostname** (PR-01: the demonstration is public but unadvertised).
The tracked configuration carries a placeholder — whatever the destination's own
``deployment.json`` names as ``tls.hostname`` — and the render substitutes the real name
into every string value of every rendered document. A destination that names no
placeholder is untouched by construction, which is what keeps the local destination out of
this entirely.

**The capture clearance** (issue #34, link 6). The page is served through the proxy behind
its clearance, so every capture mechanism needs the credential to load the page at all.
The tracked capture document carries the reader identity and an empty secret, exactly as
the tracked broker URLs carry a role and no password; the render fills the secret from the
same generated value the proxy's credential file is written from, so the two halves of the
clearance cannot disagree.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import render_credentials  # noqa: E402
from destination import ConfigurationError  # noqa: E402

DESTINATION = "probe"

PLACEHOLDER = "drogna.invalid"
REAL = "drogna.example.org"


def _root(tmp_path: Path, documents: dict[str, dict[str, object]]) -> Path:
    """A repository-shaped tree carrying one destination's configuration."""
    source = tmp_path / "config" / DESTINATION
    source.mkdir(parents=True)
    for name, document in documents.items():
        (source / name).write_text(json.dumps(document) + "\n", encoding="utf-8")
    return tmp_path


def _rendered(root: Path, name: str) -> dict[str, object]:
    rendered = render_credentials.rendered_dir(DESTINATION, root) / name
    return json.loads(rendered.read_text(encoding="utf-8"))


# --- the hostname ------------------------------------------------------------------------


def _hostname_tree(tmp_path: Path, placeholder: str) -> Path:
    return _root(
        tmp_path,
        {
            "deployment.json": {
                "tls": {"terminate": bool(placeholder), "hostname": placeholder},
                "public_url": {"scheme": "https", "host": placeholder or "localhost"},
            },
            "client.json": {
                "clock": {"endpoint": f"https://{PLACEHOLDER}"},
                "query": {
                    "endpoint": f"https://{PLACEHOLDER}",
                    "names": [f"wss://{PLACEHOLDER}/ctl"],
                },
            },
        },
    )


def test_the_real_hostname_reaches_every_string_of_every_rendered_document(
    tmp_path: Path,
) -> None:
    root = _hostname_tree(tmp_path, PLACEHOLDER)

    render_credentials.render_destination(
        DESTINATION, {render_credentials.PUBLIC_HOSTNAME: REAL}, root
    )

    client = _rendered(root, "client.json")
    assert client["clock"]["endpoint"] == f"https://{REAL}"
    assert client["query"]["endpoint"] == f"https://{REAL}"
    assert client["query"]["names"] == [f"wss://{REAL}/ctl"]
    deployment = _rendered(root, "deployment.json")
    assert deployment["tls"]["hostname"] == REAL
    assert deployment["public_url"]["host"] == REAL


def test_the_tracked_tree_never_learns_the_real_hostname(tmp_path: Path) -> None:
    """PR-01's half of the bargain: the repository keeps the placeholder, for ever."""
    root = _hostname_tree(tmp_path, PLACEHOLDER)
    tracked = root / "config" / DESTINATION / "client.json"
    before = tracked.read_text(encoding="utf-8")

    render_credentials.render_destination(
        DESTINATION, {render_credentials.PUBLIC_HOSTNAME: REAL}, root
    )

    assert tracked.read_text(encoding="utf-8") == before
    assert REAL not in before


def test_no_hostname_means_the_placeholder_stands(tmp_path: Path) -> None:
    """Empty is a value: a rehearsal bring-up renders the tracked shape unchanged."""
    root = _hostname_tree(tmp_path, PLACEHOLDER)

    render_credentials.render_destination(DESTINATION, {}, root)

    assert _rendered(root, "client.json")["clock"]["endpoint"] == f"https://{PLACEHOLDER}"


def test_a_destination_with_no_placeholder_is_untouched_by_construction(
    tmp_path: Path,
) -> None:
    """The local destination names no hostname, so nothing is substituted whatever the
    environment says — even where a URL happens to carry the other destination's
    placeholder, because the placeholder is this destination's own declaration."""
    root = _hostname_tree(tmp_path, "")

    render_credentials.render_destination(
        DESTINATION, {render_credentials.PUBLIC_HOSTNAME: REAL}, root
    )

    assert _rendered(root, "client.json")["clock"]["endpoint"] == f"https://{PLACEHOLDER}"


# --- the capture clearance ---------------------------------------------------------------


def _capture_tree(tmp_path: Path) -> Path:
    return _root(
        tmp_path,
        {
            "capture.json": {
                "client": {
                    "url": "http://127.0.0.1:8081",
                    "credentials": {"user": "drogna_reader", "secret": ""},
                }
            },
            "clock.json": {"client": {"note": "no credentials shape, left alone"}},
        },
    )


def test_the_capture_secret_is_filled_from_the_proxy_secret(tmp_path: Path) -> None:
    root = _capture_tree(tmp_path)

    render_credentials.render_destination(
        DESTINATION, {render_credentials.PROXY_SECRET: "generated-value"}, root
    )

    rendered = _rendered(root, "capture.json")
    assert rendered["client"]["credentials"]["secret"] == "generated-value"
    tracked = json.loads(
        (root / "config" / DESTINATION / "capture.json").read_text(encoding="utf-8")
    )
    assert tracked["client"]["credentials"]["secret"] == ""


def test_a_missing_proxy_secret_stops_the_render_rather_than_rendering_no_clearance(
    tmp_path: Path,
) -> None:
    root = _capture_tree(tmp_path)

    with pytest.raises(ConfigurationError) as refusal:
        render_credentials.render_destination(DESTINATION, {}, root)

    assert render_credentials.PROXY_SECRET in str(refusal.value)


def test_a_document_without_the_credentials_shape_is_left_alone(tmp_path: Path) -> None:
    root = _capture_tree(tmp_path)

    render_credentials.render_destination(
        DESTINATION, {render_credentials.PROXY_SECRET: "generated-value"}, root
    )

    assert _rendered(root, "clock.json") == {"client": {"note": "no credentials shape, left alone"}}
