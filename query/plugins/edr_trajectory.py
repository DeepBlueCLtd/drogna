"""The bespoke EDR trajectory provider: each vertex answered for its own arrival time.

No supplied pygeoapi provider implements trajectory at all — the provider matrix lists
`xarray-edr` as position and cube only — so FR-050 makes this a planned component sitting
behind the coverage output port rather than a workaround (ADR-0003). pygeoapi parses the
``coords`` parameter with ``shapely.wkt.loads`` and hands the geometry to the provider
untouched, so every question about what the M ordinate means is answered in this file.

**What M carries.** Each vertex's arrival time, as seconds since the Unix epoch. Feature
002's spike used that encoding and recorded honestly that it did not verify the choice
against the OGC API-EDR specification text; it is the one assumption in its finding resting
on convention alone. It is written down here, once, as
:data:`VERTEX_TIME_ENCODING`, because the client and this provider must agree either way and
a disagreement between them would produce a plausible wrong answer rather than an error.

**What happens when M does not survive.** It is refused, and the refusal names the version
pin. Below Shapely 2.1 built against GEOS 3.12 the per-vertex times are lost before any
provider code runs — returned as NaN, dropped entirely, or delivered in the Z slot, three
modes rather than the one FR-051 describes — and *nothing raises*. The default outcome of
losing M is not an error: it is a provider quietly evaluating a whole route at one time and
returning HTTP 200 with values that look entirely reasonable. So this provider checks, and
declines to fall back to a single time.

**The vertical.** WKT Z is elevation, positive up. The coverage's axis is depth, positive
down. ``depth = -z``. A geometry with no Z takes the configured default depth, explicitly,
because the spike found the default invisible from outside.

**What is refused rather than smoothed over.** A route whose vertex times do not increase is
refused with the offending vertex named, not silently reordered. A route longer than the
configured vertex limit is refused with the limit stated, not truncated. A vertex outside the
forecast's extent is declined explicitly and its value is null; nothing is extrapolated.

**``limit``.** The framework passes one, defaulting to ten. It is a records limit and this
provider does not let it truncate a route: a twenty-vertex route answered as ten with HTTP
200 is exactly the failure this file exists to avoid. The vertex bound is the configured
one, and it refuses rather than truncates.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import Any, ClassVar

from harness_core.clock import SimInstant

from plugins.coveragejson import trajectory_coverage
from plugins.edr_coverage import (
    CoverageSettings,
    DrognaCoverageEDRProvider,
    OpenRun,
)
from plugins.errors import (
    QueryLayerError,
    RequestTooLargeError,
    TrajectoryRefusedError,
    as_provider_error,
)
from plugins.interpolation import interpolate

__all__ = [
    "VERTEX_TIME_ENCODING",
    "DrognaTrajectoryEDRProvider",
    "TrajectoryQuery",
    "Vertex",
    "vertices_from_coordinates",
    "vertices_from_geometry",
]

VERTEX_TIME_ENCODING = "seconds since 1970-01-01T00:00:00Z"
"""What the M ordinate of a trajectory's WKT means. See the module docstring."""

_MICROS_PER_SECOND = 1_000_000

_PIN = (
    "FR-051 pins Shapely 2.1 or later built against GEOS 3.12 or later. Below that the M "
    "ordinate of a LINESTRING M or LINESTRING ZM is lost silently — returned as NaN, "
    "dropped entirely, or delivered in the Z slot, depending on the combination — and the "
    "per-vertex arrival times are gone before any provider code runs. Refusing to answer "
    "the whole route at one time, because such a response is structurally correct and "
    "wrong, and nobody inspecting it could tell."
)


@dataclass(frozen=True)
class Vertex:
    """One point on a route: where, how deep, and when the platform is expected there."""

    index: int
    longitude: float
    latitude: float
    depth: float
    unix_seconds: float

    def iso(self) -> str:
        return SimInstant(round(self.unix_seconds * _MICROS_PER_SECOND)).iso()


def vertices_from_coordinates(
    coordinates: Sequence[Sequence[float]],
    *,
    default_depth_metres: float,
) -> list[Vertex]:
    """Turn ``(x, y, z, m)`` rows into vertices, refusing any whose M is not a time.

    Written against rows rather than against a geometry so the rule can be tested without a
    geometry library present, and so the one place M is interpreted is one function.
    """
    vertices: list[Vertex] = []
    for index, row in enumerate(coordinates):
        if len(row) < 3:
            raise TrajectoryRefusedError(
                f"vertex {index} carries {len(row)} ordinates; a trajectory's vertices "
                f"carry an M ordinate with the arrival time ({VERTEX_TIME_ENCODING}). {_PIN}"
            )
        longitude, latitude = float(row[0]), float(row[1])
        elevation = float(row[2]) if len(row) == 4 else None
        if elevation is not None and math.isnan(elevation):
            # A LINESTRING M parsed with include_z gives a NaN in the Z slot rather than
            # three columns. It means the route named no depth, not that it named a broken
            # one, so the configured default applies exactly as for a three-ordinate route.
            elevation = None
        measure = float(row[-1])
        if math.isnan(measure):
            raise TrajectoryRefusedError(
                f"vertex {index} has no arrival time: its M ordinate parsed as NaN. {_PIN}"
            )
        depth = default_depth_metres if elevation is None else -elevation
        vertices.append(
            Vertex(
                index=index,
                longitude=longitude,
                latitude=latitude,
                depth=depth,
                unix_seconds=measure,
            )
        )
    if not vertices:
        raise TrajectoryRefusedError("a trajectory query names no vertices")
    return vertices


def vertices_from_geometry(geometry: Any, *, default_depth_metres: float) -> list[Vertex]:
    """Read the geometry pygeoapi hands over, M ordinate included.

    ``shapely.get_coordinates(..., include_m=True)`` is the only call that reaches the M
    values. On Shapely 2.0 the parameter does not exist and the ordinate is absent rather
    than NaN; that raises ``TypeError`` here and is turned into the same refusal, because
    from the caller's point of view the two are one failure with one cause.

    ``shapely.has_m`` is deliberately not used: on Shapely 2.1 built against GEOS below 3.12
    it raises ``UnsupportedGEOSVersionError`` rather than returning ``False``, so a guard
    written in terms of it errors out instead of failing informatively.
    """
    try:
        from shapely import get_coordinates
    except ImportError as error:  # pragma: no cover - the image installs it
        raise TrajectoryRefusedError(
            f"no geometry library is installed, so a trajectory's coordinates cannot be "
            f"read. {_PIN}"
        ) from error

    try:
        rows = get_coordinates(geometry, include_z=True, include_m=True)
    except TypeError as error:
        raise TrajectoryRefusedError(
            f"the installed geometry library cannot return an M ordinate at all, so the "
            f"per-vertex arrival times are already gone. {_PIN}"
        ) from error

    if rows.shape[1] != 4:
        raise TrajectoryRefusedError(
            f"the geometry parsed to {rows.shape[1]} ordinates per vertex, not four, so "
            f"there is no M ordinate to read the arrival times from. {_PIN}"
        )
    return vertices_from_coordinates(
        [[float(value) for value in row] for row in rows],
        default_depth_metres=default_depth_metres,
    )


class TrajectoryQuery:
    """Sampling a route against one open run. Plain Python; no framework in the way."""

    def __init__(self, run: OpenRun) -> None:
        self.run = run

    def validate(self, vertices: Sequence[Vertex]) -> None:
        """Increasing time order and the vertex-count bound, each refusal naming the cause."""
        budget = self.run.settings.trajectory_maximum_vertices
        if len(vertices) > budget:
            raise RequestTooLargeError(
                f"this route names {len(vertices)} vertices and the configured limit is "
                f"{budget}. Refused rather than truncated: a route answered short would be "
                f"returned with HTTP 200 and would look complete."
            )
        for earlier, later in pairwise(vertices):
            if later.unix_seconds <= earlier.unix_seconds:
                raise TrajectoryRefusedError(
                    f"vertex {later.index} is timed at {later.iso()}, which is not after "
                    f"vertex {earlier.index} at {earlier.iso()}. A route that goes "
                    f"backwards in time is refused rather than reordered: reordering would "
                    f"answer a route nobody asked for."
                )

    def sample(
        self,
        vertices: Sequence[Vertex],
        *,
        parameters: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        run = self.run
        chosen = run.settings.select(parameters)
        self.validate(vertices)

        composite: list[tuple[str, float, float, float]] = []
        values: dict[str, list[float | None]] = {parameter.name: [] for parameter in chosen}
        declined: list[dict[str, Any]] = []
        variables = {parameter.name: run.variable(parameter) for parameter in chosen}

        for vertex in vertices:
            seconds = self._axis_seconds(vertex)
            coordinate = (seconds, vertex.depth, vertex.latitude, vertex.longitude)
            composite.append((vertex.iso(), vertex.longitude, vertex.latitude, vertex.depth))
            outside = run.grid.outside(coordinate)
            if outside:
                declined.append(
                    {
                        "vertex": vertex.index,
                        "reason": "; ".join(outside),
                        "note": (
                            "outside the forecast's extent. Declined explicitly; nothing is "
                            "extrapolated, because a forecast horizon that extends itself "
                            "silently is the worst answer available here."
                        ),
                    }
                )
                for parameter in chosen:
                    values[parameter.name].append(None)
                continue
            for parameter in chosen:
                values[parameter.name].append(
                    interpolate(variables[parameter.name], run.grid, coordinate)
                )

        return trajectory_coverage(
            vertices=composite,
            parameters=chosen,
            values=values,
            declined=declined,
        )

    def _axis_seconds(self, vertex: Vertex) -> float:
        """The vertex's arrival time in the coverage's own time units."""
        instant = SimInstant(round(vertex.unix_seconds * _MICROS_PER_SECOND))
        return (instant - self.run.time_encoding.origin) / _MICROS_PER_SECOND


class DrognaTrajectoryEDRProvider(DrognaCoverageEDRProvider):
    """The provider a coverage collection names: position, cube and trajectory, from one class.

    One collection serves all three rather than two collections that could disagree about
    which run they describe (FR-004, T031).

    ``position`` and ``cube`` are re-declared below as one-line delegations, and this is not
    tidiness. In the pygeoapi line feature 002's spike measured,
    ``BaseEDRProvider.__init_subclass__`` builds the advertised query types from the
    subclass's *own* ``__dict__``: a plugin that subclasses a provider and adds only
    ``trajectory`` advertises **only** trajectory, and ``position`` and ``cube`` vanish from
    the collection's data queries in silence. Re-declaring them keeps all three advertised
    under that mechanism. ``query_types`` below keeps all three advertised under the other
    mechanism, the one the pinned release uses. A test asserts the collection advertises
    three, and it asserts it through both.
    """

    query_types: ClassVar[list[str]] = ["position", "cube", "trajectory", "instances"]

    def position(self, **kwargs: Any) -> Any:
        """Delegation, so the query type stays advertised. See the class docstring."""
        return super().position(**kwargs)

    def cube(self, **kwargs: Any) -> Any:
        """Delegation, so the query type stays advertised. See the class docstring."""
        return super().cube(**kwargs)

    def trajectory(self, **kwargs: Any) -> Any:
        try:
            run = self._open(kwargs.get("instance"))
            geometry = kwargs.get("wkt")
            if geometry is None:
                raise TrajectoryRefusedError("a trajectory query needs a coords parameter")
            vertices = vertices_from_geometry(
                geometry,
                default_depth_metres=run.settings.default_depth_metres,
            )
            return TrajectoryQuery(run).sample(
                vertices,
                parameters=kwargs.get("select_properties"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error


def settings_from_config(section: Mapping[str, Any]) -> CoverageSettings:
    """Convenience for a caller holding the configuration document rather than a provider."""
    return CoverageSettings.from_config(section)
