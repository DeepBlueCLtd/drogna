"""A recorded run, read into the shape the export writes: profiles along a sampling path.

The source is what a run left behind: its manifest, and its observations one JSON document
per line in the observation vocabulary. The packager reads both and writes nothing here.

**What a profile is.** A vertical series of measurements at one horizontal position and one
simulation instant. The observation stream carries one value per measured property per
position, so a profile is recovered by grouping on ``(sim_time, latitude, longitude)`` and
then on depth within the group. Ordering the profiles by simulation instant is what makes
them a sampling path rather than a bag of positions; where two profiles share an instant
the position breaks the tie, so the order is a function of the data and not of the order
the file happened to be written in.

**Levels are dropped, never filled.** A level is exported only where every exported
variable has a value at it. The alternative is a fill value in the middle of a profile,
which is exactly the fabrication FR-003 forbids — and a reader has no way to tell a fill
value from a measurement that happened to be that number. Dropped levels are counted and
reported rather than discarded silently, because a run in which half the levels are
incomplete is a fault in the run and not a property of the export.

**Nothing about the instrument survives this module.** An observation carries a thing, a
sensor, a datastream and a feature of interest. None of them is read into the export model,
so no later module can write one into a file by accident: what cannot be reached cannot
leak (FR-017).
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harness_core.clock import SimInstant

__all__ = [
    "EXPORTED_PROPERTIES",
    "Level",
    "Profile",
    "ProfileSet",
    "RunSource",
    "SourceError",
    "profiles_from_observations",
    "read_observations",
    "window_bounds",
    "windows_covering",
]

EXPORTED_PROPERTIES: tuple[str, ...] = ("temperature", "salinity", "pressure")
"""The three observed properties, in the order the export writes them.

Closed deliberately, and the same three the observation master admits. Sound speed is not
among them and is not exported: it is derived at the point of use from temperature,
salinity and depth by the one implementation in ``harness_core`` (ADR-0005), and a derived
value shipped beside its inputs is a second source of truth that can disagree with them.
"""


class SourceError(Exception):
    """The recorded run cannot be read, or does not hold what a bundle needs."""


@dataclass(frozen=True)
class Level:
    """One depth level of one profile: a depth and a value for each exported property."""

    depth_m: float
    values: tuple[float, ...]


@dataclass(frozen=True)
class Profile:
    """One vertical series at one position and one simulation instant."""

    when: SimInstant
    latitude: float
    longitude: float
    levels: tuple[Level, ...]

    @property
    def level_count(self) -> int:
        return len(self.levels)


@dataclass(frozen=True)
class ProfileSet:
    """Every profile a window holds, in path order, and what was left out getting here."""

    profiles: tuple[Profile, ...]
    incomplete_levels: int = 0

    @property
    def level_count(self) -> int:
        return sum(profile.level_count for profile in self.profiles)

    def within(self, start: SimInstant, end: SimInstant) -> ProfileSet:
        """The profiles whose instant lies in ``[start, end)``. The window is half-open."""
        return ProfileSet(
            tuple(profile for profile in self.profiles if start <= profile.when < end),
            self.incomplete_levels,
        )


@dataclass(frozen=True)
class RunSource:
    """Where a recorded run is, as configuration names it. This module opens nothing else."""

    directory: Path
    observations_file: str
    run_manifest_file: str

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> RunSource:
        return cls(
            directory=Path(section["directory"]),
            observations_file=str(section["observations_file"]),
            run_manifest_file=str(section["run_manifest_file"]),
        )

    @property
    def observations_path(self) -> Path:
        return self.directory / self.observations_file

    @property
    def run_manifest_path(self) -> Path:
        return self.directory / self.run_manifest_file

    def read_run_manifest(self) -> Mapping[str, Any]:
        """The run manifest, as bytes-on-disk and as a document, refusing anything else."""
        try:
            raw = self.run_manifest_path.read_bytes()
        except OSError as exc:
            raise SourceError(f"the run manifest cannot be read ({exc.strerror or exc})") from exc
        try:
            document = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SourceError(f"the run manifest is not valid JSON ({exc})") from exc
        if not isinstance(document, dict):
            raise SourceError("the run manifest must be a JSON object")
        return document

    def read_run_manifest_bytes(self) -> bytes:
        """The manifest exactly as it is on disk, because its digest is over those bytes."""
        try:
            return self.run_manifest_path.read_bytes()
        except OSError as exc:
            raise SourceError(f"the run manifest cannot be read ({exc.strerror or exc})") from exc

    def read_profiles(self) -> ProfileSet:
        return profiles_from_observations(read_observations(self.observations_path))


def read_observations(path: Path) -> Iterator[Mapping[str, Any]]:
    """Read a recorded observation stream, one JSON document per line.

    A blank line is skipped; a line that is not a JSON object is a fault in the recording
    and stops the read, because a packager that quietly dropped a malformed observation
    would produce a bundle that is short of data and says nothing about it.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SourceError(
            f"the recorded observations cannot be read ({exc.strerror or exc})"
        ) from exc
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            document = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SourceError(
                f"line {number} of the recorded observations is not JSON ({exc})"
            ) from exc
        if not isinstance(document, dict):
            raise SourceError(f"line {number} of the recorded observations is not an object")
        yield document


def _key(observation: Mapping[str, Any]) -> tuple[int, float, float]:
    try:
        location = observation["location"]
        return (
            SimInstant.from_iso(str(observation["sim_time"])).micros,
            float(location["latitude"]),
            float(location["longitude"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceError(f"an observation carries no usable position or instant ({exc})") from exc


def profiles_from_observations(observations: Iterable[Mapping[str, Any]]) -> ProfileSet:
    """Group an observation stream into profiles, ordered along the sampling path."""
    grouped: dict[tuple[int, float, float], dict[float, dict[str, float]]] = {}
    for observation in observations:
        prop = str(observation.get("observed_property", ""))
        if prop not in EXPORTED_PROPERTIES:
            raise SourceError(f"an observation reports {prop!r}, which the export does not carry")
        key = _key(observation)
        try:
            depth = float(observation["location"]["depth_m"])
            result = float(observation["result"])
        except (KeyError, TypeError, ValueError) as exc:
            raise SourceError(f"an observation carries no usable depth or result ({exc})") from exc
        grouped.setdefault(key, {}).setdefault(depth, {})[prop] = result

    profiles: list[Profile] = []
    incomplete = 0
    for (micros, latitude, longitude), by_depth in sorted(grouped.items()):
        levels: list[Level] = []
        for depth, values in sorted(by_depth.items()):
            if len(values) != len(EXPORTED_PROPERTIES):
                incomplete += 1
                continue
            levels.append(
                Level(depth, tuple(values[name] for name in EXPORTED_PROPERTIES)),
            )
        if not levels:
            continue
        profiles.append(
            Profile(
                when=SimInstant(micros),
                latitude=latitude,
                longitude=longitude,
                levels=tuple(levels),
            )
        )
    return ProfileSet(tuple(profiles), incomplete)


def window_bounds(
    epoch: SimInstant, length_seconds: float, index: int
) -> tuple[SimInstant, SimInstant]:
    """The half-open bounds of window ``index``, counted from the run's simulation epoch.

    Integer microseconds throughout, so a window boundary is exact and two packaging runs
    over one manifest divide the run at the same instants.
    """
    length_us = round(length_seconds * 1_000_000)
    if length_us <= 0:
        raise SourceError("an export window is a positive span of simulation time")
    return epoch.plus_micros(index * length_us), epoch.plus_micros((index + 1) * length_us)


def windows_covering(
    epoch: SimInstant, length_seconds: float, profiles: Sequence[Profile]
) -> tuple[int, ...]:
    """Which window indices hold at least one profile. Empty windows produce no bundle."""
    length_us = round(length_seconds * 1_000_000)
    if length_us <= 0:
        raise SourceError("an export window is a positive span of simulation time")
    indices = sorted({(profile.when - epoch) // length_us for profile in profiles})
    return tuple(index for index in indices if index >= 0)
