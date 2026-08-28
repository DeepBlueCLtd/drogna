"""The widened EDR provider: all seven data query types, and instances, from one class.

This is feature 023's growth of feature 008's provider chain, additive by construction:
:class:`DrognaComposerEDRProvider` subclasses the trajectory provider, which subclasses
the coverage provider, and the computation for each new type lives in its own module —
:mod:`plugins.edr_region`, :mod:`plugins.edr_corridor`, :mod:`plugins.edr_locations` —
exactly as position, cube and trajectory live in theirs.

Every query type is re-declared here as a method in this class's own ``__dict__`` *and*
named in ``query_types`` on the class itself, because pygeoapi has spelt query-type
advertisement two different ways across releases and the failure mode of getting it wrong
is a collection that quietly stops advertising what it can do
(:mod:`plugins.pygeoapi_version`). The advertised set, the emitted OpenAPI document and
the served account in ``query/README.md`` are widened together (FR-78).

**The corridor's width arrives past the provider interface, deliberately.** pygeoapi
0.20.0 passes ``within``/``within-units`` for radius and nothing at all for corridor —
measured against the release, not assumed — so ``corridor-width`` and ``width-units`` are
read off the web request at the one seam this component already owns for exactly this
shape of problem (``sensorthings_provider.request_query_options`` records the argument).
The reading is confined to one function here, degrades to "no parameter given" where no
request is in flight, and everything below it is framework-free.

The geometry helpers are duck-typed over the Shapely API pygeoapi hands over, so the
shape refusals — a polygon with holes, a multipolygon, a non-point radius centre — are
testable in the workspace, which carries no geometry library.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, ClassVar

from plugins.edr_corridor import CorridorQuery
from plugins.edr_geometry import parse_distance_km
from plugins.edr_locations import (
    LocationsCatalogue,
    PostgresSensorPositions,
    location_column,
)
from plugins.edr_region import RegionQuery
from plugins.edr_trajectory import DrognaTrajectoryEDRProvider, vertices_from_geometry
from plugins.errors import QueryLayerError, as_provider_error

__all__ = [
    "CORRIDOR_OPTIONS_NOT_IMPLEMENTED",
    "DrognaComposerEDRProvider",
    "point_from_geometry",
    "ring_from_polygon",
]

CORRIDOR_OPTIONS_NOT_IMPLEMENTED: Mapping[str, str] = {
    "corridor-height": (
        "The corridor is horizontal: depth comes from the route's own Z ordinates or "
        "the configured default, per vertex, exactly as trajectory takes it."
    ),
    "height-units": "Not implemented because corridor-height is not.",
    "resolution-x": (
        "The along-track resolution is the route's own vertices; the cross-track "
        "resolution is the run's grid spacing, derived from the store rather than "
        "chosen per request."
    ),
    "resolution-z": "The vertical is per-vertex, as in trajectory; there is no z axis to resample.",
}
"""Corridor options refused with the option named, in the SensorThings discipline.

A silently dropped option would return an answer to a question nobody asked, and it
would look exactly like a correct one.
"""


def point_from_geometry(geometry: Any) -> tuple[float, float]:
    """The (longitude, latitude) of a point geometry, or a refusal naming the shape."""
    kind = getattr(geometry, "geom_type", type(geometry).__name__)
    if kind != "Point":
        raise QueryLayerError(
            f"this query type takes a POINT in coords, and the geometry given is "
            f"{kind}. The centre of a radius query is one point; drawing the "
            f"neighbourhood is the distance's job."
        )
    return float(geometry.x), float(geometry.y)


def ring_from_polygon(geometry: Any) -> list[tuple[float, float]]:
    """A single-ring polygon's exterior, or a refusal naming the unsupported shape.

    Holes and multipolygons are refused rather than approximated: answering the filled
    outline of a polygon somebody drew with a hole in it would return data the caller
    explicitly excluded, with nothing in the response to say so.
    """
    kind = getattr(geometry, "geom_type", type(geometry).__name__)
    if kind == "MultiPolygon":
        raise QueryLayerError(
            "an area query takes one POLYGON in coords, and the geometry given is a "
            "MultiPolygon. One query, one region; issue one request per region."
        )
    if kind != "Polygon":
        raise QueryLayerError(
            f"an area query takes a POLYGON in coords, and the geometry given is {kind}."
        )
    interiors = list(getattr(geometry, "interiors", ()) or ())
    if interiors:
        raise QueryLayerError(
            f"this polygon has {len(interiors)} interior ring(s), and holes are not "
            f"served: answering the filled outline would include data the caller "
            f"explicitly excluded. Draw the region as a single ring."
        )
    return [(float(x), float(y)) for x, y, *_ in geometry.exterior.coords]


def request_parameters() -> dict[str, str]:
    """The plain query parameters of the request in flight, at the one established seam.

    pygeoapi's EDR routing passes corridor queries no width at all, so ``corridor-width``
    and ``width-units`` can arrive no other way. Same seam, same confinement and same
    fallback as ``sensorthings_provider.request_query_options``: where Flask is absent or
    no request is in flight, there are no parameters, and the caller refuses for the
    missing width by name.
    """
    try:
        from flask import has_request_context, request
    except ImportError:  # pragma: no cover - the image installs it
        return {}
    if not has_request_context():
        return {}
    return {name: value for name, value in request.args.items() if not name.startswith("$")}


class DrognaComposerEDRProvider(DrognaTrajectoryEDRProvider):
    """The provider the forecast collection names: every advertised type genuinely served.

    ``position``, ``cube``, ``trajectory`` and ``instances`` are re-declared as one-line
    delegations for the advertisement reason the trajectory provider's docstring sets
    out; ``radius``, ``area``, ``corridor`` and ``locations`` are this feature's growth.
    """

    query_types: ClassVar[list[str]] = [
        "position",
        "radius",
        "area",
        "cube",
        "trajectory",
        "corridor",
        "locations",
        "instances",
    ]

    def __init__(self, provider_def: Mapping[str, Any]) -> None:
        super().__init__(provider_def)
        options = dict(provider_def.get("options") or {})
        locations = dict(options.get("locations") or {})
        observations = dict(options.get("observations") or {})
        source = options.get("sensor_position_source")
        if source is None:
            source = PostgresSensorPositions(
                dsn=str(observations["dsn"]),
                schema=str(observations["schema"]),
                tables=dict(observations["tables"]),
            )
        self.locations_catalogue = LocationsCatalogue(
            list(locations.get("features") or ()),
            source,
            maximum_locations=self.settings.locations_maximum_locations,
        )

    # -- the types the base classes already serve, re-declared to stay advertised -------

    def position(self, **kwargs: Any) -> Any:
        """Delegation, so the query type stays advertised. See the class docstring."""
        return super().position(**kwargs)

    def cube(self, **kwargs: Any) -> Any:
        """Delegation, so the query type stays advertised. See the class docstring."""
        return super().cube(**kwargs)

    def trajectory(self, **kwargs: Any) -> Any:
        """Delegation, so the query type stays advertised. See the class docstring."""
        return super().trajectory(**kwargs)

    def instances(self, **kwargs: Any) -> Any:
        """Delegation, so the query type stays advertised. See the class docstring."""
        return super().instances(**kwargs)

    # -- the four grown types ------------------------------------------------------------

    def radius(self, **kwargs: Any) -> Any:
        try:
            run = self._open(kwargs.get("instance"))
            geometry = kwargs.get("wkt")
            if geometry is None:
                raise QueryLayerError("a radius query needs a coords parameter")
            longitude, latitude = point_from_geometry(geometry)
            within_km = parse_distance_km(
                kwargs.get("within"), kwargs.get("within_units"), name="within"
            )
            return RegionQuery(run).radius(
                longitude=longitude,
                latitude=latitude,
                within_km=within_km,
                z=kwargs.get("z"),
                datetime_=kwargs.get("datetime_"),
                parameters=kwargs.get("select_properties"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error

    def area(self, **kwargs: Any) -> Any:
        try:
            run = self._open(kwargs.get("instance"))
            geometry = kwargs.get("wkt")
            if geometry is None:
                raise QueryLayerError("an area query needs a coords parameter")
            return RegionQuery(run).area(
                ring=ring_from_polygon(geometry),
                z=kwargs.get("z"),
                datetime_=kwargs.get("datetime_"),
                parameters=kwargs.get("select_properties"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error

    def corridor(self, **kwargs: Any) -> Any:
        try:
            run = self._open(kwargs.get("instance"))
            geometry = kwargs.get("wkt")
            if geometry is None:
                raise QueryLayerError("a corridor query needs a coords parameter")
            parameters = request_parameters()
            for option, reason in CORRIDOR_OPTIONS_NOT_IMPLEMENTED.items():
                if option in parameters:
                    raise QueryLayerError(
                        f"the corridor option {option} is not implemented by this "
                        f"interface. {reason} Refused rather than ignored: a silently "
                        f"dropped option returns an answer to a question nobody asked."
                    )
            width_km = parse_distance_km(
                parameters.get("corridor-width"),
                parameters.get("width-units"),
                name="corridor-width",
            )
            vertices = vertices_from_geometry(
                geometry, default_depth_metres=run.settings.default_depth_metres
            )
            return CorridorQuery(run).sample(
                vertices,
                width_km=width_km,
                parameters=kwargs.get("select_properties"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error

    def locations(self, **kwargs: Any) -> Any:
        try:
            identifier = kwargs.get("location_id")
            if identifier:
                run = self._open(kwargs.get("instance"))
                location = self.locations_catalogue.find(str(identifier))
                return location_column(
                    run,
                    location,
                    z=kwargs.get("z"),
                    datetime_=kwargs.get("datetime_"),
                    parameters=kwargs.get("select_properties"),
                )
            return self.locations_catalogue.list(
                bbox=kwargs.get("bbox"),
                datetime_=kwargs.get("datetime_"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error
