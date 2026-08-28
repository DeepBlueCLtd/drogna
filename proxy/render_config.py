"""Turning the destination configuration into the file nginx actually reads.

``proxy/`` holds templates and a release policy. It holds no host, no port and no path,
because an nginx configuration is conventionally written full of them and this is the
component where losing Constitution IV would matter most: a literal upstream here is a
surface nobody declared. Every value in the rendered file comes from
``config/<destination>/proxy.json``, and a placeholder the configuration has no value for
is a render failure naming the key rather than an empty directive that nginx accepts and
that means something other than what was meant.

The rendering is deliberately dull. ``@{name}`` placeholders are substituted from a flat
mapping, and the delimiter is not a dollar sign because nginx's own ``$variables`` are
left alone — a template that had to escape them would be a template nobody could read
against the nginx documentation.

Two properties are enforced here rather than left to review.

**Nothing is invented.** Every substituted value is derived from the configuration
document or is an nginx identifier with no external meaning. A test asserts that every
location, upstream and file name in the rendered output appears in the input document.

**A value that would change the grammar is refused, not escaped.** A path, host or URL
carrying whitespace, a quote, a brace or a semicolon would end a directive early and
begin another one; that is configuration injection, and the fix is to refuse the
configuration rather than to be clever about quoting it. The one free-text value — the
challenge realm, which a human reads — is emitted as a quoted nginx string.

Run as a program it reads ``HARNESS_CONFIG`` like every other component, validates the
document against the packaged schema before any other I/O, and writes the rendered
configuration to the location the configuration names.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from harness_core.config import ConfigError, load_or_exit

from proxy.policy import (
    ALLOW_UPGRADE,
    PolicyError,
    ReleasePolicy,
    page_locations,
    released_locations,
)
from proxy.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema

__all__ = [
    "DENY_PROBE_SUFFIX",
    "LOG_FORMAT_NAME",
    "TEMPLATES",
    "MissingConfigurationValueError",
    "UnrenderableValueError",
    "load_proxy_config",
    "render",
    "render_from_document",
    "template_text",
]

COMPONENT = "proxy"

# harness:allow-literal-path the templates shipped beside this module, not a deployment location
TEMPLATES = "templates"

# Where each section of the configuration lives, for the error that names it. These are
# JSON pointers into the document the component was started from — the same convention
# query/render_config.py follows — and not locations on any filesystem.
# harness:allow-literal-path a JSON pointer into the configuration, not a filesystem path
_PROXY_POINTER = "/proxy"
# harness:allow-literal-path a JSON pointer into the configuration, not a filesystem path
_RELEASED_POINTER = "/proxy/released"
# harness:allow-literal-path a JSON pointer into the configuration, not a filesystem path
_CONTROL_POINTER = "/proxy/control"
# harness:allow-literal-path a JSON pointer into the configuration, not a filesystem path
_PAGE_POINTER = "/proxy/page"
# harness:allow-literal-path a JSON pointer into the configuration, not a filesystem path
_TLS_POINTER = "/proxy/tls"

# The nginx identifier the refusal log format is declared under. An identifier in nginx's
# own namespace, not a location: it names nothing outside the rendered file.
LOG_FORMAT_NAME = "harness_refusal"

# What `try_files` looks for before it gives up. It can never be found, whatever the
# document root is or is not, because no file is named for a request path with this
# appended — which is the point: it is a way of reaching `=404` after the access phase
# rather than before it. See the note beside `location /` in the template.
DENY_PROBE_SUFFIX = ".refused"

_PLACEHOLDER = re.compile(r"@\{([a-z0-9_]+)\}")

# Characters that would end an nginx directive early or begin another one. A configuration
# value carrying any of them is refused rather than quoted: quoting is a guess about the
# grammar of a file this component does not parse.
_UNRENDERABLE = re.compile(r"""[\s;{}"'\\]|[\x00-\x1f\x7f]""")


class MissingConfigurationValueError(Exception):
    """A placeholder the configuration has no value for. Names the key and where it belongs."""

    def __init__(self, placeholder: str, source: str) -> None:
        super().__init__(
            f"the proxy configuration template needs a value for @{{{placeholder}}} and the "
            f"destination configuration has none. Add it under {source} in "
            f"config/<destination>/, in every destination: a value present in one and absent "
            f"from another is the drift the parity check exists to report."
        )
        self.placeholder = placeholder
        self.source = source


class UnrenderableValueError(Exception):
    """A configuration value that would not survive being written into a directive."""

    def __init__(self, where: str, value: str) -> None:
        super().__init__(
            f"{where} is {value!r}, which carries a character that ends an nginx directive "
            "or begins another one. It is refused rather than escaped: a value that can "
            "change the grammar of the served configuration is configuration injection, "
            "and the boundary is the last place to be clever about quoting."
        )
        self.where = where
        self.value = value


def template_text(name: str) -> str:
    """One template, read from beside this module."""
    return (Path(__file__).resolve().parent / TEMPLATES / name).read_text(encoding="utf-8")


def _bare(value: Any, where: str) -> str:
    """A value written into a directive as it stands, or a refusal naming where it came from."""
    text = str(value)
    if not text or _UNRENDERABLE.search(text):
        raise UnrenderableValueError(where, text)
    return text


def _quoted(value: Any, where: str) -> str:
    """The one free-text value: a quoted nginx string, with the two escapes nginx knows."""
    text = str(value)
    if any(ordinal < 0x20 or ordinal == 0x7F for ordinal in map(ord, text)):
        raise UnrenderableValueError(where, text)
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _require(document: Mapping[str, Any], *path: str) -> Any:
    cursor: Any = document
    for step in path:
        if not isinstance(cursor, Mapping) or step not in cursor:
            raise MissingConfigurationValueError(path[-1], "/" + "/".join(path[:-1]))
        cursor = cursor[step]
    return cursor


def _substitute(text: str, values: Mapping[str, str], source: str) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in values:
            raise MissingConfigurationValueError(name, source)
        return values[name]

    return _PLACEHOLDER.sub(replace, text)


def _released_block(policy: ReleasePolicy) -> str:
    """One block per released collection, in the order :func:`released_locations` fixes.

    The upgrade location is filtered out here and rendered from its own template. It is a
    different exposure surface and it reads as one in the served file too: a reviewer
    should not have to notice that one entry in a list of collections is a persistent
    connection to the broker.
    """
    text = template_text("released-location.conf.template")
    blocks = []
    for location in released_locations(policy):
        if location.upgrade:
            continue
        identifier = location.path.rsplit("/", 1)[1]
        blocks.append(
            _substitute(
                text,
                {
                    "identifier": _bare(identifier, "proxy.released.collections"),
                    "location_path": _bare(location.path, "proxy.released.prefix"),
                    "upstream": _bare(location.upstream, "proxy.upstream.query"),
                    "rule": _bare(location.rule, "proxy.released.collections"),
                },
                _RELEASED_POINTER,
            )
        )
    return "\n".join(blocks)


def _page_block(policy: ReleasePolicy) -> str:
    """The page's locations, where the destination declares a page. Empty otherwise.

    The page is the client's own build, served through this boundary so the page and the
    data it reads share one origin and one clearance (issue #34 link 6). Its surface is
    declared path by path in the configuration, exactly as the released collections are:
    an exact location per named document, a `^~` prefix per asset directory, and nothing
    for anything the document does not name. `auth_basic` at server level covers every
    location here like every other, which is the property the template defends.
    """
    entries = page_locations(policy)
    if not entries:
        return ""
    text = template_text("page-location.conf.template")
    guard = template_text("page-prefix-guard.conf.template")
    blocks = [
        "    # The page: the client build, served behind the same clearance as the data\n"
        "    # it reads (one origin, one credential — issue #34 link 6). Only the paths\n"
        "    # the configuration names are admitted; the build emitting a new path does\n"
        "    # not expose it, which is FR-003's property applied to the page."
    ]
    for location in entries:
        if not location.exact:
            blocks.append(
                _substitute(
                    guard,
                    {
                        "prefix": _bare(location.path, "proxy.page.prefixes"),
                        "deny_probe_suffix": DENY_PROBE_SUFFIX,
                    },
                    _PAGE_POINTER,
                )
            )
        blocks.append(
            _substitute(
                text,
                {
                    "modifier": "=" if location.exact else "^~",
                    "location_path": _bare(
                        location.path if location.exact else location.path + "/",
                        "proxy.page.paths",
                    ),
                    "upstream": _bare(location.upstream, "proxy.upstream.page.url"),
                    "rule": _bare(location.rule, "proxy.page"),
                },
                _PAGE_POINTER,
            )
        )
    return "\n".join(blocks)


def _upgrade_block(policy: ReleasePolicy, document: Mapping[str, Any]) -> str:
    """The one protocol-upgrade location ADR-0008 decided on."""
    control = _require(document, "proxy", "control")
    subprotocol = control.get("subprotocol")
    header = ""
    if subprotocol is not None:
        header = _substitute(
            template_text("subprotocol-header.conf.template"),
            {"subprotocol": _quoted(subprotocol, "proxy.control.subprotocol")},
            _CONTROL_POINTER,
        )
    location = next(entry for entry in released_locations(policy) if entry.upgrade)
    return _substitute(
        template_text("upgrade-location.conf.template"),
        {
            "upgrade_prefix": _bare(location.path, "proxy.control.upgrade_prefix"),
            "upstream": _bare(location.upstream, "proxy.upstream.control_websocket"),
            "rule": _bare(ALLOW_UPGRADE, "proxy.control"),
            "read_timeout": _bare(
                _require(document, "proxy", "control", "read_timeout_seconds"),
                "proxy.control.read_timeout_seconds",
            ),
            "subprotocol_header": header,
        },
        _CONTROL_POINTER,
    )


def _tls_block(document: Mapping[str, Any]) -> tuple[str, str]:
    """The TLS directives and the `listen` suffix that turns them on, or two empty strings.

    A destination that terminates TLS and names no material is a render failure. The
    alternative — a listener that quietly serves plaintext on the port the deployment
    published as the TLS one — is the failure this component exists to prevent, arriving
    by the back door.
    """
    tls = _require(document, "proxy", "tls")
    if not _require(document, "proxy", "tls", "enabled"):
        return "", ""
    protocols = _require(document, "proxy", "tls", "protocols")
    if not protocols:
        raise MissingConfigurationValueError("protocols", _TLS_POINTER)
    block = _substitute(
        template_text("tls.conf.template"),
        {
            "certificate": _bare(_require(tls, "certificate"), "proxy.tls.certificate"),
            # harness:allow-literal-path a JSON pointer, not a filesystem path
            "key": _bare(_require(tls, "key"), "proxy.tls.key"),
            "protocols": " ".join(_bare(name, "proxy.tls.protocols") for name in protocols),
        },
        _TLS_POINTER,
    )
    return block, " ssl"


def render_from_document(document: Mapping[str, Any]) -> str:
    """Render the served configuration from a validated configuration document."""
    policy = ReleasePolicy.from_document(document)
    tls_block, listen_options = _tls_block(document)
    values = {
        "log_format_name": LOG_FORMAT_NAME,
        "deny_probe_suffix": DENY_PROBE_SUFFIX,
        "listen_host": _bare(_require(document, "proxy", "listen", "host"), "proxy.listen.host"),
        "listen_port": _bare(_require(document, "proxy", "listen", "port"), "proxy.listen.port"),
        "listen_options": listen_options,
        "server_name": _bare(
            _require(document, "proxy", "listen", "server_name"), "proxy.listen.server_name"
        ),
        "tls_block": tls_block,
        "access_log": _bare(_require(document, "proxy", "logs", "access"), "proxy.logs.access"),
        "error_log": _bare(_require(document, "proxy", "logs", "error"), "proxy.logs.error"),
        "error_level": _bare(
            _require(document, "proxy", "logs", "error_level"), "proxy.logs.error_level"
        ),
        "credentials_realm": _quoted(
            _require(document, "proxy", "credentials", "realm"), "proxy.credentials.realm"
        ),
        "credentials_file": _bare(
            _require(document, "proxy", "credentials", "file"), "proxy.credentials.file"
        ),
        "released_prefix": _bare(policy.prefix, "proxy.released.prefix"),
        "released_locations": _released_block(policy),
        "page_locations": _page_block(policy),
        "upgrade_location": _upgrade_block(policy, document),
        "health_port": _bare(_require(document, "proxy", "health", "port"), "proxy.health.port"),
        "health_path": _bare(_require(document, "proxy", "health", "path"), "proxy.health.path"),
    }
    return _substitute(template_text("harness.conf.template"), values, _PROXY_POINTER)


def load_proxy_config() -> Any:
    """Read and validate this component's one configuration file, before any other I/O."""
    return load_or_exit(
        schema(CONFIG_SCHEMA),
        component=COMPONENT,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
    )


def output_path(document: Mapping[str, Any]) -> Path:
    """Where the rendered configuration is written. A build artefact, named by configuration."""
    return Path(str(_require(document, "proxy", "rendered", "output")))


def render(destination: Path | None = None, *, loaded: Any | None = None) -> Path:
    """Write the rendered configuration, returning where it was written."""
    config = loaded if loaded is not None else load_proxy_config()
    target = destination if destination is not None else output_path(config.document)
    target.write_text(render_from_document(config.document), encoding="utf-8")
    return target


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render the served nginx configuration.")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=None,
        help="where to write it; by default, the location the configuration names",
    )
    arguments = parser.parse_args(argv)
    try:
        written = render(arguments.output)
    except (
        MissingConfigurationValueError,
        UnrenderableValueError,
        PolicyError,
        ConfigError,
    ) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(str(written))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
