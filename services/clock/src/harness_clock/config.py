"""Loading this component's configuration, and nothing else, first.

Constitution IV: one environment variable names one file; that file is validated against
the packaged schema before any other I/O; an invalid file is a startup failure with a
readable message and a distinct exit code. The clock is the component where this matters
most, because it binds a socket every other component depends on, and a socket bound
before validation is a socket bound on a configuration nobody checked.

The validated document becomes the generated model, so the constraints the master declares
are enforced by the type rather than by whoever remembers.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from harness_core.config import LoadedConfig, Reader, load_config, load_or_exit
from harness_types.config.clock import DrognaClockConfiguration

from harness_clock.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema
from harness_clock.version import CLOCK_NAME

__all__ = ["ClockConfig", "load", "load_or_exit_with"]


@dataclass(frozen=True)
class ClockConfig:
    """The validated document and the model parsed from it."""

    loaded: LoadedConfig

    @property
    def settings(self) -> DrognaClockConfiguration:
        return DrognaClockConfiguration.model_validate(dict(self.loaded.document))

    @property
    def digest(self) -> str:
        return self.loaded.digest

    @property
    def document(self) -> Mapping[str, Any]:
        return self.loaded.document


def load(*, env: Mapping[str, str] | None = None, reader: Reader | None = None) -> ClockConfig:
    """Read and validate the configuration named by ``HARNESS_CONFIG``."""
    return ClockConfig(
        load_config(
            schema(CONFIG_SCHEMA),
            env=env,
            reader=reader,
            component=CLOCK_NAME,
            referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
        )
    )


def load_or_exit_with(
    *, env: Mapping[str, str] | None = None, reader: Reader | None = None, stderr: Any = None
) -> ClockConfig:
    """The entry-point form: one readable line to stderr, then the matching exit code."""
    return ClockConfig(
        load_or_exit(
            schema(CONFIG_SCHEMA),
            env=env,
            reader=reader,
            component=CLOCK_NAME,
            referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
            stderr=stderr,
        )
    )
