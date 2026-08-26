"""Compose the observation store's provisioning SQL: migrations, then roles, in order.

This module writes SQL to standard output and connects to nothing::

    python stores/observations/apply.py | psql "$DSN"

That shape is deliberate. The provisioning step runs against a database the seeding path
already knows how to reach, and a second connection here would mean a second place holding
a connection string and a driver dependency in a directory whose whole content is
otherwise SQL. What this module contributes is the two things a bare ``psql -f`` of the
directory would not do: it orders the migrations, and it emits a digest guard after each
one so that a migration edited after it was applied stops the run instead of leaving a
fresh instance and a migrated one quietly disagreeing (NFR-07, FR-022).

Everything runs in one transaction. A provisioning run either leaves the schema as this
directory describes it or leaves it as it found it.

The grants, and the assertion that no role but the ingest client's can write, live in
``roles.sql`` where the roles are named. They are applied last because a grant on a table
that does not exist yet is an error rather than a promise.
"""

from __future__ import annotations

import hashlib
import sys
from collections.abc import Iterator, Sequence
from pathlib import Path

__all__ = ["MIGRATIONS_DIRECTORY", "ROLES_FILE", "composed_sql", "digest_of", "migrations"]

# harness:allow-literal-path SQL shipped beside this module, not a deployment location
MIGRATIONS_DIRECTORY = "migrations"
# harness:allow-literal-path as above
ROLES_FILE = "roles.sql"
_SQL_SUFFIX = ".sql"

_HERE = Path(__file__).resolve().parent


def digest_of(text: str) -> str:
    """The digest recorded beside a migration's name, in the manifest's own spelling."""
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def migrations(root: Path | None = None) -> list[Path]:
    """Every migration, in the lexical order their numbering imposes."""
    directory = (root or _HERE) / MIGRATIONS_DIRECTORY
    return sorted(path for path in directory.glob("*" + _SQL_SUFFIX) if path.is_file())


def _guard(name: str, digest: str) -> str:
    """SQL recording a migration as applied, and refusing a migration that has changed."""
    return f"""
DO $guard$
BEGIN
    INSERT INTO observations.migration (name, digest)
    VALUES ('{name}', '{digest}')
    ON CONFLICT (name) DO NOTHING;
    IF NOT EXISTS (
        SELECT 1 FROM observations.migration
        WHERE name = '{name}' AND digest = '{digest}'
    ) THEN
        RAISE EXCEPTION
            'migration % was applied from different content; a fresh instance and this '
            'one would not agree. Write a new migration rather than editing an applied '
            'one', '{name}';
    END IF;
END
$guard$;
"""


def _parts(root: Path | None = None) -> Iterator[str]:
    here = root or _HERE
    yield "BEGIN;"
    for path in migrations(here):
        text = path.read_text(encoding="utf-8")
        yield f"-- {path.name}"
        yield text
        yield _guard(path.name, digest_of(text))
    roles = here / ROLES_FILE
    yield f"-- {roles.name}"
    yield roles.read_text(encoding="utf-8")
    yield "COMMIT;"


def composed_sql(root: Path | None = None) -> str:
    """The whole provisioning run as one script, in one transaction."""
    return "\n".join(_parts(root)) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(f"{Path(__file__).name} takes no arguments; it writes SQL to stdout", file=sys.stderr)
        return 2
    sys.stdout.write(composed_sql())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
