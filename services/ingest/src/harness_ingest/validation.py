"""Validation, and what happens to what fails it.

Every message is validated before it enters a batch. A message that fails is never written,
is counted, and is kept with the reason it was refused so somebody can look at it. That
last part is the difference between a seam and a filter: a filter that silently drops what
it does not like leaves a hole in the data and no record of why.

Validation is against the Pydantic model generated from
``contracts/schemas/observation.schema.json``. Nothing here restates the shape of an
observation, and nothing here can drift from what the sensors publish, because both ends
use what was generated from the same master (Constitution III).

Two failures are treated identically and reported differently: a payload that is not JSON
at all, and a payload that is JSON but not an observation. The second is the interesting
one, because it is what a control-shaped message published on an ``obs/`` topic looks like
from here — namespace discipline enforced at both ends, not only at the broker.
"""

from __future__ import annotations

import json
from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass

from harness_types.messages.observation import DrognaObservation
from pydantic import ValidationError

__all__ = ["Rejection", "RejectionLog", "ValidationOutcome", "validate"]

_REASON_LIMIT = 400


@dataclass(frozen=True)
class Rejection:
    """One refused message: the topic it arrived on, its bytes, and why it was refused."""

    topic: str
    payload: bytes
    reason: str


@dataclass(frozen=True)
class ValidationOutcome:
    """Either an observation or a rejection. Never both, and never neither."""

    observation: DrognaObservation | None
    rejection: Rejection | None

    @property
    def accepted(self) -> bool:
        return self.observation is not None


def _reason(text: str) -> str:
    """A rejection reason short enough to keep thousands of, and specific enough to act on."""
    collapsed = " ".join(text.split())
    if len(collapsed) <= _REASON_LIMIT:
        return collapsed
    return collapsed[: _REASON_LIMIT - 1] + "…"


def validate(topic: str, payload: bytes) -> ValidationOutcome:
    """Validate one received message. Never raises: a refusal is a result, not an incident."""
    try:
        document = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return ValidationOutcome(
            None, Rejection(topic, payload, _reason(f"not valid JSON: {error}"))
        )
    if not isinstance(document, dict):
        return ValidationOutcome(
            None,
            Rejection(topic, payload, _reason("an observation is a JSON object")),
        )
    try:
        observation = DrognaObservation.model_validate(document)
    except ValidationError as error:
        return ValidationOutcome(
            None, Rejection(topic, payload, _reason(f"not an observation: {error}"))
        )
    return ValidationOutcome(observation, None)


class RejectionLog:
    """Rejections, counted without bound and kept up to one.

    The count is the number that matters: it goes on ``ctl/telemetry`` and it never stops
    rising, so a run cannot end with rejections nobody knew about. The retention is bounded
    because a long run would otherwise fill memory with refusals; when the bound is
    reached, that is itself reported rather than being an oldest record quietly vanishing.
    """

    def __init__(self, maximum_retained: int) -> None:
        if maximum_retained < 1:
            raise ValueError("keeping no rejections at all would leave nothing to inspect")
        self._maximum = maximum_retained
        self._kept: deque[Rejection] = deque(maxlen=maximum_retained)
        self._count = 0
        self._discarded = 0

    @property
    def count(self) -> int:
        """Every rejection this run has seen, kept or not."""
        return self._count

    @property
    def discarded(self) -> int:
        """Rejections that fell off the end of the retention. Reported, never silent."""
        return self._discarded

    @property
    def full(self) -> bool:
        return len(self._kept) >= self._maximum

    def record(self, rejection: Rejection) -> None:
        self._count += 1
        if self.full:
            self._discarded += 1
        self._kept.append(rejection)

    def retained(self) -> Iterator[Rejection]:
        """The kept rejections, oldest first, for whoever is inspecting them."""
        return iter(tuple(self._kept))

    def __len__(self) -> int:
        return len(self._kept)
