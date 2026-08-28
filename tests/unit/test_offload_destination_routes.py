"""The packager and the stub destination name the same three routes. 014 T045.

Two configuration files describe one protocol from its two ends:
`offload.destination.routes` is what the packager sends to, and `archive.routes` is what
`deploy/archive/stub.py` serves. Nothing derives one from the other — they are separate
documents in separate components' sections, which is right, because a destination is not
obliged to be this one.

What follows from that is drift, and drift here is quiet. A renamed route gives a 404 the
packager reports as a transfer failure, at deploy time, on a path
`tests/integration/test_offload_destination_stub.py` exercises only where a container
runtime is reachable. This fails in a second, everywhere, and says which route moved.

The endpoint's port is checked for the same reason and is the sharper case: `offload.json`
carries `http://archive:8110` and `deployment.json` publishes the container port the stub
binds. Those are three spellings of one number in two files, and nothing but this compares
them.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

from destination import load_deployment  # noqa: E402

DESTINATIONS = ("local", "droplet")


def _document(destination: str, name: str) -> dict:
    path = REPOSITORY_ROOT / "config" / destination / name
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_both_ends_name_the_same_routes(destination: str) -> None:
    sends_to = _document(destination, "offload.json")["offload"]["destination"]["routes"]
    serves = _document(destination, "archive.json")["archive"]["routes"]

    assert sends_to == serves, (
        f"{destination}: the packager sends to {sends_to} and the stub serves {serves}. A "
        "route the destination does not recognise is a 404 the packager reports as a "
        "transfer failure"
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_packager_addresses_the_port_the_stub_binds(destination: str) -> None:
    endpoint = _document(destination, "offload.json")["offload"]["destination"]["endpoint"]
    stub = _document(destination, "archive.json")["archive"]

    assert urlparse(endpoint).port == stub["port"], (
        f"{destination}: the packager sends to port {urlparse(endpoint).port} and the stub "
        f"listens on {stub['port']}"
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_deployment_publishes_the_port_the_stub_binds(destination: str) -> None:
    """The container port in `deployment.json` is the one the program actually listens on.

    Without this the service comes up, reports healthy on whatever the deployment believes,
    and refuses every connection the packager makes.
    """
    published = load_deployment(destination, REPOSITORY_ROOT)["network"]["publish"]["archive"]
    stub = _document(destination, "archive.json")["archive"]

    assert published["container_port"] == stub["port"], (
        f"{destination}: the deployment publishes container port "
        f"{published['container_port']} and the stub listens on {stub['port']}"
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_destination_identifier_is_the_one_the_packager_expects(destination: str) -> None:
    """A receipt from a destination this component was not configured to send to is refused
    by `verify`, so a mismatch here is a bundle that transfers and never verifies."""
    expected = _document(destination, "offload.json")["offload"]["destination"]["id"]
    declared = _document(destination, "archive.json")["archive"]["destination_id"]

    assert declared == expected, (
        f"{destination}: the packager expects receipts from {expected!r} and the stub signs "
        f"them {declared!r}; verification refuses a receipt from a destination it did not "
        "send to"
    )
