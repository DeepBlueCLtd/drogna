"""The startup contract: one named file, validated before anything else happens.

Every drogna component reads exactly one environment variable, ``HARNESS_CONFIG``,
naming its configuration file. It validates that file against its JSON Schema as its
first operation and refuses to start if the file is absent, unreadable, malformed or
invalid. Nothing else in a component may carry operational meaning from the
environment, and no filename, host, port or URL appears in component source
(Constitution IV, NFR-04).

The loader reads one file — the config itself — and does so through an injectable
reader, so a test can record every access and prove that no socket, database or other
file was touched before validation returned.

Exit codes are distinct so a supervisor can tell the four failures apart without
parsing text.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError, best_match
from referencing import Registry, Resource

__all__ = [
    "EXIT_CONFIG_INVALID",
    "EXIT_CONFIG_MALFORMED",
    "EXIT_CONFIG_UNREADABLE",
    "EXIT_NO_CONFIG_VARIABLE",
    "HARNESS_CONFIG_VARIABLE",
    "ConfigError",
    "ConfigInvalidError",
    "ConfigMalformedError",
    "ConfigUnreadableError",
    "LoadedConfig",
    "MissingConfigVariableError",
    "load_config",
    "load_or_exit",
    "read_json_document",
]

HARNESS_CONFIG_VARIABLE = "HARNESS_CONFIG"
"""The single environment variable a component reads. There is no second one."""

EXIT_NO_CONFIG_VARIABLE = 78
EXIT_CONFIG_UNREADABLE = 79
EXIT_CONFIG_MALFORMED = 80
EXIT_CONFIG_INVALID = 81

Reader = Callable[[str], bytes]


class ConfigError(Exception):
    """A component cannot start because its configuration is unusable."""

    exit_code = EXIT_CONFIG_INVALID


class MissingConfigVariableError(ConfigError):
    exit_code = EXIT_NO_CONFIG_VARIABLE


class ConfigUnreadableError(ConfigError):
    exit_code = EXIT_CONFIG_UNREADABLE


class ConfigMalformedError(ConfigError):
    exit_code = EXIT_CONFIG_MALFORMED


class ConfigInvalidError(ConfigError):
    """The document parsed but the schema rejected it. Carries the failing JSON pointer."""

    exit_code = EXIT_CONFIG_INVALID

    def __init__(self, message: str, *, pointer: str, schema_id: str, source: str) -> None:
        super().__init__(message)
        self.pointer = pointer
        self.schema_id = schema_id
        self.source = source


@dataclass(frozen=True)
class LoadedConfig:
    """A validated configuration document and the digest that identifies it.

    The digest, not the content, is what reaches the run manifest and the heartbeat, so
    a manifest can be published without leaking a secret the config happens to carry.
    """

    source: str
    document: Mapping[str, Any]
    digest: str
    schema_id: str

    def section(self, name: str) -> Mapping[str, Any]:
        """Return a section, or fail with the pointer a reader can act on."""
        try:
            return self.document[name]
        except KeyError:
            raise ConfigInvalidError(
                f"{self.source}: no section at /{name}",
                pointer=f"/{name}",
                schema_id=self.schema_id,
                source=self.source,
            ) from None


def _default_reader(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def read_json_document(path: str, *, reader: Reader | None = None) -> Mapping[str, Any]:
    """Read and parse a JSON document — a schema, or a manifest being replayed."""
    read = reader or _default_reader
    try:
        raw = read(path)
    except OSError as exc:
        raise ConfigUnreadableError(f"{path}: cannot be read ({exc.strerror or exc})") from exc
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConfigMalformedError(f"{path}: not valid JSON ({exc})") from exc


def _registry(referenced_schemas: Iterable[Mapping[str, Any]]) -> Registry:
    resources = []
    for document in referenced_schemas:
        identifier = document.get("$id")
        if identifier is None:
            raise ValueError("a referenced schema without an $id cannot be resolved")
        resources.append((str(identifier), Resource.from_contents(dict(document))))
    return Registry().with_resources(resources)


def _pointer(error: ValidationError) -> str:
    return "/" + "/".join(str(part) for part in error.absolute_path)


def validate_document(
    document: Mapping[str, Any],
    schema: Mapping[str, Any],
    *,
    source: str,
    referenced_schemas: Iterable[Mapping[str, Any]] = (),
) -> None:
    """Validate ``document``, raising :class:`ConfigInvalidError` naming the failing pointer."""
    schema_id = str(schema.get("$id", "<schema without $id>"))
    validator = Draft202012Validator(dict(schema), registry=_registry(referenced_schemas))
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.absolute_path))
    if not errors:
        return
    error = best_match(errors) or errors[0]
    raise ConfigInvalidError(
        f"{source}: {_pointer(error)} rejected by {schema_id}: {error.message}",
        pointer=_pointer(error),
        schema_id=schema_id,
        source=source,
    )


def load_config(
    schema: Mapping[str, Any],
    *,
    env: Mapping[str, str] | None = None,
    reader: Reader | None = None,
    component: str = "component",
    referenced_schemas: Iterable[Mapping[str, Any]] = (),
) -> LoadedConfig:
    """Load, validate and digest this component's configuration.

    In order, and nothing before: read ``HARNESS_CONFIG``; read that one file; parse it;
    validate it; digest it. Any failure raises a :class:`ConfigError` carrying the exit
    code the component should die with.
    """
    environment = os.environ if env is None else env
    path = environment.get(HARNESS_CONFIG_VARIABLE)
    if not path:
        raise MissingConfigVariableError(
            f"{component}: {HARNESS_CONFIG_VARIABLE} is not set, so there is nothing to read; "
            "every drogna component is started with exactly this one variable"
        )

    read = reader or _default_reader
    try:
        raw = read(path)
    except OSError as exc:
        raise ConfigUnreadableError(
            f"{component}: {path}: cannot be read ({exc.strerror or exc})"
        ) from exc

    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConfigMalformedError(f"{component}: {path}: not valid JSON ({exc})") from exc

    if not isinstance(document, dict):
        raise ConfigMalformedError(f"{component}: {path}: the configuration must be a JSON object")

    validate_document(document, schema, source=path, referenced_schemas=referenced_schemas)

    return LoadedConfig(
        source=path,
        document=document,
        digest=digest_of(raw),
        schema_id=str(schema.get("$id", "<schema without $id>")),
    )


def digest_of(raw: bytes) -> str:
    """The SHA-256 digest recorded in the manifest and published in the heartbeat."""
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def load_or_exit(
    schema: Mapping[str, Any],
    *,
    env: Mapping[str, str] | None = None,
    reader: Reader | None = None,
    component: str = "component",
    referenced_schemas: Iterable[Mapping[str, Any]] = (),
    stderr: Any = None,
) -> LoadedConfig:
    """The entry-point form: one readable line to stderr, then the matching exit code."""
    try:
        return load_config(
            schema,
            env=env,
            reader=reader,
            component=component,
            referenced_schemas=referenced_schemas,
        )
    except ConfigError as exc:
        print(str(exc), file=stderr or sys.stderr)
        raise SystemExit(exc.exit_code) from exc
