"""The broker client, wrapped thinly and documented as marginal.

Constitution VI calls event publication a marginal port: wrapped, but not pretending to be
pluggable. This is the wrapping. It exists so that a component speaks
:class:`~harness_core.heartbeat.MessagePublisher` and knows nothing about MQTT, which is
also what makes the two-broker fallback (FR-015) a change of configuration values — the
endpoint is read from the component's own configuration and appears nowhere in source.

It lives here, beside the protocol it satisfies, because every component publishes. It was
written inside ``services/sensors/`` when the sensors were the only thing that published,
and it moved the moment a second component reached for it: the service-dependency gate
exists because ``encode_netcdf`` and ``read_netcdf`` each sat inside a service and acquired
consumers across a boundary before anybody moved them, and this is the third of those
caught at the moment it was introduced rather than three consumers later.

Credentials travel in the broker URL, as ``mqtt://<role>:<secret>@<host>:<port>``. The
tracked configuration carries the role and no secret; the deploy-time render supplies the
secret, which appears in no tracked file. Roles are per role and not per client instance,
so a second sensor needs no new credential and gains no new permission.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from queue import Empty, Queue
from typing import Any
from urllib.parse import unquote, urlparse

from harness_core.clock import Tick
from harness_core.heartbeat import MessagePublisher

__all__ = [
    "FROM_CONFIGURATION",
    "FROM_CONFIGURATION_MESSAGES",
    "IDLE",
    "BrokerEndpoint",
    "BrokerError",
    "PahoPublisher",
    "PahoSubscription",
    "PahoTickSource",
    "connect_publisher",
    "connect_subscriber",
    "idle_interval",
    "publish_retained",
    "resolve_publisher",
    "resolve_subscriber",
]

IDLE: tuple[str, bytes] = ("", b"")
"""What a subscription yields when its idle interval elapses with no message.

A component's loop is written over the messages it receives, and every service here also has
work that is not a reaction: a heartbeat falls due, a request times out, a run finishes
assembling in staging. Before this the loop woke only when a message arrived, so a component
watching a quiet branch published one heartbeat at start-up and then went silent — greyed out
in the client while running perfectly, which is the one untruth the liveness display exists to
prevent.

The empty topic is what says "nothing arrived". MQTT forbids a zero-length topic name, so no
real message can wear it and no component's routing can mistake one for the other; a loop
tests the topic before routing and does its own work either way.
"""


def idle_interval(heartbeat_interval_seconds: float | None, *, default: float = 5.0) -> float:
    """How long a live loop waits for a message before waking to do its own work.

    Half the component's declared heartbeat interval, so a heartbeat is never missed by a
    whole cadence: waking exactly on the interval would leave every beat deciding a
    comparison by microseconds, and the first one to land on the wrong side of it would be a
    liveness window's worth of silence for no reason.
    """
    interval = default if not heartbeat_interval_seconds else float(heartbeat_interval_seconds)
    if interval <= 0:
        raise ValueError("a heartbeat interval is a positive number of host seconds")
    return interval / 2


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
        self._send(topic, payload, retain=self._retain)

    def publish_retained(self, topic: str, payload: bytes) -> None:
        """Publish one message and have the broker hold it for whoever subscribes next."""
        self._send(topic, payload, retain=True)

    def _send(self, topic: str, payload: bytes, *, retain: bool) -> None:
        if self._client is None:
            raise BrokerError("publish was called before the broker connection was opened")
        message = self._client.publish(topic, payload, qos=self._qos, retain=retain)
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


class PahoSubscription:
    """Messages on one topic filter, as ``(topic, payload)`` pairs.

    The sibling of ``PahoPublisher``, and the thing seven components were missing. Their
    entry points take ``messages: Iterable[tuple[str, bytes]] = ()`` and nothing ever passed
    one, so each ran its loop over an empty tuple, reported nothing, and exited 0 — which
    Compose reports as "the container exited cleanly, having been expected to stay up" and a
    reader reports as a component that does not work. A publisher had been wired for all of
    them; a subscriber had not, and half a connection is not a connection.

    Deliberately not built on ``PahoTickSource``. That class yields ``Tick`` objects because
    what it subscribes to is the clock, and generalising it would mean a class that sometimes
    parses its payload and sometimes does not. This yields bytes and leaves every question of
    meaning to the component, which is where the schema lives.

    The client identifier carries a suffix, because MQTT requires it to be unique across a
    broker's clients and a component that also publishes is already using the bare one. A
    collision is not reported to either party: the broker accepts the newcomer and closes the
    incumbent, and what the component then sees is its *other* connection failing.
    """

    def __init__(
        self,
        endpoint: BrokerEndpoint,
        *,
        topic: str | Sequence[str],
        qos: int = 1,
        purpose: str = "subscription",
    ) -> None:
        self._endpoint = endpoint
        # One filter or several. Several because a component's interest is not always one
        # branch — the monitor watches `obs/#` for what was measured and `ctl/run-published`
        # for what was forecast, and subscribing to a filter wide enough to cover both would
        # ask for control topics its role is refused and does not want.
        self._topics: tuple[str, ...] = (topic,) if isinstance(topic, str) else tuple(topic)
        self._qos = qos
        self._purpose = purpose
        self._messages: Queue[tuple[str, bytes]] = Queue()
        self._client: Any | None = None

    def connect(self) -> None:
        try:
            from paho.mqtt import client as mqtt
        except ImportError as error:  # pragma: no cover - the image installs it
            raise BrokerError("no MQTT client is installed, so nothing can be received") from error

        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self._endpoint.client_id}-{self._purpose}",
            protocol=mqtt.MQTTv5,
        )
        if self._endpoint.username is not None:
            client.username_pw_set(self._endpoint.username, self._endpoint.password)

        def on_message(_client: Any, _userdata: Any, message: Any) -> None:
            self._messages.put((message.topic, message.payload))

        client.on_message = on_message
        try:
            client.connect(
                self._endpoint.host,
                self._endpoint.port,
                keepalive=self._endpoint.keepalive_seconds,
            )
        except OSError as error:
            raise BrokerError(f"the broker is not reachable: {error}") from error
        for filter_ in self._topics:
            client.subscribe(filter_, qos=self._qos)
        client.loop_start()
        self._client = client

    def messages(self, *, idle_seconds: float | None = None) -> Iterator[tuple[str, bytes]]:
        """Yield messages as they arrive. Blocks; ends only when the process does.

        With ``idle_seconds`` set, a stretch of that length with nothing received yields
        :data:`IDLE` instead of waiting on. A component's loop then turns at a bounded
        cadence whether or not its branch is busy, which is what lets it beat, expire an
        outstanding request, or notice a run that has finished assembling.
        """
        if self._client is None:
            self.connect()
        while True:
            if idle_seconds is None:
                yield self._messages.get()
                continue
            try:
                yield self._messages.get(timeout=idle_seconds)
            except Empty:
                yield IDLE

    def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            client.loop_stop()
            client.disconnect()


class _FromConfiguration:
    """The default a component's ``publisher`` parameter carries: build one from config.

    ``None`` is a value a caller supplies, and it means *publish nothing* — Constitution
    VII's case, which four tests assert and which must stay exactly what it was. "Nobody
    supplied one" is a different state and needs a different value to say it in, or the two
    collapse and a caller who asked for silence gets a connection attempt instead.

    It is a publisher rather than a bare object so the parameter keeps its type, and it
    raises rather than returning quietly if one ever reaches a publish: a sentinel that
    silently discarded messages would be the stub this repository refuses to have.
    """

    def publish(self, topic: str, payload: bytes) -> None:  # pragma: no cover - unreachable
        raise BrokerError(
            "the publisher sentinel was published to; it stands for 'nobody supplied one' "
            "and should have been resolved at startup"
        )


FROM_CONFIGURATION: MessagePublisher = _FromConfiguration()
"""Nobody supplied a publisher, so the component builds one from its own configuration."""

FROM_CONFIGURATION_MESSAGES: Any = _FromConfiguration()
"""Nobody supplied a message source, so the component subscribes using its own configuration.

The same object serves both sentinels because it stands for the same thing — "nobody said" —
and because a second class would be a second place to compare against.
"""


def publish_retained(publisher: MessagePublisher, topic: str, payload: bytes) -> None:
    """Publish a message the broker should hold for whoever subscribes next.

    For the one kind of message on the control namespace that is *state* rather than an
    event: which forecast run is current. An event is only for whoever was listening; this
    one has to reach a component that connects afterwards, and every component in the loop
    connects afterwards at least once, because every component restarts.

    What that cost, before this existed, was watched happening. A run identifier is a pure
    function of the root seed and the run sequence (Constitution II), so a scheduler that
    starts counting from zero against a store that already holds run zero computes a name
    the store has — and the publisher refuses it, correctly, with "a run identifier names
    one run". The loop then stalls until the outstanding request times out, once per restart,
    for one run of the scenario. Retaining the announcement tells a starting scheduler which
    run was last published, which is the only thing it needs to carry on counting.

    The announcement stays a notification and not a source of truth: every consumer of it
    re-reads the coverage store rather than believing the message, so a retained message left
    over from a store that has since been reset costs a read and nothing else.

    ``getattr`` rather than a wider protocol, deliberately. ``MessagePublisher`` is one method
    and is satisfied by every recorder in this repository's tests; widening it to carry a
    transport concept — retention is MQTT's, not the harness's — would put that concept into
    every component that publishes anything. A publisher that cannot retain simply publishes,
    which is what it did before, and the component is no worse off than it was.
    """
    retaining = getattr(publisher, "publish_retained", None)
    if callable(retaining):
        retaining(topic, payload)
        return
    publisher.publish(topic, payload)


def connect_publisher(
    document: Mapping[str, Any], *, qos: int = 1, retain: bool = False
) -> PahoPublisher:
    """Open a publisher on the broker this component's own configuration names, or raise."""
    publisher = PahoPublisher(
        BrokerEndpoint.from_config(document["broker"]), qos=qos, retain=retain
    )
    publisher.connect()
    return publisher


def resolve_publisher(
    supplied: MessagePublisher | None,
    document: Mapping[str, Any],
    *,
    component: str,
    report: Any,
    qos: int = 1,
    retain: bool = False,
) -> tuple[MessagePublisher | None, PahoPublisher | None]:
    """Settle which of the three publisher states a component is starting in.

    Returns the publisher to use — possibly ``None`` — and the one this call opened and is
    therefore responsible for closing, which is ``None`` in every case but the third.

    1. *A caller supplied one, or supplied ``None``.* Taken as given. ``None`` means publish
       nothing, and no connection is attempted: a caller that asked for silence should not
       pay for a name lookup, nor read a line about a broker it never wanted.
    2. *Nobody supplied one and the configuration names no broker.* The component publishes
       nothing and says so in its own words, which is what it did before any of this: it
       does not invent a client and does not publish to a stub (Constitution VII).
    3. *Nobody supplied one and the configuration names a broker.* A client is built from
       that configuration — endpoint and credentials both, so neither appears in source
       (Constitution IV) — and used.

    When the third case cannot connect, the failure is reported on stderr in full and the
    component carries on with nothing to publish to. That is the deliberate half of this,
    so it is worth saying why it is not what the sensors do. A sensor exists to publish
    observations; with no broker it has no work at all, so it retries with bounded backoff
    spent in simulation time and then stops with a distinct exit code. Every component here
    has work that is not publishing — the clock advances the run and serves time over HTTP,
    the generator writes a world, the packager transfers bundles — and none of them holds a
    tick stream to spend a backoff in, so the sensors' retry is not available to them and
    waiting on the host clock is what Constitution I forbids outright. Making the failure
    fatal instead would mean every one of these components refuses to start against a broker
    that is merely slow to come up, which none of them did before.

    What both policies share is the rule that actually matters, and neither bends it: a
    component never publishes to a stub and never reports itself alive while it is not
    connected. It is greyed out in the client, truthfully, and stderr says which of the two
    reasons applies.
    """
    if supplied is not FROM_CONFIGURATION:
        return supplied, None
    if "broker" not in document:
        return None, None
    try:
        opened = connect_publisher(document, qos=qos, retain=retain)
    except BrokerError as failure:
        print(
            f"{component}: {failure}, so this component publishes nothing and is greyed "
            "out in the client rather than falsely lit",
            file=report,
        )
        return None, None
    return opened, opened


def connect_subscriber(
    document: Mapping[str, Any],
    *,
    topic: str | Sequence[str],
    qos: int = 1,
    purpose: str = "subscription",
) -> PahoSubscription:
    """Open a subscription on the broker this component's own configuration names, or raise."""
    subscription = PahoSubscription(
        BrokerEndpoint.from_config(document["broker"]), topic=topic, qos=qos, purpose=purpose
    )
    subscription.connect()
    return subscription


def resolve_subscriber(
    supplied: Iterable[tuple[str, bytes]] | None,
    document: Mapping[str, Any],
    *,
    component: str,
    topic: str | Sequence[str],
    report: Any,
    qos: int = 1,
    purpose: str = "subscription",
    idle_seconds: float | None = None,
) -> tuple[Iterable[tuple[str, bytes]], PahoSubscription | None]:
    """Settle where a component's messages come from. The mirror of ``resolve_publisher``.

    Returns the message source and the subscription this call opened, which the caller is
    responsible for closing and which is ``None`` in every case but the third.

    The three states are the publisher's three, read the other way round:

    1. *A caller supplied a source.* Taken as given, empty tuple included — that is how every
       test in this repository drives these components, feeding a fixed list of messages and
       asserting what came out, and it must keep working exactly as it did.
    2. *Nobody supplied one and the configuration names no broker.* The component has nothing
       to react to and says so in its own words. It does not invent a source and does not
       subscribe to a stub (Constitution VII).
    3. *Nobody supplied one and the configuration names a broker.* A subscription is built
       from that configuration and the component reacts to what actually arrives.

    Case 1 is why the default is a sentinel rather than ``()``. "Nobody supplied one" and
    "somebody supplied nothing" are different states, and collapsing them is precisely the
    bug this repairs: the parameter defaulted to an empty tuple, so every component in a
    container looked like a caller who had asked for silence, ran its loop over nothing, and
    exited 0 while reporting no error of any kind.

    A failure to connect is reported and is not fatal, on the same reasoning
    ``resolve_publisher`` sets out: these components have work that is not reacting, and none
    of them holds a tick stream to spend a backoff in.

    ``idle_seconds`` reaches the subscription in case 3 alone. A caller that supplied its own
    source decides its own cadence, and a component with nothing subscribed has no loop left
    to pace: it says so and its loop ends, which is what it did before any of this.
    """
    if supplied is not FROM_CONFIGURATION_MESSAGES:
        return (() if supplied is None else supplied), None
    if "broker" not in document:
        print(
            f"{component}: no broker is configured, so nothing is subscribed to and this "
            "component reacts to nothing. That is truthful, not a degradation",
            file=report,
        )
        return (), None
    try:
        opened = connect_subscriber(document, topic=topic, qos=qos, purpose=purpose)
    except BrokerError as failure:
        print(
            f"{component}: {failure}, so this component receives nothing and reacts to "
            "nothing rather than falsely reporting itself at work",
            file=report,
        )
        return (), None
    return opened.messages(idle_seconds=idle_seconds), opened
