"""The SensorThings entity set drogna serves, the path grammar, and the navigation links.

pygeoapi ships a provider called ``sensorthings``, but it is an HTTP *client*: it queries an
external SensorThings service, transforms what it receives and republishes it as OGC API -
Features. It consumes the standard rather than providing it, and drogna has a Postgres
observation store and no external service to point it at (ADR-0004). So the entity set is
projected here, read-only, from the ``observations`` schema.

**What is served**: Things, Sensors, ObservedProperties, Datastreams, Observations and
FeaturesOfInterest.

**What is not, and why it is not an oversight.** Locations and HistoricalLocations are
absent by decision. The store holds the location of each observation — that is what a
FeatureOfInterest is — and not a platform's location history. A Thing's location history is
the very thing Constitution V forbids the harness to hold, under a name the standard happens
to supply. ``query/conformance.md`` says so in the interface's own metadata, so a reader
learns it from the documentation rather than from a request that returns nothing.

**Walkability.** Every entity carries a self link and one navigation link per relationship it
has, so the entity set can be walked from the service root without prior knowledge of the
path grammar (FR-027, SC-013). The grammar is deliberately shallow: an entity set, an entity
by identifier, and one navigation step. Anything deeper is refused with the grammar named,
rather than half-answered.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from plugins.errors import QueryLayerError

__all__ = [
    "ABSENT_ENTITY_SETS",
    "ENTITY_SETS",
    "PHENOMENON_TIME",
    "EntitySet",
    "Relationship",
    "ResourcePath",
    "RowSource",
    "SelectionCriteria",
    "TimeComparison",
    "entity_set",
    "parse_path",
    "project",
]

PHENOMENON_TIME = "phenomenonTime"
"""The one time this interface exposes, and the only property it filters or orders on.

It is simulation time. No arrival time, no insertion time and no host clock is exposed or
filterable, because a consumer able to filter on when a row was written could reconstruct
the order the harness happened to write it in, which is not a fact about the simulated world
(Constitution I, FR-010).
"""

ABSENT_ENTITY_SETS: Mapping[str, str] = {
    # FR-026 requires the reason for an absence to be visible, and the reason is the word.
    "Locations": (
        "A Thing's location is its location history the moment there is more than one of "
        # harness:allow-forbidden-vocabulary FR-026 asks for the reason, and the reason is the word
        "them, and a location history is a track by another name. Constitution V forbids "
        "the harness to hold one. The location an observation pertains to is served, as its "
        "FeatureOfInterest."
    ),
    "HistoricalLocations": (
        "The same reason, stated by the standard's own name for it. Absent by decision, not "
        "by omission."
    ),
}


class RowSource(Protocol):
    """Where rows come from. Read-only, and the query layer's role holds nothing more.

    Two implementations exist: one over the observation store through the select-only role,
    and one over rows held in memory, which is what the tests read. Both answer the same
    three questions, because a projection that behaved differently against a real store
    would be tested against nothing that matters.
    """

    def select(
        self,
        entity: str,
        *,
        criteria: SelectionCriteria,
    ) -> Sequence[Mapping[str, Any]]: ...

    def count(self, entity: str, *, criteria: SelectionCriteria) -> int: ...


@dataclass(frozen=True)
class TimeComparison:
    """One comparison on phenomenon time. The only comparison this interface implements."""

    operator: str
    value: str

    def admits(self, moment: str) -> bool:
        comparisons = {
            "eq": lambda a, b: a == b,
            "ne": lambda a, b: a != b,
            "gt": lambda a, b: a > b,
            "ge": lambda a, b: a >= b,
            "lt": lambda a, b: a < b,
            "le": lambda a, b: a <= b,
        }
        return bool(comparisons[self.operator](moment, self.value))


@dataclass(frozen=True)
class SelectionCriteria:
    """Everything a row source is allowed to be asked. Deliberately small."""

    equals: Mapping[str, Any] = field(default_factory=dict)
    phenomenon_time: tuple[TimeComparison, ...] = ()
    descending: bool = False
    skip: int = 0
    top: int | None = None


@dataclass(frozen=True)
class Relationship:
    """One navigation link: what it is called, where it goes, and how it is joined."""

    name: str
    target: str
    many: bool
    # The column carrying the join. On a to-one relationship it is a column of this
    # entity's own row; on a to-many it is a column of the target's row.
    column: str


@dataclass(frozen=True)
class EntitySet:
    """One served collection of entities and everything needed to project and link it."""

    name: str
    singular: str
    id_column: str
    properties: Mapping[str, str]
    relationships: tuple[Relationship, ...]
    time_column: str | None = None

    def relationship(self, name: str) -> Relationship:
        for relationship in self.relationships:
            if relationship.name == name:
                return relationship
        available = ", ".join(sorted(item.name for item in self.relationships))
        raise QueryLayerError(
            f"{self.name} has no relationship called {name!r}; it has {available}. "
            f"Locations and HistoricalLocations are absent by decision — see the "
            f"conformance statement."
        )


# The projection. Column names on the left of each properties entry are the observation
# store's; the SensorThings property names are on the right. They are stated rather than
# derived so that a change in either is a change somebody made.
ENTITY_SETS: Mapping[str, EntitySet] = {
    "Things": EntitySet(
        name="Things",
        singular="Thing",
        id_column="id",
        properties={"name": "name", "description": "description"},
        relationships=(Relationship("Datastreams", "Datastreams", True, "thing_id"),),
    ),
    "Sensors": EntitySet(
        name="Sensors",
        singular="Sensor",
        id_column="id",
        properties={
            "name": "name",
            "description": "description",
            "encoding_type": "encodingType",
            "metadata": "metadata",
        },
        relationships=(Relationship("Datastreams", "Datastreams", True, "sensor_id"),),
    ),
    "ObservedProperties": EntitySet(
        name="ObservedProperties",
        singular="ObservedProperty",
        id_column="id",
        properties={"name": "name", "definition": "definition", "description": "description"},
        relationships=(Relationship("Datastreams", "Datastreams", True, "observed_property_id"),),
    ),
    "Datastreams": EntitySet(
        name="Datastreams",
        singular="Datastream",
        id_column="id",
        properties={
            "name": "name",
            "description": "description",
            "observation_type": "observationType",
            "unit_name": "unitOfMeasurement.name",
            "unit_symbol": "unitOfMeasurement.symbol",
            "unit_definition": "unitOfMeasurement.definition",
        },
        relationships=(
            Relationship("Thing", "Things", False, "thing_id"),
            Relationship("Sensor", "Sensors", False, "sensor_id"),
            Relationship("ObservedProperty", "ObservedProperties", False, "observed_property_id"),
            Relationship("Observations", "Observations", True, "datastream_id"),
        ),
    ),
    "Observations": EntitySet(
        name="Observations",
        singular="Observation",
        id_column="id",
        properties={"phenomenon_time": PHENOMENON_TIME, "result": "result"},
        relationships=(
            Relationship("Datastream", "Datastreams", False, "datastream_id"),
            Relationship("FeatureOfInterest", "FeaturesOfInterest", False, "feature_id"),
        ),
        time_column="phenomenon_time",
    ),
    "FeaturesOfInterest": EntitySet(
        name="FeaturesOfInterest",
        singular="FeatureOfInterest",
        id_column="id",
        properties={
            "name": "name",
            "description": "description",
            "encoding_type": "encodingType",
            "feature": "feature",
        },
        relationships=(Relationship("Observations", "Observations", True, "feature_id"),),
    ),
}


def entity_set(name: str) -> EntitySet:
    """One entity set by name, or a refusal that names what is served and what is not."""
    try:
        return ENTITY_SETS[name]
    except KeyError:
        pass
    if name in ABSENT_ENTITY_SETS:
        raise QueryLayerError(
            f"{name} is not served by this interface. {ABSENT_ENTITY_SETS[name]} "
            f"See the conformance statement."
        )
    served = ", ".join(ENTITY_SETS)
    raise QueryLayerError(f"there is no entity set called {name!r}; this interface serves {served}")


_ENTITY_STEP = re.compile(r"^(?P<name>[A-Za-z]+)(?:\((?P<key>'[^']*'|[^)]*)\))?$")


@dataclass(frozen=True)
class ResourcePath:
    """A parsed resource path: an entity set, perhaps an entity, perhaps one step onward."""

    entity: EntitySet
    key: str | None
    navigation: Relationship | None

    @property
    def is_collection(self) -> bool:
        if self.navigation is not None:
            return self.navigation.many
        return self.key is None


_GRAMMAR = (
    "the grammar this interface implements is /<EntitySet>, /<EntitySet>(<id>) and "
    "/<EntitySet>(<id>)/<NavigationProperty> — one navigation step, no more. A deeper path "
    "is refused rather than half-answered; see the conformance statement."
)


def parse_path(path: str) -> ResourcePath:
    """Parse a resource path to the documented depth, refusing anything beyond it."""
    steps = [step for step in path.strip("/").split("/") if step]
    if not steps:
        raise QueryLayerError(f"the service root names no entity set; {_GRAMMAR}")
    if len(steps) > 2:
        raise QueryLayerError(f"{path!r} takes {len(steps) - 1} navigation steps; {_GRAMMAR}")

    head = _ENTITY_STEP.match(steps[0])
    if head is None:
        raise QueryLayerError(f"{steps[0]!r} is not an entity set or an entity; {_GRAMMAR}")
    entity = entity_set(head.group("name"))
    key = head.group("key")
    if key is not None:
        key = key.strip("'")

    if len(steps) == 1:
        return ResourcePath(entity=entity, key=key, navigation=None)

    if key is None:
        raise QueryLayerError(
            f"{path!r} navigates from an entity set rather than from an entity; {_GRAMMAR}"
        )
    tail = _ENTITY_STEP.match(steps[1])
    if tail is None or tail.group("key") is not None:
        raise QueryLayerError(f"{steps[1]!r} is not a navigation property; {_GRAMMAR}")
    return ResourcePath(entity=entity, key=key, navigation=entity.relationship(tail.group("name")))


def _nest(target: dict[str, Any], dotted: str, value: Any) -> None:
    """Place a value at a dotted property name, so unitOfMeasurement nests as it should."""
    parts = dotted.split(".")
    cursor = target
    for part in parts[:-1]:
        cursor = cursor.setdefault(part, {})
    cursor[parts[-1]] = value


def entity_url(base: str, entity: EntitySet, identifier: Any) -> str:
    return f"{base.rstrip('/')}/{entity.name}('{identifier}')"


def project(
    row: Mapping[str, Any],
    entity: EntitySet,
    *,
    base: str,
) -> dict[str, Any]:
    """One row as one entity: its identifier, its properties, its self and navigation links.

    Every relationship gets a link whether or not anything is on the other end of it. An
    entity that omitted a navigation link when the target set happened to be empty would be
    unwalkable in exactly the case a consumer most needs to be told "nothing here".
    """
    identifier = row[entity.id_column]
    self_link = entity_url(base, entity, identifier)
    projected: dict[str, Any] = {"@iot.id": identifier, "@iot.selfLink": self_link}
    for column, name in entity.properties.items():
        _nest(projected, name, row.get(column))
    for relationship in entity.relationships:
        suffix = "@iot.navigationLink"
        projected[f"{relationship.name}{suffix}"] = f"{self_link}/{relationship.name}"
    return projected
