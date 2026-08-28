"""The observation store authenticates by trust for the compose network, and only for it.

ADR-0023. The claim has two halves and they pull in opposite directions, which is why both
are asserted here rather than one being taken on trust from the other.

**Authentication is given away, deliberately.** Every DSN in `config/*/` names a role and
carries no password, and each of them connects. That is the whole of what the decision buys:
four generated secrets, a DSN rewriter and an `ALTER ROLE` in the seeding step all existed to
answer `fe_sendauth: no password supplied` on a port published to 127.0.0.1, guarding a
boundary the network already drew.

**Authorisation is not.** `roles.sql` still refuses everybody but `drogna_ingest` a write,
and the test below watches a real `INSERT` refused rather than reading a privilege table.
Trust decides who you may claim to be; the grants decide what that gets you, and FR-018 and
SC-003 rest on the second.

**Scope is asserted against the server's own loaded rules**, through `pg_hba_file_rules`,
rather than by opening a connection from an address off the compose network. The distinction
matters: a container on another bridge network cannot route to this one at all, so such a
connection is refused by the absence of a route and would prove nothing about `pg_hba`.
What can be proved, and is, is that the file the server actually loaded is the tracked one —
not the default `initdb` wrote into PGDATA — and that what it loaded is scoped to `samenet`
with no unrestricted line. That is the difference between a rule file that is in force and
one that merely exists, and it is the half that a `POSTGRES_HOST_AUTH_METHOD` alone would
have got wrong on every existing volume.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import psycopg
import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

from destination import load_deployment  # noqa: E402

DESTINATION = "local"

# The roles whose DSNs must work with no password: the owner the store was created as, and
# the three `stores/observations/roles.sql` creates with LOGIN and nothing else.
RUNTIME_ROLES = ("drogna_ingest", "drogna_read", "drogna_telemetry")

# The reader, and the write it must not be able to do. `DEFAULT VALUES` rather than a column
# list on purpose: a misspelled column would fail with UndefinedColumn before Postgres ever
# reached the privilege check, and the test would pass for the wrong reason.
READER = "drogna_read"
FORBIDDEN_WRITE = "INSERT INTO observations.observation DEFAULT VALUES"


def _docker_is_reachable() -> bool:
    try:
        return subprocess.run(("docker", "info"), capture_output=True, timeout=30).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


pytestmark = pytest.mark.skipif(
    not _docker_is_reachable(), reason="no container runtime is reachable from this shell"
)


def _compose_result(*arguments: str, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        (
            "docker",
            "compose",
            "--file",
            str(REPOSITORY_ROOT / "deploy" / "compose.yaml"),
            "--env-file",
            str(REPOSITORY_ROOT / "deploy" / ".env"),
            *arguments,
        ),
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=REPOSITORY_ROOT,
    )


def _compose(*arguments: str) -> str:
    result = _compose_result(*arguments)
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture(scope="module")
def store() -> dict[str, object]:
    """The running store's own account of itself, having started it if it was not up.

    Started here rather than assumed, and that is not a convenience. `pytest` runs these
    files in name order, `test_compose_bringup.py` sorts before this one and takes the stack
    down with its volumes at module teardown, so a fixture that skipped on a stopped store
    would skip on every full run — including in CI, where the whole point is that what skips
    locally runs somewhere. A test that skips everywhere reads exactly like a clean one,
    which is the failure CLAUDE.md opens with.
    """
    for script in ("up.sh", "seed.sh"):
        # Both, and seeding is not optional: the run-time roles are created by
        # `stores/observations/roles.sql`, which the seeding step applies. A store that is
        # merely up answers `role "drogna_read" does not exist` — which is itself a passing
        # grade for trust auth, since the connection got as far as the role check with no
        # password, and is not what this file is asserting. Both scripts converge, so this
        # is a no-op against a stack that is already up and seeded.
        done = subprocess.run(
            (str(REPOSITORY_ROOT / "scripts" / script), DESTINATION),
            capture_output=True,
            text=True,
            timeout=1800,
            cwd=REPOSITORY_ROOT,
        )
        if done.returncode != 0:
            pytest.skip(f"{script} could not prepare the observation store: {done.stderr[-400:]}")
    deployment = load_deployment(DESTINATION, REPOSITORY_ROOT)
    publish = deployment["network"]["publish"]["observations"]
    return {
        "database": deployment["database"]["name"],
        "owner": deployment["database"]["user"],
        "bind": publish["bind"],
        "port": publish["host_port"],
    }


def _psql_json(store: dict[str, object], statement: str) -> list[dict[str, object]]:
    """One statement, run inside the container, its rows returned as JSON."""
    wrapped = f"SELECT coalesce(json_agg(t), '[]'::json) FROM ({statement}) AS t"
    output = _compose(
        "exec",
        "-T",
        "observations",
        "psql",
        "--quiet",
        "--no-psqlrc",
        "--tuples-only",
        "--no-align",
        "--username",
        str(store["owner"]),
        "--dbname",
        str(store["database"]),
        "--command",
        wrapped,
    )
    return json.loads(output.strip())


def _dsn(store: dict[str, object], role: str) -> str:
    return f"postgresql://{role}@{store['bind']}:{store['port']}/{store['database']}"


def test_the_server_loaded_the_tracked_rules_and_not_the_default(
    store: dict[str, object],
) -> None:
    """`hba_file` names the file in the stores mount, so the tracked rules are the ones in
    force. Without this, every other assertion here could hold against PGDATA's own default
    on a volume that happened to be initialised with trust."""
    declared = _compose("config", "--format", "json")
    hba = json.loads(declared)["services"]["observations"]["command"]
    setting = _psql_json(store, "SELECT setting FROM pg_settings WHERE name = 'hba_file'")

    assert setting, "the server reports no hba_file setting"
    loaded = str(setting[0]["setting"])
    assert f"hba_file={loaded}" in hba, (
        f"the server loaded {loaded}, which deploy/compose.yaml does not name in its command: {hba}"
    )
    assert loaded.endswith("observations/pg_hba.conf"), loaded


def test_every_loaded_rule_is_trust_and_scoped_to_this_network(
    store: dict[str, object],
) -> None:
    """Trust, and `samenet` — never an unrestricted line.

    The absence of a `host all all all` rule is the boundary: an address off the compose
    network is rejected because no rule admits it, not because it is asked for a password.
    """
    rules = _psql_json(
        store,
        "SELECT type, address, auth_method, error FROM pg_hba_file_rules ORDER BY line_number",
    )

    assert rules, "the server loaded no authentication rules at all"
    for rule in rules:
        assert rule["error"] is None, f"the server could not parse a rule: {rule['error']}"
        assert rule["auth_method"] == "trust", (
            f"a rule asks for {rule['auth_method']}; ADR-0023 says this store authenticates "
            "by trust, and a rule that asks for a password is one no DSN carries"
        )
        address = rule["address"]
        assert address in (None, "samenet"), (
            f"a rule admits {address!r}. Only the container's own socket and the compose "
            "network may reach this store; an unrestricted address would extend trust past "
            "the boundary the published bind (127.0.0.1) draws"
        )
    assert {rule["type"] for rule in rules} == {"local", "host"}, rules


@pytest.mark.parametrize("role", RUNTIME_ROLES)
def test_a_runtime_role_connects_with_no_password(store: dict[str, object], role: str) -> None:
    """The DSN as `config/*/` tracks it, with nothing added. This is the failure the
    retired machinery existed to prevent, asserted directly."""
    with psycopg.connect(_dsn(store, role), connect_timeout=15) as connection:
        assert connection.execute("SELECT current_user").fetchone()[0] == role


def test_the_owner_connects_with_no_password(store: dict[str, object]) -> None:
    """The role the seeding step and the features one-shot provision as."""
    owner = str(store["owner"])
    with psycopg.connect(_dsn(store, owner), connect_timeout=15) as connection:
        assert connection.execute("SELECT current_user").fetchone()[0] == owner


def test_trust_gives_away_authentication_and_not_authorisation(
    store: dict[str, object],
) -> None:
    """The reader connects, and is still refused a write.

    Asserted as an attempted `INSERT` rather than as `has_table_privilege`, because the
    claim FR-018 makes is that the database refuses the write, not that a catalogue says it
    would.
    """
    with (
        psycopg.connect(_dsn(store, READER), connect_timeout=15) as connection,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        connection.execute(FORBIDDEN_WRITE)
