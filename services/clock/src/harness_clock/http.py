"""The clock's small HTTP interface: two routes, and a deliberate refusal to be more.

ADR-0009 decided what this is for and, just as importantly, what it is not for. Simulation
time reaches consumers by subscription to ``ctl/clock`` on the broker. This interface
exists for the two things a subscription cannot do:

- **Setting the rate.** A command from the browser (FR-10), including pinning to zero and
  releasing again so that a screenshot capture can hold the whole system still (FR-53).
- **Answering "what is the time now."** For a component starting up, or catching up after a
  restart. It is not a way to read time in a loop; a component polling this is doing the
  wrong thing and should be subscribing.

Read and control sit under distinct path prefixes, both taken from configuration, so the
reverse proxy can apply policy by prefix without enumerating routes (FR-007). No route,
host or port appears in this module: they are part of the clock's published interface, so
they are configuration and not code (Constitution IV).

The standard library's ``send_response`` stamps a ``Date`` header from the host clock.
Nothing in drogna reads it, and the principle is easier to keep when the read is not there
at all, so the responses below are assembled with ``send_response_only`` and carry only the
headers they need.

Every response carries ``Access-Control-Allow-Origin: *``, and ``OPTIONS`` answers the
preflight, because the browser is the one place this interface is *for* (FR-10, FR-49) and
the browser always arrives cross-origin: the page is served from the client's port and the
clock listens on its own, so a command carrying ``Content-Type: application/json`` is
preflighted and, unanswered, never sent. The control had therefore never worked from a
browser until the capture workflow first ran the client against a real clock and found the
door shut. The wildcard is a stated decision, not a shrug — ADR-0021 records what it grants
(any page in a viewer's browser that can reach the bind address may command the clock, which
is what any local process already could), what bounds it (the bind address), and the
two-line revert.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlsplit

from harness_core.clock import ClockControlError

from harness_clock.service import ClockService

__all__ = ["ClockHTTPServer", "ClockRequestHandler", "serve"]

_JSON = "application/json"
_MAXIMUM_BODY_BYTES = 64 * 1024


class ClockRequestHandler(BaseHTTPRequestHandler):
    """Answers the snapshot and the control route, and nothing else."""

    protocol_version = "HTTP/1.1"
    server_version = "drogna-clock"
    sys_version = ""

    @property
    def _clock(self) -> ClockHTTPServer:
        server: Any = self.server
        return server

    def do_GET(self) -> None:
        route = urlsplit(self.path).path
        if route == self._clock.snapshot_route:
            self._respond(HTTPStatus.OK, self._clock.service.snapshot())
        elif route == self._clock.control_route:
            self._refuse(HTTPStatus.METHOD_NOT_ALLOWED, "the control route takes commands, by POST")
        else:
            self._refuse(HTTPStatus.NOT_FOUND, f"{route!r} is not part of the clock's interface")

    def do_POST(self) -> None:
        route = urlsplit(self.path).path
        if route == self._clock.snapshot_route:
            self._refuse(HTTPStatus.METHOD_NOT_ALLOWED, "the snapshot is read with GET")
            return
        if route != self._clock.control_route:
            self._refuse(HTTPStatus.NOT_FOUND, f"{route!r} is not part of the clock's interface")
            return

        payload = self._body()
        if payload is None:
            return
        try:
            state = self._clock.service.command(payload)
        except ClockControlError as exc:
            # A refused command leaves the clock exactly as it was, which is what FR-005
            # asks for: a readable error, and the current state unchanged.
            self._refuse(HTTPStatus.BAD_REQUEST, str(exc))
            return
        self._respond(HTTPStatus.OK, state)

    def do_OPTIONS(self) -> None:
        """Answer the browser's preflight, whatever route it asks about.

        The grant does not vary by route, so neither does the answer; a preflight for a
        route that does not exist fails on the request that follows it, with the 404 that
        names the route.
        """
        self.send_response_only(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _body(self) -> Mapping[str, Any] | None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._refuse(HTTPStatus.BAD_REQUEST, "the content length is not a number")
            return None
        if length > _MAXIMUM_BODY_BYTES:
            self._refuse(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "a clock command is a small object")
            return None
        raw = self.rfile.read(length) if length else b""
        try:
            document = json.loads(raw.decode("utf-8")) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._refuse(HTTPStatus.BAD_REQUEST, f"the command is not valid JSON ({exc})")
            return None
        if not isinstance(document, dict):
            self._refuse(HTTPStatus.BAD_REQUEST, "a clock command is a JSON object")
            return None
        return document

    def _respond(self, status: HTTPStatus, document: Mapping[str, Any]) -> None:
        self._write(status, json.dumps(document, sort_keys=True).encode("utf-8"))

    def _refuse(self, status: HTTPStatus, message: str) -> None:
        self._write(status, json.dumps({"error": message}, sort_keys=True).encode("utf-8"))

    def _write(self, status: HTTPStatus, payload: bytes) -> None:
        self.send_response_only(status)
        self.send_header("Content-Type", _JSON)
        self.send_header("Content-Length", str(len(payload)))
        # On the response as well as the preflight: a browser discards a cross-origin
        # response that does not repeat the grant, however the preflight answered.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: Any) -> None:
        """Log without a timestamp.

        Constitution I permits log line decoration to read the host clock, and the standard
        library's default does. Not taking a permission that is not needed keeps the
        exemption inventory to the two entries that are genuinely load-bearing.
        """
        stream = self._clock.log_stream
        if stream is not None:
            print(f"{self.server_version}: {format % args}", file=stream)


class ClockHTTPServer(ThreadingHTTPServer):
    """The listening socket, and the routes it answers on."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        address: tuple[str, int],
        *,
        service: ClockService,
        snapshot_route: str,
        control_route: str,
        log_stream: Any = None,
    ) -> None:
        self.service = service
        self.snapshot_route = snapshot_route
        self.control_route = control_route
        self.log_stream = log_stream
        super().__init__(address, ClockRequestHandler)

    @property
    def port(self) -> int:
        """The port actually bound, which a test asking for port zero needs to know."""
        return int(self.server_address[1])


def serve(
    service: ClockService,
    *,
    host: str,
    port: int,
    snapshot_route: str,
    control_route: str,
    log_stream: Any = None,
) -> ClockHTTPServer:
    """Bind the interface. Called only after the configuration has been validated."""
    return ClockHTTPServer(
        (host, port),
        service=service,
        snapshot_route=snapshot_route,
        control_route=control_route,
        log_stream=log_stream,
    )
