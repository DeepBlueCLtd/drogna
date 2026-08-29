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

from plugins.edr_geometry import point_in_ring
from plugins.errors import QueryLayerError, QueryOptionRefusedError
from plugins.sensorthings_entities import (
    PHENOMENON_TIME,
    EntitySet,
    Relationship,
    SelectionCriteria,
    SpatialWithin,
    TimeComparison,
)

__all__ = [
    "IMPLEMENTED_OPTIONS",
    "OUT_OF_SCOPE",
    "SPATIAL_FUNCTION",
    "ParsedOptions",
    "next_link",
    "parse_options",
]

SPATIAL_FUNCTION = "st_within"
"""The one spatial predicate the filter subset implements (FR-80, ADR-0027).

``st_within(location, geography'POLYGON (…)')``: the observation's own sampled position
inside a single drawn ring, composing with the phenomenon-time comparisons by ``and``.
Every other spatial function, every other property and every other geometry keeps its
refusal with its name — the subset's honesty has been its narrowness, and the narrowness
is retained by widening it one stated predicate at a time.
"""

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
        "Filtering is on phenomenon time, and spatially on the observation geometry "
        "through st_within, and on nothing else. A filter on a result value or any "
        "other property is a query the harness has no use for and would have to be "
        "tested to claim."
    ),
    "$filter-function": (
        "Of the filter language's geospatial and temporal functions, exactly one is "
        "implemented: st_within(location, geography'POLYGON (…)'), the observation "
        "geometry inside a single drawn ring (ADR-0027). Every other function is "
        "refused by name."
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


_ST_WITHIN = re.compile(
    r"^\s*st_within\(\s*(?P<property>[A-Za-z][\w/]*)\s*,\s*"
    r"geography'(?P<wkt>[^']*)'\s*\)\s*$"
)
_POLYGON_RING = re.compile(r"^\s*POLYGON\s*\(\s*\((?P<ring>[^()]*)\)\s*\)\s*$")


def _parse_spatial(match: re.Match[str], entity: EntitySet, conformance: str) -> SpatialWithin:
    """One st_within clause, or a refusal naming exactly what is not served."""
    prop = match.group("property")
    if entity.geometry_column is None:
        raise QueryOptionRefusedError(
            f"$filter {SPATIAL_FUNCTION} on {entity.name}",
            conformance=conformance,
            detail=(
                f"{entity.name} carries no geometry; the spatial predicate is over the "
                f"observation geometry alone."
            ),
        )
    if prop != entity.geometry_column:
        raise QueryOptionRefusedError(
            f"$filter {SPATIAL_FUNCTION} on {prop}",
            conformance=conformance,
            detail=(
                f"the spatial predicate is over {entity.geometry_column} — the "
                f"observation's own sampled position — and no other property."
            ),
        )
    wkt = match.group("wkt").strip()
    ring_match = _POLYGON_RING.match(wkt)
    if ring_match is None:
        shape = wkt.split("(")[0].strip() or "an empty geometry"
        raise QueryOptionRefusedError(
            f"$filter {SPATIAL_FUNCTION} with {shape}",
            conformance=conformance,
            detail=(
                "the predicate takes a single-ring POLYGON in the geography literal; "
                "holes, multipolygons and other geometries are not served. Refused "
                "rather than approximated: answering a different region than the one "
                "drawn would look exactly like a correct answer."
            ),
        )
    try:
        ring = tuple(
            (float(pair.split()[0]), float(pair.split()[1]))
            for pair in ring_match.group("ring").split(",")
            if pair.strip()
        )
        if len({point for point in ring}) < 3:
            raise ValueError("fewer than three distinct vertices")
    except (ValueError, IndexError) as error:
        raise QueryOptionRefusedError(
            f"$filter {SPATIAL_FUNCTION}",
            conformance=conformance,
            detail=f"the polygon's ring could not be read as x y pairs: {error}.",
        ) from None
    return SpatialWithin(wkt=wkt, ring=ring)


def _parse_filter(
    expression: str, entity: EntitySet, conformance: str
) -> tuple[tuple[TimeComparison, ...], tuple[SpatialWithin, ...]]:
    """Comparisons on phenomenon time and st_within predicates, joined by ``and``.

    Anything else is refused by name: any other function, any other property, any other
    geometry, disjunction. The spatial clause is recognised before the function refusal
    runs, so st_within is the one function that does not refuse — everything about it that
    is not served still does, with the cause named (ADR-0027).
    """
    if re.search(r"\bor\b", expression, re.IGNORECASE):
        raise QueryOptionRefusedError(
            "$filter with or",
            conformance=conformance,
            detail=(
                "a filter is a conjunction of comparisons on phenomenon time and spatial "
                "predicates; disjunction is not implemented."
            ),
        )
    if entity.time_column is None and entity.geometry_column is None:
        raise QueryOptionRefusedError(
            "$filter",
            conformance=conformance,
            detail=(
                f"{entity.name} carries no phenomenon time and no geometry, and those are "
                f"the only properties this interface filters on."
            ),
        )

    comparisons: list[TimeComparison] = []
    spatial: list[SpatialWithin] = []
    for clause in re.split(r"\band\b", expression, flags=re.IGNORECASE):
        within = _ST_WITHIN.match(clause)
        if within is not None:
            spatial.append(_parse_spatial(within, entity, conformance))
            continue
        _refuse_functions(clause, conformance)
        match = _COMPARISON.match(clause)
        if match is None:
            raise QueryOptionRefusedError(
                "$filter",
                conformance=conformance,
                detail=(
                    f"{clause.strip()!r} is not a comparison of the form "
                    f"'{PHENOMENON_TIME} <operator> <value>' or a "
                    f"{SPATIAL_FUNCTION}({entity.geometry_column or 'location'}, "
                    f"geography'POLYGON (…)') predicate."
                ),
            )
        left = match.group("left")
        if left != PHENOMENON_TIME:
            raise QueryOptionRefusedError(
                f"$filter on {left}",
                conformance=conformance,
                detail=OUT_OF_SCOPE["$filter-property"],
            )
        if entity.time_column is None:
            raise QueryOptionRefusedError(
                "$filter",
                conformance=conformance,
                detail=(
                    f"{entity.name} carries no phenomenon time, so a comparison on it "
                    f"selects nothing this entity set holds."
                ),
            )
        comparisons.append(
            TimeComparison(match.group("operator"), match.group("right").strip("'\""))
        )
    return tuple(comparisons), tuple(spatial)


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
    spatial: tuple[SpatialWithin, ...] = ()
    if parameters.get("$filter"):
        comparisons, spatial = _parse_filter(parameters["$filter"], entity, conformance)

    descending = False
    if parameters.get("$orderby"):
        descending = _parse_orderby(parameters["$orderby"], entity, conformance)

    expand: tuple[Relationship, ...] = ()
    if parameters.get("$expand"):
        expand = _parse_expand(parameters["$expand"], entity, conformance)

    return ParsedOptions(
        criteria=SelectionCriteria(
            phenomenon_time=comparisons,
            within=spatial,
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


def _row_within(location: Any, ring: tuple[tuple[float, float], ...]) -> bool:
    """The in-memory reading of the predicate, through the same ring test the EDR area
    query uses, so the two row sources cannot disagree about what "within" means.

    A row's location is a GeoJSON-style mapping or a (longitude, latitude) pair. A row
    with no location is not within anything: the predicate asks about a position, and a
    row that has none cannot satisfy it.
    """
    if location is None:
        return False
    coordinates = location.get("coordinates") or () if isinstance(location, Mapping) else location
    values = list(coordinates)[:2]
    if len(values) != 2:
        return False
    try:
        return point_in_ring(float(values[0]), float(values[1]), ring)
    except QueryLayerError:
        return False


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
    if criteria.within and entity.geometry_column is not None:
        column = entity.geometry_column
        selected = [
            row
            for row in selected
            if all(_row_within(row.get(column), predicate.ring) for predicate in criteria.within)
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
