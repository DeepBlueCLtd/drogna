#!/usr/bin/env python3
"""Spike code — throwaway. Not imported by drogna and not promoted into it.

Measure what each image in the deployment costs, without a Docker daemon.

Two numbers per image, and they answer different questions:

  compressed    the sum of the layer sizes in the registry manifest. What a host pulls,
                and therefore what a cold bring-up waits for.
  uncompressed  the same layers streamed through gzip and counted. What the image
                occupies on the host's disk once pulled.

The layers are streamed and discarded rather than stored, so this needs bandwidth and
almost no disk. Nothing is written except the report.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ACCEPT = ",".join(
    [
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.oci.image.index.v1+json",
    ]
)

# The images the deployment names, each with the role it plays. Kept in step with
# deploy/compose.yaml and deploy/images/ by hand: this is a spike, not a gate.
IMAGES = [
    ("python:3.11-slim-bookworm", "base of the Python service image and the query image"),
    ("ghcr.io/astral-sh/uv:0.8.17", "copied whole into every Python service image"),
    ("postgis/postgis:16-3.4", "the observation store, pulled as-is"),
    ("eclipse-mosquitto:2.0.22", "the broker, pulled as-is"),
    ("nginx:1.27-alpine", "base of the proxy image and the client image"),
    ("node:22-alpine", "build stage of the client image; not in the runtime image"),
    # Candidates, for the comparison the finding rests on.
    ("python:3.11-alpine", "candidate base"),
    ("postgis/postgis:16-3.4-alpine", "candidate observation store"),
    ("postgres:16-alpine", "candidate observation store, no PostGIS"),
    ("debian:bookworm-slim", "floor for a Debian-based image"),
    ("alpine:3.20", "floor for an Alpine-based image"),
]


def fetch(url: str, headers: dict[str, str], raw: bool = False):
    """GET with backoff. Docker Hub rate-limits anonymous token requests."""
    last: Exception | None = None
    for attempt in range(6):
        try:
            request = urllib.request.Request(url, headers=headers)
            response = urllib.request.urlopen(request, timeout=120)
            return response if raw else json.loads(response.read())
        except urllib.error.HTTPError as error:
            last = error
            if error.code in (429, 500, 502, 503):
                time.sleep(2**attempt)
                continue
            raise
    raise RuntimeError(f"gave up on {url}") from last


def split_reference(reference: str) -> tuple[str, str, str]:
    registry = "registry-1.docker.io"
    name = reference
    if reference.startswith("ghcr.io/"):
        registry = "ghcr.io"
        name = reference.removeprefix("ghcr.io/")
    repository, tag = name.rsplit(":", 1)
    if registry == "registry-1.docker.io" and "/" not in repository:
        repository = "library/" + repository
    return registry, repository, tag


def authorise(registry: str, repository: str) -> str:
    if registry == "registry-1.docker.io":
        url = (
            "https://auth.docker.io/token"
            f"?service=registry.docker.io&scope=repository:{repository}:pull"
        )
    else:
        url = f"https://{registry}/token?scope=repository:{repository}:pull"
    return fetch(url, {})["token"]


def manifest_for(reference: str, architecture: str) -> tuple[dict, str, str, dict]:
    registry, repository, tag = split_reference(reference)
    headers = {"Authorization": f"Bearer {authorise(registry, repository)}", "Accept": ACCEPT}
    document = fetch(
        f"https://{registry}/v2/{repository}/manifests/{urllib.parse.quote(tag)}", headers
    )
    if "manifests" in document:
        for entry in document["manifests"]:
            platform = entry.get("platform", {})
            if (
                platform.get("architecture") == architecture
                and platform.get("os") == "linux"
                and not platform.get("variant")
            ):
                document = fetch(
                    f"https://{registry}/v2/{repository}/manifests/{entry['digest']}", headers
                )
                break
        else:
            raise RuntimeError(f"no linux/{architecture} manifest for {reference}")
    return document, registry, repository, headers


def uncompressed_size(digests, registry, repository, headers) -> int:
    total = 0
    for digest in digests:
        stream = fetch(f"https://{registry}/v2/{repository}/blobs/{digest}", headers, raw=True)
        with gzip.GzipFile(fileobj=stream) as expanded:
            while chunk := expanded.read(1 << 20):
                total += len(chunk)
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--architecture", default="amd64")
    parser.add_argument(
        "--compressed-only",
        action="store_true",
        help="skip the layer download; report pull bytes only",
    )
    arguments = parser.parse_args()

    print(f"{'image':<40} {'pull':>10} {'on disk':>10}  role")
    print("-" * 100)
    report = []
    for reference, role in IMAGES:
        try:
            document, registry, repository, headers = manifest_for(
                reference, arguments.architecture
            )
            compressed = sum(layer["size"] for layer in document["layers"])
            expanded = None
            if not arguments.compressed_only:
                expanded = uncompressed_size(
                    [layer["digest"] for layer in document["layers"]],
                    registry,
                    repository,
                    headers,
                )
            shown = f"{expanded / 1e6:9.1f}M" if expanded else "         -"
            print(f"{reference:<40} {compressed / 1e6:9.1f}M {shown}  {role}")
            report.append(
                {
                    "image": reference,
                    "role": role,
                    "layers": len(document["layers"]),
                    "compressed_bytes": compressed,
                    "uncompressed_bytes": expanded,
                }
            )
        except Exception as error:
            print(f"{reference:<40} {'ERROR':>10} {error}")
            report.append({"image": reference, "role": role, "error": str(error)})
    print(json.dumps(report, indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
