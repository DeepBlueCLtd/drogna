"""Turning the destination configuration into the file pygeoapi actually reads.

``query/`` holds a template and two plugins. It holds no host, no port and no path, because
a pygeoapi configuration is conventionally written full of them and this is the component
where Constitution IV is most easily lost. Every value in the rendered document comes from
``config/<destination>/query.json``, and a placeholder the configuration has no value for is
a startup failure naming the key rather than an empty string that fails later somewhere less
informative.

The rendering is deliberately dull: ``string.Template`` over the text, with structured values
emitted as JSON. JSON is valid YAML, so a nested block can be substituted whole without this
module needing a YAML library or a second opinion about how pygeoapi's document should be
indented.

Run as a program it reads ``HARNESS_CONFIG`` like every other component, validates the
document against the packaged schema before any other I/O, and writes the rendered
configuration to the path named on the command line.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from string import Template
from typing import Any

from harness_core.config import ConfigInvalidError, load_or_exit
from plugins.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema

__all__ = [
    "TEMPLATE_NAME",
    "MissingConfigurationValueError",
    "load_query_config",
    "render",
    "render_from_document",
    "template_text",
]

# harness:allow-literal-path the template shipped beside this module, not a deployment location
TEMPLATE_NAME = "pygeoapi-config.yaml.template"

COMPONENT = "query"

# harness:allow-literal-path a JSON pointer into the configuration, not a filesystem path
_QUERY_POINTER = "/query"

# Where pygeoapi routes the SensorThings provider, in the URL space it advertises.
#
# The provider builds every link it serves — the entity-set urls at the service root, every
# @iot.selfLink, every @iot.navigationLink, every @iot.nextLink — from one base. That base
# has to be the path pygeoapi actually reaches the provider at, which is the collection's
# `items` resource: `<server.url>/collections/<collection>/items`, with the SensorThings
# resource path following as pygeoapi's `<path:item_id>`.
#
# It was the server url, one collection short, and so every link the interface served named
# a path nothing routed. Nothing in-process could see it: the tests walk the links through
# the service object, which strips whatever base it was handed, so a base that resolved
# nowhere walked exactly as well as one that resolved. Only a request to the running stack
# told the difference, and it told it as a 404 on every entity set.
#
# The collection name is spelt here and in the template. `test_config_rendering.py` reads
# the rendered document, finds the collection the SensorThings provider is actually in, and
# asserts the base matches it, so the two cannot drift apart in silence.
#
# Held as segments rather than as a path fragment. Joining them is one line either way, and
# a tuple cannot be mistaken for — or grow into — a location: there is no destination in it
# to configure, only the shape of the route pygeoapi publishes, which is the framework's and
# not this deployment's.
_SENSORTHINGS_ROUTE = ("collections", "observations", "items")


class MissingConfigurationValueError(Exception):
    """A placeholder the configuration has no value for. Names the key and where it belongs."""

    def __init__(self, placeholder: str, source: str) -> None:
        super().__init__(
            f"the pygeoapi configuration template needs a value for ${{{placeholder}}} and "
            f"the destination configuration has none. Add it under {source} in "
            f"config/<destination>/, in every destination: a value present in one and absent "
            f"from another is the drift the parity check exists to report."
        )
        self.placeholder = placeholder
        self.source = source


def template_text() -> str:
    """The template, read from beside this module."""
    return (Path(__file__).resolve().parent / TEMPLATE_NAME).read_text(encoding="utf-8")


def _block(value: Any) -> str:
    """A structured value, as JSON — which is YAML, so it substitutes whole."""
    return json.dumps(value, sort_keys=True)


def _require(document: Mapping[str, Any], *path: str) -> Any:
    cursor: Any = document
    for step in path:
        if not isinstance(cursor, Mapping) or step not in cursor:
            raise MissingConfigurationValueError(path[-1], "/" + "/".join(path[:-1]))
        cursor = cursor[step]
    return cursor


def _values(document: Mapping[str, Any]) -> dict[str, str]:
    """Every placeholder the template uses, and where each one came from."""
    query = _require(document, "query")
    presentation = _require(document, "query", "presentation")
    domain = _require(document, "query", "domain")
    axes = _require(document, "query", "coverage", "axes")
    limits = _require(document, "query", "limits")
    observations = _require(document, "query", "observations")
    store = _require(document, "query", "coverage_store")
    logging_section = _require(document, "logging")

    base = str(query["public_base_url"]).rstrip("/")
    prefix = str(query["collection_prefix"]).strip("/")

    # What each provider is handed. The whole query section travels, rather than a copy of
    # selected keys, so that a value added to the configuration reaches the provider without
    # a second list here having to be remembered.
    coverage_options = {
        "coverage_store": dict(store),
        "coverage": dict(_require(document, "query", "coverage")),
        "limits": dict(limits),
        "interpolation": dict(_require(document, "query", "interpolation")),
    }
    public_url = f"{base}/{prefix}" if prefix else base
    sensorthings_options = {
        "base_url": "/".join((public_url, *_SENSORTHINGS_ROUTE)),
        "observations": dict(observations),
        "limits": dict(limits),
    }

    return {
        "bind_host": str(_require(document, "query", "bind", "host")),
        "bind_port": str(_require(document, "query", "bind", "port")),
        "public_url": public_url,
        "page_size_default": str(limits["page_size_default"]),
        "page_size_maximum": str(limits["page_size_maximum"]),
        "log_level": str(logging_section["level"]),
        "map_tile_url": str(presentation["map_tile_url"]),
        "map_attribution": str(presentation["map_attribution"]),
        "terms_of_service": str(presentation["terms_of_service"]),
        "licence_name": str(presentation["licence_name"]),
        "licence_url": str(presentation["licence_url"]),
        "provider_name": str(presentation["provider_name"]),
        "coverage_root": str(store["root"]),
        "axis_longitude": str(axes["longitude"]),
        "axis_latitude": str(axes["latitude"]),
        "axis_depth": str(axes["depth"]),
        "axis_time": str(axes["time"]),
        "observations_dsn": str(observations["dsn"]),
        "domain_bbox": _block(list(domain["bbox"])),
        "domain_begin": str(domain["temporal"]["begin"]),
        "domain_end": str(domain["temporal"]["end"]),
        "coverage_options": _block(coverage_options),
        "sensorthings_options": _block(sensorthings_options),
    }


def render_from_document(document: Mapping[str, Any], text: str | None = None) -> str:
    """Render the pygeoapi configuration from a validated configuration document."""
    template = Template(text if text is not None else template_text())
    try:
        values = _values(document)
    except KeyError as error:
        # A key absent from a section that is itself present. Reported the same way as a
        # missing section, because from the operator's side they are one problem.
        # harness:allow-literal-path a JSON pointer, not a filesystem path
        raise MissingConfigurationValueError(str(error.args[0]), _QUERY_POINTER) from error
    try:
        return template.substitute(values)
    except KeyError as error:
        raise MissingConfigurationValueError(str(error.args[0]), _QUERY_POINTER) from error


def load_query_config() -> Any:
    """Read and validate this component's one configuration file, before any other I/O."""
    return load_or_exit(
        schema(CONFIG_SCHEMA),
        component=COMPONENT,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
    )


def render(destination: Path, *, loaded: Any | None = None) -> Path:
    """Write the rendered configuration, returning where it was written."""
    config = loaded if loaded is not None else load_query_config()
    destination.write_text(render_from_document(config.document), encoding="utf-8")
    return destination


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="where the rendered configuration is written")
    arguments = parser.parse_args(argv)
    try:
        render(arguments.output)
    except (MissingConfigurationValueError, ConfigInvalidError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
