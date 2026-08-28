#!/usr/bin/env python3
"""Site gate: no two decision records claim the same number, and the index says so.

    python site/gates/check_adr_numbers.py --site site/build

Two holes, both found on 28 August 2026 and both by the same afternoon's work.

**A number can be claimed twice, and nothing notices.** The number lives in a filename,
so two branches picking the next free one produce two *different* files. Git merges them
without a word — there is no textual conflict between adding `0023-a.md` and adding
`0023-b.md`. It happened twice in one afternoon: lane C took 0022 and lane D took 0023
while a third branch held each in flight, and the only reason either was noticed is that
both lanes had also added a row to `docs/adr/README.md`, in the same place, so the
*index* conflicted. Had one lane forgotten the index, or had the rows landed apart, the
duplicate would have merged in silence and the two records would have shared a number in
every reference made afterwards.

**The index is checked by nothing.** `check_adr.py` reads the built site, and the
published index is generated from the record files by `site/hooks/publish_adrs.py` — so
it compares a generated page against the files it was generated from, and they cannot
disagree. `docs/adr/README.md` is hand-written, is what a reader of the repository sees
first, and had already been found to have silently stopped at 0013. Its own closing
paragraph says what it is: "the files were always the record; this table is a claim about
them." Nothing tested the claim.

So this gate reads the directory and the index and reports four things:

- a number claimed by more than one record,
- a file under ``docs/adr/`` that is neither a record nor ``README.md``,
- a record with no row in the index,
- a row in the index naming a file that does not exist.

It deliberately does **not** require the numbers to be contiguous. There is no ADR-0017
and the index explains why; a gate that demanded an unbroken run would fail on a decision
already taken and recorded.

``--site`` is accepted because the runner passes it to every gate uniformly. Nothing here
reads the built site: the records and their index are both source, and a gate that needed
a build to check two committed files would not run in a fresh checkout.

Findings are printed one per line as ``<path>:<line>: <rule>: <message>``, and the exit
code is 0 for none, 1 for some, 2 for a run that could not happen.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

GATE = "adr-numbers"

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_CANNOT_RUN = 2

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RECORDS = "docs/adr"
INDEX_NAME = "README.md"

# `0024-the-advisory-store-is-a-third-schema.md`, as the records are actually named.
RECORD_NAME = re.compile(r"^(?P<number>\d{4})-(?P<slug>[a-z0-9-]+)\.md$")
# A row of the index: `| [0024](0024-....md) | Title | Status |`. The link target is what
# is read, because that is the half a reader clicks.
INDEX_ROW = re.compile(r"^\|\s*\[(?P<number>\d{4})\]\((?P<target>[^)]+)\)", re.MULTILINE)


class UnrunnableError(Exception):
    """The gate cannot reach a conclusion, and must say what is missing."""


def relative(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def findings(records_dir: Path) -> list[str]:
    if not records_dir.is_dir():
        raise UnrunnableError(f"no records directory at {relative(records_dir)}.")

    index_path = records_dir / INDEX_NAME
    if not index_path.is_file():
        raise UnrunnableError(
            f"no index at {relative(index_path)}; without it there is nothing to check the "
            f"records against, and an empty run is not a clean one."
        )

    out: list[str] = []

    by_number: dict[str, list[Path]] = defaultdict(list)
    for path in sorted(records_dir.iterdir()):
        if not path.is_file() or path.name == INDEX_NAME:
            continue
        match = RECORD_NAME.match(path.name)
        if match is None:
            out.append(
                f"{relative(path)}:-: {GATE}.unrecognised: is not named NNNN-slug.md, so it is "
                f"neither a record this gate can check nor the index."
            )
            continue
        by_number[match.group("number")].append(path)

    if not by_number:
        raise UnrunnableError(
            f"{relative(records_dir)} holds no record this gate recognises, so it has nothing "
            f"to check. An empty run is not a clean one."
        )

    for number, paths in sorted(by_number.items()):
        if len(paths) > 1:
            names = ", ".join(relative(p) for p in paths)
            out.append(
                f"{relative(records_dir)}:-: {GATE}.duplicate: {len(paths)} records claim "
                f"ADR-{number}: {names}. Two branches took the same next number; the files do "
                f"not conflict, so nothing else would have said so."
            )

    index_text = index_path.read_text(encoding="utf-8")
    rows: dict[str, list[str]] = defaultdict(list)
    for match in INDEX_ROW.finditer(index_text):
        rows[match.group("number")].append(match.group("target"))

    if not rows:
        raise UnrunnableError(
            f"{relative(index_path)} holds no row this gate recognises, so the index could not "
            f"be read. A table that stopped being recognised looks exactly like an empty one."
        )

    for number in sorted(by_number):
        if number not in rows:
            out.append(
                f"{relative(index_path)}:-: {GATE}.unindexed: ADR-{number} exists and the index "
                f"does not list it. The index is what a reader of the repository sees first."
            )

    for number, targets in sorted(rows.items()):
        if len(targets) > 1:
            out.append(
                f"{relative(index_path)}:-: {GATE}.repeated-row: ADR-{number} is listed "
                f"{len(targets)} times."
            )
        for target in targets:
            if not (records_dir / target).is_file():
                out.append(
                    f"{relative(index_path)}:-: {GATE}.dangling: the row for ADR-{number} names "
                    f"{target}, which does not exist."
                )

    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True, help="the built site; unused, see the docstring")
    parser.add_argument("--records", default=DEFAULT_RECORDS)
    arguments = parser.parse_args(argv)

    records = Path(arguments.records)
    if not records.is_absolute():
        records = REPO_ROOT / records

    try:
        found = findings(records)
    except UnrunnableError as error:
        print(f"{GATE}: could not run: {error}", file=sys.stderr)
        return EXIT_CANNOT_RUN

    for line in found:
        print(line)
    print(f"{GATE}: {len(found)} findings")
    return EXIT_FINDINGS if found else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
