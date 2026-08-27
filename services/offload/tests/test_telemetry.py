"""What the packager says about itself, and where the numbers in it come from.

The counts are read from the ledger, not accumulated beside it. So the test that matters
here is the one that moves a bundle through the states and asserts the report follows —
a second tally kept in memory would pass a test that only checked the arithmetic.
"""

from __future__ import annotations

import json

import pytest
from harness_core.config import ConfigInvalidError
from harness_offload.ledger import BundleState, Ledger
from harness_offload.telemetry import TELEMETRY_TOPIC, OffloadTelemetry
from offload_support import (
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    write_run,
)


class Recorder:
    def __init__(self) -> None:
        self.published: list[tuple[str, bytes]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append((topic, payload))


def test_the_report_counts_bundles_by_the_ledgers_own_state(tmp_path) -> None:
    book = Ledger(tmp_path / "ledger" / "bundles.jsonl")
    clock = manual_clock()
    book.append("b-aaaaaaaaaaaaaaaa", BundleState.STAGED, when=clock.now())
    book.append("b-bbbbbbbbbbbbbbbb", BundleState.STAGED, when=clock.now())
    book.append("b-bbbbbbbbbbbbbbbb", BundleState.TRANSFERRED, when=clock.now())

    document = OffloadTelemetry(publisher=None).report(
        ledger=book, tick=clock.tick(), staging_bytes=10, bound_bytes=100, producing=True
    )

    assert document["bundles"]["staged"] == 1
    assert document["bundles"]["transferred"] == 1
    assert document["bundles"]["verified"] == 0


def test_the_report_is_validated_against_its_master_before_it_is_published(tmp_path) -> None:
    book = Ledger(tmp_path / "ledger" / "bundles.jsonl")
    telemetry = OffloadTelemetry(publisher=None)

    with pytest.raises(ConfigInvalidError):
        telemetry.report(
            ledger=book,
            tick=manual_clock().tick(),
            staging_bytes=10,
            bound_bytes=0,  # the master requires a bound of at least one byte
            producing=True,
        )


def test_a_refusal_is_carried_with_its_reason(tmp_path) -> None:
    """A count says something is wrong; a reason says which of the six ways it is wrong."""
    book = Ledger(tmp_path / "ledger" / "bundles.jsonl")
    telemetry = OffloadTelemetry(publisher=None)
    telemetry.tally.refuse("b-1: the destination returned success with no receipt body")

    document = telemetry.report(
        ledger=book, tick=manual_clock().tick(), staging_bytes=0, bound_bytes=1, producing=True
    )

    assert document["verification"]["refused"] == 1
    assert "no receipt body" in document["verification"]["last_refusal"]


def test_a_component_with_no_broker_publishes_nothing_at_all(tmp_path) -> None:
    """Constitution VII: it does not invent a broker and does not publish to a stub."""
    telemetry = OffloadTelemetry(publisher=None)

    telemetry.publish({"anything": "at all"})  # must not raise, must not publish


def test_a_cycle_publishes_one_report_on_the_control_topic(tmp_path) -> None:
    write_run(tmp_path / "run")
    recorder = Recorder()
    packager = packager_for(
        tmp_path,
        destination=StubDestination(),
        clock=manual_clock(),
        document=configuration(tmp_path),
    )
    packager.telemetry = OffloadTelemetry(publisher=recorder)

    packager.cycle()

    assert len(recorder.published) == 1
    topic, payload = recorder.published[0]
    assert topic == TELEMETRY_TOPIC
    document = json.loads(payload)
    assert document["component"] == "offload"
    assert document["bundles"]["verified"] >= 1
    assert document["staging"]["producing"] is True
