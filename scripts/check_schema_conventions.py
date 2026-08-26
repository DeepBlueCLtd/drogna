#!/usr/bin/env python3
"""Gate: the neutral masters obey their conventions (Constitution III, NFR-02).

The generator chain will turn any valid JSON Schema into types. It will not tell you that
a schema is unfindable, or open to a typo, or that its example has stopped matching the
shape it illustrates. That is what this gate is for, and it runs before generation because
a convention broken here becomes a type nobody can find later.

What is checked, over every ``contracts/schemas/*.schema.json``:

- **Naming and identity.** The file is ``<topic-noun>.schema.json`` and its ``$id`` is
  ``https://schemas.harness.invalid/<file name>``. The domain is reserved by RFC 2606 and
  is never fetched: an identifier is a name, not an address.
- **Dialect.** JSON Schema 2020-12, which is also OpenAPI 3.1's dialect, which is what
  lets the OpenAPI document reference these files rather than transcribe them.
- **Legibility.** A title and a description on the document, because the title becomes the
  generated type's name and the description becomes its documentation in both languages.
- **Closure.** Every object that declares properties declares ``additionalProperties``.
  Left open, a typo in a key is accepted in silence, which is precisely the failure a
  schema is here to prevent.
- **Examples.** Every declared example validates against its own schema. An example that
  has drifted from its schema is worse than none: it is a lie that reads as documentation.
- **References.** Every ``$ref`` resolves to a document in this directory. Nothing here
  reaches the network, and the generator is installed without the extra that would let it.
- **Simulation time.** No ``format: date-time`` and no host-clock property names.
  Constitution I says time comes from the simulation clock; a schema that invites a
  consumer to fill a field from ``Date.now()`` has undone that before any code is written.

Violations are all reported, not just the first: a schema is usually wrong in the way its
author misunderstood the convention, which is to say several times over.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import REPO_ROOT, Finding, run_gate

GATE = "schema-conventions"

SCHEMA_DIRECTORY = Path("contracts") / "schemas"
SUFFIX = ".schema.json"
DIALECT = "https://json-schema.org/draft/2020-12/schema"
IDENTIFIER_PREFIX = "https://schemas.harness.invalid/"

NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$")

# Formats that mean "a moment on somebody's wall clock". A message carries simulation
# time, as a documented string or as a sim_time-and-tick pair, and never invites a
# consumer to reach for the host clock to fill a field (Constitution I, FR-020).
HOST_TIME_FORMATS = frozenset({"date-time", "date", "time"})
HOST_TIME_NAMES = frozenset(
    {
        "timestamp",
        "created_at",
        "updated_at",
        "received_at",
        "host_time",
        "wall_clock",
        "wallclock",
        "now",
    }
)


def _findings(path: Path, line: int, rule: str, expression: str, message: str) -> Finding:
    return Finding(path=path, line=line, rule=rule, expression=expression, message=message)


def _line_of(text: str, needle: str) -> int:
    """The line a key appears on, so a report points somewhere a person can open."""
    for number, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            return number
    return 1


def _objects(node: Any, pointer: str = "") -> Iterable[tuple[str, dict[str, Any]]]:
    if isinstance(node, dict):
        yield pointer or "/", node
        for key, value in node.items():
            yield from _objects(value, f"{pointer}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _objects(value, f"{pointer}/{index}")


def _registry(documents: dict[str, dict[str, Any]]):
    """Every master, addressable by identifier and by file name, and resolved offline."""
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT202012

    resources = []
    for name, document in documents.items():
        resource = Resource(contents=document, specification=DRAFT202012)
        resources.append((name, resource))
        identifier = document.get("$id")
        if isinstance(identifier, str):
            resources.append((identifier, resource))
    return Registry().with_resources(resources)


def _validate_examples(
    path: Path,
    text: str,
    document: dict[str, Any],
    registry: Any,
) -> Iterable[Finding]:
    examples = document.get("examples")
    if examples is None:
        return
    if not isinstance(examples, list):
        yield _findings(path, _line_of(text, '"examples"'), "example", "examples", "not a list")
        return

    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(document, registry=registry)
    for index, example in enumerate(examples):
        errors = sorted(validator.iter_errors(example), key=lambda error: list(error.path))
        for error in errors:
            location = "/".join(str(part) for part in error.path) or "the example"
            yield _findings(
                path,
                _line_of(text, '"examples"'),
                "example",
                f"examples[{index}]",
                f"{location}: {error.message}. An example that no longer validates is a "
                "lie that reads as documentation",
            )


def check(paths: Sequence[Path], root: Path) -> Iterable[Finding]:
    directories = []
    for entry in paths:
        if entry.is_dir() and entry.name == SCHEMA_DIRECTORY.name:
            directories.append(entry)
        elif entry.is_dir() and (entry / SCHEMA_DIRECTORY).is_dir():
            directories.append(entry / SCHEMA_DIRECTORY)
        elif entry.is_file():
            directories.append(entry)
    if not directories:
        directories = [root / SCHEMA_DIRECTORY]

    files: list[Path] = []
    for entry in directories:
        if entry.is_file():
            files.append(entry)
        else:
            files.extend(sorted(entry.glob("*.json")))

    documents: dict[str, dict[str, Any]] = {}
    texts: dict[Path, str] = {}
    findings: list[Finding] = []
    for path in files:
        text = path.read_text(encoding="utf-8")
        texts[path] = text
        try:
            documents[path.name] = json.loads(text)
        except json.JSONDecodeError as error:
            findings.append(_findings(path, error.lineno, "json", path.name, str(error)))

    registry = _registry(documents)

    for path in files:
        document = documents.get(path.name)
        if document is None:
            continue
        text = texts[path]
        findings.extend(_document_findings(path, text, document, documents))
        findings.extend(_validate_examples(path, text, document, registry))
    return findings


def _document_findings(
    path: Path,
    text: str,
    document: dict[str, Any],
    documents: dict[str, dict[str, Any]],
) -> Iterable[Finding]:
    name = path.name
    if not name.endswith(SUFFIX):
        yield _findings(path, 1, "naming", name, f"a master is named <topic-noun>{SUFFIX}")
        stem = name.split(".")[0]
    else:
        stem = name[: -len(SUFFIX)]
    if not NAME_PATTERN.match(stem):
        yield _findings(
            path,
            1,
            "naming",
            stem,
            "lower case, digits and separators only; the name becomes a module name in "
            "two languages",
        )

    dialect = document.get("$schema")
    if dialect != DIALECT:
        yield _findings(
            path,
            _line_of(text, "$schema"),
            "dialect",
            str(dialect),
            f"masters are authored against {DIALECT}, which is OpenAPI 3.1's dialect too",
        )

    expected = f"{IDENTIFIER_PREFIX}{name}"
    identifier = document.get("$id")
    if identifier != expected:
        yield _findings(
            path,
            _line_of(text, "$id"),
            "identifier",
            str(identifier),
            f"the identifier of this document is {expected}",
        )

    for key in ("title", "description"):
        if not str(document.get(key, "")).strip():
            yield _findings(
                path,
                1,
                "legibility",
                key,
                "the title names the generated type and the description documents it in "
                "both languages; neither is decoration",
            )

    for pointer, node in _objects(document):
        yield from _node_findings(path, text, pointer, node, documents)


def _node_findings(
    path: Path,
    text: str,
    pointer: str,
    node: dict[str, Any],
    documents: dict[str, dict[str, Any]],
) -> Iterable[Finding]:
    if "properties" in node and isinstance(node["properties"], dict):
        # A oneOf branch narrows the object it sits inside; closure is declared there.
        inside_variant = "/oneOf/" in pointer or "/anyOf/" in pointer or "/allOf/" in pointer
        if "additionalProperties" not in node and not inside_variant:
            yield _findings(
                path,
                _line_of(text, '"properties"'),
                "closure",
                pointer,
                "an object with properties and no additionalProperties; unknown keys "
                "would be accepted in silence, and a typo in a key is the failure a "
                "schema exists to catch",
            )
        elif node.get("additionalProperties") is True:
            yield _findings(
                path,
                _line_of(text, '"additionalProperties"'),
                "closure",
                pointer,
                "additionalProperties is true; declare the extra shape or forbid it",
            )
        for key in node["properties"]:
            if key.lower() in HOST_TIME_NAMES:
                yield _findings(
                    path,
                    _line_of(text, f'"{key}"'),
                    "simulation-time",
                    key,
                    "a host-clock name. Time comes from the simulation clock "
                    "(Constitution I): carry sim_time, or a sim_time and tick pair",
                )
            if key.endswith("_at") and not _is_simulation_instant(node["properties"][key]):
                yield _findings(
                    path,
                    _line_of(text, f'"{key}"'),
                    "simulation-time",
                    key,
                    "a moment that is not a simulation instant; an `_at` field carries "
                    "sim_time, so that no consumer fills it from the host clock",
                )

    declared = node.get("format")
    if isinstance(declared, str) and declared in HOST_TIME_FORMATS:
        yield _findings(
            path,
            _line_of(text, f'"{declared}"'),
            "simulation-time",
            f"format: {declared}",
            "a wall-clock format. Simulation time is a documented string, not a format "
            "that invites a consumer to reach for the host clock",
        )

    reference = node.get("$ref")
    if isinstance(reference, str):
        yield from _reference_findings(path, text, pointer, reference, documents)


def _is_simulation_instant(schema: Any) -> bool:
    if not isinstance(schema, dict):
        return False
    if "sim_time" in (schema.get("required") or []):
        return True
    return "sim" in json.dumps(schema.get("description", "")).lower()


def _reference_findings(
    path: Path,
    text: str,
    pointer: str,
    reference: str,
    documents: dict[str, dict[str, Any]],
) -> Iterable[Finding]:
    document_part, _, fragment = reference.partition("#")
    line = _line_of(text, reference)
    if document_part:
        target = document_part
        if target.startswith(IDENTIFIER_PREFIX):
            target = target[len(IDENTIFIER_PREFIX) :]
        elif "://" in target:
            yield _findings(
                path,
                line,
                "reference",
                reference,
                "a document outside the repository; generation never reaches the network",
            )
            return
        target = target.rsplit("/", 1)[-1]
        if target not in documents:
            yield _findings(
                path, line, "reference", reference, f"there is no {target} in {SCHEMA_DIRECTORY}"
            )
            return
        document = documents[target]
    else:
        document = documents[path.name]

    node: Any = document
    for token in [part for part in fragment.split("/") if part]:
        token = token.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or token not in node:
            yield _findings(path, line, "reference", reference, "does not resolve")
            return
        node = node[token]


def main(argv: Sequence[str] | None = None) -> int:
    return run_gate(GATE, check, argv, root=REPO_ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
