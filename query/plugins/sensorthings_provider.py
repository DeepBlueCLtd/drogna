"""The bespoke SensorThings provider: a stated subset of Part 1 Sensing, read-only.

This binds the entity model, the path grammar and the query options to pygeoapi's provider
base class and to the observation store, and it serves the conformance statement as part of
the collection's own metadata so that a reader learns the limits from the interface as well
as from the documentation (FR-030).

It is **not conformant**, and nothing here says otherwise. It implements a subset, the
subset is enumerated, and every absent part carries its reason. A harness that overstates its
conformance is worth less as evidence than one that states a small conformance accurately.

Reads go through the select-only role and nothing else (FR-011). There is no write path in
this module to disable: the statements it builds are ``SELECT`` and the refusal for a write
method is decided before a connection is touched.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from plugins.errors import QueryLayerError, as_provider_error
from plugins.pygeoapi_version import base_provider, require_pinned_pygeoapi
from plugins.sensorthings_entities import (
    ABSENT_ENTITY_SETS,
    ENTITY_SETS,
    PHENOMENON_TIME,
    EntitySet,
    SelectionCriteria,
    parse_path,
    project,
)
from plugins.sensorthings_options import (
    IMPLEMENTED_OPTIONS,
    OUT_OF_SCOPE,
    SPATIAL_FUNCTION,
    next_link,
    parse_options,
    rows_after_filter,
)

__all__ = [
    "DrognaSensorThingsProvider",
    "InMemoryRowSource",
    "PostgresRowSource",
    "SensorThingsService",
    "conformance_statement",
]

CONFORMANCE_SEGMENT = "conformance"
"""The one resource that is not an entity set: the statement of what is not implemented."""

SYNTHETIC = (
    "Every value served here is synthetic. The numerics are deliberately fake and the "
    "platform is a sampling point, not a subject of surveillance."
)


def conformance_statement(conformance_url: str) -> dict[str, Any]:
    """The plain account of what is implemented and what is absent, as served metadata.

    Built from the same constants the code enforces — the served entity sets, the
    implemented options, the out-of-scope list and the absent entity sets — so the statement
    and the behaviour cannot disagree. ``query/conformance.md`` repeats it in prose and a
    test compares the two.
    """
    return {
        "standard": "OGC SensorThings API Part 1: Sensing",
        "conformant": False,
        "claim": (
            "drogna implements a subset of SensorThings Part 1 (Sensing) and claims no "
            "conformance. What is implemented is listed here; what is absent is listed here "
            "with its reason."
        ),
        "synthetic": SYNTHETIC,
        "entity_sets_served": list(ENTITY_SETS),
        "entity_sets_absent": dict(ABSENT_ENTITY_SETS),
        "query_options_implemented": list(IMPLEMENTED_OPTIONS),
        "query_options_absent": dict(OUT_OF_SCOPE),
        "spatial": (
            f"$filter implements exactly one spatial predicate: "
            f"{SPATIAL_FUNCTION}(location, geography'POLYGON (…)') — the observation's "
            f"own sampled position inside a single drawn ring, composing with the "
            f"phenomenon-time comparisons by and. Every other spatial function, "
            f"property and geometry is refused with its name (ADR-0025)."
        ),
        "time": (
            f"{PHENOMENON_TIME} is simulation time. No arrival time or insertion time is "
            f"exposed, ordered on or filterable."
        ),
        "path_grammar": (
            "/<EntitySet>, /<EntitySet>(<id>), /<EntitySet>(<id>)/<NavigationProperty>. One "
            "navigation step; anything deeper is refused."
        ),
        "href": conformance_url,
    }


class InMemoryRowSource:
    """Rows held in memory, answering the same three questions as the store.

    This is what the tests read. It is not a mock of a component: it is a second
    implementation of a row source, and Constitution VII's prohibition is on mocked traffic
    driving illumination, which nothing here does.
    """

    def __init__(self, tables: Mapping[str, Sequence[Mapping[str, Any]]]) -> None:
        self._tables = {name: [dict(row) for row in rows] for name, rows in tables.items()}

    def _filtered(self, entity: str, criteria: SelectionCriteria) -> list[Mapping[str, Any]]:
        return rows_after_filter(self._tables.get(entity, []), ENTITY_SETS[entity], criteria)

    def select(self, entity: str, *, criteria: SelectionCriteria) -> Sequence[Mapping[str, Any]]:
        rows = self._filtered(entity, criteria)
        end = None if criteria.top is None else criteria.skip + criteria.top
        return rows[criteria.skip : end]

    def count(self, entity: str, *, criteria: SelectionCriteria) -> int:
        return len(self._filtered(entity, criteria))


@dataclass(frozen=True)
class PostgresRowSource:
    """Rows from the observation store, through the select-only role.

    ``psycopg`` is imported when a connection is first needed rather than at module import,
    so that the projection, the grammar and the options can be tested in a workspace that
    carries neither the driver nor a database. The statements are ``SELECT`` and are built
    with parameters rather than by interpolation; table and column names come from
    configuration, which is where the observation store's schema is described.
    """

    dsn: str
    schema: str
    tables: Mapping[str, str]

    def _connect(self) -> Any:
        try:
            import psycopg
        except ImportError as error:  # pragma: no cover - the image installs it
            raise QueryLayerError(
                "no database driver is installed, so the observation store cannot be read"
            ) from error
        return psycopg.connect(self.dsn)

    def _statement(
        self, entity: str, criteria: SelectionCriteria, *, counting: bool
    ) -> tuple[str, list[Any]]:
        model = ENTITY_SETS[entity]
        table = self.tables[_table_key(entity)]
        columns = "count(*)" if counting else "*"
        clauses: list[str] = []
        values: list[Any] = []
        for column, value in criteria.equals.items():
            clauses.append(f"{column} = %s")
            values.append(value)
        if criteria.within and model.geometry_column is not None:
            # The one spatial predicate the filter subset implements (FR-80, ADR-0025).
            # The WKT literal travels as a bound parameter; the geography column is read
            # as geometry because ST_Within is defined over geometry, and the store's
            # SRID is 4326 throughout.
            for predicate in criteria.within:
                clauses.append(
                    f"ST_Within({model.geometry_column}::geometry, ST_GeomFromText(%s, 4326))"
                )
                values.append(predicate.wkt)
        if criteria.phenomenon_time and model.time_column is not None:
            for comparison in criteria.phenomenon_time:
                clauses.append(f"{model.time_column} {_SQL_OPERATORS[comparison.operator]} %s")
                values.append(comparison.value)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        statement = f"SELECT {columns} FROM {self.schema}.{table}{where}"
        if counting:
            return statement, values
        order_column = model.time_column or model.id_column
        direction = "DESC" if criteria.descending else "ASC"
        statement += f" ORDER BY {order_column} {direction}, {model.id_column} {direction}"
        if criteria.top is not None:
            statement += " LIMIT %s"
            values.append(criteria.top)
        statement += " OFFSET %s"
        values.append(criteria.skip)
        return statement, values

    def select(self, entity: str, *, criteria: SelectionCriteria) -> Sequence[Mapping[str, Any]]:
        statement, values = self._statement(entity, criteria, counting=False)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(statement, values)
            names = [description[0] for description in cursor.description]
            return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]

    def count(self, entity: str, *, criteria: SelectionCriteria) -> int:
        statement, values = self._statement(entity, criteria, counting=True)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(statement, values)
            return int(cursor.fetchone()[0])


_SQL_OPERATORS = {"eq": "=", "ne": "<>", "gt": ">", "ge": ">=", "lt": "<", "le": "<="}


def _table_key(entity: str) -> str:
    """The configuration key naming an entity set's table."""
    return {
        "Things": "things",
        "Sensors": "sensors",
        "ObservedProperties": "observed_properties",
        "Datastreams": "datastreams",
        "Observations": "observations",
        "FeaturesOfInterest": "features_of_interest",
    }[entity]


def request_query_options() -> dict[str, str]:
    """The ``$``-prefixed query options, read from the web request rather than from pygeoapi.

    This is the one place in the query layer that reaches past the provider interface, and it
    is here because the interface has no room for what SensorThings needs. pygeoapi's Features
    routing hands ``get()`` an identifier, a language and a CRS transform, and nothing else;
    a query parameter it does not recognise is either dropped or rejected as an unknown
    property filter. So ``$top``, ``$skip``, ``$count``, ``$orderby``, ``$filter`` and
    ``$expand`` cannot arrive any other way.

    Feature 002's spike anticipated exactly this shape of problem and judged it a genuine
    fallback that costs little: the cost is a coupling to pygeoapi's choice of web framework,
    at one seam, in one function. Everything above it — the entity model, the grammar, the
    options and their refusals — is framework-free and is tested without a web request in
    sight. Where Flask is absent, or there is no request in flight, this returns nothing and
    the caller behaves as though no option had been given.
    """
    try:
        from flask import has_request_context, request
    except ImportError:  # pragma: no cover - the image installs it
        return {}
    if not has_request_context():
        return {}
    return {name: value for name, value in request.args.items() if name.startswith("$")}


def request_method() -> str:
    """The HTTP method, for the same reason and with the same fallback."""
    try:
        from flask import has_request_context, request
    except ImportError:  # pragma: no cover - the image installs it
        return "GET"
    if not has_request_context():
        return "GET"
    return str(request.method)


class SensorThingsService:
    """The interface itself: a service root, entity sets, entities and one navigation step."""

    def __init__(
        self,
        source: Any,
        *,
        base_url: str,
        page_size_default: int,
        page_size_maximum: int,
    ) -> None:
        self._source = source
        self._base = base_url.rstrip("/")
        self._default = page_size_default
        self._maximum = page_size_maximum

    @property
    def base_url(self) -> str:
        return self._base

    @property
    def conformance_url(self) -> str:
        return f"{self._base}/{CONFORMANCE_SEGMENT}"

    def root(self) -> dict[str, Any]:
        """The service root: every entity set, by link, plus the conformance statement.

        The statement is here as well as on each entity set because the root is where a
        consumer starts, and the limits are the first thing they should meet.
        """
        return {
            "value": [{"name": name, "url": f"{self._base}/{name}"} for name in ENTITY_SETS],
            "drogna:conformance": conformance_statement(self.conformance_url),
        }

    def conformance(self) -> dict[str, Any]:
        return conformance_statement(self.conformance_url)

    def resource(
        self,
        path: str,
        parameters: Mapping[str, str] | None = None,
        *,
        method: str = "GET",
    ) -> dict[str, Any]:
        """Answer one resource path, or refuse with the cause named."""
        query = dict(parameters or {})
        if path.strip("/") == CONFORMANCE_SEGMENT:
            # The one resource that is not an entity set. The root advertises it by href
            # and this is where that href lands, so it is routed here rather than falling
            # through to the path grammar — which used to answer it with "there is no
            # entity set called 'conformance'", a true statement about the wrong question.
            return self.conformance()
        resolved = parse_path(path)
        entity = (
            ENTITY_SETS[resolved.navigation.target]
            if resolved.navigation is not None
            else resolved.entity
        )
        options = parse_options(
            query,
            entity,
            conformance=self.conformance_url,
            page_size_default=self._default,
            page_size_maximum=self._maximum,
            method=method,
        )

        criteria = options.criteria
        if resolved.navigation is not None:
            criteria = self._navigation_criteria(resolved, criteria)
        elif resolved.key is not None:
            criteria = SelectionCriteria(equals={resolved.entity.id_column: resolved.key}, top=1)

        rows = list(self._source.select(entity.name, criteria=criteria))

        if not resolved.is_collection:
            if not rows:
                raise QueryLayerError(
                    f"{entity.singular} {resolved.key!r} is not in this store"
                    if resolved.navigation is None
                    else f"{resolved.entity.singular} {resolved.key!r} has no "
                    f"{resolved.navigation.name}"
                )
            return self._expanded(rows[0], entity, options)

        document: dict[str, Any] = {"value": [self._expanded(row, entity, options) for row in rows]}
        if options.count:
            document["@iot.count"] = self._source.count(entity.name, criteria=criteria)
        link = next_link(f"{self._base}/{path.strip('/')}", query, options, len(rows))
        if link is not None:
            document["@iot.nextLink"] = link
        return document

    def _navigation_criteria(self, resolved: Any, criteria: SelectionCriteria) -> SelectionCriteria:
        relationship = resolved.navigation
        if relationship.many:
            return SelectionCriteria(
                equals={relationship.column: resolved.key},
                phenomenon_time=criteria.phenomenon_time,
                within=criteria.within,
                descending=criteria.descending,
                skip=criteria.skip,
                top=criteria.top,
            )
        owner = self._one(resolved.entity, resolved.key)
        return SelectionCriteria(
            equals={ENTITY_SETS[relationship.target].id_column: owner[relationship.column]},
            top=1,
        )

    def _one(self, entity: EntitySet, key: Any) -> Mapping[str, Any]:
        rows = list(
            self._source.select(
                entity.name,
                criteria=SelectionCriteria(equals={entity.id_column: key}, top=1),
            )
        )
        if not rows:
            raise QueryLayerError(f"{entity.singular} {key!r} is not in this store")
        return rows[0]

    def _expanded(self, row: Mapping[str, Any], entity: EntitySet, options: Any) -> dict[str, Any]:
        projected = project(row, entity, base=self._base)
        for relationship in options.expand:
            target = ENTITY_SETS[relationship.target]
            if relationship.many:
                criteria = SelectionCriteria(
                    equals={relationship.column: row[entity.id_column]}, top=self._maximum
                )
                projected[relationship.name] = [
                    project(item, target, base=self._base)
                    for item in self._source.select(target.name, criteria=criteria)
                ]
            else:
                related = self._one(target, row[relationship.column])
                projected[relationship.name] = project(related, target, base=self._base)
        return projected


class DrognaSensorThingsProvider(base_provider()):  # type: ignore[misc]
    """pygeoapi's binding for the service above.

    ``data`` in the provider definition is the observation store's connection string. The
    provider owns no state beyond the service and refuses, in its constructor, to serve
    against a pygeoapi it has not been tested with — the same refusal, from the same pin, as
    the EDR providers make.
    """

    def __init__(self, provider_def: Mapping[str, Any]) -> None:
        require_pinned_pygeoapi()
        super().__init__(dict(provider_def))
        options = dict(provider_def.get("options") or {})
        observations = options["observations"]
        limits = options["limits"]
        source = options.get("row_source") or PostgresRowSource(
            dsn=str(observations["dsn"]),
            schema=str(observations["schema"]),
            tables=dict(observations["tables"]),
        )
        self.service = SensorThingsService(
            source,
            base_url=str(options["base_url"]),
            page_size_default=int(limits["page_size_default"]),
            page_size_maximum=int(limits["page_size_maximum"]),
        )

    def get_fields(self) -> dict[str, Any]:
        return {
            name: {"type": "object", "title": model.singular} for name, model in ENTITY_SETS.items()
        }

    def get_metadata(self) -> dict[str, Any]:
        """The collection's own metadata, carrying the conformance statement (FR-030)."""
        return {
            "entity_sets": list(ENTITY_SETS),
            "conformance": self.service.conformance(),
        }

    def query(self, **kwargs: Any) -> Any:
        """The collection with no resource path: the service root, and what this path is not.

        pygeoapi routes this from ``/collections/<id>/items``, which is an OGC API - Features
        resource and not a SensorThings one. This collection has no features; the entity set
        begins one path segment further on. So the answer is an empty feature collection —
        pygeoapi's own handler reads ``features`` off it and would fail without one — carrying
        the service root beside it, which is where a consumer should start anyway.
        """
        try:
            return {
                "type": "FeatureCollection",
                "features": [],
                "numberMatched": 0,
                "numberReturned": 0,
                "drogna:note": (
                    "This collection serves a stated subset of SensorThings Part 1 (Sensing), "
                    "not OGC API - Features. It has no features. Each entity set below is "
                    "reached at this path followed by its name."
                ),
                "drogna:sensorthings": self.service.root(),
            }
        except QueryLayerError as error:
            raise as_provider_error(error) from error

    def get(self, identifier: str, **kwargs: Any) -> Any:
        """One resource path, routed from ``/collections/<id>/items/<path>``.

        pygeoapi's route for this is ``<path:item_id>``, so the identifier arrives with its
        slashes intact and the whole grammar — an entity set, an entity, one navigation step
        — is reachable without pygeoapi knowing anything about SensorThings.
        """
        try:
            return self.service.resource(
                identifier,
                request_query_options(),
                method=request_method(),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error


def entity_names() -> list[str]:
    """Every served entity set, for a caller that wants the list without the model."""
    return list(ENTITY_SETS)


def absent_names() -> list[str]:
    return list(ABSENT_ENTITY_SETS)
