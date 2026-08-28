"""Render the untracked environment file that `deploy/compose.yaml` interpolates from.

The Compose file holds no hostname, port, path or limit. It holds names, and this module
turns a destination's `deployment.json` into the values behind them. Every name in
`deploy/env.template` must be given a value here, and every value here must correspond to a
name in the template: a name with no value, or a value with no name, is an error rather than
an empty string quietly reaching a container (SRD NFR-05, Constitution IV).

Secrets are the one kind of value that does not come from configuration. They are generated
by the run script, reused from an existing environment file where one exists so that a
re-run does not invalidate a store initialised with the previous value, and never written
to a tracked file (FR-016).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import compose_document
import render_credentials
from destination import (
    COMPOSE_FILENAME,
    CONFIG_DIRNAME,
    CONFIG_SUFFIX,
    ENV_FILENAME,
    ENV_TEMPLATE_FILENAME,
    ConfigurationError,
    deploy_dir,
    destination_dir,
    load_deployment,
    repository_root,
)

# Repository-internal layout. These are deliberately not destination values: a destination
# that changed them would no longer be running the same configuration, which is the whole
# point of the feature.
DOCKERFILES = {
    "HARNESS_DOCKERFILE_PYTHON": "deploy/images/python-service.Dockerfile",
    "HARNESS_DOCKERFILE_CLIENT": "deploy/images/client.Dockerfile",
    "HARNESS_DOCKERFILE_QUERY": "deploy/images/query-layer.Dockerfile",
    "HARNESS_DOCKERFILE_PROXY": "deploy/images/proxy.Dockerfile",
}

# The scheme a container uses to reach another container's listener on the internal
# network. Never TLS: termination happens at the edge, and the edge is the proxy.
INTERNAL_SCHEME = "http"

# Services whose health check asks their own HTTP listener whether it is serving.
HTTP_HEALTH_SERVICES = ("query", "proxy", "client")

# One secret per broker role, and the proxy's. The names come from
# render_credentials.SECRET_NAMES so that the roles are declared in one place: the access
# control list defines them, that module maps each to its variable, and this list is
# derived rather than retyped.
#
# The database's secrets used to head this tuple. ADR-0022 retired them: the store
# authenticates by trust for the compose network, so there is no database password to
# generate, carry or reconcile.
SECRET_NAMES = render_credentials.SECRET_NAMES

# The stub offload destination's program: the directory under `deploy/` that holds it, and
# the file inside that directory the container is told to run.
_ARCHIVE_DIRNAME = "archive"
_ARCHIVE_PROGRAM = "stub.py"

# Where the observation store's client authentication rules sit inside the stores mount.
# `deploy/compose.yaml` names the file through HARNESS_DATABASE_HBA_FILE below.
_HBA_RELATIVE = "observations/pg_hba.conf"

GENERATED_MARKER = "# Renderer appends below this line. Do not edit by hand."

_TEMPLATE_NAME = re.compile(r"^([A-Z][A-Z0-9_]*)=\s*$")
_ENV_LINE = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


def variable_suffix(service: str) -> str:
    """The environment-variable suffix for a service name."""
    return service.replace("-", "_").upper()


def config_filename(service: str) -> str:
    """The configuration file a service reads, by the same mechanical rule."""
    return service.replace("-", "_") + CONFIG_SUFFIX


def read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = _ENV_LINE.match(line)
        if match:
            values[match.group(1)] = match.group(2)
    return values


def resolve_secrets(existing: dict[str, str], supplied: dict[str, str] | None) -> dict[str, str]:
    supplied = supplied or {}
    resolved: dict[str, str] = {}
    missing: list[str] = []
    for name in SECRET_NAMES:
        value = existing.get(name) or supplied.get(name) or os.environ.get(name, "")
        if not value:
            missing.append(name)
        resolved[name] = value
    if missing:
        raise ConfigurationError(
            "no value for secret(s) "
            + ", ".join(missing)
            + "; the run script generates these into the untracked environment file, so run "
            "the stack through scripts/up.sh rather than calling the renderer directly"
        )
    return resolved


def _publish_values(deployment: dict[str, Any]) -> dict[str, str]:
    values: dict[str, str] = {}
    for service, entry in deployment["network"]["publish"].items():
        suffix = variable_suffix(service)
        values[f"HARNESS_PUBLISH_{suffix}"] = (
            f"{entry['bind']}:{entry['host_port']}:{entry['container_port']}"
        )
        values[f"HARNESS_PORT_{suffix}"] = str(entry["container_port"])
    return values


def _health_urls(deployment: dict[str, Any], config_host_dir: Path) -> dict[str, str]:
    """Where each HTTP service answers a health probe.

    The published listener is the wrong place to ask whenever a component answers it with
    anything other than 200. The proxy is the case that proves it: it is default-deny, so
    a probe against its published port is answered 401, and the container could never
    become healthy no matter how well it was working. Its configuration declares a
    separate health surface — a port and a path of its own — precisely so that the probe
    has somewhere to go that is not the boundary being guarded.

    So a component that declares ``health`` in its own configuration is probed there, and
    one that does not falls back to the published container port at the root. The rule is
    general rather than a special case for the proxy, because the next component to guard
    its published surface will need it too.
    """
    values: dict[str, str] = {}
    publish = deployment["network"]["publish"]
    for service in HTTP_HEALTH_SERVICES:
        entry = publish.get(service)
        if entry is None:
            continue
        port = entry["container_port"]
        path = "/"
        declared = _declared_health(config_host_dir, service)
        if declared is not None:
            port, path = declared
        values[f"HARNESS_HEALTH_URL_{variable_suffix(service)}"] = (
            f"{INTERNAL_SCHEME}://{service}:{port}{path}"
        )
    return values


def _declared_health(config_host_dir: Path, service: str) -> tuple[int, str] | None:
    """A component's own health port and path, if its configuration names one."""
    path = config_host_dir / f"{service}.json"
    if not path.is_file():
        return None
    document = json.loads(path.read_text(encoding="utf-8"))
    health = document.get(service, {}).get("health")
    if not isinstance(health, dict) or "port" not in health or "path" not in health:
        return None
    return int(health["port"]), str(health["path"])


def _public_url(deployment: dict[str, Any]) -> str:
    url = deployment["public_url"]
    authority = url["host"]
    default_port = {"http": 80, "https": 443}[url["scheme"]]
    if url["port"] != default_port:
        authority = f"{authority}:{url['port']}"
    return f"{url['scheme']}://{authority}{url['base_path']}"


def values_for(
    destination: str, root: Path | None = None, secrets: dict[str, str] | None = None
) -> dict[str, str]:
    """Every name the Compose file interpolates, with the value this destination gives it."""
    root = (root or repository_root()).resolve()
    deployment = load_deployment(destination, root)
    runtime = deployment["runtime"]
    paths = deployment["container_paths"]
    host_paths = deployment["host_paths"]
    resources = deployment["resources"]
    # Two directories, deliberately, and they answer different questions.
    #
    # `mounted_config_dir` is what a container reads, and it is the rendered tree: the
    # tracked files carry the role and no secret, a component needs both, and the broker
    # refuses anonymous clients (deploy/lib/render_credentials.py, ADR-0016).
    #
    # `declared_config_dir` is what this renderer reads to find each component's health
    # port and path, and it is the tracked tree. Those declarations are identical in both —
    # the render rewrites one field and nothing else — and reading them from the tracked
    # side removes an ordering hazard that would otherwise be real: on a first bring-up the
    # rendered tree does not exist yet, so every health declaration would silently come back
    # absent and every service would be waited on with the wrong check.
    mounted_config_dir = render_credentials.rendered_dir(destination, root)
    declared_config_dir = destination_dir(destination, root)

    values: dict[str, str] = {
        "HARNESS_PROJECT_NAME": deployment["project_name"],
        "COMPOSE_PROFILES": ",".join(deployment["profiles"]["active"]),
        "HARNESS_BUILD_CONTEXT": str(root),
        "HARNESS_RESTART_POLICY": runtime["restart_policy"],
        "HARNESS_LOG_DRIVER": runtime["log_driver"],
        "HARNESS_LOG_MAX_SIZE": runtime["log_max_size"],
        "HARNESS_LOG_MAX_FILES": runtime["log_max_files"],
        "HARNESS_HEALTHCHECK_INTERVAL": runtime["healthcheck"]["interval"],
        "HARNESS_HEALTHCHECK_TIMEOUT": runtime["healthcheck"]["timeout"],
        "HARNESS_HEALTHCHECK_RETRIES": str(runtime["healthcheck"]["retries"]),
        "HARNESS_HEALTHCHECK_START_PERIOD": runtime["healthcheck"]["start_period"],
        "HARNESS_LIMIT_MEMORY": resources["default"]["memory"],
        "HARNESS_LIMIT_CPUS": resources["default"]["cpus"],
        "HARNESS_APP_ROOT": paths["app_root"],
        "HARNESS_CONFIG_DIR": paths["config_dir"],
        "HARNESS_COVERAGE_ROOT": paths["coverage_root"],
        "HARNESS_ENVIRONMENT_ROOT": paths["environment_root"],
        "HARNESS_RUN_ROOT": paths["run_root"],
        "HARNESS_OFFLOAD_ROOT": paths["offload_root"],
        "HARNESS_RELEASED_ROOT": paths["released_root"],
        "HARNESS_STATIC_ROOT": paths["static_root"],
        "HARNESS_NGINX_TEMPLATE_DIR": paths["nginx_template_dir"],
        "HARNESS_BROKER_CONFIG_DIR": paths["broker_config_dir"],
        "HARNESS_BROKER_DATA_DIR": paths["broker_data_dir"],
        "HARNESS_DATABASE_DATA_DIR": paths["database_data_dir"],
        "HARNESS_CONFIG_HOST_DIR": str(mounted_config_dir),
        "HARNESS_BROKER_CONFIG_HOST_DIR": str(root / host_paths["broker_config_dir"]),
        "HARNESS_RUNTIME_HOST_DIR": str(root / host_paths["runtime_dir"]),
        # The store definitions, mounted read-only into the provisioning one-shot.
        # They are not copied into any image: a store's SQL is deploy-time input,
        # like the destination configuration beside it, and baking it into eleven
        # service images would put provisioning code in ten that never provision.
        "HARNESS_STORES_HOST_DIR": str(root / host_paths["stores_dir"]),
        "HARNESS_STORES_DIR": paths["stores_root"],
        # The stub offload destination's program, and where it is mounted and invoked.
        # Derived rather than declared, for the reason the hba file below is: one tracked
        # file at a fixed place, and a second declaration would be a second thing that
        # could disagree. `deploy/` is this deployment's own directory, so the container
        # path is composed from the app root the destination already names.
        "HARNESS_ARCHIVE_HOST_DIR": str(deploy_dir(root) / _ARCHIVE_DIRNAME),
        "HARNESS_ARCHIVE_DIR": paths["app_root"].rstrip("/") + "/" + _ARCHIVE_DIRNAME,
        "HARNESS_ARCHIVE_ENTRYPOINT": (
            paths["app_root"].rstrip("/") + "/" + _ARCHIVE_DIRNAME + "/" + _ARCHIVE_PROGRAM
        ),
        # The observation store's client authentication rules, inside the mount above.
        # Derived from the stores root rather than declared separately: it is one tracked
        # file at a fixed place within a directory the destination already names, and a
        # second declaration would be a second thing that could disagree.
        "HARNESS_DATABASE_HBA_FILE": paths["stores_root"].rstrip("/") + "/" + _HBA_RELATIVE,
        "HARNESS_PUBLIC_URL": _public_url(deployment),
        "HARNESS_DATABASE_NAME": deployment["database"]["name"],
        "HARNESS_DATABASE_USER": deployment["database"]["user"],
    }
    values.update(DOCKERFILES)
    for service, limit in resources.items():
        if service == "default":
            continue
        suffix = variable_suffix(service)
        values[f"HARNESS_LIMIT_MEMORY_{suffix}"] = limit["memory"]
        values[f"HARNESS_LIMIT_CPUS_{suffix}"] = limit["cpus"]
    values.update(_publish_values(deployment))
    values.update(_health_urls(deployment, declared_config_dir))
    values.update(resolve_secrets(read_env_file(env_path(root)), secrets))
    return values


def config_path_values(destination: str, root: Path | None = None) -> dict[str, str]:
    """One name per service, giving the container-side path of its configuration file.

    A service whose component has not been built yet has no file in the destination and so
    gets an empty value. That is a statement about what has been written, not about what is
    alive: liveness is decided by heartbeats and by nothing here (Constitution VII).
    """
    root = (root or repository_root()).resolve()
    deployment = load_deployment(destination, root)
    config_dir = deployment["container_paths"]["config_dir"].rstrip("/")
    directory = destination_dir(destination, root)
    compose = compose_document.read(deploy_dir(root) / COMPOSE_FILENAME)

    values: dict[str, str] = {}
    for service in compose_document.service_names(compose):
        filename = config_filename(service)
        present = (directory / filename).is_file()
        values[f"HARNESS_CONFIG_PATH_{variable_suffix(service)}"] = (
            f"{config_dir}/{filename}" if present else ""
        )
    return values


def env_path(root: Path | None = None) -> Path:
    return deploy_dir(root) / ENV_FILENAME


def render(
    destination: str, root: Path | None = None, secrets: dict[str, str] | None = None
) -> str:
    """The full text of the environment file for one destination."""
    root = (root or repository_root()).resolve()
    template_path = deploy_dir(root) / ENV_TEMPLATE_FILENAME
    template = template_path.read_text(encoding="utf-8")
    values = values_for(destination, root, secrets)
    generated = config_path_values(destination, root)

    lines: list[str] = []
    filled: set[str] = set()
    for line in template.splitlines():
        match = _TEMPLATE_NAME.match(line)
        if not match:
            lines.append(line)
            continue
        name = match.group(1)
        if name not in values:
            raise ConfigurationError(
                f"{ENV_TEMPLATE_FILENAME}: '{name}' has no value; either the destination "
                f"configuration is missing the key it mirrors or the name is obsolete"
            )
        lines.append(f"{name}={values[name]}")
        filled.add(name)

    unused = sorted(set(values) - filled)
    if unused:
        raise ConfigurationError(
            f"{ENV_TEMPLATE_FILENAME}: no name for value(s) "
            + ", ".join(unused)
            + "; a value the Compose file cannot reach is a key that will silently do nothing"
        )

    body = "\n".join(lines)
    if GENERATED_MARKER not in body:
        raise ConfigurationError(
            f"{ENV_TEMPLATE_FILENAME}: the generated section marker is missing"
        )
    for name in sorted(generated):
        body += f"\n{name}={generated[name]}"
    return body + "\n"


def write(
    destination: str, root: Path | None = None, secrets: dict[str, str] | None = None
) -> Path:
    root = (root or repository_root()).resolve()
    text = render(destination, root, secrets)
    path = env_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(0o600)
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination", help=f"name of a directory under {CONFIG_DIRNAME}/")
    arguments = parser.parse_args(argv)
    try:
        path = write(arguments.destination)
    except (ConfigurationError, KeyError) as exc:
        print(f"could not render the environment file: {exc}", file=sys.stderr)
        return 1
    print(str(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
