"""JSON Schema to TypeScript, over the subset the masters actually use.

The TypeScript half of the generator chain (Constitution III). It is small on purpose and
it is strict on purpose: every keyword it meets is either understood, or deliberately
ignored as a validation constraint TypeScript cannot express, or a hard failure naming the
file and the pointer. An emitter that guesses is worse than no emitter, because the wrong
type compiles and nobody hears about it until the wrong field is read at run time.

Why this exists at all rather than `json-schema-to-typescript` is argued in
``contracts/openapi/generators.toml``, where a reader meets the decision beside the
version pins. The short version: the drift check must run with no network fetch and no
second toolchain, and a Node generator gives it both.

What is understood: objects with properties, required, and `additionalProperties`;
arrays; the primitive types and their nullable unions; `enum` and `const`; `$ref` within a
document and across bundle files; `allOf` as intersection; `oneOf` and `anyOf` as unions,
including the discriminated-overlay form where a base object carries `properties` and a
`oneOf` that narrows some of them.

What is ignored, because it constrains values rather than shapes and TypeScript has no
way to say it: `minimum`, `pattern`, `minLength`, `format` and their kin. The constraint
is not lost — it lives in the schema, which is what validates the message at run time.
The generated type is a compile-time claim about shape and never a substitute for that.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

# Bumped whenever the emitter's output changes shape. Pinned in the generator manifest,
# and checked against it before generation runs, so the manifest's account of what wrote
# the committed tree is checkable rather than decorative.
EMITTER_VERSION = "1.0"

# Keywords that say something about permitted values rather than about the shape. Listed
# rather than ignored silently, so that meeting a genuinely unknown keyword is an error.
VALIDATION_ONLY = frozenset(
    {
        "$comment",
        "$id",
        "$schema",
        "default",
        "deprecated",
        "description",
        "examples",
        "exclusiveMaximum",
        "exclusiveMinimum",
        "maxItems",
        "maxLength",
        "maxProperties",
        "maximum",
        "minItems",
        "minLength",
        "minProperties",
        "minimum",
        "multipleOf",
        "pattern",
        "patternProperties",
        "propertyNames",
        "readOnly",
        "title",
        "uniqueItems",
        "writeOnly",
        "format",
    }
)

SHAPE_KEYWORDS = frozenset(
    {
        "$defs",
        "$ref",
        "additionalProperties",
        "allOf",
        "anyOf",
        "const",
        "enum",
        "items",
        "oneOf",
        "properties",
        "required",
        "type",
    }
)

PRIMITIVES = {
    "string": "string",
    "number": "number",
    "integer": "number",
    "boolean": "boolean",
    "null": "null",
}


class GenerationError(Exception):
    """A construct the emitter will not guess at, named where it was met."""


@dataclass(frozen=True)
class Target:
    """Where a `$ref` points, once resolved: a type name and where it lives."""

    name: str
    module: str | None  # None when the type is declared in this same module


@dataclass
class _Module:
    """One TypeScript file under construction."""

    imports: dict[str, set[str]] = field(default_factory=dict)
    blocks: list[str] = field(default_factory=list)

    def need(self, target: Target) -> str:
        if target.module is not None:
            self.imports.setdefault(target.module, set()).add(target.name)
        return target.name


def type_name(text: str) -> str:
    """A schema title or `$defs` key as a TypeScript type name.

    ``drogna simulation time sample`` becomes ``DrognaSimulationTimeSample``, matching what
    datamodel-code-generator makes of the same title, so the two languages call one shape
    by one name.
    """
    words = [word for word in "".join(c if c.isalnum() else " " for c in text).split() if word]
    if not words:
        raise GenerationError(f"cannot make a type name from {text!r}")
    name = "".join(word[:1].upper() + word[1:] for word in words)
    if name[0].isdigit():
        raise GenerationError(f"type name may not begin with a digit: {text!r}")
    return name


def _literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value)
    raise GenerationError(f"cannot express the literal {value!r} as a TypeScript type")


def _doc(text: str | None, indent: str) -> list[str]:
    """A description as a JSDoc block, or nothing."""
    if not text:
        return []
    # `*/` inside a description would close the comment early and leave the rest as code.
    safe = text.replace("*/", "* /")
    lines = safe.split("\n")
    if len(lines) == 1 and len(lines[0]) + len(indent) <= 92:
        return [f"{indent}/** {lines[0]} */"]
    rendered = [f"{indent}/**"]
    rendered.extend(f"{indent} * {line}".rstrip() for line in lines)
    rendered.append(f"{indent} */")
    return rendered


def _property_name(name: str) -> str:
    if name.isidentifier():
        return name
    return json.dumps(name)


class Emitter:
    """Renders one bundled schema document as one TypeScript module."""

    def __init__(self, document: Mapping[str, Any], *, source: str, resolve) -> None:
        self.document = document
        self.source = source
        self.resolve = resolve  # (ref) -> Target
        self.module = _Module()

    # -- rendering ---------------------------------------------------------------

    def render(self, schema: Mapping[str, Any], pointer: str, indent: str) -> str:
        if not isinstance(schema, Mapping):
            raise GenerationError(f"{self.source}{pointer}: expected a schema object")
        unknown = set(schema) - SHAPE_KEYWORDS - VALIDATION_ONLY
        unknown = {key for key in unknown if not key.startswith("x-")}
        if unknown:
            raise GenerationError(
                f"{self.source}{pointer}: unsupported keyword(s) {sorted(unknown)}; "
                "teach the emitter what they mean rather than letting it guess"
            )

        if "$ref" in schema:
            if set(schema) - {"$ref", *VALIDATION_ONLY}:
                raise GenerationError(
                    f"{self.source}{pointer}: a $ref alongside other shape keywords; "
                    "wrap it in allOf so that what is being narrowed is explicit"
                )
            return self.module.need(self.resolve(schema["$ref"]))

        if "const" in schema:
            return _literal(schema["const"])

        if "enum" in schema:
            return " | ".join(_literal(value) for value in schema["enum"])

        if "allOf" in schema:
            parts = [
                self.render(member, f"{pointer}/allOf/{index}", indent)
                for index, member in enumerate(schema["allOf"])
            ]
            return self._intersect(parts)

        base = self._base(schema, pointer, indent)
        variants = schema.get("oneOf") or schema.get("anyOf")
        if variants is None:
            return base if base is not None else "unknown"

        keyword = "oneOf" if "oneOf" in schema else "anyOf"
        rendered = [
            self._variant(schema, member, f"{pointer}/{keyword}/{index}", indent)
            for index, member in enumerate(variants)
        ]
        union = " | ".join(rendered)
        if base is None:
            return union
        return self._intersect([base, f"({union})"])

    def _intersect(self, parts: Sequence[str]) -> str:
        useful = [part for part in parts if part != "unknown"]
        if not useful:
            return "unknown"
        if len(useful) == 1:
            return useful[0]
        return " & ".join(part if part.startswith("{") else f"({part})" for part in useful)

    def _variant(
        self,
        parent: Mapping[str, Any],
        member: Mapping[str, Any],
        pointer: str,
        indent: str,
    ) -> str:
        """One branch of a union.

        A branch that only narrows some of the parent's properties is rendered as an
        overlay object, with a property required if either the branch or the parent
        requires it — otherwise the intersection produces `T | undefined` for a field the
        parent has already declared mandatory.
        """
        if "properties" in member and "type" not in member and "$ref" not in member:
            required = set(member.get("required", [])) | set(parent.get("required", []))
            return self._object(member, pointer, indent, required=required, closed=True)
        return self.render(member, pointer, indent)

    def _base(self, schema: Mapping[str, Any], pointer: str, indent: str) -> str | None:
        types = schema.get("type")
        if types is None:
            if "properties" in schema:
                return self._object(schema, pointer, indent)
            return None
        if isinstance(types, str):
            types = [types]
        parts = []
        for name in types:
            if name == "object":
                parts.append(self._object(schema, pointer, indent))
            elif name == "array":
                parts.append(self._array(schema, pointer, indent))
            elif name in PRIMITIVES:
                parts.append(PRIMITIVES[name])
            else:
                raise GenerationError(f"{self.source}{pointer}: unknown type {name!r}")
        return " | ".join(parts)

    def _array(self, schema: Mapping[str, Any], pointer: str, indent: str) -> str:
        items = schema.get("items")
        if items is None:
            return "unknown[]"
        rendered = self.render(items, f"{pointer}/items", indent)
        if any(character in rendered for character in " |&"):
            return f"({rendered})[]"
        return f"{rendered}[]"

    def _object(
        self,
        schema: Mapping[str, Any],
        pointer: str,
        indent: str,
        *,
        required: Iterable[str] | None = None,
        closed: bool = False,
    ) -> str:
        properties = schema.get("properties")
        extra = schema.get("additionalProperties", None)
        if properties is None:
            if isinstance(extra, Mapping):
                inner = self.render(extra, f"{pointer}/additionalProperties", indent)
                return f"Record<string, {inner}>"
            if extra is False:
                return "Record<string, never>"
            return "Record<string, unknown>"

        if not closed and extra is None:
            raise GenerationError(
                f"{self.source}{pointer}: an object with properties and no "
                "additionalProperties; the convention requires it to be declared"
            )

        mandatory = set(schema.get("required", [])) if required is None else set(required)
        inner = indent + "  "
        lines = ["{"]
        for name, subschema in properties.items():
            lines.extend(_doc(subschema.get("description"), inner))
            rendered = self.render(subschema, f"{pointer}/properties/{name}", inner)
            optional = "" if name in mandatory else "?"
            lines.append(f"{inner}{_property_name(name)}{optional}: {rendered};")
        if isinstance(extra, Mapping):
            rendered = self.render(extra, f"{pointer}/additionalProperties", inner)
            lines.append(f"{inner}[key: string]: {rendered};")
        lines.append(indent + "}")
        return "\n".join(lines)

    # -- module assembly ---------------------------------------------------------

    def declaration(self, name: str, schema: Mapping[str, Any], pointer: str) -> str:
        body = self.render(schema, pointer, "")
        lines = _doc(schema.get("description"), "")
        if body.startswith("{"):
            lines.append(f"export interface {name} {body}")
        else:
            lines.append(f"export type {name} = {body};")
        return "\n".join(lines)

    def emit(self, *, banner: str) -> str:
        document = self.document
        root = type_name(document["title"])
        declarations = [(root, document, "")]
        seen = {root}
        for key, subschema in (document.get("$defs") or {}).items():
            name = type_name(key)
            if name in seen:
                raise GenerationError(
                    f"{self.source}: two definitions want the name {name!r}; "
                    "one shape, one name — rename one of them in the master"
                )
            seen.add(name)
            declarations.append((name, subschema, f"/$defs/{key}"))

        for name, schema, pointer in declarations:
            self.module.blocks.append(self.declaration(name, schema, pointer))

        parts = [banner]
        if self.module.imports:
            imports = [
                f"import type {{ {', '.join(sorted(names))} }} from {json.dumps(module)};"
                for module, names in sorted(self.module.imports.items())
            ]
            parts.append("\n".join(imports))
        parts.extend(self.module.blocks)
        return "\n\n".join(parts) + "\n"


def emit_module(
    document: Mapping[str, Any],
    *,
    source: str,
    resolve,
    banner: str,
) -> str:
    """Render one bundled schema document as one TypeScript module."""
    return Emitter(document, source=source, resolve=resolve).emit(banner=banner)
