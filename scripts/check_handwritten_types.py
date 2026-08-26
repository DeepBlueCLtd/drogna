#!/usr/bin/env python3
"""Gate: no boundary-crossing shape is declared by hand (Constitution III, FR-012).

The generator chain enforces Constitution III in one direction only — that what is
generated matches its master. It is silent in the other direction, which is the one that
actually breaks: someone writes a Pydantic model or a TypeScript interface for a message
payload beside the code that uses it, never touches `contracts/`, and the second
definition exists from that moment. Nothing regenerates it, nothing diffs it, and it
disagrees with the master the first time the master changes.

So this gate reads the masters, learns the field names of every shape they declare, and
looks for those shapes declared again outside the generated directories. A Python class
with annotated fields or a TypeScript interface counts as a declaration. A declaration
matches a master's shape when it carries every field the master requires and adds none the
master does not have — a rule chosen because it catches the copy and the near-copy while
leaving alone the internal model that happens to share a word or two.

Two things it deliberately does not do. It does not read intent: a class whose fields
match a message payload is a second definition of that payload whatever its docstring
says, and the way to say otherwise is the marker below, in writing, where a reviewer sees
it. And it does not judge shapes that predate the chain: those are listed in
:data:`AWAITING_ADOPTION`, reported on every run so they stay visible, and removed from
that list by the feature that owns them when it adopts the generated model.

A genuine internal shape is marked inline with ``harness:allow-handwritten-type
<reason>``, and appears in the exemption inventory like every other marker.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import (
    PYTHON_SUFFIXES,
    REPO_ROOT,
    TYPESCRIPT_SUFFIXES,
    Finding,
    exempted,
    iter_files,
    marker_index,
    read_text,
    run_gate,
)

GATE = "handwritten-type"

SCHEMA_DIRECTORY = Path("contracts") / "schemas"
SUFFIX = ".schema.json"

# A shape with one or two fields is a coincidence, not a copy: `{run_id, tick}` says
# nothing about which document it came from. Three is where a match starts meaning
# something.
SMALLEST_MEANINGFUL_SHAPE = 3

# Declarations that predate the generator chain, each belonging to a feature that wrote it
# before there was anything to generate from. They are named here rather than exempted
# inline because the file they live in belongs to another feature, and because a list in
# one place is the only form of this that a reviewer can read at a glance. The list may
# shrink and may not grow: a new boundary shape has the generated model to import.
AWAITING_ADOPTION: dict[str, tuple[str, ...]] = {
    # A test helper that restates the heartbeat payload field for field. It was written
    # when there was no generated type to import, and it drifts the moment the master
    # gains a field — which is the whole argument for this gate. The client feature owns
    # the file; adopting `DrognaComponentHeartbeat` from client/src/generated/messages is
    # a one-line change there and this entry goes with it.
    "client/tests/heartbeats.ts": ("HeartbeatFields",),
}

MESSAGE = (
    "declares a shape that crosses the language boundary. It is defined in "
    "{source}; import the generated model from harness_types or "
    "client/src/generated instead of writing it again"
)

TYPESCRIPT_DECLARATION = re.compile(
    r"^\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+(?P<interface>\w+)\s*\{"
    r"|type\s+(?P<alias>\w+)\s*=\s*\{)",
)
TYPESCRIPT_FIELD = re.compile(r"^\s*(?:readonly\s+)?(?P<name>[A-Za-z_$][\w$]*)\s*\??\s*:")


class Shape:
    """One shape a master declares, and everything it calls its fields.

    ``names`` is every property name anywhere inside the shape, not only the top level.
    That is what tells a copy from an adapter: a copy uses the master's vocabulary all the
    way down, while a client's internal model of the same document renames as it adapts —
    ``clientId`` for ``client_id`` — and stops matching at the first nested field.
    """

    def __init__(self, source: str, pointer: str, schema: dict[str, Any]) -> None:
        self.source = source
        self.pointer = pointer
        self.names = frozenset(_property_names(schema))
        self.required = frozenset(schema.get("required", []))

    def matches(self, fields: frozenset[str]) -> bool:
        if len(fields) < SMALLEST_MEANINGFUL_SHAPE or len(self.names) < 2:
            return False
        return self.required <= fields <= self.names

    def __str__(self) -> str:
        return f"{self.source}{self.pointer}"


def shapes(root: Path) -> list[Shape]:
    """Every shape a master gives a name to: the document root, and each `$defs` entry.

    Only named shapes, because those are the ones that cross the boundary as a unit and
    that the generators give a type name to. A subsection nested inside a configuration
    document is not a shape anybody imports; a component computing with a structure that
    happens to share its field names is doing its job, not declaring a contract, and a
    gate that cannot tell the two apart would be switched off within a week.
    """
    found: list[Shape] = []
    directory = root / SCHEMA_DIRECTORY
    if not directory.is_dir():
        return found
    for path in sorted(directory.glob("*" + SUFFIX)):
        document = json.loads(path.read_text(encoding="utf-8"))
        source = path.relative_to(root).as_posix()
        if isinstance(document.get("properties"), dict):
            found.append(Shape(source, "", document))
        for key, definition in (document.get("$defs") or {}).items():
            if isinstance(definition, dict) and isinstance(definition.get("properties"), dict):
                found.append(Shape(source, f"/$defs/{key}", definition))
    return found


def _property_names(node: Any) -> Iterable[str]:
    """Every property name inside one shape, at any depth."""
    if isinstance(node, dict):
        properties = node.get("properties")
        if isinstance(properties, dict):
            for key, value in properties.items():
                yield key
                yield from _property_names(value)
        for key, value in node.items():
            if key != "properties":
                yield from _property_names(value)
    elif isinstance(node, list):
        for value in node:
            yield from _property_names(value)


def _python_declarations(text: str) -> Iterable[tuple[int, str, frozenset[str]]]:
    """(line, name, field names) for every class with annotated fields."""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        fields = {
            statement.target.id
            for statement in node.body
            if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name)
        }
        if fields:
            # A decorated class is reported at its first decorator, so that an exemption
            # marker written above `@dataclass` — where a person would put it — covers it.
            start = min([node.lineno, *(item.lineno for item in node.decorator_list)])
            yield start, node.name, frozenset(fields)


def _typescript_declarations(text: str) -> Iterable[tuple[int, str, frozenset[str]]]:
    """(line, name, field names) for every interface or object type alias.

    Fields are collected at every depth, for the reason :class:`Shape` gives: a copy
    speaks the master's vocabulary all the way down, and an internal model that renames as
    it adapts stops matching at the first nested field. A brace count is enough to find
    them — these declarations are field lists, not expressions.
    """
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        match = TYPESCRIPT_DECLARATION.match(lines[index])
        if match is None:
            index += 1
            continue
        name = match.group("interface") or match.group("alias")
        start = index
        depth = lines[index].count("{") - lines[index].count("}")
        fields: set[str] = set()
        index += 1
        while index < len(lines) and depth > 0:
            line = lines[index]
            field = TYPESCRIPT_FIELD.match(line)
            if field is not None:
                fields.add(field.group("name"))
            depth += line.count("{") - line.count("}")
            index += 1
        if fields:
            yield start + 1, name, frozenset(fields)


def check(paths: Sequence[Path], root: Path) -> Iterable[Finding]:
    known = shapes(root)
    if not known:
        return []

    findings: list[Finding] = []
    suffixes = PYTHON_SUFFIXES + TYPESCRIPT_SUFFIXES
    for path in iter_files(paths, gate=GATE, suffixes=suffixes, root=root):
        text = read_text(path)
        markers = marker_index(path, text)
        try:
            relative = path.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            relative = path.as_posix()
        tolerated = AWAITING_ADOPTION.get(relative, ())

        if path.suffix in PYTHON_SUFFIXES:
            declarations = _python_declarations(text)
        else:
            declarations = _typescript_declarations(text)

        for line, name, fields in declarations:
            match = next((shape for shape in known if shape.matches(fields)), None)
            if match is None or name in tolerated:
                continue
            allowed, _ = exempted(markers, line, GATE)
            if allowed:
                continue
            findings.append(
                Finding(
                    path=path,
                    line=line,
                    rule="second-definition",
                    expression=name,
                    message=MESSAGE.format(source=match),
                )
            )
    return findings


def awaiting_adoption() -> str:
    lines = ["Shapes awaiting adoption of the generated model:"]
    for file, names in sorted(AWAITING_ADOPTION.items()):
        for name in names:
            lines.append(f"  {file}: {name}")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    code = run_gate(GATE, check, argv, root=REPO_ROOT)
    if AWAITING_ADOPTION:
        print(awaiting_adoption())
    return code


if __name__ == "__main__":
    raise SystemExit(main())
