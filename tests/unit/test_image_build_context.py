"""Every path an image copies is a path its build context still contains.

A `.dockerignore` and the `COPY` lines beside it are two halves of one statement, kept in
separate files, and nothing compared them. `query-layer.Dockerfile` gained
`COPY libs/harness_core ./libs/harness_core` when the query image was first wired, while
`query-layer.Dockerfile.dockerignore` went on excluding `libs` — and its own comment went on
saying the build read `deploy/images/` and `query/` and "nothing else".

The image could not be built from that day. Nothing noticed, because nothing built it: both
destinations started the observation store alone, so no bring-up ever reached the query
layer, and this repository has no container runtime to have found it locally. It surfaced
the first time CI was asked to bring up a stack with `query` in the active profile:

    target query: failed to solve: failed to compute cache key:
    failed to calculate checksum of ref ...: "/libs/harness_core": not found

This test is the cheap half of that discovery, and it needs no daemon: it reads the `COPY`
lines out of each Dockerfile and the patterns out of the matching `.dockerignore`, and asks
whether any copied path has had its top-level directory excluded without being let back in.
It does not reimplement Docker's matching — it looks for the one contradiction that has
actually happened here, which is an exclusion nobody paired with an exception.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
IMAGES = REPO_ROOT / "deploy" / "images"

# `COPY --from=...` and `COPY --chown=...` take their source from another stage or carry a
# flag first; only a plain COPY reads from the build context.
_COPY = re.compile(r"^COPY\s+(?!--)(?P<source>\S+)", re.MULTILINE)


def _copied_paths(dockerfile: Path) -> list[str]:
    return [m.group("source") for m in _COPY.finditer(dockerfile.read_text(encoding="utf-8"))]


def _patterns(ignore: Path) -> tuple[set[str], set[str]]:
    """The exclusions and the exceptions, ignoring comments and blank lines."""
    excluded: set[str] = set()
    excepted: set[str] = set()
    for line in ignore.read_text(encoding="utf-8").splitlines():
        entry = line.strip()
        if not entry or entry.startswith("#"):
            continue
        if entry.startswith("!"):
            excepted.add(entry[1:])
        else:
            excluded.add(entry)
    return excluded, excepted


def _dockerfiles() -> list[Path]:
    found = sorted(IMAGES.glob("*.Dockerfile"))
    assert found, f"no Dockerfile under {IMAGES}; this test would pass over an empty set"
    return found


def test_no_image_copies_a_path_its_own_dockerignore_excludes() -> None:
    findings: list[str] = []
    for dockerfile in _dockerfiles():
        ignore = IMAGES / f"{dockerfile.name}.dockerignore"
        if not ignore.is_file():
            continue
        excluded, excepted = _patterns(ignore)
        for source in _copied_paths(dockerfile):
            top = source.split("/")[0]
            if top not in excluded:
                continue
            # Let back in either by its own name or by any parent between it and the top.
            parts = source.split("/")
            reinstated = any(
                "/".join(parts[: depth + 1]) in excepted for depth in range(len(parts))
            )
            if not reinstated:
                findings.append(
                    f"{dockerfile.name} copies {source!r}, and {ignore.name} excludes "
                    f"{top!r} without an exception for it. The build fails at that COPY "
                    f'with "/{source}": not found'
                )
    assert not findings, "\n".join(findings)


def test_the_query_layer_still_lets_harness_core_back_in() -> None:
    """The specific line that was missing, named so a tidy-up cannot quietly drop it."""
    ignore = IMAGES / "query-layer.Dockerfile.dockerignore"
    excluded, excepted = _patterns(ignore)
    assert "libs" in excluded, (
        "the query layer no longer excludes libs; if that is deliberate the exception below "
        "is redundant and this test should go with it"
    )
    assert "libs/harness_core" in excepted, (
        "query-layer.Dockerfile copies libs/harness_core and its dockerignore excludes libs, "
        "so the exception is what makes the image buildable at all"
    )


def test_every_copied_path_exists_in_the_tree() -> None:
    """A COPY of something that is not there fails the same way, for a different reason."""
    missing: list[str] = []
    for dockerfile in _dockerfiles():
        for source in _copied_paths(dockerfile):
            if not (REPO_ROOT / source).exists():
                missing.append(f"{dockerfile.name} copies {source!r}, which is not in the tree")
    assert not missing, "\n".join(missing)


# --- the half a COPY line cannot see ---------------------------------------------------

_ESCAPING_IMPORT = re.compile(
    r"""^\s*(?:import[^"']*from\s*|import\s*)["'](?P<target>(?:\.\./)+[^"']+)["']""",
    re.MULTILINE,
)


def test_the_client_build_context_carries_what_its_sources_import() -> None:
    """A source-level import can leave the package, and no COPY line mentions it.

    `client/src/contracts/schemas.ts` imports the boundary schemas as
    `../../../contracts/schemas/...`, because Constitution III admits one definition of a
    shape and the client reads the master rather than a copy. Nothing in
    `client.Dockerfile` names `contracts` for that to happen — the bundler resolves it — so
    the check above called the image consistent while its build could not complete:

        Could not resolve "../../../contracts/schemas/clock.schema.json"

    This walks the client's sources for imports that climb out of `client/`, resolves each
    against the repository root, and asserts the build context still contains the directory
    they land in. It is the same question as the COPY check, asked of the other half of the
    build.
    """
    client_src = REPO_ROOT / "client" / "src"
    ignore = IMAGES / "client.Dockerfile.dockerignore"
    excluded, excepted = _patterns(ignore)

    findings: list[str] = []
    for source in sorted(client_src.rglob("*.ts")) + sorted(client_src.rglob("*.tsx")):
        for match in _ESCAPING_IMPORT.finditer(source.read_text(encoding="utf-8")):
            target = (source.parent / match.group("target")).resolve()
            try:
                relative = target.relative_to(REPO_ROOT)
            except ValueError:
                continue  # resolves outside the repository; not a build-context question
            if relative.parts[0] == "client":
                continue  # still inside the package the image copies
            top = relative.parts[0]
            if top not in excluded:
                continue
            reinstated = any(
                str(Path(*relative.parts[: depth + 1])) in excepted
                for depth in range(len(relative.parts))
            )
            if not reinstated:
                findings.append(
                    f"{source.relative_to(REPO_ROOT)} imports {match.group('target')!r}, "
                    f"which lands in {relative}, and {ignore.name} excludes {top!r} with no "
                    "exception for it. The bundle cannot resolve it and the image fails to "
                    "build"
                )
    assert not findings, "\n".join(sorted(set(findings)))
