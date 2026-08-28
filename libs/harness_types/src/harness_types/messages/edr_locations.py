# DO NOT EDIT.
# Generated from contracts/schemas/edr-locations.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Point(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    type: Literal['Point']
    coordinates: list[float] = Field(..., max_length=2, min_length=2)


class Kind(Enum):
    feature = 'feature'
    sensor = 'sensor'


class Attributes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='One line for a person reading the list.')
    kind: Kind = Field(
        ...,
        description='feature: a seeded synthetic feature at its seeded position, from configuration. sensor: a sampling platform at the position of its latest reported observation, derived from the observation store at request time.',
    )
    as_of: str | None = Field(
        None,
        description='Sensor entries only: the phenomenon time of the observation the position comes from — simulation time, ISO-8601 UTC. The position is current as of this instant and no history is held behind it. Absent on feature entries, whose seeded position has no time.',
    )


class NamedLocation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    type: Literal['Feature']
    id: str = Field(
        ...,
        description="The identifier a locations data query names: a seeded feature's own identifier, or a Thing's.",
    )
    geometry: Point
    properties: Attributes


class DrognaEdrNamedLocations(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    type: Literal['FeatureCollection'] = Field(
        ...,
        description="GeoJSON's own name for the shape, so any GeoJSON reader can draw the list.",
    )
    features: list[NamedLocation] = Field(
        ...,
        description='The advertised locations. Bounded by the configured locations_maximum_locations: a longer list is refused with the count and the limit named, never truncated.',
    )
