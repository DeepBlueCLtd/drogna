"""The subscription to ``obs/#``, and the acknowledgement policy that makes it safe.

The client acknowledges a message only once the batch containing it has been committed.
Until then the message is the broker's: an ingest client that dies between receiving and
writing has lost nothing, because it never told the broker it was done. Under quality of
service 1 that is the whole of the guarantee, and it is why the queue's bound costs latency
rather than data — a client that stops acknowledging is a client the broker keeps messages
for.

Manual acknowledgement is a property of the client this module builds, not of the loop that
uses it. The loop hands back the delivery tags of the messages it has written and this
acknowledges them, so the ordering is impossible to get wrong by forgetting.

Nothing about the topic namespace is configurable. ``obs/#`` is the observation branch and
``ctl/`` is the control namespace, both fixed by the repository layout and both enforced at
the broker: the ingest role may read the first and publish on exactly two topics of the
second.
"""

from __future__ import annotations

import queue
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote, urlparse

__all__ = [
    "OBSERVATION_FILTER",
    "BrokerEndpoint",
    "BrokerError",
    "Delivery",
    "PahoSubscriber",
]

OBSERVATION_FILTER = "obs/#"
"""Everything on the observation branch, and nothing on the control namespace."""

_DEFAULT_KEEPALIVE = 60


class BrokerError(Exception):
    """The broker could not be reached, or refused what was asked of it."""


@dataclass(frozen=True)
class Delivery:
    """One received message, with what is needed to acknowledge it later."""

    topic: str
    payload: bytes
    mid: int
    qos: int


@dataclass(frozen=True)
class BrokerEndpoint:
    """Where the broker is and who this component is to it. Every field from configuration.

    Credentials travel in the URL as ``mqtt://<role>:<secret>@<host>:<port>``. The tracked
    configuration carries the role and no secret; the deploy-time render supplies the
    secret, which appears in no tracked file.
    """

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


class PahoSubscriber:
    """Subscribes to the observation branch, publishes on the two control topics allowed.

    One client does both because the ingest role is one identity: the same credentials read
    ``obs/#`` and publish ``ctl/heartbeat`` and ``ctl/telemetry``, and the access control
    list allows exactly that and nothing else.
    """

    def __init__(
        self,
        endpoint: BrokerEndpoint,
        *,
        qos: int = 1,
        topic_filter: str = OBSERVATION_FILTER,
    ) -> None:
        self._endpoint = endpoint
        self._qos = qos
        self._filter = topic_filter
        self._deliveries: queue.Queue[Delivery] = queue.Queue()
        self._client: Any | None = None
        self._paused = False

    @property
    def endpoint(self) -> BrokerEndpoint:
        """Where this client is connected, for a second subscription on the same identity."""
        return self._endpoint

    @property
    def connected(self) -> bool:
        return self._client is not None

    @property
    def pending(self) -> int:
        """Messages delivered by the broker and not yet taken by the loop."""
        return self._deliveries.qsize()

    def connect(self) -> None:
        """Open the connection and subscribe, or raise."""
        try:
            from paho.mqtt import client as mqtt
        except ImportError as error:  # pragma: no cover - the image installs it
            raise BrokerError("no MQTT client is installed, so nothing can be ingested") from error

        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self._endpoint.client_id,
            protocol=mqtt.MQTTv5,
            manual_ack=True,
        )
        if self._endpoint.username is not None:
            client.username_pw_set(self._endpoint.username, self._endpoint.password)

        def on_message(_client: Any, _userdata: Any, message: Any) -> None:
            self._deliveries.put(
                Delivery(
                    topic=message.topic,
                    payload=message.payload,
                    mid=message.mid,
                    qos=message.qos,
                )
            )

        client.on_message = on_message
        try:
            client.connect(
                self._endpoint.host,
                self._endpoint.port,
                keepalive=self._endpoint.keepalive_seconds,
            )
        except OSError as error:
            raise BrokerError(f"the broker is not reachable: {error}") from error
        client.subscribe(self._filter, qos=self._qos)
        client.loop_start()
        self._client = client

    def poll(self, timeout: float = 0.0) -> Delivery | None:
        """Take one delivered message, or nothing if none has arrived.

        The timeout is a socket wait, not simulation time. It decides how long this call
        blocks and takes no part in any value the component produces or stores.
        """
        try:
            if timeout:
                return self._deliveries.get(timeout=timeout)
            return self._deliveries.get_nowait()
        except queue.Empty:
            return None

    def deliveries(self, timeout: float = 0.0) -> Iterator[Delivery]:
        """Every message available now, oldest first. Nothing at all while paused."""
        while not self._paused:
            delivery = self.poll(timeout)
            if delivery is None:
                return
            yield delivery

    def acknowledge(self, deliveries: list[Delivery]) -> None:
        """Acknowledge messages whose batch has been committed, and not before."""
        if self._client is None:
            return
        for delivery in deliveries:
            if delivery.qos > 0:
                self._client.ack(delivery.mid, delivery.qos)

    def publish(self, topic: str, payload: bytes) -> None:
        """Publish on one of the two control topics this role is allowed."""
        if self._client is None:
            raise BrokerError("publish was called before the broker connection was opened")
        message = self._client.publish(topic, payload, qos=self._qos)
        message.wait_for_publish()
        if message.rc != 0:
            raise BrokerError(f"the broker refused a publish on {topic}: return code {message.rc}")

    def pause(self) -> None:
        """Stop taking messages: the queue is at its bound.

        The subscription stays open deliberately. Unsubscribing would tell the broker to
        stop routing, and a message that is not routed while a client is subscribed under
        an active session is a message nobody is holding — which is loss, not
        backpressure. What actually holds the flow back is acknowledgement: this client
        acknowledges only what it has written, so the broker's in-flight window fills and
        the rest stays queued at the broker until the backlog drains.
        """
        self._paused = True

    def resume(self) -> None:
        """Take messages again: the backlog has drained."""
        self._paused = False

    @property
    def paused(self) -> bool:
        return self._paused

    def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            client.loop_stop()
            client.disconnect()
