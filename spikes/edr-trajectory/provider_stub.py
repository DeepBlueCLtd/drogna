"""A throwaway pygeoapi EDR provider that answers a trajectory query per vertex.

SPIKE CODE. Throwaway. It hardcodes its results path and skips drogna's
single-environment-variable config contract (Constitution IV), as argued in
`specs/002-edr-trajectory-spike/plan.md` Complexity Tracking. Nothing here is imported
by drogna and nothing here is promoted into it: the real provider is written fresh by
the query-layer feature, behind the coverage output port (SRD FR-50).

What it exists to establish
---------------------------
1. That pygeoapi hands a provider the parsed `coords` geometry untouched, M ordinate
   included. Every call records the hand-off to `results/handoff-*.json` before it
   computes anything, so the claim rests on observation.
2. That evaluating the coverage at each vertex's *own* arrival time is possible at this
   seam, and produces CoverageJSON of the Trajectory domain type (SRD FR-20, FR-19).

Two things a reader of this file should carry to the build
----------------------------------------------------------
* `BaseEDRProvider.__init_subclass__` builds `query_types` from `cls.__dict__` alone —
  the subclass's *own* methods, not inherited ones. A plugin that subclasses
  `XarrayEDRProvider` and adds only `trajectory` therefore advertises only
  `trajectory`, silently dropping `position` and `cube` from the collection's data
  queries. That is why `position` and `cube` are redeclared below as one-line
  delegations. It is a trap, and it fails quietly.
* Registration is by method name. There is no decorator to apply in this version of
  pygeoapi; defining a method called `trajectory` is the whole of it.

Vertical convention: WKT Z is elevation, positive up; the coverage's axis is depth,
positive down. This provider applies `depth = -z`. The real one must decide the same
question deliberately and test both directions of travel.
"""

from __future__ import annotations

import hashlib
import json
import logging
import pathlib

import numpy as np
import shapely
import xarray as xr
from pygeoapi.provider.base import ProviderQueryError
from pygeoapi.provider.xarray_edr import XarrayEDRProvider
from version_probe import read_m, read_z

LOGGER = logging.getLogger(__name__)

RESULTS_DIR = pathlib.Path(__file__).resolve().parent / "results"

# Seconds since the Unix epoch is the encoding this spike uses for the M ordinate.
EPOCH = np.datetime64("1970-01-01T00:00:00", "ns")


def _iso(value) -> str:
    text = str(np.datetime64(value, "s"))
    return text + "Z"


def _jsonable(value):
    """Make an arbitrary kwarg printable, so the hand-off record loses nothing."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, shapely.geometry.base.BaseGeometry):
        return {"__geometry__": value.wkt}
    return {"__repr__": repr(value), "__type__": type(value).__name__}


class SpikeTrajectoryEDRProvider(XarrayEDRProvider):
    """Records what it is handed, then answers a trajectory query vertex by vertex."""

    def __init__(self, provider_def):
        super().__init__(provider_def)
        # 'linear' or 'nearest' on the time axis, so the interpolate-or-snap question
        # can be answered by running the same route twice.
        options = provider_def.get("options") or {}
        self.time_method = options.get("time_method", "linear")
        # 'null' returns nothing outside the coverage's domain; 'extrapolate' returns a
        # number. Both are one word apart in the code and indistinguishable from
        # outside, which is the point: AT-01's reported error depends on the choice, so
        # the real provider must make it deliberately and say which it made.
        self.out_of_domain = options.get("out_of_domain", "null")
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Redeclared so that __init_subclass__ still advertises them. See the module
    # docstring: query types come from cls.__dict__, not from the MRO.
    def position(self, **kwargs):
        return super().position(**kwargs)

    def cube(self, **kwargs):
        return super().cube(**kwargs)

    def trajectory(self, **kwargs):
        """Sample the coverage at each vertex's own (t, x, y, z)."""
        geometry = kwargs.get("wkt")
        handoff = self._record_handoff(geometry, kwargs)

        if geometry is None or geometry.geom_type != "LineString":
            message = (
                "trajectory requires a LINESTRING coords parameter; received "
                f"{None if geometry is None else geometry.geom_type}"
            )
            # pygeoapi returns the class default message unless user_msg is given:
            # GenericError.message is `self.user_msg if self.user_msg else
            # self.default_msg`. A diagnostic passed positionally never reaches the
            # client.
            raise ProviderQueryError(message, user_msg=message)

        m_values = read_m(geometry)
        if any(value is None for value in m_values):
            # The failure SRD FR-51's version pin exists to prevent. Raise rather than
            # return values for an arbitrary time: a structurally valid response
            # carrying wrong times is the outcome the whole spike is designed to catch.
            message = (
                "no per-vertex M ordinate reached the provider (shapely "
                f"{shapely.__version__} on GEOS "
                f"{'.'.join(str(part) for part in shapely.geos_version)}). "
                "Per-vertex arrival times are unavailable; refusing to answer at a "
                "single time. See SRD FR-51."
            )
            raise ProviderQueryError(message, user_msg=message)

        elevations = read_z(geometry)
        longitudes = np.array([vertex[0] for vertex in geometry.coords], dtype=float)
        latitudes = np.array([vertex[1] for vertex in geometry.coords], dtype=float)
        depths = np.array(
            [0.0 if value is None else -float(value) for value in elevations],
            dtype=float,
        )
        times = EPOCH + (np.array(m_values, dtype=float) * 1e9).astype("timedelta64[ns]")

        select_properties = kwargs.get("select_properties") or []
        fields = {
            name: definition
            for name, definition in self.fields.items()
            if not select_properties or name in select_properties
        }
        if not fields:
            raise ProviderQueryError("no parameters selected", user_msg="no parameters selected")

        index = xr.DataArray(np.arange(len(longitudes)), dims="vertex")
        indexers = {
            self.x_field: xr.DataArray(longitudes, dims="vertex", coords={"vertex": index}),
            self.y_field: xr.DataArray(latitudes, dims="vertex", coords={"vertex": index}),
            "time": xr.DataArray(times, dims="vertex", coords={"vertex": index}),
        }
        if self.z_field is not None:
            indexers[self.z_field] = xr.DataArray(depths, dims="vertex", coords={"vertex": index})

        interp_kwargs = {"fill_value": None} if self.out_of_domain == "extrapolate" else {}
        sampled = self._data[list(fields)].interp(
            **indexers, method=self.time_method, kwargs=interp_kwargs
        )

        ranges = {}
        for name in fields:
            values = np.asarray(sampled[name].values, dtype=float)
            ranges[name] = {
                "type": "NdArray",
                "dataType": "float",
                "axisNames": ["composite"],
                "shape": [len(values)],
                # CoverageJSON has no NaN; a vertex outside the domain is null.
                "values": [None if value != value else float(value) for value in values],
            }

        composite = [
            [_iso(times[i]), float(longitudes[i]), float(latitudes[i]), float(depths[i])]
            for i in range(len(longitudes))
        ]

        coverage = {
            "type": "Coverage",
            "domain": {
                "type": "Domain",
                "domainType": "Trajectory",
                "axes": {
                    "composite": {
                        "dataType": "tuple",
                        "coordinates": ["t", "x", "y", "z"],
                        "values": composite,
                    }
                },
                "referencing": [
                    {
                        "coordinates": ["x", "y"],
                        "system": {
                            "type": "GeographicCRS",
                            "id": "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
                        },
                    },
                    {
                        "coordinates": ["z"],
                        "system": {
                            "type": "VerticalCRS",
                            "cs": {
                                "csAxes": [
                                    {
                                        "name": {"en": "Depth"},
                                        "direction": "down",
                                        "unit": {"symbol": "m"},
                                    }
                                ]
                            },
                        },
                    },
                    {
                        "coordinates": ["t"],
                        "system": {"type": "TemporalRS", "calendar": "Gregorian"},
                    },
                ],
            },
            "parameters": self.get_parameters(list(fields)),
            "ranges": ranges,
            "drogna:spike": {
                "note": (
                    "SYNTHETIC. Throwaway spike provider, values from an analytic "
                    "formula. Not a forecast."
                ),
                "time_method": self.time_method,
                "out_of_domain": self.out_of_domain,
                "handoff_record": handoff.name,
            },
        }
        return coverage

    def _record_handoff(self, geometry, kwargs) -> pathlib.Path:
        """Write down exactly what pygeoapi handed over, before computing anything."""
        record = {
            "shapely_version": shapely.__version__,
            "geos_version": ".".join(str(part) for part in shapely.geos_version),
            "provider_class": f"{type(self).__module__}.{type(self).__name__}",
            "query_types_advertised": self.get_query_types(),
            "x_field": self.x_field,
            "y_field": self.y_field,
            "z_field": self.z_field,
            "time_field": self.time_field,
            "time_method": self.time_method,
            "out_of_domain": self.out_of_domain,
            "kwargs": {key: _jsonable(value) for key, value in kwargs.items()},
        }
        if geometry is not None:
            record["geometry"] = {
                "geom_type": geometry.geom_type,
                "wkt_as_received": geometry.wkt,
                "coords_tuples": [list(vertex) for vertex in geometry.coords],
                "m_recovered": read_m(geometry),
                "z_recovered": read_z(geometry),
                "vertex_count": len(geometry.coords),
            }
        else:
            record["geometry"] = None

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        # Deterministic, collision-free without a clock: one file per query type per
        # vertex count, overwritten on repeat.
        vertices = 0 if geometry is None else len(geometry.coords)
        suffix = "" if self.out_of_domain == "null" else f"-{self.out_of_domain}"
        # Deterministic, collision-free, and no clock: the digest is of the geometry as
        # received, so two different routes of the same length do not overwrite each
        # other and re-running the same route rewrites the same file.
        digest = hashlib.sha256(("" if geometry is None else geometry.wkt).encode()).hexdigest()[:8]
        path = RESULTS_DIR / (
            f"handoff-{kwargs.get('query_type', 'unknown')}-{vertices}v{suffix}-{digest}.json"
        )
        path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
        LOGGER.debug(f"recorded provider hand-off to {path}")
        return path
