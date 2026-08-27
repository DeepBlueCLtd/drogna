"""Saying so: the heartbeat that lights this component, and the report that says what it did.

Two messages, and the split between them is ADR-0006. The heartbeat answers "is this
process alive?", which is a fact about the host, so its cadence is real time and
:class:`harness_core.heartbeat.HeartbeatPublisher` owns it — including the declaration of
its own interval and liveness window, so the client judges this component on its own terms
rather than on a default. Illumination in the client follows from that heartbeat arriving
and from nothing else (Constitution VII): there is no ``enabled`` flag here and no list of
components that ought to exist.

The telemetry report answers "what is happening to the bundles?", which is a fact about the
run, so it is composed in simulation time and its interval is measured on the clock port.

The counts are read from the ledger rather than accumulated beside it. A second tally kept
in memory is a second source of truth that disagrees with the ledger after the first
restart, and it would disagree in the direction that flatters: the tally would say a bundle
was verified because this process verified it, while the ledger would say the record never
reached the disk.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from harness_core.clock import Tick
from harness_core.config import validate_document
from harness_core.heartbeat import MessagePublisher

from harness_offload.ledger import Ledger
from harness_offload.schemas import TELEMETRY_SCHEMA, schema
from harness_offload.version import PACKAGER_NAME

__all__ = ["TELEMETRY_TOPIC", "OffloadTelemetry", "VerificationTally"]

TELEMETRY_TOPIC = "ctl/telemetry"
"""The control-namespace topic. The packager publishes nothing under ``obs/``."""


@dataclass
class VerificationTally:
    """What this run's verifications came to. Refusals carry their reason, not just a count."""

    verified: int = 0
    refused: int = 0
    last_refusal: str = ""

    def accept(self) -> None:
        self.verified += 1

    def refuse(self, reason: str) -> None:
        self.refused += 1
        self.last_refusal = reason

    def as_document(self) -> dict[str, Any]:
        document: dict[str, Any] = {"refused": self.refused, "verified": self.verified}
        if self.last_refusal:
            document["last_refusal"] = self.last_refusal
        return document


@dataclass
class OffloadTelemetry:
    """Composes and publishes the report. Holds no counters of its own except the tally."""

    publisher: MessagePublisher | None
    component: str = PACKAGER_NAME
    tally: VerificationTally = field(default_factory=VerificationTally)

    def report(
        self,
        *,
        ledger: Ledger,
        tick: Tick,
        staging_bytes: int,
        bound_bytes: int,
        producing: bool,
    ) -> dict[str, Any]:
        """The report, validated against its master before it is called a report."""
        counts = ledger.counts()
        document: dict[str, Any] = {
            "component": self.component,
            "scenario_run_id": tick.run_id,
            "sim_time": tick.instant.iso(),
            "tick": tick.index,
            "bundles": counts,
            "verification": self.tally.as_document(),
            "staging": {
                "bytes": staging_bytes,
                "bound_bytes": bound_bytes,
                "at_bound": staging_bytes >= bound_bytes,
                "producing": producing,
            },
        }
        validate_document(document, schema(TELEMETRY_SCHEMA), source=TELEMETRY_TOPIC)
        return document

    def publish(self, document: Mapping[str, Any]) -> None:
        """Publish a report, or do nothing at all where no broker was supplied.

        Nothing at all, and not a stub: a component with no broker configured does not
        invent one and does not publish to a substitute, so nothing lights up in the client
        that is not really there (Constitution VII).
        """
        if self.publisher is None:
            return
        self.publisher.publish(TELEMETRY_TOPIC, json.dumps(document, sort_keys=True).encode())
