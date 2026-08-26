"""One transaction per batch, entities before observations, redelivery as a no-op.

These tests use a connection that records rather than a database. What is being asserted is
the shape of the write — the ordering, the transaction boundary, the idempotent insert —
and that is a property of this module. Whether Postgres accepts the SQL is asserted in
`tests/integration/test_observation_path.py`, against a real one.
"""

from __future__ import annotations

import ingest_support as support
import pytest
from harness_ingest.writer import ObservationWriter, StoreTables
from harness_types.messages.observation import DrognaObservation

TABLES = StoreTables(
    things="thing",
    sensors="sensor",
    observed_properties="observed_property",
    datastreams="datastream",
    observations="observation",
    features_of_interest="feature_of_interest",
)


def batch(count: int = 3) -> list[DrognaObservation]:
    return [
        DrognaObservation.model_validate(support.observation(index, measured=measured))
        for index, measured in enumerate(("temperature", "salinity", "pressure")[:count])
    ]


def test_a_batch_is_one_transaction() -> None:
    connection = support.RecordingConnection()
    ObservationWriter(connection, schema="observations", tables=TABLES).write(batch())
    assert connection.commits == 1
    assert connection.rollbacks == 0


def test_an_empty_batch_touches_nothing() -> None:
    connection = support.RecordingConnection()
    result = ObservationWriter(connection, schema="observations", tables=TABLES).write([])
    assert (result.stored, result.duplicates) == (0, 0)
    assert connection.commits == 0


def test_the_entities_are_written_before_the_observations() -> None:
    connection = support.RecordingConnection()
    ObservationWriter(connection, schema="observations", tables=TABLES).write(batch())
    statements = [statement for statement, _ in connection.cursor_object.statements]
    last_entity = max(
        index
        for index, statement in enumerate(statements)
        if "observations.datastream " in statement
    )
    first_observation = min(
        index
        for index, statement in enumerate(statements)
        if "observations.observation " in statement
    )
    assert last_entity < first_observation


def test_an_entity_is_written_once_per_batch_however_many_observations_refer_to_it() -> None:
    connection = support.RecordingConnection()
    observations = [
        DrognaObservation.model_validate(support.observation(index)) for index in range(5)
    ]
    ObservationWriter(connection, schema="observations", tables=TABLES).write(observations)
    things = [
        statement
        for statement, _ in connection.cursor_object.statements
        if "observations.thing " in statement
    ]
    assert len(things) == 1


def test_redelivery_of_a_stored_identifier_is_counted_and_stores_nothing() -> None:
    connection = support.RecordingConnection()
    writer = ObservationWriter(connection, schema="observations", tables=TABLES)
    first = writer.write(batch())
    second = writer.write(batch())
    assert (first.stored, first.duplicates) == (3, 0)
    assert (second.stored, second.duplicates) == (0, 3)


def test_a_failing_write_rolls_back_and_is_raised() -> None:
    """Either the whole batch is there or none of it is, and the caller is told."""
    cursor = support.RecordingCursor(fail_on="observations.observation ")
    connection = support.RecordingConnection(cursor_object=cursor)
    with pytest.raises(RuntimeError, match="the store is not there"):
        ObservationWriter(connection, schema="observations", tables=TABLES).write(batch())
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_the_observation_insert_carries_no_default_and_no_arrival_time() -> None:
    connection = support.RecordingConnection()
    ObservationWriter(connection, schema="observations", tables=TABLES).write(batch(1))
    statement, values = next(
        (statement, values)
        for statement, values in connection.cursor_object.statements
        if "observations.observation " in statement
    )
    assert "phenomenon_time" in statement
    assert "now()" not in statement.lower()
    assert values[1] == "2026-09-01T00:00:00.000000Z"


def test_the_feature_geometry_is_derived_from_the_observation_position() -> None:
    connection = support.RecordingConnection()
    ObservationWriter(connection, schema="observations", tables=TABLES).write(batch(1))
    _, values = next(
        (statement, values)
        for statement, values in connection.cursor_object.statements
        if "observations.feature_of_interest " in statement
    )
    assert '"coordinates": [-4.5, 49.0, -25.0]' in values[-1]
