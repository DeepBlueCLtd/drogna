"""The coverage store's names: where a run lives, and which one is current.

FR-023 and SRD FR-21. The point of a naming convention is that publishing a run makes it
servable without a collection being enumerated anywhere: the query layer resolves runs from
the layout at request time, so a run that is in the layout under the right name is a run
that is served, and one that is not is not.

The layout itself belongs to the query layer feature (C-08 / feature 008), which defines it
in ``stores/coverage/layout.md`` and validates stores against it. What is here is only what
the publisher must know in order to write into it: runs live in a directory under the store
root, each named by its own run identifier, and one pointer at the root names the current
run. Every one of those names comes from configuration.

One of those names used to arrive awkwardly. The layout gives a run's directory no prefix of
its own — the directory is the run identifier, and the identifier already begins with the
prefix its own rule states — so the store's runs subdirectory was carried in
``run_directory_prefix``, a key that meant something else and could not be empty. The master
has its own ``runs_dirname`` now, and this joins the store root to it rather than prefixing
a name with a directory and relying on the slash.

Collection identifiers are derived from the run identifier by prefix, which is what makes
them predictable to a consumer that has only the announcement.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

__all__ = ["Catalogue"]


@dataclass(frozen=True)
class Catalogue:
    """The names, and nothing else. It reads and writes only through the publisher."""

    root: Path
    runs_dirname: str
    current_pointer: str
    forecast_prefix: str
    uncertainty_prefix: str

    def runs_directory(self) -> Path:
        return self.root / self.runs_dirname

    def run_directory(self, run_id: str) -> Path:
        return self.runs_directory() / run_id

    def pointer(self) -> Path:
        return self.root / self.current_pointer

    def current_run_id(self) -> str | None:
        """Which run the pointer names, or nothing if it names none.

        The pointer is a text file holding one run identifier on one line. No file, an empty
        one, and one carrying more than one identifier all answer nothing: the last of those
        is two runs both claiming to be current, which the query layer reports rather than
        resolves, and about which the publisher has nothing truthful to say either.
        """
        try:
            raw = self.pointer().read_text(encoding="utf-8")
        except OSError:
            return None
        named = [line.strip() for line in raw.splitlines() if line.strip()]
        if len(named) != 1:
            return None
        return named[0]

    def forecast_collection(self, run_id: str) -> str:
        return f"{self.forecast_prefix}{run_id}"

    def uncertainty_collection(self, run_id: str) -> str:
        return f"{self.uncertainty_prefix}{run_id}"
