"""Getting a bundle to the destination without ever letting a partial object be acknowledged.

**Temporary name, then reveal.** The bytes are written at the destination under a name
nothing looks for, and made visible under the bundle's own name only when the last byte has
arrived. A destination that never sees a partial object under its real name can never issue
a receipt for one, so the acknowledgement path has no case to get wrong — which is better
than a destination that checks a length and is right most of the time. This mirrors the
publisher's own rule (SRD FR-30) for the same reason.

**Idempotent under retry.** A transfer interrupted anywhere is retried by starting again at
the temporary name, and the reveal replaces whatever the temporary name held. Uploading a
bundle the destination already holds is a no-op that returns the same receipt, because the
receipt is a statement about bytes and the bytes have not changed.

**Not a port.** There is one destination implementation, reached over HTTP, and Constitution
VI is explicit that a single implementation dressed as an interface is a lie about the
design. The :class:`Destination` protocol below exists because the crash-injection and
failure-path tests need to present a destination that misbehaves in one specific way, and a
stub that misbehaves is not a second implementation of anything. A genuine second
destination — an object store, say — would need an ADR.

**No receipt is composed here.** What comes back is whatever the destination said, handed
to :mod:`harness_offload.verify` unexamined. A transfer that helpfully filled in a missing
field, or that returned the digest it had just sent when the destination returned none,
would be the whole guarantee undone in a helper function.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urljoin

__all__ = [
    "Destination",
    "HttpDestination",
    "TransferError",
    "TransferOutcome",
    "send",
    "temporary_name_for",
]


class TransferError(Exception):
    """The destination could not be reached, or refused. The local bytes are untouched."""


def temporary_name_for(bundle_id: str) -> str:
    """The name a bundle occupies at the destination while it is still arriving.

    Derived from the bundle identifier, so a retry lands on the same temporary name and
    replaces the remains of the attempt before it rather than accumulating them.
    """
    return f"{bundle_id}.partial"


@dataclass(frozen=True)
class TransferOutcome:
    """What a transfer produced: the name it committed under, and the receipt, if any.

    ``receipt`` is ``None`` when the destination returned success with no body. That is one
    of the failure paths FR-009 names, and it is carried as an outcome rather than raised,
    because "the destination said yes and told us nothing" is a thing verification must be
    given the chance to refuse.
    """

    bundle_id: str
    byte_count: int
    receipt: Mapping[str, Any] | None


class Destination(Protocol):
    """The receiving endpoint. One implementation; the stubs in tests are not a second."""

    @property
    def id(self) -> str: ...

    def upload(self, temporary_name: str, payload: bytes) -> None:
        """Place the bytes under a name nothing serves and nothing acknowledges."""
        ...

    def commit(self, temporary_name: str, bundle_id: str, declared_digest: str) -> None:
        """Make the object visible under the bundle's own name, atomically.

        ``declared_digest`` is what the sender believes it sent. An honest destination
        ignores it and computes its own over the bytes that arrived; it is carried because
        a destination that trusts it is precisely the destination the echoing test
        presents, and a protocol with nowhere to put a declared digest could not present
        one.
        """
        ...

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        """What the destination says it holds, or nothing when it will not say."""
        ...


class HttpDestination:
    """The one destination: three routes over HTTP, every one of them from configuration.

    ``urllib`` rather than a third-party client, following the clock port: the request is
    three lines, and a dependency is a version to pin for a claim about bytes.
    """

    def __init__(
        self,
        *,
        identifier: str,
        endpoint: str,
        routes: Mapping[str, str],
        timeout_seconds: float,
        opener: Any = None,
    ) -> None:
        self._id = identifier
        self._endpoint = endpoint if endpoint.endswith("/") else endpoint + "/"
        self._routes = dict(routes)
        self._timeout = timeout_seconds
        self._open = opener or urllib.request.urlopen

    @property
    def id(self) -> str:
        return self._id

    def _url(self, route: str, name: str) -> str:
        template = self._routes[route]
        return urljoin(self._endpoint, template.lstrip("/").replace("{name}", name))

    def _request(self, url: str, *, method: str, payload: bytes | None = None) -> bytes:
        request = urllib.request.Request(url, data=payload, method=method)
        if payload is not None:
            request.add_header("content-type", "application/octet-stream")
        try:
            with self._open(request, timeout=self._timeout) as response:
                return bytes(response.read())
        except (urllib.error.URLError, OSError) as exc:
            raise TransferError(
                f"{method} {url}: the destination could not be reached ({exc})"
            ) from exc

    def upload(self, temporary_name: str, payload: bytes) -> None:
        self._request(self._url("upload", temporary_name), method="PUT", payload=payload)

    def commit(self, temporary_name: str, bundle_id: str, declared_digest: str) -> None:
        body = json.dumps(
            {"from": temporary_name, "to": bundle_id, "declared_digest": declared_digest}
        ).encode("utf-8")
        self._request(self._url("commit", bundle_id), method="POST", payload=body)

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        raw = self._request(self._url("receipt", bundle_id), method="GET")
        if not raw.strip():
            return None
        try:
            document = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            # A malformed receipt is returned as a malformed receipt rather than raised.
            # Verification is the one place that decides what a receipt is worth, and a
            # document it never sees is a document it cannot refuse for the right reason.
            return {"malformed": raw.decode("utf-8", errors="replace")}
        return document if isinstance(document, dict) else {"malformed": document}


def send(
    destination: Destination, bundle_id: str, payload: bytes, *, declared_digest: str
) -> TransferOutcome:
    """Upload under a temporary name, reveal it, then ask what the destination holds.

    In that order and no other. Asking for the receipt before the commit would ask about an
    object that is not there yet; committing before the upload finished is the partial
    object FR-015 exists to make impossible.

    The declared digest goes out with the commit and is never read back in. What comes back
    is compared against a digest recomputed from the file on disk, in
    :mod:`harness_offload.verify`, and this function does not compare anything at all.
    """
    temporary = temporary_name_for(bundle_id)
    destination.upload(temporary, payload)
    destination.commit(temporary, bundle_id, declared_digest)
    return TransferOutcome(
        bundle_id=bundle_id, byte_count=len(payload), receipt=destination.receipt(bundle_id)
    )
