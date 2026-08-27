#!/usr/bin/env python3
"""Spike code — throwaway. Not imported by drogna and not promoted into it.

What N concurrent stacks cost on one host, derived from the files on disk rather than
from a number typed in here.

The question this spike was asked was "can we make the container smaller". The question
behind it was "can I run one stack per pull request on the droplet". Those have different
answers, because the things a second stack duplicates are not the things an image is made
of: two stacks built from the same sources share every image layer and pay for the image
once, while each pays in full for memory, for volumes, and for a host port.

So this reads what the deployment actually declares — the services in each profile, the
memory ceiling each one is given, the ports each one publishes — and reports what changes
when the stack is instantiated more than once.

It parses `deploy/compose.yaml` with a reader of its own rather than importing
`deploy/lib/compose_document.py`, for the same reason every other file here is
self-contained: a spike that reaches into the tree it is measuring stops being throwaway.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]

_SERVICE_NAME = re.compile(r"^  ([A-Za-z0-9][A-Za-z0-9_-]*):\s*$")
_PROFILES = re.compile(r"^\s*profiles:\s*\[([^\]]*)\]")
_IMAGE = re.compile(r"^\s*image:\s*(\S+)")
_BUILD = re.compile(r"^\s{4}build:\s*$")
_MEMORY_OVERRIDE = re.compile(r"^\s*memory:\s*\$\{(HARNESS_LIMIT_MEMORY_[A-Z_]+)\}")
_PUBLISH = re.compile(r"^\s*-\s*\$\{(HARNESS_PUBLISH_[A-Z_]+)\}")


class Service:
    def __init__(self, name: str) -> None:
        self.name = name
        self.profiles: list[str] = []
        self.image: str | None = None
        self.built = False
        self.memory_key: str | None = None
        self.publishes: list[str] = []

    @property
    def pulled(self) -> bool:
        return self.image is not None


def read_services(compose_text: str) -> dict[str, Service]:
    """The services block of the Compose file, one entry per service."""
    services: dict[str, Service] = {}
    current: Service | None = None
    in_services = False
    for line in compose_text.splitlines():
        if line.startswith("services:"):
            in_services = True
            continue
        if in_services and line and not line[0].isspace() and not line.startswith("#"):
            break
        if not in_services:
            continue
        name = _SERVICE_NAME.match(line)
        if name:
            current = Service(name.group(1))
            services[current.name] = current
            continue
        if current is None:
            continue
        if match := _PROFILES.match(line):
            current.profiles = [p.strip() for p in match.group(1).split(",") if p.strip()]
        elif match := _IMAGE.match(line):
            current.image = match.group(1)
        elif _BUILD.match(line):
            current.built = True
        elif match := _MEMORY_OVERRIDE.match(line):
            current.memory_key = match.group(1)
        elif match := _PUBLISH.match(line):
            current.publishes.append(match.group(1))
    return services


def megabytes(value: str) -> int:
    """A Compose memory string — `384m`, `1g` — as whole megabytes."""
    text = value.strip().lower()
    if text.endswith("g"):
        return int(float(text[:-1]) * 1024)
    if text.endswith("m"):
        return int(float(text[:-1]))
    return int(int(text) / (1024 * 1024))


def ceiling_for(service: Service, resources: dict) -> int:
    """The memory ceiling this service is given, in megabytes."""
    if service.memory_key:
        # HARNESS_LIMIT_MEMORY_OBSERVATIONS -> resources.observations.memory
        key = service.memory_key.removeprefix("HARNESS_LIMIT_MEMORY_").lower()
        if key in resources:
            return megabytes(resources[key]["memory"])
    return megabytes(resources["default"]["memory"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", nargs="?", default="droplet")
    parser.add_argument(
        "--host-memory-mb",
        type=int,
        default=4096,
        help="the host this is sized against; the droplet's working assumption is 4 GB",
    )
    arguments = parser.parse_args()

    compose = (REPOSITORY / "deploy" / "compose.yaml").read_text()
    deployment = json.loads(
        (REPOSITORY / "config" / arguments.destination / "deployment.json").read_text()
    )
    services = read_services(compose)
    resources = deployment["resources"]
    published = deployment["network"]["publish"]
    active = deployment["profiles"]["active"]

    profiles = sorted({p for service in services.values() for p in service.profiles})

    print(f"destination: {arguments.destination}")
    print(f"active profile(s): {', '.join(active)}")
    print(f"host memory assumed: {arguments.host_memory_mb} MB")
    print()

    print("Declared memory ceiling of one stack, by profile")
    print(f"  {'profile':<14}{'services':>9}{'ceiling':>10}{'stacks that fit':>18}")
    for profile in profiles:
        selected = [s for s in services.values() if profile in s.profiles]
        total = sum(ceiling_for(s, resources) for s in selected)
        fits = arguments.host_memory_mb // total if total else 0
        print(f"  {profile:<14}{len(selected):>9}{total:>9} M{fits:>18}")
    print()

    print("What a second stack duplicates, and what it does not")
    pulled = sorted({s.image.split("@")[0] for s in services.values() if s.pulled})
    built = sorted(s.name for s in services.values() if s.built)
    print(f"  images pulled ({len(pulled)}), shared between stacks by digest — paid once:")
    for image in pulled:
        print(f"    {image}")
    print(f"  images built ({len(built)}), shared between stacks when the sources match —")
    print("    a per-pull-request stack rebuilds only the layers its diff invalidates:")
    print(f"    {', '.join(built)}")
    print()

    print("Host ports one stack claims, every one of which collides with a second stack")
    for service in sorted(services.values(), key=lambda s: s.name):
        for key in service.publishes:
            name = key.removeprefix("HARNESS_PUBLISH_").lower()
            entry = published.get(name)
            if entry:
                print(
                    f"  {service.name:<14} {entry['bind']}:{entry['host_port']}"
                    f" -> {entry['container_port']}"
                )
    print()

    print("Named volumes one stack claims; Compose prefixes them with the project name,")
    print("so a distinct HARNESS_PROJECT_NAME gives each stack its own set — and its own disk:")
    volumes = re.search(r"^volumes:\n((?:  .*\n|\n)*)", compose, re.MULTILINE)
    if volumes:
        names = re.findall(r"^  ([A-Za-z0-9][A-Za-z0-9_-]*):", volumes.group(1), re.MULTILINE)
        print(f"  {', '.join(names)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
