"""Loading this component's configuration, and nothing else, first.

Constitution IV in four lines: one environment variable, ``HARNESS_CONFIG``, names one
file; that file is read and validated against the packaged schema before any other I/O; an
invalid file is a startup failure with a readable message and a distinct exit code.

Two checks happen here that the schema cannot express, and both are refusals to start
rather than warnings, because both describe a system that would do the wrong thing
silently.

The first is FR-018. The staging area holds bundles of point observations, and SRD FR-42
withholds those from the released surface. A staging directory inside the released
directory would put every bundle on the public side of feature 013's proxy the moment it
was written, and nothing in this component would notice: it would carry on packaging
correctly. So the two directories are compared at startup and an overlap in either
direction stops the process.

The second is the convention version. ``version.CONVENTIONS`` is what the writer actually
emits into the ``Conventions`` attribute, and ``compliance.convention_version`` is what the
conformance check is run against. If those two ever disagreed the check would be examining
a claim the file does not make, and it would pass. They are compared once, here, so the
file, the check and the configuration cannot come to disagree quietly.
"""

from __future__ import annotations

import sys
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harness_core.config import (
    ConfigError,
    ConfigInvalidError,
    LoadedConfig,
    Reader,
    load_config,
)
from harness_types.config.offload import DrognaOffloadPackagerConfiguration

from harness_offload.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema
from harness_offload.version import CONVENTIONS, PACKAGER_NAME

__all__ = ["OffloadConfig", "load", "load_or_exit_with"]


@dataclass(frozen=True)
class OffloadConfig:
    """The validated document and the model parsed from it."""

    loaded: LoadedConfig

    @property
    def settings(self) -> DrognaOffloadPackagerConfiguration:
        return DrognaOffloadPackagerConfiguration.model_validate(dict(self.loaded.document))

    @property
    def digest(self) -> str:
        return self.loaded.digest

    @property
    def document(self) -> Mapping[str, Any]:
        return self.loaded.document


def _refuse(loaded: LoadedConfig, pointer: str, message: str) -> ConfigInvalidError:
    return ConfigInvalidError(
        f"{loaded.source}: {pointer}: {message}",
        pointer=pointer,
        schema_id=loaded.schema_id,
        source=loaded.source,
    )


def _within(inner: Path, outer: Path) -> bool:
    """Whether ``inner`` is ``outer`` or sits underneath it, textually.

    Textually, and deliberately: this runs before any other I/O, so it may not stat a
    directory, follow a symlink or ask the filesystem whether either exists. What it can
    say is that two configured paths overlap, which is the mistake that would be made in a
    configuration file rather than by the filesystem.
    """
    inner_parts = Path(inner).parts
    outer_parts = Path(outer).parts
    return inner_parts[: len(outer_parts)] == outer_parts


def _check_invariants(loaded: LoadedConfig) -> None:
    offload = loaded.document["offload"]
    staging = Path(offload["staging"]["directory"])
    released = Path(offload["release"]["directory"])
    if _within(staging, released) or _within(released, staging):
        raise _refuse(
            loaded,
            # harness:allow-literal-path a JSON pointer into the configuration, not a path
            "/offload/staging/directory",
            "the staging area overlaps the released directory "
            f"({offload['release']['directory']!r}, served at "
            f"{offload['release']['path_prefix']!r}). Bundles hold point observations, "
            "which FR-42 withholds from the released surface, so a bundle written here "
            "would be public the instant it was written",
        )
    declared = offload["compliance"]["convention_version"]
    if declared != CONVENTIONS:
        raise _refuse(
            loaded,
            # harness:allow-literal-path a JSON pointer into the configuration, not a path
            "/offload/compliance/convention_version",
            f"the conformance check is pinned to {declared!r} but the writer emits "
            f"{CONVENTIONS!r}; a check run against a version the file does not claim "
            "examines nothing",
        )


def load(*, env: Mapping[str, str] | None = None, reader: Reader | None = None) -> OffloadConfig:
    """Read and validate the configuration named by ``HARNESS_CONFIG``."""
    loaded = load_config(
        schema(CONFIG_SCHEMA),
        env=env,
        reader=reader,
        component=PACKAGER_NAME,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
    )
    _check_invariants(loaded)
    return OffloadConfig(loaded)


def load_or_exit_with(
    *, env: Mapping[str, str] | None = None, reader: Reader | None = None, stderr: Any = None
) -> OffloadConfig:
    """The entry-point form: one readable line to stderr, then the matching exit code.

    The two invariants above raise the same :class:`ConfigError` family the loader does, so
    a component started with overlapping directories dies exactly as one started with an
    unparsable file does — one line, one exit code — rather than starting and misbehaving.
    """
    try:
        return load(env=env, reader=reader)
    except ConfigError as exc:
        print(str(exc), file=stderr or sys.stderr)
        raise SystemExit(exc.exit_code) from exc
