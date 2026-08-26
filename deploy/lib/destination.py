"""Locating and reading a destination's configuration.

Every other module in the deployment goes through here, so that the repository root is
discovered once — from this file's own position on disk — and no script anywhere carries a
path to it.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

CONFIG_DIRNAME = "config"
DEPLOY_DIRNAME = "deploy"
DEPLOYMENT_FILENAME = "deployment.json"
COMPOSE_FILENAME = "compose.yaml"
ENV_TEMPLATE_FILENAME = "env.template"
ENV_FILENAME = ".env"
SEED_STEP_DIRNAME = "seed.d"
CONFIG_SUFFIX = ".json"


class ConfigurationError(Exception):
    """A destination is missing, malformed or internally inconsistent."""


def repository_root() -> Path:
    """The repository root, derived from this file's own position, never configured."""
    return Path(__file__).resolve().parents[2]


def deploy_dir(root: Path | None = None) -> Path:
    return (root or repository_root()) / DEPLOY_DIRNAME


def destination_dir(destination: str, root: Path | None = None) -> Path:
    directory = (root or repository_root()) / CONFIG_DIRNAME / destination
    if not directory.is_dir():
        raise ConfigurationError(
            f"no such destination: {destination} "
            f"(expected a directory of configuration files at {CONFIG_DIRNAME}/{destination})"
        )
    return directory


def destination_names(root: Path | None = None) -> list[str]:
    """Every destination the repository ships, in a stable order."""
    config_dir = (root or repository_root()) / CONFIG_DIRNAME
    if not config_dir.is_dir():
        return []
    return sorted(child.name for child in config_dir.iterdir() if child.is_dir())


def config_files(directory: Path) -> list[Path]:
    """The configuration files of one destination, in a stable order."""
    return sorted(directory.glob(f"*{CONFIG_SUFFIX}"))


def read_json(path: Path) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ConfigurationError(f"{path.name}: no such file at {path}") from exc
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ConfigurationError(f"{path.name}: not valid JSON: {exc}") from exc


def load_deployment(destination: str, root: Path | None = None) -> dict[str, Any]:
    """The deployment values for one destination."""
    document = read_json(destination_dir(destination, root) / DEPLOYMENT_FILENAME)
    if not isinstance(document, dict):
        raise ConfigurationError(f"{DEPLOYMENT_FILENAME}: expected an object at the top level")
    return document


def digest_bytes(payload: bytes) -> str:
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def key_paths(document: Any, prefix: str = "") -> set[str]:
    """Every key path in a JSON document, as dotted names with `[]` for array members.

    Two files have the same shape when their key paths are equal. Values, and the length of
    an array, are deliberately not part of the shape: a destination differs from another
    only in what its values are.
    """
    paths: set[str] = set()
    if isinstance(document, dict):
        for key, value in document.items():
            here = f"{prefix}.{key}" if prefix else key
            paths.add(here)
            paths |= key_paths(value, here)
    elif isinstance(document, list):
        for item in document:
            paths |= key_paths(item, f"{prefix}[]")
    return paths
