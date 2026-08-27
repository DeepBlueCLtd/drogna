"""Real nginx, real upstream: the scaffolding the request matrix uses.

The boundary is nginx and a rendered configuration. Almost everything interesting about it
is a property of nginx's own processing — which phase a directive runs in, how a prefix
location and an exact location compete, what the server does with a percent-encoded
separator — and none of that can be checked by reading the rendered file back. So these
tests stand the real image from ``deploy/compose.yaml`` in front of a stub upstream that
records every request it is given, and drive it over the network.

Two things the stub gives that a real query layer would not. It records what reached it,
which is the difference between refusing a request and proxying it and then refusing the
answer (FR-001); and it can be given a collection it did not have a moment ago, without
re-rendering the proxy, which is how SC-002 is checked.

Both containers run as the invoking user. Neither writes into a bind mount — the logs are
nginx's own symlinks to standard output, read back with ``docker logs`` — but the rule is
kept anyway, because the exception is how it stops being the rule. ``/var/run`` and
``/var/cache/nginx`` are given writable tmpfs mounts, since a non-root nginx cannot write
its pid file into a root-owned directory.

Host time appears here, in the wait that decides when a container is ready. That is test
harness setup, which Constitution I permits; nothing here is an operational path.
"""

from __future__ import annotations

import base64
import hashlib
import itertools
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from proxy.render_config import render_from_document  # noqa: E402

# The image deploy/compose.yaml pins for C-10. What is exercised here is what a destination
# runs, which is the only reason a container test is worth its cost.
PROXY_IMAGE = (
    "nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10"
)

CLEARED = ("drogna", "released-secret")
UNCLEARED = ("nobody", "no-secret")

_READY_TIMEOUT = 30.0

# Container and network names must be unique across concurrent runs and must not come from
# entropy: the seeded-RNG gate scans this directory like any other. The process and a
# counter give a name that is unique where it needs to be and reproducible within a run.
_NAMES = itertools.count(1)


def _name(kind: str) -> str:
    return f"drogna-{kind}-{os.getpid()}-{next(_NAMES)}"


@dataclass(frozen=True)
class ContainerSupport:
    """Whether this machine can run these tests, and if not, exactly what is missing."""

    usable: bool
    reason: str = ""


def _run(command: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(list(command), capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(
            f"{' '.join(command[:4])} failed ({result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace')[-2000:]}"
        )
    return result


def _user() -> str:
    return f"{os.getuid()}:{os.getgid()}"


@cache
def container_support() -> ContainerSupport:
    """Probe once for everything these tests need, and name whatever is absent.

    The last check is the one that is easy to miss and expensive to discover as an error
    rather than a skip: whether the pinned nginx image will start at all as a user that is
    not root. It will not without somewhere writable for its pid file, and a machine whose
    runtime refuses the tmpfs mounts that provide it cannot run these tests. Better to say
    so in a skip line than to fail twenty of them with a container log.
    """
    if shutil.which("docker") is None:
        return ContainerSupport(False, "no docker client on the path")
    if _run(["docker", "info"], check=False).returncode != 0:
        return ContainerSupport(False, "the container daemon is not reachable")
    absent = _run(["docker", "image", "inspect", PROXY_IMAGE], check=False).returncode != 0
    if absent and _run(["docker", "pull", PROXY_IMAGE], check=False).returncode != 0:
        return ContainerSupport(False, "the pinned nginx image is not present and cannot be pulled")
    probe = _name("probe")
    started = _run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            probe,
            "--user",
            _user(),
            "--tmpfs",
            "/var/run:rw,mode=1777",
            "--tmpfs",
            "/var/cache/nginx:rw,mode=1777",
            PROXY_IMAGE,
        ],
        check=False,
    )
    if started.returncode != 0:
        return ContainerSupport(False, "a container cannot be started here")
    try:
        for _ in range(20):
            state = _run(["docker", "inspect", "-f", "{{.State.Running}}", probe], check=False)
            if state.stdout.decode().strip() == "true":
                return ContainerSupport(True)
            time.sleep(0.25)  # harness:allow-wallclock test harness setup; waiting on a container
        return ContainerSupport(
            False, "the pinned nginx image does not stay running as a non-root user here"
        )
    finally:
        _run(["docker", "rm", "-f", probe], check=False)


def skip_reason() -> str:
    """What to tell the reader when they cannot. Never empty when they cannot."""
    support = container_support()
    return f"{support.reason}; nginx in these tests is real" if not support.usable else ""


def skip_without_containers() -> Any:
    """The module-level mark these tests carry: skip with the reason, never fail, never pass."""
    support = container_support()
    return pytest.mark.skipif(
        not support.usable, reason=skip_reason() or "a container runtime is available"
    )


def credentials(user: str, secret: str) -> str:
    """One line of an nginx credential file, in the RFC 2307 form nginx implements.

    `{SHA}` rather than crypt, because it is computable here with nothing installed. The
    credential is generated per test run and thrown away; no value of one appears in a
    tracked file.
    """
    digest = base64.b64encode(hashlib.sha1(secret.encode("utf-8")).digest()).decode("ascii")
    return f"{user}:{{SHA}}{digest}\n"


def authorisation(user: str, secret: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{secret}".encode()).decode("ascii")


@dataclass(frozen=True)
class Response:
    """What came back. Compared field by field, so a difference names itself."""

    status: int
    body: bytes
    headers: tuple[tuple[str, str], ...]

    def comparable(self) -> tuple[int, bytes, tuple[tuple[str, str], ...]]:
        """Status, body, and the headers that are not per-response noise.

        `Date` and `Connection` differ between two responses that are otherwise the same
        one, and asserting on them would make FR-006's uniformity untestable rather than
        untrue. Everything else is compared, `WWW-Authenticate` and `Content-Length`
        included, because those are where a difference between one path and another would
        actually show up.
        """
        ignored = {"date", "connection", "keep-alive"}
        return (
            self.status,
            self.body,
            tuple(sorted((k, v) for k, v in self.headers if k.lower() not in ignored)),
        )


COLLECTION_PATH = "/query/collections"


@dataclass(frozen=True)
class Boundary:
    """A running proxy, the stub behind it, and the two things a test does with them."""

    port: int
    upstream_port: int
    proxy_container: str
    upstream_container: str

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        clearance: tuple[str, str] | None = CLEARED,
        headers: Mapping[str, str] | None = None,
    ) -> Response:
        """One request, with or without the clearance. A refusal is a response, not an error."""
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method)
        if clearance is not None:
            request.add_header("Authorization", authorisation(*clearance))
        for name, value in (headers or {}).items():
            request.add_header(name, value)
        try:
            with urllib.request.urlopen(request, timeout=10) as answer:
                return Response(answer.status, answer.read(), tuple(answer.headers.items()))
        except urllib.error.HTTPError as refusal:
            return Response(refusal.code, refusal.read(), tuple(refusal.headers.items()))

    def upstream_directly(self, path: str) -> Response:
        """The same request, put to the stub with the boundary out of the way.

        US2 scenario 1 asks for the proxied body to be byte-identical to the upstream body
        for the same request. That is only checkable against the upstream response itself,
        so the stub is published too — on its own host port, reachable only from this
        machine, and never in a deployment.
        """
        request = urllib.request.Request(f"http://127.0.0.1:{self.upstream_port}{path}")
        try:
            with urllib.request.urlopen(request, timeout=10) as answer:
                return Response(answer.status, answer.read(), tuple(answer.headers.items()))
        except urllib.error.HTTPError as refusal:
            return Response(refusal.code, refusal.read(), tuple(refusal.headers.items()))

    def upstream_log(self) -> list[str]:
        """Every request the stub upstream was actually given, in order.

        This is the difference between refusing a request and proxying it and then
        refusing the answer. FR-001 asks for the first, and only this can tell them apart.
        """
        text = _run(["docker", "logs", self.upstream_container], check=False)
        combined = text.stdout.decode("utf-8", errors="replace")
        combined += text.stderr.decode("utf-8", errors="replace")
        return [line for line in combined.splitlines() if line.startswith("upstream ")]

    def refusal_log(self) -> list[str]:
        """Every line the proxy wrote about a request, with the rule that decided it."""
        text = _run(["docker", "logs", self.proxy_container], check=False)
        combined = text.stdout.decode("utf-8", errors="replace")
        combined += text.stderr.decode("utf-8", errors="replace")
        return [line for line in combined.splitlines() if "rule=" in line]

    def serve_additionally(self, identifier: str) -> None:
        """Give the stub a collection it did not have, without re-rendering the proxy.

        SRD FR-21 makes a new coverage collection servable without configuration change.
        SC-002 says the public response matrix must not move when that happens, and this is
        how a test makes it happen.
        """
        served = f"/usr/share/nginx/html{COLLECTION_PATH}/{identifier}"
        _run(
            [
                "docker",
                "exec",
                self.upstream_container,
                "sh",
                "-c",
                f"printf '%s' 'served-{identifier}' > {served}",
            ]
        )


UPSTREAM_CONFIG = """
log_format upstream 'upstream $request_method $uri';

server {
    listen 8080;
    access_log /var/log/nginx/access.log upstream;

    root /usr/share/nginx/html;

    # Everything the query layer would advertise, answered from a file so that a test can
    # add one while the container runs. A request for something absent is logged and
    # answered 404 — logged, because the point of this stub is what reached it.
    location / {
        try_files $uri =404;
    }
}
"""


def _write_upstream(directory: Path, collections: Sequence[str], documents: Sequence[str]) -> None:
    """Lay the stub out at the paths the query layer would use, not at paths that suit us.

    The collections sit beneath the query layer's own collection path and the documents
    that enumerate them sit beside it, because the request matrix is about what happens
    when a caller asks for those native paths through the boundary.
    """
    root = directory / "html"
    served = root / COLLECTION_PATH.strip("/")
    served.mkdir(parents=True, exist_ok=True)
    for identifier in collections:
        (served / identifier).write_text(f"served-{identifier}", encoding="utf-8")
    for document in documents:
        (served.parent / document).write_text(f"document-{document}", encoding="utf-8")
    (directory / "upstream.conf").write_text(UPSTREAM_CONFIG, encoding="utf-8")
    (directory / "default.conf").write_text("", encoding="utf-8")
    for entry in (directory / "upstream.conf", directory / "default.conf"):
        entry.chmod(0o644)
    for entry in root.rglob("*"):
        entry.chmod(0o755 if entry.is_dir() else 0o644)
    root.chmod(0o755)
    directory.chmod(0o755)


def _wait_for(boundary: Boundary, path: str) -> None:
    deadline = time.monotonic() + _READY_TIMEOUT  # harness:allow-wallclock test harness setup
    while time.monotonic() < deadline:  # harness:allow-wallclock test harness setup
        try:
            if boundary.request(path, clearance=None).status in (401, 404, 200):
                return
        except OSError:
            pass
        time.sleep(0.25)  # harness:allow-wallclock test harness setup; waiting on a container
    raise RuntimeError(f"the proxy never answered on {path}")


def _published_port(container: str, port: int) -> int:
    mapped = _run(["docker", "port", container, f"{port}/tcp"]).stdout.decode().strip()
    return int(mapped.splitlines()[0].rsplit(":", 1)[1])


def start_boundary(
    tmp_path: Path,
    document: Mapping[str, Any],
    *,
    served: Sequence[str],
    documents: Sequence[str] = (),
) -> Iterator[Boundary]:
    """Stand the boundary and its stub upstream up, and take them down afterwards.

    ``document`` is the destination-shaped configuration the served file is rendered from,
    with the upstream rewritten to the stub's name on the network created here. Nothing
    about the rendering is special to the test: it is the same function the entrypoint
    calls.
    """
    if not container_support().usable:
        pytest.skip(skip_reason())

    network = _name("net")
    upstream_container = _name("upstream")
    proxy_container = _name("proxy")

    upstream_directory = tmp_path / "upstream"
    upstream_directory.mkdir(parents=True, exist_ok=True)
    _write_upstream(upstream_directory, served, documents)

    proxy_directory = tmp_path / "proxy"
    proxy_directory.mkdir(parents=True, exist_ok=True)
    settled = json.loads(json.dumps(document))
    settled["proxy"]["upstream"]["query"]["url"] = f"http://{upstream_container}:8080"
    settled["proxy"]["upstream"]["query"]["collection_path"] = COLLECTION_PATH
    settled["proxy"]["credentials"]["file"] = "/etc/drogna/proxy.htpasswd"
    settled["proxy"]["tls"]["enabled"] = False
    settled["proxy"]["listen"]["port"] = 8080
    (proxy_directory / "harness.conf").write_text(render_from_document(settled), encoding="utf-8")
    (proxy_directory / "default.conf").write_text("", encoding="utf-8")
    (proxy_directory / "proxy.htpasswd").write_text(credentials(*CLEARED), encoding="utf-8")
    for entry in proxy_directory.iterdir():
        entry.chmod(0o644)
    proxy_directory.chmod(0o755)

    _run(["docker", "network", "create", network])
    try:
        _run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                upstream_container,
                "--network",
                network,
                "--user",
                _user(),
                "--tmpfs",
                "/var/run:rw,mode=1777",
                "--tmpfs",
                "/var/cache/nginx:rw,mode=1777",
                "-v",
                f"{upstream_directory / 'upstream.conf'}:/etc/nginx/conf.d/upstream.conf:ro",
                "-v",
                f"{upstream_directory / 'default.conf'}:/etc/nginx/conf.d/default.conf:ro",
                "-v",
                f"{upstream_directory / 'html'}:/usr/share/nginx/html",
                "-p",
                "127.0.0.1::8080",
                PROXY_IMAGE,
            ]
        )
        _run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                proxy_container,
                "--network",
                network,
                "--user",
                _user(),
                "--tmpfs",
                "/var/run:rw,mode=1777",
                "--tmpfs",
                "/var/cache/nginx:rw,mode=1777",
                "-v",
                f"{proxy_directory / 'harness.conf'}:/etc/nginx/conf.d/harness.conf:ro",
                "-v",
                f"{proxy_directory / 'default.conf'}:/etc/nginx/conf.d/default.conf:ro",
                "-v",
                f"{proxy_directory / 'proxy.htpasswd'}:/etc/drogna/proxy.htpasswd:ro",
                "-p",
                "127.0.0.1::8080",
                PROXY_IMAGE,
            ]
        )
        boundary = Boundary(
            port=_published_port(proxy_container, 8080),
            upstream_port=_published_port(upstream_container, 8080),
            proxy_container=proxy_container,
            upstream_container=upstream_container,
        )
        _wait_for(boundary, "/")
        yield boundary
    finally:
        _run(["docker", "rm", "-f", proxy_container], check=False)
        _run(["docker", "rm", "-f", upstream_container], check=False)
        _run(["docker", "network", "rm", network], check=False)
