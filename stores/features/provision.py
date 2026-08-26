"""C-07: produce the feature store's content from the root seed, and the SQL that loads it.

Static spatial reference — synthetic bathymetry and a synthetic coastline — is loaded
before a scenario starts and cannot change while one runs. This module is the producing
half. Like ``stores/observations/apply.py`` it writes SQL to standard output and connects
to nothing::

    python stores/features/provision.py --emit schema   | psql "$DSN"
    python stores/features/provision.py --emit content  | psql "$DSN"
    python stores/features/provision.py --emit digests  > "$DROGNA_ARTEFACT_DIR/features.json"

The second form is what the seeding record digests. The content is a pure function of the
root seed and the configuration, so the same seed provisioned twice yields the same
digests, and a difference between two instances is a difference somebody made.

Nothing here reads the host clock or an unseeded generator. Every draw comes from
``harness_core.rng.rng_for`` for a named stream, and every identifier from
``identifier_for``, so the reference data is reproducible from the run manifest along with
everything else.

The content represents no real place. It is a slope, some seeded roughness and a wandering
line: enough for the client to draw against and for the planner to avoid, and nothing that
claims to be a survey of anywhere (SRD §1.1).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:  # `python stores/features/provision.py` from anywhere
    sys.path.insert(0, str(_HERE))

from harness_core.config import ConfigError, load_or_exit  # noqa: E402
from harness_core.rng import configure_run, identifier_for, rng_for  # noqa: E402

__all__ = [
    "BATHYMETRY_STREAM",
    "COASTLINE_STREAM",
    "COMPONENT",
    "Content",
    "content_from",
    "digests",
    "load_sql",
    "schema_sql",
]

COMPONENT = "features"

BATHYMETRY_STREAM = "features.bathymetry"
COASTLINE_STREAM = "features.coastline"

_SCHEMAS_DIRECTORY = "schemas"
_MIGRATIONS_DIRECTORY = "migrations"
# harness:allow-literal-path shipped beside this module, not a deployment location
ROLES_FILE = "roles.sql"
# harness:allow-literal-path as above
CONFIG_SCHEMA = "config.features.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"
_SQL_SUFFIX = ".sql"

_IDENTIFIER_LENGTH = 12


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a schema document shipped beside this module, by file name."""
    document = (_HERE / _SCHEMAS_DIRECTORY / name).read_text(encoding="utf-8")
    return json.loads(document)


def schema_sql(root: Path | None = None) -> str:
    """The migrations and the grants, in the order they have to run and one transaction.

    The grants come last because a grant on a table that does not exist is an error rather
    than a promise, and the run-time roles they name are created by the observation
    store's own roles file, which the seeding path applies first.
    """
    here = root or _HERE
    parts = ["BEGIN;"]
    for path in sorted((here / _MIGRATIONS_DIRECTORY).glob("*" + _SQL_SUFFIX)):
        parts.append(f"-- {path.name}")
        parts.append(path.read_text(encoding="utf-8"))
    roles = here / ROLES_FILE
    parts.append(f"-- {roles.name}")
    parts.append(roles.read_text(encoding="utf-8"))
    parts.append("COMMIT;")
    return "\n".join(parts) + "\n"


@dataclass(frozen=True)
class Content:
    """What a provisioning run produces: rows, and the digest of each table's content."""

    bathymetry: tuple[tuple[str, float, float, float], ...]
    coastline: tuple[tuple[str, str, tuple[tuple[float, float], ...]], ...]

    def digests(self) -> dict[str, str]:
        """A digest per table, over a canonical rendering of the rows."""
        return {
            "bathymetry": _digest(self.bathymetry),
            "coastline": _digest(self.coastline),
        }


def _digest(rows: object) -> str:
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _axis(extent: Mapping[str, Any], count: int) -> list[float]:
    """``count`` evenly spaced values across an extent, endpoints included."""
    low = float(extent["minimum"])
    high = float(extent["maximum"])
    if count < 2:
        raise ValueError("an axis needs at least two values for its spacing to mean anything")
    step = (high - low) / (count - 1)
    return [low + step * index for index in range(count)]


def content_from(document: Mapping[str, Any]) -> Content:
    """Produce the whole of the feature store's content from configuration and seed.

    The slope runs from the shallow depth at the northernmost latitude to the deep depth
    at the southernmost, with seeded roughness on top. Which way it runs is arbitrary and
    stated here rather than left to be inferred from the numbers.
    """
    section = document["features"]
    domain = section["domain"]
    bathymetry_settings = section["bathymetry"]
    coastline_settings = section["coastline"]

    latitudes = _axis(domain["latitude"], int(bathymetry_settings["latitude_count"]))
    longitudes = _axis(domain["longitude"], int(bathymetry_settings["longitude_count"]))
    shallow = float(bathymetry_settings["shallow_depth_m"])
    deep = float(bathymetry_settings["deep_depth_m"])
    roughness = float(bathymetry_settings["roughness_m"])

    generator = rng_for(BATHYMETRY_STREAM)
    span = latitudes[-1] - latitudes[0]
    rows: list[tuple[str, float, float, float]] = []
    position = 0
    for latitude in latitudes:
        fraction = 0.0 if span == 0 else (latitudes[-1] - latitude) / span
        smooth = shallow + (deep - shallow) * fraction
        for longitude in longitudes:
            wander = generator.gauss(0.0, roughness) if roughness > 0 else 0.0
            depth = max(0.0, smooth + wander)
            rows.append(
                (
                    identifier_for(BATHYMETRY_STREAM, position, length=_IDENTIFIER_LENGTH),
                    latitude,
                    longitude,
                    depth,
                )
            )
            position += 1

    vertices = _axis(domain["longitude"], int(coastline_settings["vertex_count"]))
    variation = float(coastline_settings["variation_degrees"])
    shore = rng_for(COASTLINE_STREAM)
    northern = max(latitudes[0], latitudes[-1])
    line = tuple(
        (longitude, northern + (shore.gauss(0.0, variation) if variation > 0 else 0.0))
        for longitude in vertices
    )
    coastline = (
        (
            identifier_for(COASTLINE_STREAM, 0, length=_IDENTIFIER_LENGTH),
            "northern shore",
            line,
        ),
    )
    return Content(bathymetry=tuple(rows), coastline=coastline)


def _point(longitude: float, latitude: float) -> str:
    return f"ST_GeogFromText('SRID=4326;POINT({longitude!r} {latitude!r})')"


def _line_string(vertices: Sequence[tuple[float, float]]) -> str:
    points = ", ".join(f"{longitude!r} {latitude!r}" for longitude, latitude in vertices)
    return f"ST_GeogFromText('SRID=4326;LINESTRING({points})')"


def load_sql(document: Mapping[str, Any], content: Content) -> str:
    """The SQL that loads this content, in one transaction and converging on a re-run.

    Re-running is a no-op rather than a second load: every row is keyed by its
    deterministic identifier and the tables are emptied of anything the current seed no
    longer produces, so an interrupted run and a completed one end in the same place.
    """
    tables = document["features"]["store"]["tables"]
    schema_name = document["features"]["store"]["schema"]
    bathymetry = f"{schema_name}.{tables['bathymetry']}"
    coastline = f"{schema_name}.{tables['coastline']}"

    lines = ["BEGIN;", f"DELETE FROM {bathymetry};", f"DELETE FROM {coastline};"]
    for identifier, latitude, longitude, depth in content.bathymetry:
        lines.append(
            f"INSERT INTO {bathymetry} (id, latitude, longitude, depth_m, location) VALUES "
            f"('{identifier}', {latitude!r}, {longitude!r}, {depth!r}, "
            f"{_point(longitude, latitude)});"
        )
    for identifier, name, vertices in content.coastline:
        lines.append(
            f"INSERT INTO {coastline} (id, name, line) VALUES "
            f"('{identifier}', '{name}', {_line_string(vertices)});"
        )
    for name, digest in content.digests().items():
        lines.append(
            f"INSERT INTO {schema_name}.provisioning (name, digest) "
            f"VALUES ('{name}', '{digest}') "
            f"ON CONFLICT (name) DO UPDATE SET digest = EXCLUDED.digest;"
        )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def digests(document: Mapping[str, Any], content: Content) -> str:
    """The digest report the seeding record keeps, as JSON."""
    report = {
        "component": COMPONENT,
        "root_seed": int(document["seed"]["root"]),
        "digests": content.digests(),
        "counts": {
            "bathymetry": len(content.bathymetry),
            "coastline": len(content.coastline),
        },
    }
    return json.dumps(report, indent=2, sort_keys=True) + "\n"


def main(argv: Sequence[str] | None = None, *, env: Mapping[str, str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="produce the feature store's content")
    parser.add_argument(
        "--emit",
        choices=("schema", "content", "digests"),
        default="content",
        help=(
            "schema: the migrations and grants. content: the SQL loading this seed's "
            "content. digests: the report the seeding record keeps."
        ),
    )
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    config = load_or_exit(
        schema(CONFIG_SCHEMA),
        env=env,
        component=COMPONENT,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
    )
    if arguments.emit == "schema":
        sys.stdout.write(schema_sql())
        return 0

    configure_run(int(config.document["seed"]["root"]))
    content = content_from(config.document)
    if arguments.emit == "digests":
        sys.stdout.write(digests(config.document, content))
    else:
        sys.stdout.write(load_sql(config.document, content))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        raise SystemExit(exc.exit_code) from exc
