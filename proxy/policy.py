"""What the boundary lets through, and the normalisation policy is applied to.

Two jobs, and they are the same job seen from either end.

**Rendering.** :func:`released_locations` turns the release policy into the exact set of
locations the template emits: one per released collection, beneath one prefix, plus the
single upgrade location ADR-0008 decided on. A collection absent from the configured list
produces no location at all, which is what makes FR-003 structural — adding a collection
to the query layer cannot expose it, because there is nothing in the served configuration
for it to be reached through.

**Deciding.** :func:`decide` answers what the rendered configuration will answer, for a
request path, and names the rule that decided. nginx is what actually enforces policy at
run time; this is the reference the request matrix is checked against, so that a
disagreement between what we think we published and what we published shows up as a test
failure rather than as an exposure. It is not consulted per request by anything.

Normalisation is refusal-biased throughout. A path that does not decode unambiguously is
refused rather than guessed at (FR-004): every guess a proxy makes about an ambiguous path
is a guess an attacker gets to choose the input to.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

__all__ = [
    "ALLOW_RELEASED",
    "ALLOW_UPGRADE",
    "DENY_DEFAULT",
    "DENY_NOT_RELEASED",
    "DENY_UNNORMALISABLE",
    "Decision",
    "Location",
    "PolicyError",
    "ReleasePolicy",
    "UnnormalisablePathError",
    "decide",
    "normalise",
    "released_locations",
    "unreleased",
]

# Rule identifiers. They appear in the refusal log and in the tests, so they are values
# rather than prose: a refusal is diagnosable from the log alone only if the rule that
# refused it has a name (FR-020).
DENY_UNNORMALISABLE = "deny-unnormalisable"
DENY_NOT_RELEASED = "deny-not-released"
DENY_DEFAULT = "deny-default"
ALLOW_RELEASED = "allow-released"
ALLOW_UPGRADE = "allow-upgrade"

_PERCENT = re.compile(r"%(..?)?", re.DOTALL)
_HEX = re.compile(r"^[0-9A-Fa-f]{2}$")
_SEPARATORS = frozenset({"/", "\\"})
_IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class PolicyError(Exception):
    """The release policy cannot be read. Names the key rather than the symptom."""


class UnnormalisablePathError(Exception):
    """A request path that does not decode to one unambiguous path. Always a refusal."""

    def __init__(self, target: str, reason: str) -> None:
        super().__init__(f"{target!r} is refused: {reason}")
        self.target = target
        self.reason = reason


@dataclass(frozen=True)
class Location:
    """One entry in the served configuration. Nothing is served that is not one of these."""

    path: str
    """The exact path prefix this location answers on, with no trailing separator."""

    upstream: str
    """Where the request is sent when it matches. A base URL and a path, already joined."""

    rule: str
    """Which rule admitted it, recorded so that a permitted request is as traceable as a
    refused one."""

    upgrade: bool = False
    """Whether this location carries a protocol upgrade. See :class:`ReleasePolicy`."""


@dataclass(frozen=True)
class Decision:
    """What the boundary does with one request path, and which rule decided."""

    allowed: bool
    rule: str
    path: str
    location: Location | None = None


@dataclass(frozen=True)
class ReleasePolicy:
    """The configured exposure surface, read from the proxy section of the configuration.

    ``upgrade_prefix`` is the one protocol-upgrade location ADR-0008 decided on, and it is
    held distinct from ``prefix`` deliberately. An upgrade location is a different exposure
    surface from a static prefix: policy is evaluated once, at the upgrade, and the
    connection then persists carrying traffic the proxy does not inspect per message. What
    a subscriber may then receive is constrained at the broker, by its access control
    lists, and is tested there — ``tests/integration/test_topic_isolation.py``. Nothing in
    this module can constrain it, and nothing here pretends to.
    """

    prefix: str
    collections: tuple[str, ...]
    variables: tuple[str, ...]
    upgrade_prefix: str
    query_url: str
    query_collection_path: str
    control_url: str
    control_path: str

    @classmethod
    def from_document(cls, document: Mapping[str, Any]) -> ReleasePolicy:
        """Read the policy out of a validated configuration document."""
        proxy = _require(document, "proxy")
        released = _require(proxy, "proxy", "released")
        control = _require(proxy, "proxy", "control")
        upstream = _require(proxy, "proxy", "upstream")
        query = _require(upstream, "proxy.upstream", "query")
        websocket = _require(upstream, "proxy.upstream", "control_websocket")

        collections = tuple(_require(released, "proxy.released", "collections"))
        variables = tuple(_require(released, "proxy.released", "variables"))
        if not collections:
            raise PolicyError(
                "proxy.released.collections is empty. An empty release is refused here "
                "rather than served, because a deployment that meant to release nothing "
                "does not need a proxy and one that meant to release something has made a "
                "mistake this would otherwise hide."
            )
        if not variables:
            raise PolicyError(
                "proxy.released.variables is empty. The variable allow-list bounds what a "
                "released artefact may carry (FR-014); empty would admit everything."
            )
        for identifier in collections:
            if not _IDENTIFIER.match(str(identifier)):
                raise PolicyError(
                    f"proxy.released.collections contains {identifier!r}, which is not a "
                    "collection identifier. A released identifier is matched whole, and a "
                    "value carrying a separator would be a path, not an identifier."
                )

        where_prefix = "proxy.released.prefix"
        where_upgrade = "proxy.control.upgrade_prefix"
        prefix = _segment(str(_require(released, "proxy.released", "prefix")), where_prefix)
        upgrade = _segment(str(_require(control, "proxy.control", "upgrade_prefix")), where_upgrade)
        if prefix == upgrade:
            raise PolicyError(
                "proxy.released.prefix and proxy.control.upgrade_prefix are the same path. "
                "They are held apart so that neither surface can widen the other: one is "
                "inspected per request, the other is inspected once and then persists."
            )
        return cls(
            prefix=prefix,
            collections=tuple(str(name) for name in collections),
            variables=tuple(str(name) for name in variables),
            upgrade_prefix=upgrade,
            query_url=str(_require(query, "proxy.upstream.query", "url")).rstrip("/"),
            query_collection_path=str(
                _require(query, "proxy.upstream.query", "collection_path")
            ).rstrip("/"),
            control_url=str(_require(websocket, "proxy.upstream.control_websocket", "url")).rstrip(
                "/"
            ),
            control_path=str(_require(websocket, "proxy.upstream.control_websocket", "path")),
        )


def _require(section: Mapping[str, Any], where: str, key: str | None = None) -> Any:
    """A key that must be there, reported by name. Schema validation runs first; this is
    the second line, for a document that reached here without it."""
    if key is None:
        section, where, key = section, "the configuration", where
    if not isinstance(section, Mapping) or key not in section:
        raise PolicyError(f"{where}: no {key!r}")
    return section[key]


def _segment(value: str, where: str) -> str:
    """A single leading-separator path segment, with no trailing separator."""
    if not value.startswith("/") or value.count("/") != 1 or len(value) < 2:
        raise PolicyError(
            f"{where} is {value!r}. It must be one path segment with a single leading "
            "separator: policy is expressed on whole segments, and a multi-segment prefix "
            "invites a partial match nobody intended."
        )
    return value


def normalise(target: str) -> str:
    """The path policy is applied to, or a refusal saying which reading was ambiguous.

    Everything here refuses rather than repairs. Percent-encoded separators are refused
    rather than decoded, because a decoded separator makes one request path mean two
    things and the proxy would be choosing which. Traversal is resolved and then checked
    against the root, so ``/released/../../etc`` is refused rather than clamped to
    something that looks reachable.
    """
    if not target:
        raise UnnormalisablePathError(target, "the request target is empty")
    path = target.split("?", 1)[0].split("#", 1)[0]
    if not path.startswith("/"):
        raise UnnormalisablePathError(target, "the request target is not an absolute path")

    decoded = _percent_decode(target, path)
    if any(character in decoded for character in ("\x00", "\r", "\n")):
        raise UnnormalisablePathError(target, "the decoded path carries a control character")
    if any(ordinal < 0x20 or ordinal == 0x7F for ordinal in map(ord, decoded)):
        raise UnnormalisablePathError(target, "the decoded path carries a control character")
    if "\\" in decoded:
        raise UnnormalisablePathError(
            target, "the path carries a backslash, which is not a separator here and not a name"
        )

    resolved: list[str] = []
    for segment in decoded.split("/"):
        if segment in ("", "."):
            continue  # duplicate separators and a bare dot name nothing
        if segment == "..":
            if not resolved:
                raise UnnormalisablePathError(target, "the path traverses above the root")
            resolved.pop()
            continue
        resolved.append(segment)
    return "/" + "/".join(resolved)


def _percent_decode(target: str, path: str) -> str:
    """Decode, or refuse. A separator that arrives encoded is an ambiguity, not a name."""
    out: list[str] = []
    raw: bytearray = bytearray()

    def flush() -> None:
        if not raw:
            return
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise UnnormalisablePathError(
                target, "a percent-encoded byte sequence is not valid UTF-8"
            ) from None
        if any(character in _SEPARATORS for character in text):
            raise UnnormalisablePathError(
                target, "a path separator arrived percent-encoded, so the path has two readings"
            )
        out.append(text)
        raw.clear()

    index = 0
    while index < len(path):
        character = path[index]
        if character != "%":
            flush()
            out.append(character)
            index += 1
            continue
        escape = path[index + 1 : index + 3]
        if not _HEX.match(escape):
            raise UnnormalisablePathError(
                target, "a percent sign is not followed by two hex digits"
            )
        raw.append(int(escape, 16))
        index += 3
    flush()
    return "".join(out)


def released_locations(policy: ReleasePolicy) -> tuple[Location, ...]:
    """Every location the served configuration carries, in a deterministic order.

    Sorted by path, so that two renders of one configuration are byte-identical and a
    review diff shows what changed rather than how a dictionary happened to iterate.
    """
    locations = [
        Location(
            path=f"{policy.prefix}/{identifier}",
            upstream=f"{policy.query_url}{policy.query_collection_path}/{identifier}",
            rule=f"{ALLOW_RELEASED}:{identifier}",
        )
        for identifier in policy.collections
    ]
    locations.append(
        Location(
            path=policy.upgrade_prefix,
            upstream=f"{policy.control_url}{policy.control_path}",
            rule=ALLOW_UPGRADE,
            upgrade=True,
        )
    )
    return tuple(sorted(locations, key=lambda location: location.path))


def decide(policy: ReleasePolicy, target: str) -> Decision:
    """What the boundary does with one request target, and which rule decided it."""
    try:
        path = normalise(target)
    except UnnormalisablePathError as refusal:
        return Decision(allowed=False, rule=DENY_UNNORMALISABLE, path=refusal.target)

    for location in released_locations(policy):
        if path == location.path:
            return Decision(allowed=True, rule=location.rule, path=path, location=location)
        if location.upgrade:
            # Exactly one path, and not a subtree. A static prefix can afford a subtree
            # because every request beneath it is inspected; this cannot, because policy
            # here is evaluated once — at the upgrade — and the connection then persists
            # carrying traffic the proxy does not inspect per message. The served
            # configuration renders it as an exact location for the same reason, and this
            # module has to say the same thing or it is not a reference for anything.
            continue
        if path.startswith(location.path + "/"):
            return Decision(allowed=True, rule=location.rule, path=path, location=location)

    if path == policy.prefix or path.startswith(policy.prefix + "/"):
        # Beneath the released prefix but not a released collection. Named separately from
        # the default so that the log distinguishes "you asked for something withheld" from
        # "you asked for something that is not part of the boundary at all".
        return Decision(allowed=False, rule=DENY_NOT_RELEASED, path=path)
    return Decision(allowed=False, rule=DENY_DEFAULT, path=path)


def unreleased(policy: ReleasePolicy, identifiers: Sequence[str]) -> tuple[str, ...]:
    """Which of ``identifiers`` the policy does not release. Used by the tests to build a
    request matrix from what a query layer says it serves, rather than from a list here."""
    released = set(policy.collections)
    return tuple(name for name in identifiers if name not in released)
