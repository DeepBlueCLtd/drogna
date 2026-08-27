"""The broker client, wrapped thinly and documented as marginal.

Constitution VI calls event publication a marginal port: wrapped, but not pretending to be
pluggable. This is the wrapping. It exists so that the rest of the component speaks
:class:`~harness_core.heartbeat.MessagePublisher` and knows nothing about MQTT, which is
also what makes the two-broker fallback (FR-015) a change of configuration values — the
endpoint is read from the component's own configuration and appears nowhere in source.

Credentials travel in the broker URL, as ``mqtt://<role>:<secret>@<host>:<port>``. The
tracked configuration carries the role and no secret; the deploy-time render supplies the
secret, which appears in no tracked file. Roles are per role and not per client instance,
so a second sensor needs no new credential and gains no new permission.
"""

from __future__ import annotations

import json
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from queue import Queue
from typing import Any
from urllib.parse import unquote, urlparse

from harness_core.clock import Tick

__all__ = ["BrokerEndpoint", "BrokerError", "PahoPublisher", "PahoTickSource"]

_DEFAULT_KEEPALIVE = 60


class BrokerError(Exception):
    """The broker could not be reached, or refused what was asked of it."""


@dataclass(frozen=True)
class BrokerEndpoint:
    """Where the broker is and who this component is to it. Every field from configuration."""

    host: str
    port: int
    client_id: str
    keepalive_seconds: int = _DEFAULT_KEEPALIVE
    username: str | None = None
    password: str | None = None

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> BrokerEndpoint:
        parsed = urlparse(str(section["url"]))
        if parsed.hostname is None or parsed.port is None:
            raise BrokerError(
                f"the broker url {section['url']!r} names no host and port; it is the one "
                "place this component learns where the broker is"
            )
        return cls(
            host=parsed.hostname,
            port=int(parsed.port),
            client_id=str(section["client_id"]),
            keepalive_seconds=int(section.get("keepalive_seconds", _DEFAULT_KEEPALIVE)),
            username=unquote(parsed.username) if parsed.username else None,
            password=unquote(parsed.password) if parsed.password else None,
        )


class PahoPublisher:
    """Publishes on the observation branch. Publish only: this client subscribes to nothing.

    That it cannot subscribe is a property of the code as well as of the access control
    list, and both are deliberate. The list is what makes it true of any client presenting
    a sensor's credentials; this is what makes it true of this one.
    """

    def __init__(self, endpoint: BrokerEndpoint, *, qos: int = 1, retain: bool = False) -> None:
        self._endpoint = endpoint
        self._qos = qos
        self._retain = retain
        self._client: Any | None = None

    @property
    def connected(self) -> bool:
        return self._client is not None

    def connect(self) -> None:
        """Open the connection, or raise. A component that cannot connect publishes nothing."""
        try:
            from paho.mqtt import client as mqtt
        except ImportError as error:  # pragma: no cover - the image installs it
            raise BrokerError("no MQTT client is installed, so nothing can be published") from error

        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self._endpoint.client_id,
            protocol=mqtt.MQTTv5,
        )
        if self._endpoint.username is not None:
            client.username_pw_set(self._endpoint.username, self._endpoint.password)
        try:
            client.connect(
                self._endpoint.host,
                self._endpoint.port,
                keepalive=self._endpoint.keepalive_seconds,
            )
        except OSError as error:
            raise BrokerError(f"the broker is not reachable: {error}") from error
        client.loop_start()
        self._client = client

    def publish(self, topic: str, payload: bytes) -> None:
        """Publish one message, waiting for the broker to take it at quality of service 1."""
        if self._client is None:
            raise BrokerError("publish was called before the broker connection was opened")
        message = self._client.publish(topic, payload, qos=self._qos, retain=self._retain)
        message.wait_for_publish()
        if message.rc != 0:
            raise BrokerError(f"the broker refused a publish on {topic}: return code {message.rc}")

    def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            client.loop_stop()
            client.disconnect()


class PahoTickSource:
    """Simulation time, by subscription to ``ctl/clock`` (ADR-0009).

    A sensor is confined to the observation branch and is refused every control topic but
    this one. The exception is narrow and is argued in ``deploy/broker/README.md``: a
    component that cannot receive a clock sample has no simulation time, and a component
    with no simulation time would have to pace itself on the host clock, which is the one
    thing Constitution I forbids outright. What a sensor still cannot do is publish
    anywhere on the control namespace, or read any control topic other than the time.
    """

    def __init__(self, endpoint: BrokerEndpoint, *, topic: str, qos: int = 0) -> None:
        self._endpoint = endpoint
        self._topic = topic
        self._qos = qos
        self._messages: Queue[bytes] = Queue()
        self._client: Any | None = None

    def connect(self) -> None:
        try:
            from paho.mqtt import client as mqtt
        except ImportError as error:  # pragma: no cover - the image installs it
            raise BrokerError("no MQTT client is installed, so no time can be received") from error

        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self._endpoint.client_id}-clock",
            protocol=mqtt.MQTTv5,
        )
        if self._endpoint.username is not None:
            client.username_pw_set(self._endpoint.username, self._endpoint.password)

        def on_message(_client: Any, _userdata: Any, message: Any) -> None:
            self._messages.put(message.payload)

        client.on_message = on_message
        try:
            client.connect(
                self._endpoint.host,
                self._endpoint.port,
                keepalive=self._endpoint.keepalive_seconds,
            )
        except OSError as error:
            raise BrokerError(f"the broker is not reachable: {error}") from error
        client.subscribe(self._topic, qos=self._qos)
        client.loop_start()
        self._client = client

    def ticks(self) -> Iterator[Tick]:
        """Yield ticks as the clock publishes them. Ends when the subscription drops."""
        if self._client is None:
            self.connect()
        while True:
            payload = self._messages.get()
            yield Tick.from_message(json.loads(payload.decode("utf-8")))

    def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            client.loop_stop()
            client.disconnect()
