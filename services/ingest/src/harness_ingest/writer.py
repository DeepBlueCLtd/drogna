"""Writing a batch: one transaction, idempotent, and the only writer there is.

Three properties this module exists to hold.

**One transaction per batch.** A batch is written whole or not at all, so a process that
dies part way through leaves the store with a set of observations that were all published
rather than a fragment nobody can characterise (FR-007).

**Redelivery is a no-op.** Every row is keyed by the deterministic identifier the publisher
derived from the root seed and the observation's logical position, so the second copy of a
message under at-least-once delivery finds its row already there and changes nothing. The
duplicate is counted, because a store that silently absorbs them cannot tell you the broker
is redelivering (FR-017).

**The store is a function of the traffic.** The SensorThings entities an observation
belongs to travel on the message, so the Thing, Sensor, ObservedProperty, Datastream and
FeatureOfInterest rows are written from what was published rather than from a table
somebody has to keep in step with the sensors. They are written first, in the same
transaction, because an observation referencing a datastream that does not exist yet is a
foreign key violation and not an ordering to think about later.

The connection is injected. There is no repository interface over Postgres and no
pluggable intake abstraction: neither is a port, and neither is dressed as one
(Constitution VI). What is injected is a connection, because a test needs one that is not
a database and the deployed component needs one that is.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from harness_types.messages.observation import DrognaObservation

__all__ = ["Connection", "ObservationWriter", "StoreTables", "WriteResult"]

_GEOGRAPHY = "ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography"


class Cursor(Protocol):
    """The part of the DB-API cursor this module uses, and no more."""

    rowcount: int

    def execute(self, statement: str, parameters: Sequence[Any] = ...) -> Any: ...

    def close(self) -> None: ...


class Connection(Protocol):
    """The part of a DB-API connection this module uses, and no more."""

    def cursor(self) -> Cursor: ...

    def commit(self) -> None: ...

    def rollback(self) -> None: ...


@dataclass(frozen=True)
class StoreTables:
    """Where the six entity sets live. Named in configuration, not in this module."""

    things: str
    sensors: str
    observed_properties: str
    datastreams: str
    observations: str
    features_of_interest: str

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> StoreTables:
        return cls(
            things=str(section["things"]),
            sensors=str(section["sensors"]),
            observed_properties=str(section["observed_properties"]),
            datastreams=str(section["datastreams"]),
            observations=str(section["observations"]),
            features_of_interest=str(section["features_of_interest"]),
        )


@dataclass(frozen=True)
class WriteResult:
    """What one batch did: rows stored, and redeliveries that changed nothing."""

    stored: int
    duplicates: int

    @property
    def received(self) -> int:
        return self.stored + self.duplicates


def _feature_geojson(observation: DrognaObservation) -> str:
    """The FeatureOfInterest geometry, derived from the observation's own position.

    Derived rather than carried, so the geometry and the position cannot disagree. The
    depth is the third ordinate and is negative down, which is the GeoJSON convention and
    the opposite of the depth column's.
    """
    location = observation.location
    return (
        '{"type": "Point", "coordinates": '
        f"[{location.longitude!r}, {location.latitude!r}, {-location.depth_m!r}]}}"
    )


class ObservationWriter:
    """Writes validated batches into the observations schema, and nothing else."""

    def __init__(self, connection: Connection, *, schema: str, tables: StoreTables) -> None:
        self._connection = connection
        self._schema = schema
        self._tables = tables

    def _table(self, name: str) -> str:
        return f"{self._schema}.{name}"

    def write(self, batch: Sequence[DrognaObservation]) -> WriteResult:
        """Write one batch in one transaction. Either all of it lands or none of it does."""
        if not batch:
            return WriteResult(stored=0, duplicates=0)
        cursor = self._connection.cursor()
        try:
            self._write_entities(cursor, batch)
            stored = self._write_observations(cursor, batch)
            self._connection.commit()
        except Exception:
            self._connection.rollback()
            raise
        finally:
            cursor.close()
        return WriteResult(stored=stored, duplicates=len(batch) - stored)

    def _write_entities(self, cursor: Cursor, batch: Sequence[DrognaObservation]) -> None:
        """Write the entities the batch's observations refer to, each at most once."""
        things: dict[str, Sequence[Any]] = {}
        sensors: dict[str, Sequence[Any]] = {}
        properties: dict[str, Sequence[Any]] = {}
        datastreams: dict[str, Sequence[Any]] = {}
        features: dict[str, Sequence[Any]] = {}
        for observation in batch:
            context = observation.context
            things[observation.thing_id] = (
                observation.thing_id,
                context.thing.name,
                context.thing.description,
            )
            sensors[observation.sensor_id] = (
                observation.sensor_id,
                context.sensor.name,
                context.sensor.description,
                context.sensor.encoding_type,
                context.sensor.metadata,
            )
            properties[context.observed_property.id] = (
                context.observed_property.id,
                context.observed_property.name,
                context.observed_property.definition,
                context.observed_property.description,
            )
            datastreams[observation.datastream_id] = (
                observation.datastream_id,
                context.datastream.name,
                context.datastream.description,
                context.datastream.observation_type,
                context.datastream.unit_of_measurement.name,
                context.datastream.unit_of_measurement.symbol,
                context.datastream.unit_of_measurement.definition,
                observation.thing_id,
                observation.sensor_id,
                context.observed_property.id,
            )
            features[observation.feature_of_interest_id] = (
                observation.feature_of_interest_id,
                context.feature_of_interest.name,
                context.feature_of_interest.description,
                context.feature_of_interest.encoding_type,
                _feature_geojson(observation),
            )

        self._insert_each(
            cursor,
            f"INSERT INTO {self._table(self._tables.things)} (id, name, description) "
            "VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            things.values(),
        )
        self._insert_each(
            cursor,
            f"INSERT INTO {self._table(self._tables.sensors)} "
            "(id, name, description, encoding_type, metadata) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            sensors.values(),
        )
        self._insert_each(
            cursor,
            f"INSERT INTO {self._table(self._tables.observed_properties)} "
            "(id, name, definition, description) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            properties.values(),
        )
        self._insert_each(
            cursor,
            f"INSERT INTO {self._table(self._tables.features_of_interest)} "
            "(id, name, description, encoding_type, feature) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            features.values(),
        )
        self._insert_each(
            cursor,
            f"INSERT INTO {self._table(self._tables.datastreams)} "
            "(id, name, description, observation_type, unit_name, unit_symbol, "
            "unit_definition, thing_id, sensor_id, observed_property_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            datastreams.values(),
        )

    @staticmethod
    def _insert_each(cursor: Cursor, statement: str, rows: Any) -> None:
        for row in rows:
            cursor.execute(statement, list(row))

    def _write_observations(self, cursor: Cursor, batch: Sequence[DrognaObservation]) -> int:
        """Insert the observations, counting the ones that were not already there."""
        statement = (
            f"INSERT INTO {self._table(self._tables.observations)} "
            "(id, phenomenon_time, tick, scenario_run_id, result, depth_m, location, "
            "datastream_id, feature_id) "
            f"VALUES (%s, %s::timestamptz, %s, %s, %s, %s, {_GEOGRAPHY}, %s, %s) "
            "ON CONFLICT (id) DO NOTHING"
        )
        stored = 0
        for observation in batch:
            cursor.execute(
                statement,
                [
                    observation.observation_id,
                    observation.sim_time,
                    observation.tick,
                    observation.scenario_run_id,
                    observation.result,
                    observation.location.depth_m,
                    observation.location.longitude,
                    observation.location.latitude,
                    observation.datastream_id,
                    observation.feature_of_interest_id,
                ],
            )
            stored += 1 if cursor.rowcount == 1 else 0
        return stored
