"""What the query layer refuses, and how a refusal reaches the person who caused it.

Every failure here is one somebody can act on: a vertex out of order, a cube too large, a
query option nobody implemented, a run that two pointers claim. So each carries the fact
that makes it actionable — the offending vertex, the limit, the option's name — in the
message itself rather than in a log the caller cannot read.

That last part is not decoration. pygeoapi's ``GenericError.message`` returns
``self.user_msg if self.user_msg else self.default_msg``, so a diagnostic passed
positionally to ``ProviderQueryError`` is swallowed and the caller is told "query error
(check logs)". The spike measured it. :func:`as_provider_error` is the one place that
translation happens, and it passes ``user_msg`` every time.
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "CatalogueError",
    "CoverageStoreError",
    "QueryLayerError",
    "QueryOptionRefusedError",
    "RequestTooLargeError",
    "TrajectoryRefusedError",
    "as_provider_error",
]


class QueryLayerError(Exception):
    """Anything the query layer refuses. Carries a message a caller can act on."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class CoverageStoreError(QueryLayerError):
    """The coverage store does not hold what the convention says it should."""


class CatalogueError(QueryLayerError):
    """The catalogue cannot resolve a run, and says which ones were in the way."""


class TrajectoryRefusedError(QueryLayerError):
    """A trajectory request is not answerable as asked, naming the vertex or the pin."""


class RequestTooLargeError(QueryLayerError):
    """The response would exceed a documented limit, which the message names."""


class QueryOptionRefusedError(QueryLayerError):
    """A SensorThings query option outside the implemented subset (FR-029).

    Refused rather than ignored: a silently dropped option returns an answer to a question
    nobody asked, and it looks like a correct one. The option's name and the conformance
    statement travel with the refusal so the caller can see both the limit and where it is
    written down.
    """

    def __init__(self, option: str, *, conformance: str, detail: str = "") -> None:
        reason = f" {detail}" if detail else ""
        super().__init__(
            f"the query option {option} is not implemented by this interface.{reason} "
            f"drogna implements a stated subset of SensorThings Part 1 and claims no "
            f"conformance; the subset and every absent part are listed in {conformance}."
        )
        self.option = option
        self.conformance = conformance


def as_provider_error(error: QueryLayerError) -> Any:
    """Translate to the pygeoapi error the framework will render, message intact.

    Returns the exception instance rather than raising it, so a caller reads as
    ``raise as_provider_error(...)`` and the traceback starts where the decision was made.
    When pygeoapi is absent the original is handed back unchanged: there is no framework to
    render anything, and the message is the whole of what matters.
    """
    try:
        from pygeoapi.provider.base import (
            ProviderInvalidQueryError,
            ProviderRequestEntityTooLargeError,
        )
    except ImportError:
        return error

    if isinstance(error, RequestTooLargeError):
        return ProviderRequestEntityTooLargeError(error.message, user_msg=error.message)
    return ProviderInvalidQueryError(error.message, user_msg=error.message)
