"""The configured named locations agree with the seeded features they claim to name.

The EDR locations list advertises the seeded synthetic features from
``config/<destination>/query.json``, and the generator seeds those features from
``config/<destination>/env_generator.json``. The same positions therefore appear in two
files of one destination, which is exactly the duplication that drifts: an edit to the
eddy's seeded centre that misses the query configuration would leave the query layer
advertising a place the feature is not, with nothing failing anywhere. This test is the
enforcement the schema's description promises.

Two absences are asserted as deliberately absent, so a later reader meets the decision
rather than re-deriving it: the thermocline has no horizontal position, and the drifting
feature's position is a function of time — a static entry for either would be a claim the
generator's own configuration contradicts.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DESTINATIONS = ("local", "droplet")

# How a seeded feature's fixed horizontal position is spelt in env_generator.json,
# per feature kind. A feature with no entry here has no fixed horizontal position.
_POSITION_KEYS = {
    "eddy": ("centre_longitude", "centre_latitude"),
    "front": ("anchor_longitude", "anchor_latitude"),
}


def _load(destination: str, name: str) -> dict:
    path = REPO_ROOT / "config" / destination / name
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_every_configured_location_matches_its_seeded_feature(destination: str) -> None:
    query = _load(destination, "query.json")["query"]["locations"]["features"]
    seeded = _load(destination, "env_generator.json")["env_generator"]["features"]

    fixed = {
        entry["id"]: (entry[keys[0]], entry[keys[1]])
        for kind, keys in _POSITION_KEYS.items()
        for entry in [seeded[kind]]
    }

    assert query, f"{destination}: the locations list names no seeded feature"
    for entry in query:
        assert entry["id"] in fixed, (
            f"{destination}: {entry['id']!r} is advertised as a named location and is not "
            f"a seeded feature with a fixed horizontal position; the generator seeds "
            f"{sorted(fixed)}"
        )
        longitude, latitude = fixed[entry["id"]]
        assert (entry["longitude"], entry["latitude"]) == (longitude, latitude), (
            f"{destination}: {entry['id']} is advertised at "
            f"({entry['longitude']}, {entry['latitude']}) and seeded at "
            f"({longitude}, {latitude}); the two files of this destination have drifted"
        )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_two_absences_are_still_deliberate(destination: str) -> None:
    entries = _load(destination, "query.json")["query"]["locations"]["features"]
    query = {entry["id"] for entry in entries}
    seeded = _load(destination, "env_generator.json")["env_generator"]["features"]

    thermocline = seeded["thermocline"]["id"]
    drifter = seeded["moving"]["id"]
    assert thermocline not in query, (
        f"{destination}: {thermocline} has no horizontal position and cannot be a named "
        f"location; if that has changed, change this test with the argument"
    )
    assert drifter not in query, (
        f"{destination}: {drifter} drifts, so a static entry would advertise a place it "
        f"is not; evaluating its position at announced simulation time is a decision to "
        f"be argued when a need arises, not defaulted into"
    )
