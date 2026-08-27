"""Ten thousand reads across a series of publications, and not one of them sees half a field.

SC-007, and the failure C-14 owns. The reason this test is written with threads rather than
with a sequence of calls is that the failure it hunts cannot occur in a sequence of calls: a
reader that only ever reads between publications will never see a partial field however
carelessly the publisher writes. The window this is about is the one in which a reader is
mid-read while the publisher is mid-write, and reproducing it needs both at once.

So a reader loop runs while runs are published underneath it, and every read is checked
against the digests of the runs that exist. A read that returned a mixture of two runs, or
an empty file, or an error, fails the test — and each of those is a real way the naive
implementation (write into place, or unlink then recreate the pointer) fails.

The read is the two-step one the store's layout describes and the query layer performs: the
pointer names a run, and the run's directory holds the field. Both steps can fail and both
are checked. A pointer that is absent for an instant, or that carries no identifier, or that
carries two, is caught at the first step; a field that is half a run is caught at the second.

More than two runs are published, which is stronger than the two the specification asks for:
each publication is another chance to catch the window, and the digests of all of them are
known, so a mixture is still detectable.
"""

from __future__ import annotations

import hashlib
import threading
from pathlib import Path

from control_loop import RUNS_DIRNAME, manual_clock, publisher_document
from harness_publisher.service import PublisherService
from harness_types.config.publisher import DrognaPublisherConfiguration
from publisher_support import stage_run

READS = 10_000
RUNS = 12

CURRENT_POINTER = "current"
FORECAST_FILE = "forecast.nc"


class PointerError(Exception):
    """The pointer named no run, or named more than one. Either is a reader seeing nothing."""


def digest(payload: bytes) -> str:
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def current_identifier(catalogue: Path) -> str:
    """The run the pointer names. Absent, empty, or carrying two is a fault, not a value."""
    raw = (catalogue / CURRENT_POINTER).read_text(encoding="utf-8")
    named = [line.strip() for line in raw.splitlines() if line.strip()]
    if len(named) != 1:
        raise PointerError(f"the pointer named {len(named)} runs: {named}")
    return named[0]


def read_current(catalogue: Path) -> bytes:
    """The current field, resolved as the query layer resolves it: pointer, then run."""
    run_id = current_identifier(catalogue)
    return (catalogue / RUNS_DIRNAME / run_id / FORECAST_FILE).read_bytes()


def test_no_reader_ever_observes_a_partially_written_field(tmp_path: Path) -> None:
    staging = tmp_path / "staging"
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True)

    bodies = {
        f"run-{index:02d}": (f"forecast field number {index} ".encode() * (index + 3))
        for index in range(RUNS)
    }
    known = {digest(body) for body in bodies.values()}
    for run_id, body in bodies.items():
        stage_run(staging, run_id, body=body)

    settings = DrognaPublisherConfiguration.model_validate(
        publisher_document(staging=str(staging), catalogue=str(catalogue))
    )
    service = PublisherService(settings, clock=manual_clock())
    service.take("run-00")

    failures: list[str] = []
    counts = [0, 0]

    def reader(slot: int) -> None:
        """Read the current field until this reader's share of the reads is done."""
        for _ in range(READS // len(counts)):
            try:
                payload = read_current(catalogue)
            except (OSError, PointerError) as error:
                failures.append(f"a read failed outright: {error}")
                return
            if digest(payload) not in known:
                failures.append(f"a read returned {len(payload)} bytes matching no known run")
                return
            counts[slot] += 1

    def publish() -> None:
        for index in range(1, RUNS):
            service.take(f"run-{index:02d}")

    readers = [
        threading.Thread(target=reader, args=(slot,), daemon=True) for slot in range(len(counts))
    ]
    publisher = threading.Thread(target=publish, daemon=True)
    for thread in readers:
        thread.start()
    publisher.start()
    for thread in (*readers, publisher):
        thread.join(timeout=60)

    assert failures == []
    assert sum(counts) == READS
    assert service.published == RUNS
    assert service.current_run_id == f"run-{RUNS - 1:02d}"


def test_the_pointer_never_stops_resolving_during_a_swap(tmp_path: Path) -> None:
    """The delete-then-create implementation fails this and passes the test above by luck."""
    staging = tmp_path / "staging"
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True)
    stage_run(staging, "run-one", body=b"the first field")
    stage_run(staging, "run-two", body=b"the second field")

    settings = DrognaPublisherConfiguration.model_validate(
        publisher_document(staging=str(staging), catalogue=str(catalogue))
    )
    service = PublisherService(settings, clock=manual_clock())
    service.take("run-one")

    missing = 0
    stop = threading.Event()

    def watcher() -> None:
        """Watch the pointer alone, and as tightly as possible.

        Only the first of the two read steps is performed here, because only the first is
        what this test is about and because the window a delete-then-create leaves open is
        measured in microseconds: a watcher that also opened the field would sample too
        rarely to catch it, and would pass for the wrong reason.
        """
        nonlocal missing
        while not stop.is_set():
            try:
                current_identifier(catalogue)
            except (OSError, PointerError):
                missing += 1

    thread = threading.Thread(target=watcher, daemon=True)
    thread.start()
    for _ in range(200):
        pass
    service.take("run-two")
    stop.set()
    thread.join(timeout=10)

    assert missing == 0
