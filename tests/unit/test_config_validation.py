"""A destination is validated before any container starts, and says what is wrong.

An invalid configuration must be a startup failure with a readable message naming the file
and the key, never a runtime surprise (Constitution IV).
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import validate_config  # noqa: E402
from destination import destination_names  # noqa: E402

SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["component", "interval_ticks"],
    "properties": {
        "component": {
            "type": "object",
            "required": ["id"],
            "properties": {"id": {"type": "string"}},
        },
        "interval_ticks": {"type": "integer", "minimum": 1},
    },
}


def _destination(root: Path, name: str, document: dict) -> None:
    directory = root / "config" / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "widget.json").write_text(json.dumps(document), encoding="utf-8")
    schemas = root / "contracts" / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
    (schemas / "config.widget.schema.json").write_text(json.dumps(SCHEMA), encoding="utf-8")


def test_a_valid_destination_passes(tmp_path: Path) -> None:
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": 4})

    failures, gaps = validate_config.validate_destination("here", tmp_path)

    assert failures == []
    assert gaps == []


def test_a_wrong_typed_key_fails_and_names_the_key(tmp_path: Path) -> None:
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": "often"})

    failures, _ = validate_config.validate_destination("here", tmp_path)

    assert len(failures) == 1
    assert "interval_ticks" in failures[0]
    assert "widget.json" in failures[0]


def test_a_missing_required_key_fails_and_names_the_file(tmp_path: Path) -> None:
    _destination(tmp_path, "here", {"component": {"id": "widget"}})

    failures, _ = validate_config.validate_destination("here", tmp_path)

    assert len(failures) == 1
    assert "widget.json" in failures[0]
    assert "interval_ticks" in failures[0]


def test_a_key_the_schema_does_not_admit_fails(tmp_path: Path) -> None:
    """A typo in a key must be a startup failure, not a silently ignored default."""
    _destination(
        tmp_path,
        "here",
        {"component": {"id": "widget"}, "interval_ticks": 4, "intervel_ticks": 5},
    )

    failures, _ = validate_config.validate_destination("here", tmp_path)

    assert any("intervel_ticks" in failure for failure in failures)


def test_a_missing_schema_is_a_named_gap_and_a_failure_under_strict(tmp_path: Path) -> None:
    """Components are still arriving. A gap that is named is honest; a silent pass is not."""
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": 4})
    (tmp_path / "config" / "here" / "later.json").write_text("{}", encoding="utf-8")

    failures, gaps = validate_config.validate_destination("here", tmp_path)
    assert failures == []
    assert len(gaps) == 1 and "later.json" in gaps[0]

    strict_failures, strict_gaps = validate_config.validate_destination(
        "here", tmp_path, strict=True
    )
    assert strict_gaps == []
    assert len(strict_failures) == 1 and "later.json" in strict_failures[0]


def test_the_shipped_destinations_validate() -> None:
    for name in destination_names(REPOSITORY_ROOT):
        failures, _ = validate_config.validate_destination(name, REPOSITORY_ROOT)
        assert failures == [], f"destination {name} does not validate: {failures}"


# --- validating on an interpreter that has only part of the stack -----------------------


@contextmanager
def _without(*names: str) -> Iterator[None]:
    """Make `import <name>` raise ImportError, as it does where the package is absent.

    A `None` in `sys.modules` is the interpreter's own way of recording "this is not
    importable", and it is what makes the absence reproducible on a machine where the
    package is installed.
    """
    saved = {name: sys.modules.get(name) for name in names}
    try:
        for name in names:
            sys.modules[name] = None  # type: ignore[assignment]
        yield
    finally:
        for name, module in saved.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module


def test_validation_survives_a_jsonschema_that_predates_referencing(tmp_path: Path) -> None:
    """The combination nobody guarded: jsonschema usable, referencing absent.

    `validate_document` has always fallen back to the built-in validator when jsonschema is
    missing, because `deploy/README.md` promises a destination needs "a container runtime and
    a Python interpreter, and nothing else from this project" — no virtual environment to
    bring the stack up. But `_registry` imported `referencing` with no guard at all, and
    jsonschema below 4.18 carried its own resolver and did not depend on it. So a host could
    satisfy the guard and still fail on the line after it.

    That host is the GitHub runner. Every bring-up in the capture workflow died at the first
    step of `up.sh`, eight seconds in, and fell back to serving a bare client:

        == Checking the configuration for destination 'local'
        ModuleNotFoundError: No module named 'referencing'
        error: the destination's configuration is not valid; nothing was started
    """
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": 4})

    with _without("referencing", "referencing.jsonschema"):
        failures, gaps = validate_config.validate_destination("here", tmp_path)

    assert failures == [], (
        "a destination that validates cleanly must go on doing so where referencing is not "
        f"installed, by falling back to the built-in validator. Instead: {failures}"
    )
    assert gaps == []


def test_the_fallback_still_finds_the_fault_without_referencing(tmp_path: Path) -> None:
    """Falling back must not mean falling silent, which is the failure worth more than a crash."""
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": "often"})

    with _without("referencing", "referencing.jsonschema"):
        failures, _ = validate_config.validate_destination("here", tmp_path)

    assert len(failures) == 1
    assert "interval_ticks" in failures[0]


def test_the_tracked_destinations_validate_without_referencing() -> None:
    """The real question `up.sh` asks, against the real files, on the runner's interpreter.

    The fixture above is a schema of two keys. What the bring-up validates is fourteen
    components whose schemas `$ref` `config.common.schema.json`, which is the reason the
    registry exists at all — so this is the one that says the fallback reaches the end.
    """
    for destination in destination_names():
        with _without("referencing", "referencing.jsonschema"):
            failures, _ = validate_config.validate_destination(destination)
        assert failures == [], (
            f"{destination} does not validate where referencing is absent, so `up.sh` "
            f"refuses to start anything on such a host: {failures}"
        )


def test_the_fallback_enforces_min_items_rather_than_tolerating_it(tmp_path: Path) -> None:
    """Implementing a keyword and ignoring it look identical from the passing side.

    `minItems` was the one keyword the tracked schemas use and the fallback did not
    implement, so on a host with no jsonschema the real configuration was refused outright:

        droplet/planner.json: planner.indexing.depth_bands: schema keyword 'minItems' is
        not implemented by the fallback validator

    The cure for that refusal must not be to accept the keyword and never apply it, which
    would turn a loud stop into a quiet pass on exactly the input it was there to catch.
    """
    directory = tmp_path / "config" / "here"
    directory.mkdir(parents=True)
    (directory / "widget.json").write_text(
        json.dumps({"component": {"id": "widget"}, "bands": []}), encoding="utf-8"
    )
    schemas = tmp_path / "contracts" / "schemas"
    schemas.mkdir(parents=True)
    (schemas / "config.widget.schema.json").write_text(
        json.dumps(
            {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "type": "object",
                "required": ["component", "bands"],
                "properties": {
                    "component": {"type": "object"},
                    "bands": {"type": "array", "minItems": 2, "items": {"type": "string"}},
                },
            }
        ),
        encoding="utf-8",
    )

    with _without("referencing", "referencing.jsonschema"):
        failures, _ = validate_config.validate_destination("here", tmp_path)

    assert len(failures) == 1, f"an empty array under minItems 2 must be reported: {failures}"
    assert "bands" in failures[0]
    assert "at least 2" in failures[0]
