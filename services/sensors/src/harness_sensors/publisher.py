"""Publishing an observation: the topic, the validation, and nothing else.

The namespace is a convention of the harness rather than a configuration value. Sensors
publish under ``obs/`` and the control namespace is ``ctl/``; the two are fixed in
``docs/architecture/repo-layout.md`` and enforced at the broker by the access control lists
in ``deploy/broker/acl``. A sensor that tried to publish elsewhere would be refused by the
broker, which is the point: the discipline is a control, not a habit.

Every message is validated against the observation master before it leaves. A sensor is
perfectly capable of publishing something malformed — a missing field after a refactor, a
value that is not a number — and the ingest client would then refuse it and count it as a
rejection. Refusing it here means the failure appears where it was caused.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.heartbeat import MessagePublisher
from harness_types.messages.observation import DrognaObservation
from pydantic import ValidationError

__all__ = [
    "OBSERVATION_NAMESPACE",
    "InvalidObservationError",
    "ObservationPublisher",
    "topic_for",
    "validate_observation",
]

OBSERVATION_NAMESPACE = "obs"
"""The observation branch. The other namespace is ctl/, and sensors have no business there."""


def topic_for(thing_id: str, datastream_id: str) -> str:
    """``obs/<thing-id>/<datastream-id>``, and no other shape."""
    if not thing_id or not datastream_id:
        raise ValueError("an observation topic needs both a thing and a datastream")
    if "/" in thing_id or "/" in datastream_id:
        raise ValueError(
            f"identifiers carry no separator: {thing_id!r}/{datastream_id!r} would publish "
            "on a topic nobody subscribes to"
        )
    return f"{OBSERVATION_NAMESPACE}/{thing_id}/{datastream_id}"


class InvalidObservationError(ValueError):
    """A message this component was about to publish and will not."""


def validate_observation(observation: Mapping[str, Any], *, source: str) -> DrognaObservation:
    """Validate against the type generated from the observation master, or refuse to publish.

    The generated model is the only definition of the payload either end holds
    (Constitution III). Validating against it here rather than against a second copy of the
    schema means the sensors and the ingest client cannot disagree about what a valid
    observation is.
    """
    try:
        return DrognaObservation.model_validate(dict(observation))
    except ValidationError as error:
        raise InvalidObservationError(f"{source}: {error}") from error


class ObservationPublisher:
    """Composes the topic, validates the payload, hands it to the broker client.

    The broker client is injected. A component with no broker configured publishes nothing
    and says so, rather than publishing to a stub: a stub would light a component in the
    client that is not really there (Constitution VII).
    """

    def __init__(self, publisher: MessagePublisher | None) -> None:
        self._publisher = publisher
        self._published = 0

    @property
    def publishing(self) -> bool:
        return self._publisher is not None

    @property
    def published(self) -> int:
        """How many observations have gone out. The count SC-001 reconciles against."""
        return self._published

    def publish(self, observation: Mapping[str, Any]) -> str:
        """Publish one observation and return the topic it went to."""
        topic = topic_for(str(observation["thing_id"]), str(observation["datastream_id"]))
        validate_observation(observation, source=topic)
        if self._publisher is None:
            return topic
        payload = json.dumps(observation, sort_keys=True).encode("utf-8")
        self._publisher.publish(topic, payload)
        self._published += 1
        return topic
