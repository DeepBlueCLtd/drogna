"""Provision the feature store, then exit. A one-shot, not a service that stays up.

    python -m harness_features                 # apply, and report the digests
    python -m harness_features --emit digests  # report the digests, apply nothing

The producing half of this component is ``stores/features/provision.py``: it turns the root
seed and the destination configuration into SQL and opens no connection, which is the shape
its docstring argues for and the shape the integration tests exercise. This module is the
consuming half. It runs the producer, applies what it emits, and stops.

**Why this is a container and not a seeding step.** Every other provisioning in the
deployment is a few lines of ``psql`` in ``deploy/seed.d/``, run on the host. That works for
the observation store, whose ``apply.py`` imports nothing but the standard library. It
cannot work here: the feature store's content is a seeded draw and its configuration is
schema-validated, so the producer needs ``harness_core`` — and ``deploy/README.md`` promises
that a destination needs "a container runtime and a Python interpreter, and nothing else
from this project", with a test holding the promise. A step that ran ``uv run`` would break
it. So the workspace comes to the provisioning rather than the provisioning requiring a
workspace, and this is the container that carries it.

**The store definitions are mounted, not copied into the image.** ``stores/`` is deploy-time
input, like the destination configuration mounted beside it. Baking it into the shared
Python service image would put provisioning code into ten images that never provision, and
would add a ``COPY`` to the one Dockerfile ``CLAUDE.md`` warns about twice.

The digests go to standard output and nothing else does, so a caller can capture them into
the seeding record. Everything the run has to say about its progress goes to standard error.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

CONNECT_TIMEOUT_SECONDS = 10


def config_path() -> str:
    """The one variable a component reads (Constitution IV, NFR-04)."""
    declared = os.environ.get("HARNESS_CONFIG")
    if not declared:
        raise SystemExit(
            "HARNESS_CONFIG is not set, so this component does not know which document is "
            "its own. It is the one variable that carries operational meaning."
        )
    return declared


# The three emissions, in the order they must be applied. `schema` is structure, `content`
# is this seed's data, and the grants come last because a grant on a table that does not
# exist yet is an error rather than a promise.
EMISSIONS = ("schema", "content")


def stores_root(declared: str) -> Path:
    """Check that the declared definitions directory is actually there, and return it.

    The path comes from `features.store.definitions_directory` in the document named by
    HARNESS_CONFIG, not from an environment variable of its own: Constitution IV admits one
    variable and everything else arrives inside the document it names. Being a `_directory`
    key holding a container path, `deploy/lib/mount_lint.py` also checks the deployment
    mounts it — which matters here more than usual, because an unmounted directory still
    *exists* inside a container. Without that check a provisioning run would find an empty
    directory, and the failure below is the only thing that would say so.
    """
    root = Path(declared)
    if not (root / "provision.py").is_file():
        raise SystemExit(
            f"no provision.py under {root}; the store definitions are not mounted there. "
            f"Nothing was applied: a provisioning run that cannot find what it provisions "
            f"must stop rather than leave a store somebody believes is loaded."
        )
    return root


def emit(root: Path, what: str) -> str:
    """Run the producer for one emission and return the SQL it wrote."""
    result = subprocess.run(
        [sys.executable, str(root / "provision.py"), "--emit", what],
        capture_output=True,
        check=False,
        cwd=root.parent.parent,
    )
    if result.returncode != 0:
        raise SystemExit(
            f"provision.py --emit {what} failed ({result.returncode}): "
            f"{result.stderr.decode('utf-8', 'replace').strip()}"
        )
    return result.stdout.decode("utf-8")


def apply(dsn: str, statements: list[tuple[str, str]]) -> None:
    """Apply each emission, each in its own transaction, stopping at the first failure.

    One transaction per emission rather than one for all three: the schema is idempotent and
    guarded by its own digest check, the content load deletes and re-inserts, and the grants
    are separate again. A single transaction would roll back a good schema because a grant
    failed, and the next run would have nothing to grant on.
    """
    import psycopg

    with psycopg.connect(dsn, connect_timeout=CONNECT_TIMEOUT_SECONDS) as connection:
        for name, sql in statements:
            if not sql.strip():
                raise SystemExit(f"{name} emitted no SQL; refusing to report a store as loaded")
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute(sql)  # type: ignore[arg-type]
            print(f"  applied {name}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--emit",
        choices=("digests",),
        help="report the digests and apply nothing; for a caller that has already applied",
    )
    arguments = parser.parse_args(argv)

    # The configuration says where the definitions are, and the definitions carry the
    # schema the configuration is validated against — so the document is read once here to
    # find the path, and validated properly against that schema immediately afterwards. A
    # component that validated nothing until after it had followed a path out of the same
    # unvalidated document would be trusting the half it had not checked.
    store = json.loads(Path(config_path()).read_text(encoding="utf-8"))["features"]["store"]
    root = stores_root(store["definitions_directory"])

    # Imported here rather than at module scope: the producer is on a mounted path that
    # does not exist until the deployment mounts it, and stores_root() is what says so with
    # a message instead of an ImportError.
    sys.path.insert(0, str(root))
    import provision  # type: ignore[import-not-found]
    from harness_core.config import load_or_exit

    config = load_or_exit(
        provision.schema(provision.CONFIG_SCHEMA),
        component=provision.COMPONENT,
        referenced_schemas=[provision.schema(provision.COMMON_CONFIG_SCHEMA)],
    )
    dsn = config.document["features"]["store"]["dsn"]

    if arguments.emit == "digests":
        sys.stdout.write(emit(root, "digests"))
        return 0

    statements = [(what, emit(root, what)) for what in EMISSIONS]
    # harness:allow-literal-path inside the store definition read above, not a deployment location
    statements.append(("roles", (root / "roles.sql").read_text(encoding="utf-8")))
    apply(dsn, statements)

    # Last, and only after everything applied, so an interrupted run leaves no digest report
    # claiming content that never reached the store.
    sys.stdout.write(emit(root, "digests"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
