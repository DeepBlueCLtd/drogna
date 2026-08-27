"""The SensorThings query options drogna implements, and the refusal for every other one.

The subset is chosen from what the client and the acceptance tests actually exercise, not
from what the standard offers (FR-028):

- ``$top`` and ``$skip``, with a next link, because the droplet is small and a datastream
  holds more observations than one response may carry;
- ``$count``, because reconciling the served count against the store is how SC-009 is
  checked without retrieving every page;
- ``$orderby``, restricted to phenomenon time;
- ``$filter``, restricted to comparisons on phenomenon time;
- ``$expand``, to a single level.

Everything else is out of scope **by decision** and is listed in :data:`OUT_OF_SCOPE` with
the reason. A request using one is refused with the option named and the conformance
statement pointed at (FR-029). It is not ignored, and it is not answered as though it had
been applied: a silently dropped query option returns an answer to a question nobody asked,
and it looks exactly like a correct one.

Phenomenon time is the only property that can be filtered or ordered on, and phenomenon time
is simulation time. There is no arrival time and no insertion time here to expose
(Constitution I, FR-010).
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlencode

from plugins.errors import QueryOptionRefusedError
from plugins.sensorthings_entities import (
    PHENOMENON_TIME,
    EntitySet,
    Relationship,
    SelectionCriteria,
    TimeComparison,
)

__all__ = [
    "IMPLEMENTED_OPTIONS",
    "OUT_OF_SCOPE",
    "ParsedOptions",
    "next_link",
    "parse_options",
]

IMPLEMENTED_OPTIONS: tuple[str, ...] = (
    "$top",
    "$skip",
    "$count",
    "$orderby",
    "$filter",
    "$expand",
)

OUT_OF_SCOPE: Mapping[str, str] = {
    "$select": (
        "Nothing needs a partial projection, and a projection is a second shape of the same "
        "entity for the generated types to carry."
    ),
    "$search": "No free-text search exists over this store, and none is simulated.",
    "$apply": "Aggregation is out of scope; the harness aggregates nowhere else either.",
    "$value": "A raw property value has no consumer here.",
    "$ref": "A link-only representation has no consumer here.",
    "$expand-nested": (
        "Expansion is to a single level. A nested expansion multiplies the response size on "
        "a destination chosen to be small, for a shape nothing asks for."
    ),
    "$expand-options": (
        "Query options nested inside an $expand are not implemented; the expanded set is "
        "returned whole, bounded by the configured page size."
    ),
    "$filter-property": (
        "Filtering is on phenomenon time alone. Every read of this store is a read over "
        "simulation time, and a filter on a result value or a geometry is a query the "
        "harness has no use for and would have to be tested to claim."
    ),
    "$filter-function": (
        "The filter language's geospatial and temporal functions are not implemented; a "
        "comparison on phenomenon time is the whole of what is."
    ),
    "write": (
        "Every write operation and deep insert is out of scope. The query layer holds "
        "select permission on the observation store and nothing more."
    ),
    "Tasking": "The Part 2 Tasking entities are out of scope; the harness tasks nothing.",
    "MQTT": (
        "The Part 1 MQTT subscription extension is not implemented. The harness does run a "
        "broker and does publish observations in SensorThings vocabulary on it, which makes "
        "this the confusion most likely to arise here — but that broker is not a "
        "SensorThings endpoint and subscribing to it is not this standard."
    ),
}

_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE", "MERGE"})

_COMPARISON = re.compile(
    r"^\s*(?P<left>[A-Za-z][\w/]*)\s+(?P<operator>eq|ne|gt|ge|lt|le)\s+(?P<right>\S+)\s*$"
)
_FUNCTION = re.compile(r"(?<![A-Za-z0-9_])(?P<name>[a-z][a-zA-Z_]*)\s*\(")
_ORDERBY = re.compile(r"^\s*(?P<property>[A-Za-z][\w/]*)(?:\s+(?P<direction>asc|desc))?\s*$")


@dataclass(frozen=True)
class ParsedOptions:
    """What a request asked for, once everything out of scope has been refused."""

    criteria: SelectionCriteria
    count: bool
    expand: tuple[Relationship, ...]
    top: int
    skip: int


def _integer(name: str, raw: str, *, conformance: str) -> int:
    try:
        value = int(raw)
    except ValueError:
        raise QueryOptionRefusedError(
            name, conformance=conformance, detail=f"{name} takes a whole number, not {raw!r}."
        ) from None
    if value < 0:
        raise QueryOptionRefusedError(
            name, conformance=conformance, detail=f"{name} is not negative."
        )
    return value


def _refuse_functions(expression: str, conformance: str) -> None:
    match = _FUNCTION.search(expression)
    if match is not None:
        raise QueryOptionRefusedError(
            f"$filter function {match.group('name')}()",
            conformance=conformance,
            detail=OUT_OF_SCOPE["$filter-function"],
        )


def _parse_filter(
    expression: str, entity: EntitySet, conformance: str
) -> tuple[TimeComparison, ...]:
    """Comparisons on phenomenon time, joined by ``and``. Anything else is refused by name."""
    _refuse_functions(expression, conformance)
    if re.search(r"\bor\b", expression, re.IGNORECASE):
        raise QueryOptionRefusedError(
            "$filter with or",
            conformance=conformance,
            detail=(
                "a filter is a conjunction of comparisons on phenomenon time; disjunction "
                "is not implemented."
            ),
        )
    if entity.time_column is None:
        raise QueryOptionRefusedError(
            "$filter",
            conformance=conformance,
            detail=(
                f"{entity.name} carries no phenomenon time, and phenomenon time is the only "
                f"property this interface filters on."
            ),
        )

    comparisons: list[TimeComparison] = []
    for clause in re.split(r"\band\b", expression, flags=re.IGNORECASE):
        match = _COMPARISON.match(clause)
        if match is None:
            raise QueryOptionRefusedError(
                "$filter",
                conformance=conformance,
                detail=(
                    f"{clause.strip()!r} is not a comparison of the form "
                    f"'{PHENOMENON_TIME} <operator> <value>'."
                ),
            )
        left = match.group("left")
        if left != PHENOMENON_TIME:
            raise QueryOptionRefusedError(
                f"$filter on {left}",
                conformance=conformance,
                detail=OUT_OF_SCOPE["$filter-property"],
            )
        comparisons.append(
            TimeComparison(match.group("operator"), match.group("right").strip("'\""))
        )
    return tuple(comparisons)


def _parse_orderby(expression: str, entity: EntitySet, conformance: str) -> bool:
    match = _ORDERBY.match(expression)
    if match is None:
        raise QueryOptionRefusedError(
            "$orderby",
            conformance=conformance,
            detail=f"$orderby takes one property, optionally with asc or desc, not {expression!r}.",
        )
    prop = match.group("property")
    if prop != PHENOMENON_TIME or entity.time_column is None:
        raise QueryOptionRefusedError(
            f"$orderby on {prop}",
            conformance=conformance,
            detail=(
                f"ordering is on {PHENOMENON_TIME} alone, and only where the entity carries "
                f"one. Every read of this store is a read over simulation time."
            ),
        )
    return match.group("direction") == "desc"


def _parse_expand(expression: str, entity: EntitySet, conformance: str) -> tuple[Relationship, ...]:
    relationships: list[Relationship] = []
    for clause in expression.split(","):
        name = clause.strip()
        if not name:
            continue
        if "(" in name:
            raise QueryOptionRefusedError(
                "$expand with nested options",
                conformance=conformance,
                detail=OUT_OF_SCOPE["$expand-options"],
            )
        if "/" in name:
            raise QueryOptionRefusedError(
                "$expand nested beyond one level",
                conformance=conformance,
                detail=OUT_OF_SCOPE["$expand-nested"],
            )
        relationships.append(entity.relationship(name))
    return tuple(relationships)


def parse_options(
    parameters: Mapping[str, str],
    entity: EntitySet,
    *,
    conformance: str,
    page_size_default: int,
    page_size_maximum: int,
    method: str = "GET",
) -> ParsedOptions:
    """Read a request's query options, refusing every one outside the implemented subset."""
    if method.upper() in _WRITE_METHODS:
        raise QueryOptionRefusedError(
            f"the {method.upper()} method",
            conformance=conformance,
            detail=OUT_OF_SCOPE["write"],
        )

    for name in parameters:
        if name.startswith("$") and name not in IMPLEMENTED_OPTIONS:
            reason = OUT_OF_SCOPE.get(name, "It is out of scope by decision, not by omission.")
            raise QueryOptionRefusedError(name, conformance=conformance, detail=reason)

    top = page_size_default
    if "$top" in parameters:
        requested = _integer("$top", parameters["$top"], conformance=conformance)
        top = min(requested, page_size_maximum)
    skip = _integer("$skip", parameters.get("$skip", "0"), conformance=conformance)

    count = parameters.get("$count", "false").strip().lower() == "true"

    comparisons: tuple[TimeComparison, ...] = ()
    if parameters.get("$filter"):
        comparisons = _parse_filter(parameters["$filter"], entity, conformance)

    descending = False
    if parameters.get("$orderby"):
        descending = _parse_orderby(parameters["$orderby"], entity, conformance)

    expand: tuple[Relationship, ...] = ()
    if parameters.get("$expand"):
        expand = _parse_expand(parameters["$expand"], entity, conformance)

    return ParsedOptions(
        criteria=SelectionCriteria(
            phenomenon_time=comparisons,
            descending=descending,
            skip=skip,
            top=top,
        ),
        count=count,
        expand=expand,
        top=top,
        skip=skip,
    )


def next_link(
    base_url: str,
    parameters: Mapping[str, str],
    options: ParsedOptions,
    returned: int,
) -> str | None:
    """The link to the next page, or nothing when this page is the last one.

    Present only when the page came back full. A next link offered on a short page invites a
    round trip that returns nothing, which reads as an error to anything following links.
    """
    if returned < options.top:
        return None
    forward = {key: value for key, value in parameters.items() if key != "$skip"}
    forward["$skip"] = str(options.skip + returned)
    forward["$top"] = str(options.top)
    separator = "&" if "?" in base_url else "?"
    # quote_via keeps the option names readable; a link full of %24 is a link
    # nobody can check by eye against the documentation.
    encoded = urlencode(sorted(forward.items()), quote_via=quote, safe="$:")
    return f"{base_url}{separator}{encoded}"


def rows_after_filter(
    rows: Sequence[Mapping[str, Any]],
    entity: EntitySet,
    criteria: SelectionCriteria,
) -> list[Mapping[str, Any]]:
    """Apply the criteria to rows already in hand.

    Used by the in-memory row source, and by nothing that talks to a database — there the
    same criteria become a statement. Kept here so the two cannot disagree about what a
    comparison means.
    """
    selected = [
        row
        for row in rows
        if all(row.get(column) == value for column, value in criteria.equals.items())
    ]
    if criteria.phenomenon_time and entity.time_column is not None:
        column = entity.time_column
        selected = [
            row
            for row in selected
            if all(
                comparison.admits(str(row.get(column))) for comparison in criteria.phenomenon_time
            )
        ]
    if entity.time_column is not None:
        selected.sort(key=lambda row: str(row.get(entity.time_column)))
    else:
        selected.sort(key=lambda row: str(row.get(entity.id_column)))
    if criteria.descending:
        selected.reverse()
    return selected
