"""One pygeoapi version pin, shared by both bespoke providers, checked before serving.

This feature carries two provider plugins written against pygeoapi's provider base classes.
That is two compatibility surfaces against one third-party interface, and they share one
answer rather than two: the pin is a single value here, and both providers call
:func:`require_pinned_pygeoapi` before they serve anything. A version drogna has not been
tested against fails loudly, naming what was found and what was expected, instead of
serving from a base class whose behaviour nobody has measured (FR-031).

The surfaces are not hypothetical and carry no compatibility promise. Two of them decide
whether the EDR collection advertises the query types it implements, and they are spelt
differently in different releases:

- In the pinned release the advertised types come from a ``query_types`` list on
  ``BaseEDRProvider``, appended to by a ``@BaseEDRProvider.register()`` decorator. The list
  is a mutable class attribute of the *base*, so every registration anywhere in the process
  lands in the same list and providers see one another's types.
- In the development line that feature 002's spike measured there is no decorator at all:
  ``BaseEDRProvider.__init_subclass__`` builds the list from the subclass's own
  ``__dict__``, so a plugin that subclasses a provider and adds only ``trajectory``
  advertises *only* trajectory — ``position`` and ``cube`` vanish from the collection in
  silence.

drogna's providers satisfy both: every query type they serve is declared as a method in the
class's own ``__dict__`` *and* named in a ``query_types`` list set on the class itself,
which shadows the base's shared one rather than appending to it. ``get_query_types``
returns that list. The cost is one line per query type; the alternative is a collection
that quietly stops advertising what it can do.

**A discrepancy worth naming.** The pin below is the version the deployment image installs,
recorded in ``deploy/images/query-layer.requirements.txt``. Feature 002's spike measured a
development build of a later line. The spike's own shelf-life note says its result is
invalidated by exactly this — a deployment pinning a version other than the one it tested —
so the two mechanisms above are honoured together rather than one being chosen on the
strength of a measurement made against the other.
"""

from __future__ import annotations

from typing import Any, ClassVar

from plugins.errors import QueryLayerError

__all__ = [
    "PINNED_PYGEOAPI_VERSION",
    "PygeoapiVersionError",
    "base_edr_provider",
    "base_provider",
    "check_pygeoapi_version",
    "installed_pygeoapi_version",
    "require_pinned_pygeoapi",
]

PINNED_PYGEOAPI_VERSION = "0.20.0"
"""The exact release both providers are written against.

Kept as one value because two would drift. It must equal what the query layer's image
installs; a test asserts that, reading the requirements file rather than trusting a comment.
Moving it means re-running feature 002's spike, which is what its shelf-life section asks.
"""

_ABSENT = "not installed"


class PygeoapiVersionError(QueryLayerError):
    """The installed pygeoapi is not the one these providers were written against."""

    def __init__(self, found: str, expected: str = PINNED_PYGEOAPI_VERSION) -> None:
        super().__init__(
            f"pygeoapi {found} is installed and drogna's bespoke providers are written "
            f"against pygeoapi {expected}. Refusing to serve: the provider base classes "
            f"carry no compatibility promise, and the way an EDR collection advertises its "
            f"query types has already changed once between releases. Either install "
            f"{expected} or re-run the feature 002 spike against {found} and move the pin "
            f"in plugins/pygeoapi_version.py and in the query layer image together."
        )
        self.found = found
        self.expected = expected


def installed_pygeoapi_version() -> str:
    """The version of the installed pygeoapi, or a plain statement that there is none."""
    try:
        import pygeoapi
    except ImportError:
        return _ABSENT
    return str(getattr(pygeoapi, "__version__", "unknown"))


def check_pygeoapi_version(found: str, expected: str = PINNED_PYGEOAPI_VERSION) -> None:
    """Raise unless ``found`` is exactly ``expected``.

    Exact rather than a range on purpose. A range would be a claim that the intervening
    releases were tested, and they were not.
    """
    if found != expected:
        raise PygeoapiVersionError(found, expected)


def require_pinned_pygeoapi() -> None:
    """The check both providers make before they serve. Called from their constructors."""
    check_pygeoapi_version(installed_pygeoapi_version())


class _StandInProvider:
    """What a provider inherits when pygeoapi is not installed.

    It exists so that the computing half of this package can be imported and tested in an
    environment that does not carry pygeoapi — which the repository's own workspace does
    not, because pygeoapi pins a Pydantic major version the type-generation chain cannot
    use. It reproduces only what a constructor needs: the provider definition's name, type
    and data, and the coverage attributes the base sets to empty.

    Nothing serves against it. :func:`require_pinned_pygeoapi` reports the stand-in's
    absence of a version as "not installed" and refuses, which is the same refusal a wrong
    version gets and for the same reason.
    """

    query_types: ClassVar[list[str]] = []

    def __init__(self, provider_def: dict[str, Any]) -> None:
        try:
            self.name = provider_def["name"]
            self.type = provider_def["type"]
            self.data = provider_def["data"]
        except KeyError as exc:
            raise RuntimeError("name/type/data are required") from exc
        self.options = provider_def.get("options")
        self.axes: list[str] = []
        self.crs = None
        self._fields: dict[str, Any] = {}

    def get_query_types(self) -> list[str]:
        return list(self.query_types)

    def query(self, **kwargs: Any) -> Any:
        """Dispatch by query type, as the framework's own base class does."""
        try:
            handler = getattr(self, kwargs["query_type"])
        except (AttributeError, KeyError) as exc:
            raise NotImplementedError("Query not implemented!") from exc
        return handler(**kwargs)


def base_edr_provider() -> type:
    """pygeoapi's EDR provider base class, or the stand-in when it is not installed."""
    try:
        from pygeoapi.provider.base_edr import BaseEDRProvider
    except ImportError:
        return _StandInProvider
    return BaseEDRProvider


def base_provider() -> type:
    """pygeoapi's provider base class, or the stand-in when it is not installed."""
    try:
        from pygeoapi.provider.base import BaseProvider
    except ImportError:
        return _StandInProvider
    return BaseProvider
