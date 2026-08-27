#!/usr/bin/env python3
"""Site gate: a deployment hostname in built output is a finding until it is acknowledged.

The droplet's address is not customer material, so PR-01's vocabulary rule has nothing to
say about it. It is an access surface, and whether it may be published is a judgement — so
this gate forces the judgement rather than assuming either answer. Every deployment
hostname it finds is a finding unless ``docs/manifest.yaml`` acknowledges it by name, with
a reason. Acknowledging is not passing silently: it is a line somebody wrote and a reviewer
can read.

Run it against a built site::

    python site/gates/check_deployment_hostnames.py --site site/build --manifest docs/manifest.yaml

Exit 0 with no findings, 1 with findings, 2 when it could not run. **An absent manifest is
2, not 0.** A gate that treats a missing acknowledgement list as "nothing to acknowledge"
passes precisely the site nobody has reviewed.

This is uncovered ground on both sides. ``scripts/check_no_literal_paths.py`` scans Python,
TypeScript and SQL and does not look at Markdown, so the source is not covered either, and
nothing at all has ever read the built output for an address.

Where the hostnames come from
-----------------------------
From ``config/<destination>/deployment.json``, which is where the deployment's own address
is declared — ``public_url.host`` and ``tls.hostname`` — and never from a list retyped here.
A retyped list is a list that drifts, and the drifted copy would be the one guarding the
public site. The ``local`` destination is skipped: ``localhost`` on a page is an
instruction to a reader, not an access surface.

Beside that, an address literal that is neither loopback nor link-local nor unspecified is
reported whatever configuration says, because an address written straight into a page is
exactly the case a declared-name list cannot catch. Loopback is left alone: the blog tells a
reader to open the client at ``127.0.0.1:8080`` and that is the truth, not a leak.

What is read, and what is deliberately not
------------------------------------------
The built tree's text, through the reader in :mod:`check_vocabulary`: page prose, the
script and style blobs, the published assets, and the attributes that name somewhere
(``href``, ``src`` and their kin). Not ``d``, ``viewBox`` or ``transform`` — an SVG path is
a run of dotted decimals, and every page of this site carries ``2.41.44.82`` inside one.

Not images. Text inside a published screenshot is read by ``check_vocabulary.py``, whose
``address-bar`` rule reports a location visible in an image; keeping the OCR dependency in
one gate means one gate refuses to run when the engine is missing rather than two.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_vocabulary import (  # noqa: E402,RUF100
    EMITTED,
    EXIT_CANNOT_RUN,
    EXIT_CLEAN,
    EXIT_FINDINGS,
    IMAGE_SUFFIXES,
    REPO_ROOT,
    TEXT_SUFFIXES,
    Finding,
    text_fragments,
)

GATE = "deployment-hostnames"

CONFIG_ROOT = REPO_ROOT / "config"
# The name of the file each destination declares its own address in. It is read so that
# the hostnames are never retyped here, which is the whole point of the rule.
# harness:allow-literal-path read from, not written to; the alternative is a retyped list
DEPLOYMENT_FILE = "deployment.json"
LOCAL_DESTINATION = "local"

DEFAULT_MANIFEST = Path("docs/manifest.yaml")
ACKNOWLEDGED_KEY = "acknowledged_hostnames"

# A dotted quad. Canonical form only: an octet with a leading zero is a decimal run, not
# an address anybody typed.
# Bounded so that `1.042.75.75` inside a minified stylesheet is not read as an address
# twice over, and so that an address at the end of a sentence still is. The first draft
# refused a trailing dot outright and therefore missed `... or 198.51.100.4.` — planted
# into a real built page, and reported by nothing. A trailing dot is only part of the
# number when a digit follows it.
ADDRESS = re.compile(r"(?<![A-Za-z0-9.\-])((?:\d{1,3}\.){3}\d{1,3})(?![A-Za-z0-9\-])(?!\.\d)")

# Inside a minified stylesheet or script a run of decimals is geometry, not an address, and
# today's build carries two that prove it: `POSIX.2 2.8.3.2` in a comment in the theme's
# vendored tokenizer, and `1.7.75.75` — which is `1.7 .75 .75` — inside SVG path data in a
# CSS data URI. Both are preceded by a space. So in emitted code an address is reported only
# where something introduces it as a value or a host. In prose, a reference or an asset it is
# reported wherever it appears, because there a person wrote it.
#
# The limit this leaves is worth stating: a deployment address hard-coded bare into inline
# configuration would not be reported by this rule. The declared-hostname rule covers every
# zone including emitted, and a deployment declares itself by name.
VALUE_INTRODUCERS = frozenset({'"', "'", "`", "/", "@", "=", "(", ":", ","})

HOSTNAME_MESSAGE = (
    "a deployment hostname in published output. It is an access surface, not customer "
    f"material, so publishing it is a judgement: acknowledge it under {ACKNOWLEDGED_KEY} "
    "in the manifest with a reason, or take it off the page"
)
ADDRESS_MESSAGE = (
    "an address literal in published output. Nothing in configuration named it, which is "
    "why it is reported: an address typed straight into a page is the case a list of "
    f"declared names cannot catch. Acknowledge it under {ACKNOWLEDGED_KEY} or remove it"
)
NO_REASON_MESSAGE = (
    "acknowledged in the manifest with no reason given, so it acknowledges nothing — an "
    "exemption nobody had to justify is an exemption nobody reviewed"
)


class CannotRunError(RuntimeError):
    """The gate could not look. Reported as exit 2, never as a clean run."""


@dataclass(frozen=True)
class Acknowledgement:
    name: str
    reason: str

    @property
    def stands(self) -> bool:
        return bool(self.reason.strip())


def declared_hostnames(config_root: Path = CONFIG_ROOT) -> set[str]:
    """The hostnames the deployments declare for themselves, read from configuration."""
    found: set[str] = set()
    if not config_root.is_dir():
        raise CannotRunError(
            f"no configuration at {config_root}: the deployment hostnames are read from "
            f"config/<destination>/{DEPLOYMENT_FILE} and there is nothing to read"
        )
    for destination in sorted(config_root.iterdir()):
        if not destination.is_dir() or destination.name == LOCAL_DESTINATION:
            continue
        document = destination / DEPLOYMENT_FILE
        if not document.is_file():
            continue
        try:
            declared = json.loads(document.read_text(encoding="utf-8"))
        except json.JSONDecodeError as broken:
            raise CannotRunError(f"{document} is not readable JSON: {broken}") from broken
        for section, key in (("public_url", "host"), ("tls", "hostname")):
            value = declared.get(section, {}).get(key, "")
            if isinstance(value, str) and value.strip():
                found.add(value.strip().lower())
    return found


def acknowledgements(manifest: Path) -> dict[str, Acknowledgement]:
    """Read the manifest's acknowledged hostnames. An absent manifest is not an empty one."""
    if not manifest.is_file():
        raise CannotRunError(
            f"no manifest at {manifest}: this gate reports every deployment hostname it "
            f"finds unless {ACKNOWLEDGED_KEY} in the manifest says otherwise, and with no "
            "manifest there is no such statement. Passing here would pass the site nobody "
            "has reviewed"
        )
    try:
        import yaml
    except ModuleNotFoundError as missing:  # pragma: no cover - PyYAML is a workspace dependency
        raise CannotRunError("PyYAML is not installed, so the manifest cannot be read") from missing
    try:
        document = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as broken:
        raise CannotRunError(f"{manifest} is not readable YAML: {broken}") from broken
    if not isinstance(document, dict):
        raise CannotRunError(f"{manifest} does not hold a mapping, so it declares nothing")

    listed = document.get(ACKNOWLEDGED_KEY, []) or []
    if not isinstance(listed, list):
        raise CannotRunError(f"{manifest}: {ACKNOWLEDGED_KEY} is not a list")

    read: dict[str, Acknowledgement] = {}
    for entry in listed:
        if isinstance(entry, str):
            read[entry.strip().lower()] = Acknowledgement(entry.strip().lower(), "")
        elif isinstance(entry, dict):
            name = str(entry.get("host") or entry.get("hostname") or "").strip().lower()
            if name:
                read[name] = Acknowledgement(name, str(entry.get("reason") or ""))
    return read


def _address_finding(matched: str) -> bool:
    """Whether this dotted quad is an address worth reporting."""
    if any(part != str(int(part)) for part in matched.split(".")):
        return False  # a leading zero: a decimal run, not an address
    try:
        address = ipaddress.IPv4Address(matched)
    except ipaddress.AddressValueError:
        return False
    return not (
        address.is_loopback
        or address.is_link_local
        or address.is_unspecified
        or address.is_multicast
        or address.is_reserved
    )


def _introduced(text: str, start: int) -> bool:
    """Whether something in emitted code introduces this address as a value or a host."""
    return start == 0 or text[start - 1] in VALUE_INTRODUCERS


def scan(root: Path, hostnames: Iterable[str]) -> Iterator[tuple[str, int | None, str, str, str]]:
    """Yield (location, line, rule, matched, zone) for every hostname or address found."""
    names = sorted(hostnames)
    for path in sorted(root.rglob("*")):
        # Symlinks are not followed: a tree that contains itself is a walk that never ends.
        if path.is_symlink() or not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES or suffix not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(root).as_posix()
        for fragment in text_fragments(path, relative):
            lowered = fragment.text.lower()
            for name in names:
                if name in lowered:
                    yield relative, fragment.line, "declared-hostname", name, fragment.zone
            for found in ADDRESS.finditer(fragment.text):
                if not _address_finding(found.group(1)):
                    continue
                if fragment.zone == EMITTED and not _introduced(fragment.text, found.start()):
                    continue
                yield relative, fragment.line, "address-literal", found.group(1), fragment.zone


def findings(root: Path, manifest: Path, config_root: Path = CONFIG_ROOT) -> list[Finding]:
    hostnames = declared_hostnames(config_root)
    accepted = acknowledgements(manifest)
    found: list[Finding] = []
    for location, line, rule, matched, zone in scan(root, hostnames):
        entry = accepted.get(matched.lower())
        if entry is not None and entry.stands:
            continue
        if entry is not None:
            message = NO_REASON_MESSAGE
        else:
            message = HOSTNAME_MESSAGE if rule == "declared-hostname" else ADDRESS_MESSAGE
        found.append(Finding(location, line, rule, zone, matched, message))
    return sorted(found, key=lambda item: (item.location, item.line or 0, item.rule, item.matched))


def parse(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=f"drogna site gate: {GATE}")
    parser.add_argument("--site", required=True, type=Path, help="the built site to read")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help=f"the manifest carrying {ACKNOWLEDGED_KEY}; an absent manifest is exit 2",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, stream: object = None) -> int:
    arguments = parse(argv)
    out = stream or sys.stdout
    root: Path = arguments.site

    if not root.is_dir():
        print(f"{GATE}: cannot run: {root} is not a built site directory", file=out)
        return EXIT_CANNOT_RUN
    try:
        found = findings(root, arguments.manifest)
    except CannotRunError as reason:
        print(f"{GATE}: cannot run: {reason}", file=out)
        return EXIT_CANNOT_RUN

    for finding in found:
        print(finding.render(), file=out)
    print(f"{GATE}: {len(found)} findings", file=out)
    return EXIT_FINDINGS if found else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
