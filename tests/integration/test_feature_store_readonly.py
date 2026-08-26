"""The feature store: provisioned by script, and read-only while a scenario runs.

FR-12 and FR-13, against a real Postgres. Two schemas in one instance, the content a
function of the root seed, and every run-time role refused on insert, update and delete —
refused by the database, not by anyone remembering not to write.

The provisioning is done by ``stores/features/provision.py`` rather than by this test, so
what is exercised is the script the seeding path runs.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import observation_path as support
import pytest

pytestmark = support.skip_without_containers()

RUNTIME_ROLES = ("drogna_ingest", "drogna_read", "drogna_telemetry")


@pytest.fixture(scope="module")
def config(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The tracked local configuration, written where the script can be pointed at it."""
    directory = tmp_path_factory.mktemp("features")
    return support.write_config(directory, "features", support.destination_config("features"))


@pytest.fixture(scope="module")
def store(tmp_path_factory: pytest.TempPathFactory, config: Path) -> Iterator[support.Store]:
    for running in support.start_store(tmp_path_factory.mktemp("store")):
        running.apply(support.feature_store_sql(config, emit="schema"))
        running.apply(support.feature_store_sql(config, emit="content"))
        yield running


def test_the_two_schemas_are_two_schemas_in_one_instance(store: support.Store) -> None:
    """FR-12, asserted the only way it can be: by counting instances and schemas."""
    schemas = store.scalar(
        "SELECT string_agg(nspname, ',' ORDER BY nspname) FROM pg_namespace "
        "WHERE nspname IN ('observations', 'features')"
    )
    assert schemas == "features,observations"
    assert store.scalar("SELECT current_database()") == support.DATABASE


def test_the_content_is_there_and_came_from_the_script(store: support.Store) -> None:
    assert int(store.scalar("SELECT count(*) FROM features.bathymetry")) == 651
    assert int(store.scalar("SELECT count(*) FROM features.coastline")) == 1


def test_the_recorded_digests_match_what_the_script_says_it_produced(
    store: support.Store, config: Path
) -> None:
    """The seeding record's claim and the store's content are the same claim."""
    report = json.loads(support.feature_store_sql(config, emit="digests"))
    for name, digest in report["digests"].items():
        stored = store.scalar(f"SELECT digest FROM features.provisioning WHERE name = '{name}'")
        assert stored == digest


def test_provisioning_twice_from_one_root_seed_gives_the_same_content(config: Path) -> None:
    """US5 scenario 4: a reset instance provisioned again is the same instance."""
    first = json.loads(support.feature_store_sql(config, emit="digests"))
    second = json.loads(support.feature_store_sql(config, emit="digests"))
    assert first == second
    assert first["root_seed"] == support.destination_config("features")["seed"]["root"]


def test_re_running_the_load_converges_rather_than_loading_twice(
    store: support.Store, config: Path
) -> None:
    store.apply(support.feature_store_sql(config, emit="content"))
    assert int(store.scalar("SELECT count(*) FROM features.bathymetry")) == 651


def test_every_run_time_role_can_read(store: support.Store) -> None:
    for role in RUNTIME_ROLES:
        assert int(store.scalar("SELECT count(*) FROM features.bathymetry", role=role)) == 651


def test_every_run_time_role_is_refused_on_insert_update_and_delete(
    store: support.Store,
) -> None:
    """SC-010: the success count is zero, and the database is what makes it so."""
    statements = (
        "INSERT INTO features.coastline (id, name, line) VALUES ('x', 'x', "
        "ST_GeogFromText('SRID=4326;LINESTRING(0 0, 1 1)'))",
        "UPDATE features.bathymetry SET depth_m = 0",
        "DELETE FROM features.bathymetry",
    )
    for role in RUNTIME_ROLES:
        for statement in statements:
            result = store.psql(statement, role=role, check=False)
            assert result.returncode != 0, f"{role} was allowed: {statement}"
            assert b"permission denied" in result.stderr


def test_the_observation_store_has_exactly_one_writer(store: support.Store) -> None:
    """SC-003, from the database's own catalogue rather than from the roles file."""
    grantees = store.scalar(
        "SELECT string_agg(DISTINCT grantee, ',') FROM information_schema.role_table_grants "
        "WHERE table_schema = 'observations' AND privilege_type = 'INSERT' "
        f"AND grantee <> '{support.OWNER}'"
    )
    assert grantees == "drogna_ingest"


def test_nothing_in_either_schema_takes_a_default_from_the_host_clock(
    store: support.Store,
) -> None:
    """Constitution I, checked in the place a default would actually live."""
    defaults = store.scalar(
        "SELECT count(*) FROM information_schema.columns "
        "WHERE table_schema IN ('observations', 'features') AND column_default IS NOT NULL"
    )
    assert int(defaults) == 0
