"""Serving the query layer, and saying so while it serves.

``pygeoapi serve`` runs a Flask application and owns the process for its lifetime, which
leaves nowhere for this component to announce itself from — so it never did. C-09 has had a
heartbeat since feature 008: ``plugins/heartbeat.py``, with a careful docstring about being
lit because it is heard from and for nothing else. Nothing ever constructed it. No caller, no
test, and a box in the client that was grey for the life of every stack while the component
behind it answered every request put to it. That is the untruth Constitution VII exists to
prevent, produced by the one component whose whole job is answering truthfully.

This module is the missing caller. It starts the heartbeat, then hands the process to
pygeoapi's own application — so what is lit is the process that serves, and nothing else can
light it.

**Time arrives here over HTTP, and that is deliberate rather than a shortcut.** Every other
component takes simulation time by subscription (ADR-0009), and the query role cannot: the
access control list gives ``drogna_query`` one write and no read at all, and
``deploy/broker/acl`` argues for that at length — a read-only query surface that could
subscribe to the control namespace would be the cross-contamination C-03 owns as its failure
mode. So each beat reads the clock's own snapshot endpoint, which this component's
configuration already names and which is the only route to time its role permits. A snapshot
that cannot be read is reported and the beat is skipped: a heartbeat carrying an invented
simulation time would be worse than none.

**Nothing here is a second opinion about whether the query layer is up.** A sidecar that
probed the HTTP surface and published on its behalf would be exactly the synthesised traffic
``harness_core.heartbeat`` forbids — a component is lit because a message from it arrived,
and this thread lives inside the process that answers.
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from harness_core.broker import FROM_CONFIGURATION, resolve_publisher
from harness_core.clock import ClockEndpoint, ClockError, HttpClockControl
from plugins.heartbeat import QueryLayerHeartbeat
from render_config import COMPONENT, load_query_config

__all__ = ["beat_until_stopped", "main", "start_heartbeat"]

_DEFAULT_HEARTBEAT_SECONDS = 5.0


def beat_until_stopped(
    heartbeat: QueryLayerHeartbeat,
    control: HttpClockControl,
    *,
    interval_seconds: float,
    stop: threading.Event,
    report: Any,
) -> None:
    """Beat on the declared real-time cadence for as long as the process serves.

    Cadence is real time (ADR-0006): at a clock rate of zero simulated time stops and this
    component does not, and a liveness display that greyed it out during exactly the capture
    FR-053 exists to make meaningful would be reporting a falsehood about a running system.

    A snapshot that cannot be read skips the beat and says so. The component then greys out,
    which is true — it has no simulation time to report and every message it publishes
    carries one.
    """
    first = True
    while not stop.is_set():
        try:
            tick = control.snapshot().tick
        except (ClockError, OSError) as failure:
            print(f"{COMPONENT}: no simulation time to report ({failure})", file=report)
            tick = None
        if tick is not None:
            if first:
                heartbeat.starting(tick)
                first = False
            else:
                heartbeat.serving(tick, detail="serving")
        # A real-time wait, which is what a heartbeat cadence is (ADR-0006). It is also how
        # the thread is stopped: the event is set when the process is going down, and a beat
        # is never left pending on a sleep that has to run out first.
        stop.wait(interval_seconds)


def start_heartbeat(document: Any, digest: str | None, report: Any) -> threading.Event:
    """Open the publisher and start the thread. Returns the event that stops it.

    A daemon thread, because the process's business is serving and the heartbeat is a
    statement about that process rather than work of its own: when Flask goes, this goes with
    it, and a heartbeat outliving the thing it describes is the failure in miniature.
    """
    # The sentinel, so a client is built from this component's own configuration — and so
    # that a configuration naming no broker takes the second of resolve_publisher's three
    # states rather than being special-cased here.
    publisher, _owned = resolve_publisher(
        FROM_CONFIGURATION, document, component=COMPONENT, report=report
    )
    heartbeat = QueryLayerHeartbeat(
        publisher,
        component=str(document["component"]["id"]),
        interval_seconds=float(
            document["component"].get("heartbeat_interval_seconds", _DEFAULT_HEARTBEAT_SECONDS)
        ),
        config_digest=digest,
    )
    if not heartbeat.publishing:
        print(
            f"{COMPONENT}: no broker is configured, so nothing is announced and this "
            "component is greyed out in the client rather than falsely lit",
            file=report,
        )
        return threading.Event()

    stop = threading.Event()
    thread = threading.Thread(
        target=beat_until_stopped,
        args=(
            heartbeat,
            HttpClockControl(ClockEndpoint.from_config(document["clock"])),
        ),
        kwargs={
            "interval_seconds": float(
                document["component"].get("heartbeat_interval_seconds", _DEFAULT_HEARTBEAT_SECONDS)
            ),
            "stop": stop,
            "report": report,
        },
        name=f"{COMPONENT}-heartbeat",
        daemon=True,
    )
    thread.start()
    return stop


def main(argv: list[str] | None = None) -> int:
    """Start the heartbeat, then serve. The order is the point: serving is the process."""
    _ = argv
    loaded = load_query_config()
    start_heartbeat(loaded.document, loaded.digest, sys.stderr)

    # Imported here rather than at module scope: pygeoapi reads PYGEOAPI_CONFIG at import
    # time and raises without it, so importing it before the configuration above has been
    # validated would replace this component's own startup failure with somebody else's.
    from pygeoapi.flask_app import APP, api_

    bind = api_.config["server"]["bind"]
    # The reloader is off, and that is not a preference. It forks a second process which
    # re-imports this module, and a heartbeat published from a process that is not the one
    # answering requests is precisely the falsehood this whole module exists to remove.
    APP.run(host=bind["host"], port=bind["port"], debug=False, use_reloader=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
