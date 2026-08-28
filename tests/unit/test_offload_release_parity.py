"""The packager and the proxy declare the same identification radius. 014 T047.

Two configuration files describe one release policy from its two ends:
``offload.export.identification_radius_m`` is what the packager writes into the
measurement geometry of every run-manifest sibling — the radius the run is *scored* on —
and ``proxy.identification_radius_m`` is the radius the boundary *releases* under, which
the provenance scanner and the updated-region test read. Nothing derives one from the
other, deliberately: ``contracts/schemas/run-manifest.schema.json`` requires the radius
to travel with the geometry rather than be read from a deployment's policy later, so the
packager must hold its own value.

What follows from that is drift, and drift here is worse than quiet: a run scored on a
radius it was not released under is scored on nothing, and the updated-region gate would
keep printing verdicts nobody could rely on. This is the parity test the decision in
``specs/014-offload-export/tasks.md`` asks for, in the same shape as
``test_offload_destination_routes.py`` beside it.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

DESTINATIONS = ("local", "droplet")


def _document(destination: str, name: str) -> dict:
    path = REPOSITORY_ROOT / "config" / destination / name
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_both_ends_declare_the_same_identification_radius(destination: str) -> None:
    scored_on = _document(destination, "offload.json")["offload"]["export"][
        "identification_radius_m"
    ]
    released_under = _document(destination, "proxy.json")["proxy"]["identification_radius_m"]

    assert scored_on == released_under, (
        f"{destination}: the packager writes geometries scored on {scored_on} m and the "
        f"proxy releases under {released_under} m. A run scored on a radius it was not "
        "released under is scored on nothing"
    )
