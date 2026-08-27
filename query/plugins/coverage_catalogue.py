"""Resolving runs from the coverage store's layout, at request time, from no list anywhere.

FR-021 asks that a new model run become servable without editing collection configuration.
That is a statement about naming and cataloguing rather than about pygeoapi: if the set of
runs were written down in a configuration file, publishing would need a human in the middle
of it and the sense-decide-act-publish cycle would not close on its own.

So the run set is read from the store, every time it is asked for. A run is a directory
named for its deterministic identifier; it is catalogued when it holds a forecast field, an
uncertainty field and a manifest, and not before. The current run is named by a pointer file
holding one identifier per line: exactly one line resolves, and more than one is reported as
a conflict rather than resolved by choosing. ``stores/coverage/layout.md`` is the normative
account and this module is its only implementation — the validator under ``stores/coverage/``
calls into here rather than restating the rules where they could disagree.

Cost per request is bounded by a cache keyed on the store's own state — the set of run
directory names, the pointer's content and each manifest's size and inode — and never on an
interval measured by a host clock. A catalogue that refreshed every thirty seconds would be
reading time from the operating system to decide what to serve, which is the thing
Constitution I exists to prevent, and it would also be wrong: the store changes when the
publisher renames a directory, not when a timer expires.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from plugins.errors import CatalogueError, CoverageStoreError

__all__ = [
    "MANIFEST_REQUIRED_KEYS",
    "CatalogueEntry",
    "CoverageCatalogue",
    "StoreLayout",
    "derive_run_id",
    "validate_manifest",
]

# The coverage run manifest's required keys. A run whose manifest lacks one of these is
# incomplete, and incomplete runs are not catalogued.
#
# This list is the shape's only machine-readable statement today, and that is a gap rather
# than a design: by Constitution III it belongs in `contracts/schemas/` as
# `coverage-run-manifest.schema.json`, whence Python and TypeScript models are generated. It
# is not there because adding a master regenerates trees this feature does not own.
# `stores/coverage/run-manifest.example.json` is the worked example, and a test validates it
# against these rules so the example cannot drift from them.
MANIFEST_REQUIRED_KEYS: tuple[str, ...] = (
    "schema_version",
    "run_id",
    "root_seed",
    "run_sequence",
    "generator_version",
    "model_version",
    "sim_time",
    "valid_time",
    "ensemble",
)

_VALID_TIME_KEYS = ("begin", "end")
_ENSEMBLE_KEYS = ("members", "method")


@dataclass(frozen=True)
class StoreLayout:
    """The names the convention fixes, as values from configuration rather than constants."""

    root: Path
    runs_dirname: str
    staging_dirname: str
    current_pointer: str
    forecast_file: str
    uncertainty_file: str
    manifest_file: str
    partial_suffix: str

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> StoreLayout:
        return cls(
            root=Path(str(section["root"])),
            runs_dirname=str(section["runs_dirname"]),
            staging_dirname=str(section["staging_dirname"]),
            current_pointer=str(section["current_pointer"]),
            forecast_file=str(section["forecast_file"]),
            uncertainty_file=str(section["uncertainty_file"]),
            manifest_file=str(section["manifest_file"]),
            partial_suffix=str(section["partial_suffix"]),
        )

    @property
    def runs_directory(self) -> Path:
        return self.root / self.runs_dirname

    @property
    def staging_directory(self) -> Path:
        """Where a run is assembled before it is visible. Inside the store, deliberately.

        The publisher makes a run visible by renaming it out of here into
        :attr:`runs_directory`. A rename between two volumes is a copy and a copy is not
        indivisible, so staging is a directory of this store rather than a store of its
        own: putting it on a volume of its own would be a deployment in which nothing
        could ever be published. Nothing beneath it is catalogued or served.
        """
        return self.root / self.staging_dirname

    @property
    def pointer_path(self) -> Path:
        return self.root / self.current_pointer

    def run_directory(self, run_id: str) -> Path:
        return self.runs_directory / run_id

    def required_files(self, run_id: str) -> tuple[Path, Path, Path]:
        directory = self.run_directory(run_id)
        return (
            directory / self.forecast_file,
            directory / self.uncertainty_file,
            directory / self.manifest_file,
        )


@dataclass(frozen=True)
class CatalogueEntry:
    """One complete run: its identifier, where it is, and what its manifest says."""

    run_id: str
    directory: Path
    forecast_path: Path
    uncertainty_path: Path
    manifest_path: Path
    manifest: Mapping[str, Any]

    @property
    def valid_time(self) -> tuple[str, str]:
        """The forecast's valid-time extent, which is the default when a query names none.

        Taken from the manifest, which is data. An EDR query with no ``datetime`` must not
        be answered as "now": there is no now here, and reading one would be a host clock
        deciding what a forecast says (Constitution I).
        """
        extent = self.manifest["valid_time"]
        return str(extent["begin"]), str(extent["end"])


def derive_run_id(
    *,
    root_seed: int,
    run_sequence: int,
    rule: str,
    version: int,
    prefix: str,
) -> str:
    """The identifier of a run, from the root seed and the run sequence and nothing else.

    A pure function, so two replays of one scenario produce the same catalogue and a
    response from either can be compared with a response from the other (Constitution II,
    FR-013). No clock, no entropy, no ordering of the filesystem.

    The rule name and version are part of the input rather than of the code, so that this
    feature and the publisher agree without sharing an implementation: both compute the same
    string from the same five values, and a change to the rule changes every identifier
    visibly rather than quietly.
    """
    if run_sequence < 0:
        raise ValueError("a run sequence is not negative")
    material = f"{rule}|{version}|{root_seed}|{run_sequence}".encode()
    digest = hashlib.sha256(material).hexdigest()[:12]
    return f"{prefix}-{run_sequence:06d}-{digest}"


def validate_manifest(document: Any, *, source: str) -> Mapping[str, Any]:
    """Check a run manifest against the convention, or say exactly what is missing."""
    if not isinstance(document, Mapping):
        raise CoverageStoreError(f"{source}: a run manifest is a JSON object")
    missing = [key for key in MANIFEST_REQUIRED_KEYS if key not in document]
    if missing:
        raise CoverageStoreError(f"{source}: the run manifest has no {', '.join(missing)}")
    extent = document["valid_time"]
    if not isinstance(extent, Mapping) or any(key not in extent for key in _VALID_TIME_KEYS):
        raise CoverageStoreError(
            f"{source}: valid_time states the forecast's extent as begin and end"
        )
    if str(extent["begin"]) > str(extent["end"]):
        raise CoverageStoreError(
            f"{source}: valid_time begins at {extent['begin']} and ends at {extent['end']}, "
            f"which is backwards"
        )
    ensemble = document["ensemble"]
    if not isinstance(ensemble, Mapping) or any(key not in ensemble for key in _ENSEMBLE_KEYS):
        raise CoverageStoreError(
            f"{source}: ensemble states its members and the method that combined them"
        )
    return document


class CoverageCatalogue:
    """The run set, resolved from the store's layout whenever it is asked for."""

    def __init__(self, layout: StoreLayout) -> None:
        self._layout = layout
        self._state: tuple[Any, ...] | None = None
        self._entries: dict[str, CatalogueEntry] = {}
        self._pointer_lines: list[str] = []

    @property
    def layout(self) -> StoreLayout:
        return self._layout

    def entries(self) -> list[CatalogueEntry]:
        """Every complete run, in identifier order. Deterministic, not directory order."""
        self._refresh()
        return [self._entries[run_id] for run_id in sorted(self._entries)]

    def identifiers(self) -> list[str]:
        return sorted(self.entries_by_id())

    def entries_by_id(self) -> Mapping[str, CatalogueEntry]:
        self._refresh()
        return dict(self._entries)

    def entry(self, run_id: str) -> CatalogueEntry:
        """One run by its own identifier, superseded or not.

        A superseded run stays addressable: comparing two runs is the point of keeping them
        (FR-015). Only the *current* collection moves on.
        """
        self._refresh()
        try:
            return self._entries[run_id]
        except KeyError:
            known = ", ".join(sorted(self._entries)) or "no complete run"
            raise CatalogueError(
                f"the coverage store holds no complete run called {run_id!r}; it holds {known}"
            ) from None

    def current(self) -> CatalogueEntry:
        """The run the pointer names, or a refusal that reports the conflict."""
        self._refresh()
        pointer = self._layout.pointer_path
        if not self._pointer_lines:
            raise CatalogueError(
                f"no run is current: {pointer.name} names none. A run becomes current when "
                f"the publisher writes its identifier there, in one line, by replacing the "
                f"file in a single operation."
            )
        if len(self._pointer_lines) > 1:
            named = ", ".join(self._pointer_lines)
            raise CatalogueError(
                f"{len(self._pointer_lines)} runs claim to be current — {named}. Refusing to "
                f"resolve: serving an arbitrary one of them would be worse than serving "
                f"nothing, because nothing in the response would say which was chosen. "
                f"{pointer.name} carries exactly one identifier."
            )
        run_id = self._pointer_lines[0]
        try:
            return self._entries[run_id]
        except KeyError:
            raise CatalogueError(
                f"{pointer.name} names {run_id!r} as current, but no complete run of that "
                f"name is in the store. A run is complete when it holds "
                f"{self._layout.forecast_file}, {self._layout.uncertainty_file} and "
                f"{self._layout.manifest_file}."
            ) from None

    def is_current(self, run_id: str) -> bool:
        self._refresh()
        return self._pointer_lines == [run_id]

    def incomplete(self) -> list[tuple[str, str]]:
        """Run directories present but not catalogued, with the reason for each.

        Reported rather than hidden: an operator whose run is not being served is owed the
        reason, and "it is not in the list" is not one.
        """
        self._refresh()
        found: list[tuple[str, str]] = []
        for directory in self._run_directories():
            if directory.name in self._entries:
                continue
            found.append((directory.name, self._incompleteness(directory.name)))
        return found

    def _run_directories(self) -> list[Path]:
        runs = self._layout.runs_directory
        if not runs.is_dir():
            return []
        return sorted(
            path
            for path in runs.iterdir()
            if path.is_dir() and not path.name.endswith(self._layout.partial_suffix)
        )

    def _incompleteness(self, run_id: str) -> str:
        absent = [path.name for path in self._layout.required_files(run_id) if not path.is_file()]
        if absent:
            return f"it has no {', '.join(absent)}"
        try:
            self._read_manifest(run_id)
        except CoverageStoreError as error:
            return error.message
        return "it is complete"

    def _read_manifest(self, run_id: str) -> Mapping[str, Any]:
        path = self._layout.run_directory(run_id) / self._layout.manifest_file
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError as error:
            raise CoverageStoreError(f"{path.name}: cannot be read ({error})") from error
        try:
            document = json.loads(raw)
        except json.JSONDecodeError as error:
            raise CoverageStoreError(f"{path.name}: not valid JSON ({error})") from error
        manifest = validate_manifest(document, source=path.name)
        stated = str(manifest["run_id"])
        if stated != run_id:
            raise CoverageStoreError(
                f"{path.name}: the manifest calls this run {stated!r} and it is in a "
                f"directory called {run_id!r}; the two must agree or a run cannot be "
                f"addressed by its own identifier"
            )
        return manifest

    def _pointer_state(self) -> tuple[Any, ...]:
        try:
            stat = self._layout.pointer_path.stat()
        except OSError:
            return ()
        return (stat.st_mtime_ns, stat.st_size, stat.st_ino)

    def _store_state(self) -> tuple[Any, ...]:
        """A fingerprint of the store, from the store. Never from an elapsed interval."""
        parts: list[Any] = [self._pointer_state()]
        for directory in self._run_directories():
            entry: list[Any] = [directory.name]
            for path in self._layout.required_files(directory.name):
                try:
                    stat = path.stat()
                except OSError:
                    entry.append(None)
                else:
                    entry.append((stat.st_size, stat.st_mtime_ns, stat.st_ino))
            parts.append(tuple(entry))
        return tuple(parts)

    def _read_pointer(self) -> list[str]:
        try:
            raw = self._layout.pointer_path.read_text(encoding="utf-8")
        except OSError:
            return []
        return [line.strip() for line in raw.splitlines() if line.strip()]

    def _refresh(self) -> None:
        state = self._store_state()
        if state == self._state:
            return
        entries: dict[str, CatalogueEntry] = {}
        for directory in self._run_directories():
            run_id = directory.name
            forecast, uncertainty, manifest_path = self._layout.required_files(run_id)
            if not all(path.is_file() for path in (forecast, uncertainty, manifest_path)):
                continue
            try:
                manifest = self._read_manifest(run_id)
            except CoverageStoreError:
                continue
            entries[run_id] = CatalogueEntry(
                run_id=run_id,
                directory=directory,
                forecast_path=forecast,
                uncertainty_path=uncertainty,
                manifest_path=manifest_path,
                manifest=manifest,
            )
        self._entries = entries
        self._pointer_lines = self._read_pointer()
        self._state = state


def describe(entries: Iterable[CatalogueEntry]) -> Sequence[str]:
    """Identifiers only, for a message that has to name what is present."""
    return [entry.run_id for entry in entries]
