"""The stub archive the offload packager transfers to. 014 T045.

`config/<destination>/offload.json` has named `archive` as its destination since the
packager was written, and nothing answered there. The deployed component could stage a
bundle and could never transfer one; the failure was a connection refused at the far end of
a path no test in the deployment exercised, because every test that exercises it presents
its own stub in-process.

**What it is.** A destination, in the sense `harness_offload.transfer.Destination` means:
three routes, an object that is invisible until committed, and a receipt. It is a stub in
the sense the harness is a demonstration — deliberately fake and saying so — and not in the
sense of a test double that always agrees. `services/offload/tests/offload_support.py`
holds the doubles that misbehave on purpose; this is the one that behaves.

**The one property that makes a receipt worth having: it computes its own digest.** The
commit request carries the sender's `declared_digest`, and this program reads it only to
put it in its log. What the receipt reports is a SHA-256 this process computed over the
bytes that actually arrived. A destination that echoed the declared digest would agree with
the sender every time, including when the bytes never arrived, which is the whole of what
`harness_offload.verify` exists to refuse — and
`services/offload/tests/test_verify.py` presents an echoing destination and asserts it
fails. This one must not be that.

**It holds no clock.** `sim_time` is required in a receipt and there is no host time to take
(Constitution I), so it is read from C-01's snapshot at the moment the receipt is composed.
When the clock cannot be reached, no receipt is issued at all — an empty body, which
`transfer.send` carries as `receipt=None` and `verify` refuses. That is a modelled outcome:
"the destination said yes and told us nothing" is one of the failure paths FR-009 names, and
it is a better answer than a receipt carrying a time this program invented.

**Nothing here is durable.** Objects live in memory and a restart forgets them. A stub that
lost a bundle it had acknowledged would be a bug in something real; here it is the honest
extent of the claim, and the ledger on the packager's side is the record that matters.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

CONFIG_VARIABLE = "HARNESS_CONFIG"

LOGGER = logging.getLogger("archive")


class Store:
    """What has arrived, and what has been made visible. Guarded, because the server threads."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._partials: dict[str, bytes] = {}
        self._committed: dict[str, bytes] = {}

    def put_partial(self, name: str, payload: bytes) -> None:
        with self._lock:
            # Replaced rather than appended: a retry lands on the same temporary name and
            # must not accumulate the remains of the attempt before it.
            self._partials[name] = payload

    def commit(self, temporary_name: str, bundle_id: str) -> bool:
        with self._lock:
            payload = self._partials.pop(temporary_name, None)
            if payload is None:
                # Committing a name nothing was uploaded under. Refused rather than
                # committed empty: an object that was never sent must never become visible.
                return False
            self._committed[bundle_id] = payload
            return True

    def committed(self, bundle_id: str) -> bytes | None:
        with self._lock:
            return self._committed.get(bundle_id)


def _clock_sim_time(settings: dict[str, Any]) -> dict[str, Any] | None:
    """The simulation instant, from C-01, or nothing when it will not answer."""
    clock = settings["clock"]
    url = clock["endpoint"].rstrip("/") + clock["routes"]["snapshot"]
    try:
        with urllib.request.urlopen(url, timeout=float(clock["timeout_seconds"])) as response:
            snapshot = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError, KeyError) as failure:
        LOGGER.warning("the clock could not be read (%s); no receipt will be issued", failure)
        return None
    return snapshot


def _handler(settings: dict[str, Any], store: Store) -> type[BaseHTTPRequestHandler]:
    archive = settings["archive"]
    destination_id = str(archive["destination_id"])
    routes = archive["routes"]

    # The route templates are the ones the packager's own configuration carries, so the two
    # sides cannot drift: `config/<destination>/offload.json` names them under
    # `offload.destination.routes` and `archive.json` names the same three here. A mismatch
    # is a 404 the packager reports as a transfer failure, which is the right shape of
    # complaint even though nothing else would notice.
    upload_suffix = routes["upload"].replace("{name}", "")
    commit_suffix = routes["commit"].split("{name}")[-1]
    receipt_suffix = routes["receipt"].split("{name}")[-1]

    def name_from(path: str, suffix: str) -> str | None:
        if not path.startswith(upload_suffix) or not path.endswith(suffix):
            return None
        name = path[len(upload_suffix) : len(path) - len(suffix) if suffix else None]
        return name or None

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: Any) -> None:
            LOGGER.info("%s", format % args)

        def _respond(self, status: int, body: bytes = b"") -> None:
            self.send_response(status)
            self.send_header("content-length", str(len(body)))
            if body:
                self.send_header("content-type", "application/json")
            self.end_headers()
            if body:
                self.wfile.write(body)

        def do_PUT(self) -> None:
            name = name_from(self.path, "")
            if name is None:
                self._respond(404)
                return
            length = int(self.headers.get("content-length", "0"))
            store.put_partial(name, self.rfile.read(length))
            # 204: the bytes are held under a name nothing serves. Not an acknowledgement —
            # an acknowledgement is a receipt, and a receipt follows a commit.
            self._respond(204)

        def do_POST(self) -> None:
            bundle_id = name_from(self.path, commit_suffix)
            if bundle_id is None:
                self._respond(404)
                return
            length = int(self.headers.get("content-length", "0"))
            try:
                request = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._respond(400)
                return
            # Read, logged, and never used to compose the receipt below. See the module
            # docstring: a destination that reports back what it was told proves only that
            # a request was sent.
            LOGGER.info(
                "commit %s: the sender declares %s", bundle_id, request.get("declared_digest")
            )
            if not store.commit(str(request.get("from", "")), bundle_id):
                self._respond(409)
                return
            self._respond(204)

        def do_GET(self) -> None:
            bundle_id = name_from(self.path, receipt_suffix)
            if bundle_id is None:
                self._respond(404)
                return
            payload = store.committed(bundle_id)
            if payload is None:
                # Nothing was committed under this name — it was never sent, or this
                # process has restarted and forgotten it. Success with an empty body rather
                # than 404, and the difference is what the packager is told.
                #
                # A 404 reaches `transfer.HttpDestination.receipt` as an HTTPError and
                # becomes `TransferError: the destination could not be reached`, which is
                # false and points at the network. An empty body becomes `receipt=None` —
                # "the destination said yes and told us nothing" — which is one of the
                # failure paths FR-009 names, is what actually happened, and makes
                # verification refuse. Either way nothing is evicted; only one of them says
                # why. FR-015 holds in both: an acknowledgement is not permission, and this
                # is not an acknowledgement.
                self._respond(200)
                return
            snapshot = _clock_sim_time(settings)
            if snapshot is None:
                # Success with no body. `transfer.send` carries this as `receipt=None` and
                # verification refuses it, which is what should happen when the destination
                # cannot say when it received anything.
                self._respond(200)
                return
            receipt = {
                "destination_id": destination_id,
                "bundle_id": bundle_id,
                # Computed here, over what arrived. The whole point of this program.
                "digest": "sha256:" + hashlib.sha256(payload).hexdigest(),
                "byte_count": len(payload),
                "sim_time": snapshot["sim_time"],
                "tick": snapshot["tick"],
                "schema_version": 1,
            }
            self._respond(200, json.dumps(receipt).encode("utf-8"))

    return Handler


def load_settings() -> dict[str, Any]:
    path = os.environ.get(CONFIG_VARIABLE, "")
    if not path:
        raise SystemExit(f"{CONFIG_VARIABLE} names no configuration file; nothing was started")
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> int:
    settings = load_settings()
    logging.basicConfig(
        level=settings.get("logging", {}).get("level", "INFO"),
        format="%(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )
    archive = settings["archive"]
    server = ThreadingHTTPServer(
        (archive["bind"], int(archive["port"])), _handler(settings, Store())
    )
    LOGGER.info(
        "the stub archive is listening as %s; it computes its own digests",
        archive["destination_id"],
    )
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
