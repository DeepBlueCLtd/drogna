"""Check that the deployment holds no literal address, and that its conventions hold.

The one property this feature exists to protect is that a destination is described by its
configuration and by nothing else. A hostname, a port, an absolute path or a URL written
into `deploy/` is that property already broken, so this is checked by parsing rather than
by eye (SRD NFR-05, Constitution IV).

Two deliberate exemptions, both narrow enough to state here:

* Image references. A base image pinned by digest is not an address the deployment chooses;
  it is the identity of the image. Lines carrying `image:`, `FROM` or `--from=` are exempt
  from the address rules and are instead required to carry a digest.
* Paths inside another image. `COPY --from=` and `RUN --mount=` name locations in an image
  the deployment did not build. Those lines are exempt from the absolute-path rule.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import compose_document
from destination import COMPOSE_FILENAME, deploy_dir, repository_root

SCANNED_SUFFIXES = frozenset(
    {".yaml", ".yml", ".template", ".Dockerfile", ".sh", ".md", ".txt", ".py", ".service", ".conf"}
)

# `deploy/broker/` belongs to 007-observation-path and `deploy/.runtime/` is generated.
SKIPPED_DIRECTORY_NAMES = frozenset({"broker", ".runtime", "__pycache__"})

_LOOPBACK_NAME = re.compile(r"\blocalhost\b", re.IGNORECASE)
_IPV4 = re.compile(r"(?<![\w.])\d{1,3}(?:\.\d{1,3}){3}(?![\w.])")
_URL = re.compile(r"\b[a-z][a-z0-9+.-]*://[A-Za-z0-9_.\-\[]")
_PORT = re.compile(r"(?<=[\w\].]):(\d{2,5})(?!\w)")
# The pseudo-filesystems /dev and /proc are left out deliberately: `>/dev/null` is not a
# deployment choice, and no destination will ever want it to be one.
_ABSOLUTE_PATH = re.compile(
    r"(?<![\w$.{/])/(?:usr|etc|var|opt|home|srv|root|tmp|mnt|bin|sbin|lib)(?![\w])"
)

_IMAGE_LINE = re.compile(r"(^\s*image:|^\s*FROM\s|--from=)")
_IN_IMAGE_PATH_LINE = re.compile(r"(--from=|--mount=)")

# A location belonging to the host operating system — where systemd keeps unit files, where
# apt keeps keyrings — is not a deployment choice, and putting it in a destination's
# configuration would pretend that it were. A line carrying this marker is exempt from the
# absolute-path rule and carries its reason, in the manner of the constitution's
# wall-clock marker. Every marker is meant to be read in review.
_HOST_OS_PATH_MARKER = "harness:host-os-path"
_DIGEST = re.compile(r"@sha256:[0-9a-f]{64}")


def scanned_files(directory: Path) -> list[Path]:
    found: list[Path] = []
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        if set(path.relative_to(directory).parts[:-1]) & SKIPPED_DIRECTORY_NAMES:
            continue
        if path.name.startswith(".env"):
            continue
        # This module states the patterns it forbids, so it necessarily contains them.
        if path.name == Path(__file__).name:
            continue
        if path.suffix in SCANNED_SUFFIXES or path.name.endswith(".Dockerfile"):
            found.append(path)
    return found


def address_findings(path: Path, text: str) -> list[str]:
    """Every literal address in one file, as messages naming the line."""
    findings: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if number == 1 and stripped.startswith("#!"):
            continue
        if _IMAGE_LINE.search(line):
            if ("image:" in line or line.lstrip().startswith("FROM ")) and not _DIGEST.search(line):
                findings.append(f"{path.name}:{number}: image reference is not pinned by digest")
            continue
        for pattern, description in (
            (_LOOPBACK_NAME, "the literal name 'localhost'"),
            (_IPV4, "a literal IP address"),
            (_URL, "a literal URL"),
            (_PORT, "a literal port number"),
        ):
            match = pattern.search(line)
            if match:
                findings.append(
                    f"{path.name}:{number}: {description} ({match.group(0)!r}); "
                    f"it belongs in the destination configuration: {stripped[:80]}"
                )
        if not _IN_IMAGE_PATH_LINE.search(line) and _HOST_OS_PATH_MARKER not in line:
            match = _ABSOLUTE_PATH.search(line)
            if match:
                findings.append(
                    f"{path.name}:{number}: a literal absolute path ({match.group(0)!r}); "
                    f"it belongs in the destination configuration: {stripped[:80]}"
                )
    return findings


def convention_findings(compose_text: str) -> list[str]:
    """Every place the Compose file departs from the conventions this feature fixes."""
    findings: list[str] = []
    for service, block in sorted(compose_document.service_blocks(compose_text).items()):
        if "profiles:" not in block:
            findings.append(f"service '{service}' declares no profile")
        if "<<: *runtime" not in block:
            findings.append(f"service '{service}' does not merge the shared runtime fragment")
        one_shot = "harness.lifecycle: one-shot" in block
        if "healthcheck:" not in block and not one_shot:
            findings.append(
                f"service '{service}' declares no health check and is not labelled one-shot"
            )
        for line in block.splitlines():
            if "HARNESS_CONFIG:" in line and "${" not in line:
                findings.append(
                    f"service '{service}' sets HARNESS_CONFIG to a literal rather than a name"
                )
    return findings


def documented_volume_findings(compose_text: str, readme_text: str) -> list[str]:
    findings: list[str] = []
    for volume in compose_document.volume_names(compose_text):
        if volume not in readme_text:
            findings.append(
                f"volume '{volume}' is declared in {COMPOSE_FILENAME} but does not appear in "
                f"the volume table in the deployment README"
            )
    return findings


def run(root: Path | None = None) -> list[str]:
    root = root or repository_root()
    directory = deploy_dir(root)
    findings: list[str] = []
    for path in scanned_files(directory):
        findings.extend(address_findings(path, path.read_text(encoding="utf-8")))
    compose_text = (directory / COMPOSE_FILENAME).read_text(encoding="utf-8")
    findings.extend(convention_findings(compose_text))
    readme = directory / "README.md"
    if readme.is_file():
        findings.extend(
            documented_volume_findings(compose_text, readme.read_text(encoding="utf-8"))
        )
    else:
        findings.append("the deployment README is missing, so no volume can be accounted for")
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.parse_args(argv)
    findings = run()
    if findings:
        print("the deployment carries literals or breaks its own conventions:", file=sys.stderr)
        for finding in findings:
            print(f"  {finding}", file=sys.stderr)
        return 1
    print("the deployment holds no literal address and keeps its conventions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
