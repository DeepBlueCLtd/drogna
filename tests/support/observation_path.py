"""Real broker, real store: the scaffolding the observation path's integration tests use.

These tests run against a Mosquitto container loaded with the tracked configuration from
``deploy/broker/`` and a PostGIS container with the migrations and grants from
``stores/observations/`` and ``stores/features/`` applied. That is the whole point of
them. An access control list is not tested by reading the file back; it is tested by
attempting a forbidden publish and being refused, and that needs a broker. The same goes
for a grant, and for a transaction.

Two conveniences and no shortcuts. The images are the ones ``deploy/compose.yaml`` pins by
digest, so what is exercised here is what a destination runs. The credentials are generated
per test run and thrown away, because credentials are per role and per deployment and no
value of one appears in a tracked file.

Host time appears in this module, in the waits that decide when a container is ready. That
is test harness setup, which Constitution I permits; nothing here is an operational path
and no value derived from it reaches a component.
"""

from __future__ import annotations

import itertools
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BROKER_CONFIG = REPO_ROOT / "deploy" / "broker"
OBSERVATION_STORE = REPO_ROOT / "stores" / "observations"
FEATURE_STORE = REPO_ROOT / "stores" / "features"

BROKER_IMAGE = (
    "eclipse-mosquitto:2.0.22@sha256:"
    "212f89e1eaeb2c322d6441b64396e3346026674db8fa9c27beac293405c32b3c"
)
STORE_IMAGE = (
    "postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5"
)

ROLES: dict[str, str] = {
    "drogna_sensor": "sensor-secret",
    "drogna_ingest": "ingest-secret",
    "drogna_control": "control-secret",
    "drogna_viewer": "viewer-secret",
}

DATABASE = "drogna"
OWNER = "drogna"
OWNER_PASSWORD = "owner-secret"
DATABASE_ROLES: dict[str, str] = {
    "drogna_ingest": "ingest-database-secret",
    "drogna_read": "read-database-secret",
    "drogna_telemetry": "telemetry-database-secret",
}

_READY_TIMEOUT = 60.0

# Container names have to be unique within a host and across concurrent runs, and they must
# not come from entropy — the seeded-RNG gate scans this directory like any other, and an
# identifier drawn from a random source is exactly what it is looking for. The process and a
# counter give a name that is unique where it needs to be and reproducible within a run.
_NAMES = itertools.count(1)


def _container_name(kind: str) -> str:
    return f"drogna-{kind}-{os.getpid()}-{next(_NAMES)}"


@dataclass(frozen=True)
class ContainerSupport:
    """Whether this machine can run these tests, and if not, exactly what is missing."""

    usable: bool
    reason: str = ""


@cache
def container_support() -> ContainerSupport:
    """Probe once for everything these tests need, and name whatever is absent.

    A container-backed test must skip where the environment cannot give it a container —
    loudly, and never by quietly passing. A test that passes without its container is a
    check that examines nothing, which is the failure this repository's gates exist to
    prevent; a test that errors makes the whole run useless as a signal. So this probes,
    once per session, for each thing that has actually gone wrong somewhere:

    - the client and a reachable daemon;
    - the pinned images, pulling them if the machine has not got them;
    - and the one that is easy to miss — that a file a container writes into a bind mount
      is usable afterwards by whoever is running the tests. As root the question does not
      arise. On a CI runner that is not root it decides whether the broker can be given a
      credential file at all.
    """
    if shutil.which("docker") is None:
        return ContainerSupport(False, "no docker client on the path")
    info = _run(["docker", "info"], check=False)
    if info.returncode != 0:
        detail = info.stderr.decode("utf-8", errors="replace").strip().splitlines()
        return ContainerSupport(
            False,
            "the container daemon is not reachable" + (f": {detail[-1]}" if detail else ""),
        )
    for image in (BROKER_IMAGE, STORE_IMAGE):
        if _run(["docker", "image", "inspect", image], check=False).returncode == 0:
            continue
        pull = _run(["docker", "pull", image], check=False)
        if pull.returncode != 0:
            return ContainerSupport(
                False,
                f"the pinned image {image.split('@')[0]} is not present and cannot be pulled",
            )
    with tempfile.TemporaryDirectory() as scratch:
        written = _run(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{scratch}:/work",
                BROKER_IMAGE,
                "sh",
                "-c",
                "echo probe > /work/probe && chmod 0640 /work/probe",
            ],
            check=False,
        )
        if written.returncode != 0:
            detail = written.stderr.decode("utf-8", errors="replace").strip().splitlines()
            return ContainerSupport(
                False,
                "a container cannot write into a bind mount here"
                + (f": {detail[-1]}" if detail else ""),
            )
        probe = Path(scratch) / "probe"
        if not probe.is_file():
            return ContainerSupport(False, "a file a container wrote into a bind mount is absent")
    return ContainerSupport(True)


def docker_available() -> bool:
    """Whether these tests can run at all. The reason for a no is in :func:`container_support`."""
    return container_support().usable


def skip_reason() -> str:
    """What to tell the reader when they cannot. Never empty when they cannot."""
    support = container_support()
    return (
        f"{support.reason}; the broker and the store in these tests are real"
        if not support.usable
        else ""
    )


def requires_docker() -> None:
    """Skip, loudly and with the reason, where the environment cannot oblige."""
    if not container_support().usable:
        pytest.skip(skip_reason())


def skip_without_containers() -> Any:
    """The module-level mark these tests carry: skip with the reason, never fail, never pass.

    The reason names what was actually missing — no client, an unreachable daemon, an image
    that cannot be pulled, a bind mount a container cannot write to. A run that skips
    twenty-seven tests should say why in a line somebody can act on, rather than leaving
    them to guess which of four things their machine lacks.
    """
    support = container_support()
    return pytest.mark.skipif(
        not support.usable, reason=skip_reason() or "a container runtime is available"
    )


def _run(command: Sequence[str], *, check: bool = True, stdin: bytes | None = None):
    result = subprocess.run(list(command), input=stdin, capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(
            f"{' '.join(command[:4])} failed ({result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace')[-2000:]}"
        )
    return result


def _published_port(container: str, port: int) -> int:
    mapped = _run(["docker", "port", container, f"{port}/tcp"]).stdout.decode().strip()
    return int(mapped.splitlines()[0].rsplit(":", 1)[1])


def _wait_until(predicate, *, what: str) -> None:
    # harness:allow-wallclock test harness setup; deciding when a container is ready
    deadline = time.monotonic() + _READY_TIMEOUT
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.2)
    raise RuntimeError(f"{what} did not become ready within {_READY_TIMEOUT} seconds")


@dataclass(frozen=True)
class Broker:
    """A running broker, loaded with the configuration this feature owns."""

    container: str
    port: int
    log_path: Path

    def url(self, role: str) -> str:
        """The broker URL for one role, credentials and all, as configuration carries it."""
        return f"mqtt://{role}:{ROLES[role]}@127.0.0.1:{self.port}"

    def logs(self) -> str:
        return _run(["docker", "logs", self.container], check=False).stdout.decode("utf-8")

    def publish(self, role: str, topic: str, message: str, *, qos: int = 1):
        """Publish as a role, through the broker's own client. Returns the completed process."""
        return _run(
            [
                "docker",
                "run",
                "--rm",
                "--network",
                f"container:{self.container}",
                BROKER_IMAGE,
                "mosquitto_pub",
                "-V",
                "5",
                "-h",
                "localhost",
                "-u",
                role,
                "-P",
                ROLES[role],
                "-t",
                topic,
                "-m",
                message,
                "-q",
                str(qos),
            ],
            check=False,
        )

    def subscribe(self, role: str, topic: str, *, seconds: int = 3, count: int | None = None):
        """Subscribe as a role for a fixed wait. Returns the completed process."""
        command = [
            "docker",
            "run",
            "--rm",
            "--network",
            f"container:{self.container}",
            BROKER_IMAGE,
            "mosquitto_sub",
            "-V",
            "5",
            "-h",
            "localhost",
            "-u",
            role,
            "-P",
            ROLES[role],
            "-t",
            topic,
            "-W",
            str(seconds),
        ]
        if count is not None:
            command.extend(["-C", str(count)])
        return _run(command, check=False)

    def background_subscriber(self, role: str, topic: str, *, seconds: int = 8) -> str:
        """Start a subscriber that runs for ``seconds`` and returns its container name."""
        name = _container_name("sub")
        _run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                name,
                "--network",
                f"container:{self.container}",
                BROKER_IMAGE,
                "mosquitto_sub",
                "-V",
                "5",
                "-h",
                "localhost",
                "-u",
                role,
                "-P",
                ROLES[role],
                "-t",
                topic,
                "-W",
                str(seconds),
            ]
        )
        return name


def _write_credentials(directory: Path) -> None:
    """Produce the broker's password file the way the deployment does: with its own tool.

    The container runs as the invoking user rather than as root. Without that, the file it
    creates on the host belongs to root, and the ``chmod`` below then fails with EPERM
    wherever the tests are not themselves run as root — which is every continuous
    integration runner, and none of the development containers where this was written. The
    tests passed locally and errored in CI for that reason alone, twenty-seven of them, and
    the cause was a permission rather than anything the tests assert.
    """
    user = f"{os.getuid()}:{os.getgid()}"
    first = True
    for role, secret in ROLES.items():
        flags = ["-c", "-b"] if first else ["-b"]
        _run(
            [
                "docker",
                "run",
                "--rm",
                "--user",
                user,
                "-v",
                f"{directory}:/work",
                BROKER_IMAGE,
                "mosquitto_passwd",
                *flags,
                "/work/passwd",
                role,
                secret,
            ]
        )
        first = False

    credentials = directory / "passwd"
    if credentials.stat().st_uid != os.getuid():
        raise RuntimeError(
            f"{credentials} belongs to uid {credentials.stat().st_uid}, not to this "
            f"process ({os.getuid()}). The container ignored --user, so the chmod below "
            "would fail with a bare EPERM naming only the path. Say it here instead."
        )
    credentials.chmod(0o644)


def start_broker(tmp_path: Path, *, configuration: Path | None = None) -> Iterator[Broker]:
    """Start a broker with a tracked configuration, and stop it afterwards.

    ``configuration`` is the directory the files come from: ``deploy/broker/`` by default,
    and ``deploy/broker/two-broker/`` for the physical-separation fallback. Both are
    tracked, and neither is written by this module — copying them is how these tests test
    the files a destination actually mounts.
    """
    requires_docker()
    source = configuration or BROKER_CONFIG
    directory = tmp_path / "broker"
    directory.mkdir(parents=True, exist_ok=True)
    # The broker runs as its own unprivileged user inside the container, so it needs to be
    # able to traverse this directory and read what is in it. A temporary directory is
    # private to its creator by default, which is right everywhere except here. These are
    # files this process has just made, so setting their mode needs no privilege — unlike
    # the credential file, which the container makes and the container finishes with.
    directory.chmod(0o755)
    for name in ("mosquitto.conf", "acl"):
        shutil.copy(source / name, directory / name)
        (directory / name).chmod(0o644)
    _write_credentials(directory)

    container = _container_name("broker")
    _run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            container,
            "-v",
            f"{directory}:/mosquitto/config:ro",
            "-p",
            "127.0.0.1::1883",
            "-p",
            "127.0.0.1::9001",
            BROKER_IMAGE,
        ]
    )
    try:
        _wait_until(
            lambda: (
                "mosquitto version 2.0.22 running"
                in _run(["docker", "logs", container], check=False).stdout.decode("utf-8")
            ),
            what="the broker",
        )
        yield Broker(
            container=container,
            port=_published_port(container, 1883),
            log_path=directory,
        )
    finally:
        _run(["docker", "rm", "-f", container], check=False)


def websocket_port(broker: Broker) -> int:
    """The published port of the WebSocket listener ADR-0008's upgrade location proxies to."""
    return _published_port(broker.container, 9001)


@dataclass(frozen=True)
class Store:
    """A running Postgres instance with both schemas applied."""

    container: str
    port: int

    def dsn(self, role: str) -> str:
        secret = DATABASE_ROLES.get(role, OWNER_PASSWORD)
        return f"postgresql://{role}:{secret}@127.0.0.1:{self.port}/{DATABASE}"

    def psql(self, statement: str, *, role: str = OWNER, check: bool = True):
        secret = DATABASE_ROLES.get(role, OWNER_PASSWORD)
        return _run(
            [
                "docker",
                "exec",
                "-e",
                f"PGPASSWORD={secret}",
                self.container,
                "psql",
                "-qtA",
                "-h",
                "127.0.0.1",
                "-U",
                role,
                "-d",
                DATABASE,
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                statement,
            ],
            check=check,
        )

    def scalar(self, statement: str, *, role: str = OWNER) -> str:
        return self.psql(statement, role=role).stdout.decode("utf-8").strip()

    def apply(self, sql: str, *, role: str = OWNER) -> None:
        secret = DATABASE_ROLES.get(role, OWNER_PASSWORD)
        _run(
            [
                "docker",
                "exec",
                "-i",
                "-e",
                f"PGPASSWORD={secret}",
                self.container,
                "psql",
                "-q",
                "-h",
                "127.0.0.1",
                "-U",
                role,
                "-d",
                DATABASE,
                "-v",
                "ON_ERROR_STOP=1",
            ],
            stdin=sql.encode("utf-8"),
        )


def observation_store_sql() -> str:
    """The provisioning SQL, composed by the store's own tooling rather than by this test."""
    import sys

    if str(OBSERVATION_STORE) not in sys.path:
        sys.path.insert(0, str(OBSERVATION_STORE))
    import apply as store_tooling

    return store_tooling.composed_sql(OBSERVATION_STORE)


def start_store(tmp_path: Path) -> Iterator[Store]:
    """Start Postgres, apply the migrations and the grants, and stop it afterwards."""
    requires_docker()
    container = _container_name("store")
    _run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            container,
            "-e",
            f"POSTGRES_DB={DATABASE}",
            "-e",
            f"POSTGRES_USER={OWNER}",
            "-e",
            f"POSTGRES_PASSWORD={OWNER_PASSWORD}",
            "-p",
            "127.0.0.1::5432",
            STORE_IMAGE,
        ]
    )
    try:
        _wait_until(
            # Over TCP, not over the socket: the image bootstraps on a socket first and
            # answers there before it is listening, so a socket check passes too early.
            lambda: (
                _run(
                    [
                        "docker",
                        "exec",
                        container,
                        "pg_isready",
                        "-h",
                        "127.0.0.1",
                        "-U",
                        OWNER,
                        "-d",
                        DATABASE,
                    ],
                    check=False,
                ).returncode
                == 0
            ),
            what="the observation store",
        )
        store = Store(container=container, port=_published_port(container, 5432))
        store.apply(observation_store_sql())
        for role, secret in DATABASE_ROLES.items():
            store.psql(f"ALTER ROLE {role} PASSWORD '{secret}'")
        yield store
    finally:
        _run(["docker", "rm", "-f", container], check=False)


def feature_store_sql(config: Path, *, emit: str) -> str:
    """The feature store's schema, content or digest report, from its own script.

    Run with the interpreter running the tests rather than through a launcher, so it works
    the same wherever the tests are run from and needs nothing on the path.
    """
    result = subprocess.run(
        [sys.executable, str(FEATURE_STORE / "provision.py"), "--emit", emit],
        check=True,
        capture_output=True,
        cwd=REPO_ROOT,
        env={**os.environ, "HARNESS_CONFIG": str(config)},
    )
    return result.stdout.decode("utf-8")


def destination_config(name: str) -> dict[str, Any]:
    """One of the tracked local configuration files, as a starting point for a test's own."""
    path = REPO_ROOT / "config" / "local" / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def write_config(directory: Path, name: str, document: dict[str, Any]) -> Path:
    path = directory / f"{name}.json"
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    return path
