"""The Compose configuration holds names, not addresses, and keeps its own conventions.

The property this feature exists to protect is that a destination is described by its
configuration and by nothing else. It is checked by parsing the files rather than by
reading them, because reading them is how it stops being true.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import compose_document  # noqa: E402
import compose_lint  # noqa: E402
import render_credentials  # noqa: E402
import render_env  # noqa: E402
from destination import COMPOSE_FILENAME, deploy_dir  # noqa: E402

DEPLOY_DIR = deploy_dir(REPOSITORY_ROOT)
COMPOSE_TEXT = (DEPLOY_DIR / COMPOSE_FILENAME).read_text(encoding="utf-8")
README_TEXT = (DEPLOY_DIR / "README.md").read_text(encoding="utf-8")


def test_the_deployment_carries_no_literal_address() -> None:
    """No hostname, port, absolute path or URL anywhere under deploy/.

    The two exemptions are stated in compose_lint: an image reference, which is an identity
    rather than an address, and a location inside someone else's image.
    """
    findings: list[str] = []
    for path in compose_lint.scanned_files(DEPLOY_DIR):
        findings.extend(compose_lint.address_findings(path, path.read_text(encoding="utf-8")))
    assert findings == []


def test_the_compose_file_keeps_its_conventions() -> None:
    """Every service carries a profile, the shared runtime fragment and a health check."""
    assert compose_lint.convention_findings(COMPOSE_TEXT) == []


def test_every_declared_volume_is_documented_with_what_fills_it() -> None:
    assert compose_lint.documented_volume_findings(COMPOSE_TEXT, README_TEXT) == []
    assert compose_document.volume_names(COMPOSE_TEXT), "the file should declare volumes"


def test_every_image_is_pinned_by_digest() -> None:
    """A replay resting on a floating base image is not a replay (Constitution II)."""
    references = re.findall(r"^\s*image:\s*(\S+)", COMPOSE_TEXT, flags=re.MULTILINE)
    references += re.findall(
        r"^FROM\s+(\S+)",
        "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(DEPLOY_DIR.glob("images/*.Dockerfile"))
        ),
        flags=re.MULTILINE,
    )
    assert references, "there should be image references to check"
    for reference in references:
        assert re.search(r"@sha256:[0-9a-f]{64}$", reference), f"{reference} is not pinned"


def test_every_service_takes_its_configuration_by_name() -> None:
    """One meaningful environment variable per service, and its value is never a literal."""
    for service, block in compose_document.service_blocks(COMPOSE_TEXT).items():
        for line in block.splitlines():
            if "HARNESS_CONFIG:" in line:
                assert "${" in line, f"service {service} hardcodes its configuration path"


def test_each_service_has_a_name_for_its_configuration_file_in_the_environment() -> None:
    """The renderer gives every service in the file a configuration-path variable.

    An empty value means the component has not been built and has no file at this
    destination. That is a statement about what has been written, not about what is alive.
    """
    values = render_env.config_path_values("local", REPOSITORY_ROOT)
    for service in compose_document.service_names(COMPOSE_TEXT):
        name = f"HARNESS_CONFIG_PATH_{render_env.variable_suffix(service)}"
        assert name in values, f"no configuration-path variable for service {service}"


def test_the_environment_template_and_the_renderer_agree() -> None:
    """A name with no value, or a value with no name, is an error rather than an empty
    string quietly reaching a container. Rendering is what proves the two sides agree."""
    supplied = {"HARNESS_DATABASE_PASSWORD": "x" * 8}
    supplied.update({variable: "y" * 8 for variable in render_credentials.SECRET_NAMES})
    for name in ("local", "droplet"):
        text = render_env.render(name, REPOSITORY_ROOT, supplied)
        assert "COMPOSE_PROFILES=" in text
        # The rendered tree, not the tracked one. A container reads configuration carrying
        # the broker secret, which no tracked file may hold; deploy/lib/render_credentials.py
        # writes it and ADR-0016 says why the mount had to move.
        assert f"HARNESS_CONFIG_HOST_DIR={REPOSITORY_ROOT}/deploy/.runtime/config/{name}" in text
        assert f"HARNESS_CONFIG_HOST_DIR={REPOSITORY_ROOT}/config/{name}\n" not in text


def test_the_secret_never_reaches_a_tracked_file() -> None:
    """The template is tracked and carries names. Values, and secrets above all, do not."""
    template = (DEPLOY_DIR / "env.template").read_text(encoding="utf-8")
    for name in render_env.SECRET_NAMES:
        assert f"{name}=\n" in template or template.rstrip().endswith(f"{name}=")


def test_every_component_appears_in_the_deployment_readme() -> None:
    """Eighteen components, each accounted for as a service or explained as not being one.

    The table is a manifest for people reading it. Nothing consults it, and in particular
    it does not decide what the client draws as alive (Constitution VII).
    """
    for number in range(1, 19):
        assert f"C-{number:02d}" in README_TEXT, f"C-{number:02d} is not accounted for"
    for service in compose_document.service_names(COMPOSE_TEXT):
        assert f"`{service}`" in README_TEXT, f"service {service} is not in the README table"


def test_no_service_is_declared_twice() -> None:
    """A repeated mapping key is not an error in YAML, which is why this is a test.

    The later definition wins and the earlier one vanishes without complaint. Every other
    check in this file reads the document as a mapping, so all of them see one entry and
    none of them can see the collapse. `telemetry` was declared twice for a while — once
    when the deployment was pre-provisioned and again when the component was built — and
    the copy that survived had lost the coverage volume its persistence reference reads.
    """
    declared = compose_document.declared_service_names(COMPOSE_TEXT)
    repeated = sorted({name for name in declared if declared.count(name) > 1})
    assert not repeated, f"declared more than once in {COMPOSE_FILENAME}: {repeated}"


def test_the_duplicate_service_check_reports_a_duplicate() -> None:
    """The check above is only worth having if it fails on the thing it describes."""
    doubled = COMPOSE_TEXT.replace(
        "  # C-17 offload packager.",
        "  telemetry:\n    profiles: [control, full]\n\n  # C-17 offload packager.",
        1,
    )
    assert doubled != COMPOSE_TEXT, "the fixture anchor is gone; this test now proves nothing"
    findings = compose_lint.duplicate_service_findings(doubled)
    assert any("'telemetry' is declared 2 times" in finding for finding in findings), findings
    assert not compose_lint.duplicate_service_findings(COMPOSE_TEXT)
