"""The RNG port: every stochastic choice in drogna, derived from the run's root seed.

Derivation rule ``harness-rng`` version 1
----------------------------------------

For a run with root seed ``R`` and a stream named ``S``::

    material = b"harness-rng/1" + b"\\x00" + decimal(R) + b"\\x00" + utf8(S)
    entropy  = int.from_bytes(sha256(material), "big")     # 256 bits
    generator = random.Random(entropy)

Consequences worth stating plainly. The rule is a pure function of ``(R, S)``, so two
processes asking for the same stream get the same sequence without coordinating, and
the run manifest records the rule and its version rather than a table of derived seeds.
Changing the rule is a version bump, because it changes every sequence in every replay.

Identifiers use the same material with the logical position appended, so an identifier
that appears in a stored record or a published message is a function of seed and
position — never of entropy, never of a host clock (Constitution II).

This module is the one declared zone in which a generator may be constructed. Every
other module reaches randomness through :func:`rng_for`.
"""

from __future__ import annotations

import hashlib
import uuid
from random import Random

__all__ = [
    "DERIVATION_RULE",
    "DERIVATION_VERSION",
    "RandomStreams",
    "configure_run",
    "current_run",
    "entropy_for",
    "identifier_for",
    "reset_run",
    "rng_for",
    "uuid_for",
]

DERIVATION_RULE = "harness-rng"
DERIVATION_VERSION = 1

_SEPARATOR = b"\x00"


def _material(root_seed: int, stream: str) -> bytes:
    prefix = f"{DERIVATION_RULE}/{DERIVATION_VERSION}".encode()
    return _SEPARATOR.join((prefix, str(root_seed).encode("ascii"), stream.encode("utf-8")))


class RandomStreams:
    """The run's randomness: one generator per named stream, derived and cached.

    Stream names are ``<component>.<purpose>`` by convention. The convention matters:
    two call sites asking for one name share one sequence, and their draws interleave.
    The manifest lists the streams a run is expected to use so that an unexpected
    sharing shows up as a difference in the document rather than as a puzzle in the
    output.
    """

    def __init__(self, root_seed: int) -> None:
        if isinstance(root_seed, bool) or not isinstance(root_seed, int):
            raise TypeError("the root seed is an integer, recorded verbatim in the run manifest")
        if root_seed < 0:
            raise ValueError("the root seed is not negative")
        self._root_seed = root_seed
        self._generators: dict[str, Random] = {}

    @property
    def root_seed(self) -> int:
        return self._root_seed

    @property
    def derivation(self) -> dict[str, object]:
        """The rule and version, as the run manifest records them."""
        return {"rule": DERIVATION_RULE, "version": DERIVATION_VERSION}

    def entropy_for(self, stream: str) -> int:
        """The 256-bit entropy for ``stream``, for generators this module does not build."""
        _require_stream_name(stream)
        return int.from_bytes(hashlib.sha256(_material(self._root_seed, stream)).digest(), "big")

    def rng_for(self, stream: str) -> Random:
        """Return the generator for ``stream``, cached so one name means one sequence."""
        _require_stream_name(stream)
        existing = self._generators.get(stream)
        if existing is not None:
            return existing
        generator = Random(self.entropy_for(stream))
        self._generators[stream] = generator
        return generator

    def streams(self) -> tuple[str, ...]:
        """The stream names drawn from so far, in the order they were first requested."""
        return tuple(self._generators)

    def identifier_for(self, stream: str, position: int, *, length: int = 16) -> str:
        """A stable hex identifier for a logical position within a stream."""
        if isinstance(position, bool) or not isinstance(position, int):
            raise TypeError("a logical position is an integer")
        if not 1 <= length <= 64:
            raise ValueError("identifier length is between 1 and 64 hex characters")
        _require_stream_name(stream)
        material = _SEPARATOR.join(
            (_material(self._root_seed, stream), str(position).encode("ascii"))
        )
        return hashlib.sha256(material).hexdigest()[:length]

    def uuid_for(self, stream: str, position: int) -> uuid.UUID:
        """A stable UUID for a logical position: the shape of uuid4, none of its entropy."""
        digest = bytearray(bytes.fromhex(self.identifier_for(stream, position, length=32)))
        digest[6] = (digest[6] & 0x0F) | 0x80  # version 8: custom, per RFC 9562
        digest[8] = (digest[8] & 0x3F) | 0x80  # RFC 4122 variant
        return uuid.UUID(bytes=bytes(digest))


def _require_stream_name(stream: str) -> None:
    if not stream or not isinstance(stream, str):
        raise ValueError("a stream needs a name of the form <component>.<purpose>")


_current: RandomStreams | None = None


def configure_run(root_seed: int) -> RandomStreams:
    """Set the process's run randomness from the root seed in config or in a manifest."""
    global _current
    _current = RandomStreams(root_seed)
    return _current


def reset_run() -> None:
    """Forget the configured run. For tests, and for a process that replays twice."""
    global _current
    _current = None


def current_run() -> RandomStreams:
    """The configured run randomness, or a refusal.

    There is deliberately no fallback to an unseeded generator: a component that has not
    been told its root seed has nothing to draw from, and guessing would make the run
    unreproducible without saying so.
    """
    if _current is None:
        raise RuntimeError(
            "no root seed has been configured; call configure_run() with the seed from "
            "config or from the run manifest before drawing anything"
        )
    return _current


def rng_for(stream: str) -> Random:
    """The single route to randomness in drogna."""
    return current_run().rng_for(stream)


def entropy_for(stream: str) -> int:
    """Derived entropy for a generator this module does not build, such as numpy's."""
    return current_run().entropy_for(stream)


def identifier_for(stream: str, position: int, *, length: int = 16) -> str:
    """A deterministic identifier for a stored record or a published message."""
    return current_run().identifier_for(stream, position, length=length)


def uuid_for(stream: str, position: int) -> uuid.UUID:
    """A deterministic UUID for a stored record or a published message."""
    return current_run().uuid_for(stream, position)
