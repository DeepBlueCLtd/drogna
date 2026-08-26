"""Fixtures for the generator's tests. Paths are computed from this file, never literal.

The package is put on the path here rather than relied on being installed. The workspace's
root `pyproject.toml` lists the members `uv sync` installs, and adding `harness-env-generator`
to it belongs to whoever owns that file; until then this keeps the tests runnable from a
clean checkout without reaching outside this feature's directories.

Most tests run against a deliberately small grid. The properties under test — agreement
between the evaluator and the stored field, byte-identity between two runs, the shape of
the timescale field — are not properties of the grid's size, and a full domain would buy
nothing but minutes.
"""

from __future__ import annotations

import copy
import struct
from typing import Any

import pytest

# The helpers and the constants below live in `support` so that the tests can import
# them by name. `support` also puts the package's `src` on the path, so importing it
# first is what makes the import beneath it work.
from support import (
    CONFIG_DIGEST,
    CONFIG_DIR,
    REPO_ROOT,
    RUN_ID,
    SCHEMA_DIR,
    SMALL_GRID,
    build,
    manual_clock,
    read_json,
    small_config,
    write_config,
)

__all__ = [
    "CONFIG_DIGEST",
    "CONFIG_DIR",
    "REPO_ROOT",
    "RUN_ID",
    "SCHEMA_DIR",
    "SMALL_GRID",
    "build",
    "manual_clock",
    "read_json",
    "small_config",
    "write_config",
]


@pytest.fixture(scope="session")
def manifest_schema() -> dict[str, Any]:
    return read_json(SCHEMA_DIR / "manifest.schema.json")


@pytest.fixture(scope="session")
def config_schema() -> dict[str, Any]:
    return read_json(SCHEMA_DIR / "config.env_generator.schema.json")


@pytest.fixture(scope="session")
def common_config_schema() -> dict[str, Any]:
    return read_json(SCHEMA_DIR / "config.common.schema.json")


@pytest.fixture(scope="session")
def config() -> dict[str, Any]:
    return small_config()


@pytest.fixture(scope="session")
def world(config: dict[str, Any]) -> Any:
    return build(copy.deepcopy(config))


@pytest.fixture(scope="session")
def manifest(world: Any) -> dict[str, Any]:
    return world.manifest


# Reading the file back --------------------------------------------------------------
#
# A reader is written here rather than imported so that the test compares the writer
# against the published classic-NetCDF layout rather than against itself.


class NetcdfFile:
    """Dimensions, attributes and variable data, decoded from classic NetCDF bytes."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self._offset = 0
        if payload[:4] != b"CDF\x01":
            raise ValueError("not a classic NetCDF file")
        self._offset = 4
        self.numrecs = self._u32()
        self.dimensions = self._dimensions()
        self.attributes = self._attributes()
        self.variables = self._variables()

    def _u32(self) -> int:
        value = struct.unpack_from(">I", self._payload, self._offset)[0]
        self._offset += 4
        return value

    def _name(self) -> str:
        length = self._u32()
        text = self._payload[self._offset : self._offset + length].decode("utf-8")
        self._offset += length + ((4 - length % 4) % 4)
        return text

    def _dimensions(self) -> list[tuple[str, int]]:
        tag = self._u32()
        count = self._u32()
        if tag == 0:
            return []
        return [(self._name(), self._u32()) for _ in range(count)]

    def _attributes(self) -> dict[str, Any]:
        tag = self._u32()
        count = self._u32()
        if tag == 0:
            return {}
        found: dict[str, Any] = {}
        for _ in range(count):
            name = self._name()
            nc_type = self._u32()
            elements = self._u32()
            if nc_type == 2:
                found[name] = self._payload[self._offset : self._offset + elements].decode("utf-8")
                self._offset += elements + ((4 - elements % 4) % 4)
            elif nc_type == 4:
                found[name] = struct.unpack_from(">i", self._payload, self._offset)[0]
                self._offset += 4
            elif nc_type == 6:
                found[name] = struct.unpack_from(">d", self._payload, self._offset)[0]
                self._offset += 8
            else:
                raise ValueError(f"unexpected attribute type {nc_type}")
        return found

    def _variables(self) -> dict[str, dict[str, Any]]:
        tag = self._u32()
        count = self._u32()
        if tag == 0:
            return {}
        sizes = {name: size for name, size in self.dimensions}
        order = [name for name, _ in self.dimensions]
        found: dict[str, dict[str, Any]] = {}
        for _ in range(count):
            name = self._name()
            rank = self._u32()
            dimensions = tuple(order[self._u32()] for _ in range(rank))
            attributes = self._attributes()
            nc_type = self._u32()
            self._u32()  # vsize, implied by the shape and the type
            begin = self._u32()
            length = 1
            for dimension in dimensions:
                length *= sizes[dimension]
            code = {5: "f", 6: "d"}[nc_type]
            width = {5: 4, 6: 8}[nc_type]
            values = list(struct.unpack_from(f">{length}{code}", self._payload, begin))
            found[name] = {
                "dimensions": dimensions,
                "attributes": attributes,
                "values": values,
                "width": width,
            }
        return found


@pytest.fixture(scope="session")
def stored(world: Any) -> NetcdfFile:
    return NetcdfFile(world.field_payload)
