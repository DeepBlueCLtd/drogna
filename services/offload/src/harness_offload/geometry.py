"""The measurement geometry producer: the run-manifest sibling a bundle travels beside.

014 T047. The geometry — the identification radius the run is released under, the
interval in simulation seconds, and every position and simulation time a measurement was
taken at — is the ground truth the updated-region half of the leakage gate scores a
change mask against (FR-015, FR-42). C-01 writes the run's own manifest and holds no
observations, so its manifest carries no geometry and is complete without one; this
component reads the whole window's profiles before it stages anything, so it is the one
component in a position to write the block, and the ownership decision of 2026-08-27
says it does.

**The document is a sibling, never a member.** It holds every exact position a
measurement was taken at — the run-manifest master's own words: exactly what a release
must not contain — so it is staged *beside* the bundle as its own file, named by the
sidecar without membership, and the artefact the provenance scanner scores (SC-006)
never contains it. That decision is recorded in ``specs/014-offload-export/tasks.md``
beneath the proposal it settles.

**Nothing here defaults.** The block is validated through the model generated from
``contracts/schemas/run-manifest.schema.json`` before a byte is written, and an empty
measurements list is refused rather than serialised: the master's ``minItems: 1`` exists
because an empty geometry makes every comparison against it inconclusive, and the
recorded observation stream still has no writer, so the empty window is the case that
will actually occur.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import SimInstant
from harness_types.messages.run_manifest import DrognaRunManifest
from pydantic import ValidationError

from harness_offload.profiles import ProfileSet

__all__ = ["EmptyGeometryError", "measurement_geometry", "run_manifest_sibling"]

_MICROS_PER_SECOND = 1_000_000


class EmptyGeometryError(ValueError):
    """A window with no measurements has no geometry, and writing one anyway would make
    every comparison against it inconclusive — which nothing downstream would report."""


def measurement_geometry(
    window: ProfileSet,
    *,
    window_start: SimInstant,
    identification_radius_m: float,
    interval_seconds: float,
) -> dict[str, Any]:
    """The ``measurement_geometry`` block for one window, from the profiles it holds.

    ``simulation_seconds`` is counted from the window's start in whole simulation
    seconds, which is what the master declares; the window length is likewise required to
    be a whole number of seconds, because a truncated interval would leave moved cells
    unaccounted for and the mask scoring at chance for the wrong reason.
    """
    if not window.profiles:
        raise EmptyGeometryError(
            "the window holds no measurements, so there is no geometry to write; a "
            "run-manifest sibling with an empty geometry is refused rather than staged"
        )
    if not float(interval_seconds).is_integer():
        raise ValueError(
            f"the export window is {interval_seconds} simulation seconds, which is not a "
            "whole number of seconds; the geometry's interval_seconds is an integer"
        )
    return {
        "identification_radius_m": float(identification_radius_m),
        "interval_seconds": int(interval_seconds),
        "measurements": [
            {
                "longitude": profile.longitude,
                "latitude": profile.latitude,
                "simulation_seconds": (profile.when - window_start) // _MICROS_PER_SECOND,
            }
            for profile in window.profiles
        ],
    }


def run_manifest_sibling(
    run_manifest: Mapping[str, Any],
    window: ProfileSet,
    *,
    window_start: SimInstant,
    identification_radius_m: float,
    interval_seconds: float,
) -> bytes:
    """The sibling's bytes: the run manifest, plus the window's geometry, validated.

    The copy goes through :class:`DrognaRunManifest` before anything is written, like
    every other document this component writes — so a source manifest that was never a
    manifest, or a geometry the master would refuse, is refused here rather than staged.
    The rendering is fixed (sorted keys, two-space indent, one trailing newline) because
    the sibling's bytes are compared between two packaging runs, and a serialiser's
    default key order is not a promise.
    """
    document = json.loads(json.dumps(dict(run_manifest)))
    document["measurement_geometry"] = measurement_geometry(
        window,
        window_start=window_start,
        identification_radius_m=identification_radius_m,
        interval_seconds=interval_seconds,
    )
    try:
        DrognaRunManifest.model_validate(document)
    except ValidationError as error:
        raise ValueError(
            f"the run-manifest sibling does not validate against its master: {error}"
        ) from error
    return (json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode(
        "utf-8"
    )
