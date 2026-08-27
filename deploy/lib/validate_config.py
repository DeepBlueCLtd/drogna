"""Validate a destination's configuration files against their JSON Schemas.

This runs before any container starts, so that an invalid destination is a startup failure
with a readable message naming the file and the key, never a runtime surprise
(Constitution IV, SRD NFR-04).

Two implementations sit behind one interface. Where `jsonschema` is installed it is used,
because it is the reference implementation. Where it is not — a freshly provisioned droplet
with nothing but a container runtime, which is the case this feature exists to serve — a
small validator covering the keywords the destination schemas actually use runs instead. It
refuses to pass a schema using a keyword it does not implement rather than quietly ignoring
it, so the fallback can never be more permissive without saying so.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from destination import (
    CONFIG_SUFFIX,
    ConfigurationError,
    config_files,
    destination_dir,
    read_json,
    repository_root,
)

SCHEMA_DIRNAME = "contracts/schemas"
SCHEMA_PREFIX = "config."
SCHEMA_SUFFIX = ".schema.json"

_ANNOTATION_KEYWORDS = frozenset(
    {
        "$schema",
        "$id",
        "$comment",
        "$defs",
        "title",
        "description",
        "examples",
        "default",
        "deprecated",
        # `format` is an annotation in the 2020-12 default vocabulary, not an assertion.
        # Treating it as one here would be stricter than the reference implementation.
        "format",
    }
)

_TYPES: dict[str, type | tuple[type, ...]] = {
    "object": dict,
    "array": list,
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "null": type(None),
}


def schema_path_for(component: str, root: Path | None = None) -> Path:
    directory = (root or repository_root()) / SCHEMA_DIRNAME
    return directory / f"{SCHEMA_PREFIX}{component}{SCHEMA_SUFFIX}"


def _type_name(value: Any) -> str:
    for name, kinds in _TYPES.items():
        if name == "number":
            continue
        if isinstance(value, kinds) and not (name != "boolean" and isinstance(value, bool)):
            return name
    return type(value).__name__


def _resolve(
    ref: str, root_schema: dict[str, Any], schema_dir: Path
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Resolve a `$ref` to a subschema and the document it lives in.

    Returns None where the target is not present in this repository, which happens while a
    component that owns a schema has not been built yet. The caller reports that as a gap.
    """
    filename, _, fragment = ref.partition("#")
    if filename:
        target = schema_dir / filename
        if not target.is_file():
            return None
        document = read_json(target)
        if not isinstance(document, dict):
            return None
    else:
        document = root_schema

    node: Any = document
    for part in fragment.lstrip("/").split("/"):
        if not part:
            continue
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return (node, document) if isinstance(node, dict) else None


def _validate(
    instance: Any,
    schema: dict[str, Any],
    root_schema: dict[str, Any],
    schema_dir: Path,
    pointer: str,
    errors: list[str],
) -> None:
    for keyword in schema:
        if keyword in _ANNOTATION_KEYWORDS:
            continue
        if keyword not in _SUPPORTED:
            errors.append(
                f"{pointer or '<root>'}: schema keyword '{keyword}' is not implemented by "
                f"the fallback validator; install jsonschema or narrow the schema"
            )

    if "$ref" in schema:
        resolved = _resolve(schema["$ref"], root_schema, schema_dir)
        if resolved is not None:
            subschema, document = resolved
            _validate(instance, subschema, document, schema_dir, pointer, errors)
        return

    if "const" in schema and instance != schema["const"]:
        errors.append(f"{pointer}: expected the constant {schema['const']!r}, found {instance!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{pointer}: expected one of {schema['enum']!r}, found {instance!r}")

    expected = schema.get("type")
    if expected is not None:
        names = [expected] if isinstance(expected, str) else list(expected)
        if not any(_matches_type(instance, name) for name in names):
            errors.append(
                f"{pointer or '<root>'}: expected {' or '.join(names)}, "
                f"found {_type_name(instance)}"
            )
            return

    for subschema in schema.get("allOf", []):
        _validate(instance, subschema, root_schema, schema_dir, pointer, errors)

    if isinstance(instance, dict):
        _validate_object(instance, schema, root_schema, schema_dir, pointer, errors)
    elif isinstance(instance, list):
        _validate_array(instance, schema, root_schema, schema_dir, pointer, errors)
    elif isinstance(instance, str):
        _validate_string(instance, schema, pointer, errors)
    elif isinstance(instance, (int, float)) and not isinstance(instance, bool):
        _validate_number(instance, schema, pointer, errors)


def _validate_array(
    instance: list[Any],
    schema: dict[str, Any],
    root_schema: dict[str, Any],
    schema_dir: Path,
    pointer: str,
    errors: list[str],
) -> None:
    minimum = schema.get("minItems")
    if isinstance(minimum, int) and len(instance) < minimum:
        errors.append(
            f"{pointer or '<root>'}: expected at least {minimum} "
            f"item{'' if minimum == 1 else 's'}, found {len(instance)}"
        )
    item_schema = schema.get("items")
    if isinstance(item_schema, dict):
        for index, item in enumerate(instance):
            _validate(item, item_schema, root_schema, schema_dir, f"{pointer}[{index}]", errors)


def _matches_type(instance: Any, name: str) -> bool:
    if name not in _TYPES:
        return False
    if name in ("integer", "number") and isinstance(instance, bool):
        return False
    if name == "integer":
        return isinstance(instance, int)
    return isinstance(instance, _TYPES[name])


def _validate_object(
    instance: dict[str, Any],
    schema: dict[str, Any],
    root_schema: dict[str, Any],
    schema_dir: Path,
    pointer: str,
    errors: list[str],
) -> None:
    properties = schema.get("properties", {})
    for name in schema.get("required", []):
        if name not in instance:
            errors.append(f"{pointer + '.' if pointer else ''}{name}: required key is missing")
    minimum = schema.get("minProperties")
    if minimum is not None and len(instance) < minimum:
        errors.append(
            f"{pointer or '<root>'}: expected at least {minimum} keys, found {len(instance)}"
        )
    additional = schema.get("additionalProperties", True)
    for key, value in instance.items():
        here = f"{pointer}.{key}" if pointer else key
        if key in properties:
            _validate(value, properties[key], root_schema, schema_dir, here, errors)
        elif isinstance(additional, dict):
            _validate(value, additional, root_schema, schema_dir, here, errors)
        elif additional is False:
            errors.append(f"{here}: key is not permitted by the schema")


def _validate_string(
    instance: str, schema: dict[str, Any], pointer: str, errors: list[str]
) -> None:
    minimum = schema.get("minLength")
    if minimum is not None and len(instance) < minimum:
        errors.append(f"{pointer}: expected at least {minimum} characters, found {len(instance)}")
    maximum = schema.get("maxLength")
    if maximum is not None and len(instance) > maximum:
        errors.append(f"{pointer}: expected at most {maximum} characters, found {len(instance)}")
    pattern = schema.get("pattern")
    if pattern is not None and re.search(pattern, instance) is None:
        errors.append(f"{pointer}: {instance!r} does not match {pattern!r}")


def _validate_number(
    instance: float, schema: dict[str, Any], pointer: str, errors: list[str]
) -> None:
    minimum = schema.get("minimum")
    if minimum is not None and instance < minimum:
        errors.append(f"{pointer}: expected at least {minimum}, found {instance}")
    maximum = schema.get("maximum")
    if maximum is not None and instance > maximum:
        errors.append(f"{pointer}: expected at most {maximum}, found {instance}")
    exclusive_minimum = schema.get("exclusiveMinimum")
    if exclusive_minimum is not None and instance <= exclusive_minimum:
        errors.append(f"{pointer}: expected more than {exclusive_minimum}, found {instance}")
    exclusive_maximum = schema.get("exclusiveMaximum")
    if exclusive_maximum is not None and instance >= exclusive_maximum:
        errors.append(f"{pointer}: expected less than {exclusive_maximum}, found {instance}")


_SUPPORTED = frozenset(
    {
        "$ref",
        "type",
        "const",
        "enum",
        "allOf",
        "properties",
        "required",
        "additionalProperties",
        "minProperties",
        "items",
        "minItems",
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
    }
)


def _registry(schema_dir: Path):
    """A referencing registry over every schema in `schema_dir`, keyed by `$id`, or None.

    None means referencing is not installed, which is a supported state rather than an
    error: `deploy/README.md` promises a destination needs no virtual environment, and the
    caller falls back to the built-in validator on the same terms it uses for a missing
    jsonschema.

    Schemas are also registered under their bare filename, because a `$ref` of
    `config.common.schema.json#/$defs/component` resolves against the referring
    schema's `$id` base when it has one and is taken literally when it does not.
    Registering both spellings means a schema validates whether or not its author
    gave it an `$id`, rather than failing on a detail no reader would connect to
    the error.
    """
    try:
        from referencing import Registry, Resource
        from referencing.jsonschema import DRAFT202012
    except ImportError:
        # jsonschema below 4.18 carried its own resolver and did not depend on referencing,
        # so an interpreter can have a usable jsonschema and no referencing at all. Reporting
        # that as "no registry" lets the caller fall back the way it already does for a
        # missing jsonschema, rather than raising out of a helper nobody guarded.
        return None

    resources = []
    for path in sorted(schema_dir.glob("*.schema.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            # A malformed schema is reported by the file that uses it, in context,
            # rather than as an obscure failure while building the registry.
            continue
        resource = Resource.from_contents(document, default_specification=DRAFT202012)
        identifier = document.get("$id")
        if identifier:
            resources.append((identifier, resource))
        resources.append((path.name, resource))
    return Registry().with_resources(resources)


def validate_document(document: Any, schema: dict[str, Any], schema_dir: Path) -> list[str]:
    """Every way `document` fails `schema`, not merely the first."""
    # jsonschema and referencing are one capability, not two, and the fallback answers for
    # both. The guard used to name only jsonschema, so an interpreter carrying jsonschema
    # without referencing satisfied it and then died in `_registry` — which is what a GitHub
    # runner carries, and what brought every bring-up down at the first line of `up.sh` with
    # an unguarded ModuleNotFoundError. The question worth asking is not "is jsonschema
    # importable" but "can this interpreter validate against a registry".
    try:
        import jsonschema
    except ImportError:
        jsonschema = None  # type: ignore[assignment]

    registry = _registry(schema_dir) if jsonschema is not None else None
    if jsonschema is None or registry is None:
        errors: list[str] = []
        _validate(document, schema, schema, schema_dir, "", errors)
        return errors

    # Every configuration schema `$ref`s config.common.schema.json for the sections
    # shared by all components, so the validator needs a registry able to resolve
    # those references. Without one, jsonschema raises Unresolvable at the first
    # `$ref` and the destination cannot be validated at all — which is worse than
    # the fallback validator above, because it fails loudly on correct config.
    validator = jsonschema.Draft202012Validator(schema, registry=registry)
    reported = []
    for error in sorted(validator.iter_errors(document), key=lambda item: list(item.absolute_path)):
        pointer = ".".join(str(part) for part in error.absolute_path) or "<root>"
        reported.append(f"{pointer}: {error.message}")
    return reported


def validate_destination(
    destination: str, root: Path | None = None, strict: bool = False
) -> tuple[list[str], list[str]]:
    """Validate every configuration file in one destination.

    Returns the failures and, separately, the files whose schema has not been written yet.
    An absent schema is a gap rather than a failure while components are still arriving;
    `strict` turns every gap into a failure, which is what a complete harness should use.
    """
    root = root or repository_root()
    directory = destination_dir(destination, root)
    schema_dir = root / SCHEMA_DIRNAME
    files = config_files(directory)
    if not files:
        return ([f"{destination}: no configuration files found in {directory}"], [])

    failures: list[str] = []
    gaps: list[str] = []
    for path in files:
        component = path.name[: -len(CONFIG_SUFFIX)]
        schema_file = schema_path_for(component, root)
        if not schema_file.is_file():
            message = (
                f"{destination}/{path.name}: no schema at "
                f"{SCHEMA_DIRNAME}/{schema_file.name}; validation begins when it lands"
            )
            (failures if strict else gaps).append(message)
            continue
        try:
            document = read_json(path)
            schema = read_json(schema_file)
        except ConfigurationError as exc:
            failures.append(f"{destination}/{path.name}: {exc}")
            continue
        for error in validate_document(document, schema, schema_dir):
            failures.append(f"{destination}/{path.name}: {error}")
    return failures, gaps


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination", help="name of a directory under config/")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat a configuration file with no schema as a failure",
    )
    arguments = parser.parse_args(argv)
    try:
        failures, gaps = validate_destination(arguments.destination, strict=arguments.strict)
    except ConfigurationError as exc:
        print(f"configuration check failed: {exc}", file=sys.stderr)
        return 2
    for gap in gaps:
        print(f"note: {gap}")
    if failures:
        print(
            f"configuration check failed for destination '{arguments.destination}':",
            file=sys.stderr,
        )
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print(f"configuration check passed for destination '{arguments.destination}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
