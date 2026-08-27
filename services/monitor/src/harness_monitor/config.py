"""Loading this component's configuration, and nothing else, first.

Constitution IV in four lines: one environment variable, ``HARNESS_CONFIG``, names one
file; that file is read and validated against the packaged schema before any other I/O;
an invalid file is a startup failure with a readable message and a distinct exit code.

The validated document is then parsed into the generated model, so that every constraint
the master declares — the threshold being positive, the persistence counts being at least
two — is enforced by the type rather than by whoever remembers to check. There is no
hand-written configuration class in this package (Constitution III).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from harness_core.config import LoadedConfig, Reader, load_config, load_or_exit
from harness_types.config.monitor import DrognaMonitorConfiguration

from harness_monitor.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema
from harness_monitor.version import MONITOR_NAME

__all__ = ["MonitorConfig", "load", "load_or_exit_with"]


@dataclass(frozen=True)
class MonitorConfig:
    """The validated document and the model parsed from it."""

    loaded: LoadedConfig

    @property
    def settings(self) -> DrognaMonitorConfiguration:
        return DrognaMonitorConfiguration.model_validate(dict(self.loaded.document))

    @property
    def digest(self) -> str:
        return self.loaded.digest

    @property
    def document(self) -> Mapping[str, Any]:
        return self.loaded.document


def load(*, env: Mapping[str, str] | None = None, reader: Reader | None = None) -> MonitorConfig:
    """Read and validate the configuration named by ``HARNESS_CONFIG``."""
    return MonitorConfig(
        load_config(
            schema(CONFIG_SCHEMA),
            env=env,
            reader=reader,
            component=MONITOR_NAME,
            referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
        )
    )


def load_or_exit_with(
    *, env: Mapping[str, str] | None = None, reader: Reader | None = None, stderr: Any = None
) -> MonitorConfig:
    """The entry-point form: one readable line to stderr, then the matching exit code."""
    return MonitorConfig(
        load_or_exit(
            schema(CONFIG_SCHEMA),
            env=env,
            reader=reader,
            component=MONITOR_NAME,
            referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
            stderr=stderr,
        )
    )
