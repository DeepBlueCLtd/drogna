"""The served configuration is a build artefact, and these are the properties it has.

Three of them are worth stating before the code, because they are why this file is longer
than a rendering test usually is.

**Nothing is invented.** Every location, upstream and file name in the output is built
from a value in the input document. A renderer that could introduce a location could
introduce an exposed one, and no amount of care with the release list would help.

**The refusals happen after the access phase.** `return 404` in a location is executed in
nginx's rewrite phase, before `auth_basic` is ever consulted, so a boundary written that
way tells an uncleared caller 404 for an unreleased path and 401 for a released one — and
the released set is then enumerable by a caller holding nothing. That is FR-006 lost to a
directive that looks harmless. It is asserted here rather than left to a reviewer noticing.

**No directive can alter a response body.** FR-005 and ADR-0001 rest on it: binary access
is what makes path-prefix policy sufficient, and a `sub_filter` in the served file would
mean the boundary had started editing what it forwards.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import pytest

from proxy.render_config import (
    DENY_PROBE_SUFFIX,
    MissingConfigurationValueError,
    UnrenderableValueError,
    render_from_document,
    template_text,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DESTINATIONS = REPOSITORY_ROOT / "config"
TEMPLATES = REPOSITORY_ROOT / "proxy" / "templates"

sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

from check_no_literal_paths import classify  # noqa: E402

DESTINATION_NAMES = sorted(
    entry.name for entry in DESTINATIONS.iterdir() if (entry / "proxy.json").is_file()
)


def load(destination: str) -> dict[str, Any]:
    return json.loads((DESTINATIONS / destination / "proxy.json").read_text(encoding="utf-8"))


def rendered(destination: str = "local") -> str:
    return render_from_document(load(destination))


# --- reading the rendered file ------------------------------------------------------------


def directives(text: str) -> list[str]:
    """The lines that configure something, with the prose stripped out."""
    lines = []
    for line in text.splitlines():
        stripped = line.split("#", 1)[0].strip()
        if stripped:
            lines.append(stripped)
    return lines


def blocks(text: str, opener: str) -> list[str]:
    """The bodies of every block whose header starts with ``opener``, by brace counting."""
    found: list[str] = []
    lines = directives(text)
    for index, line in enumerate(lines):
        if not line.startswith(opener) or not line.endswith("{"):
            continue
        depth = 1
        body: list[str] = []
        for following in lines[index + 1 :]:
            depth += following.count("{") - following.count("}")
            if depth == 0:
                break
            body.append(following)
        found.append("\n".join(body))
    return found


def location_bodies(text: str) -> dict[str, str]:
    """Every location in the rendered file, by the header that introduces it."""
    result: dict[str, str] = {}
    lines = directives(text)
    for index, line in enumerate(lines):
        if not line.startswith("location ") or not line.endswith("{"):
            continue
        header = line[: -len("{")].strip()
        depth = 1
        body: list[str] = []
        for following in lines[index + 1 :]:
            depth += following.count("{") - following.count("}")
            if depth == 0:
                break
            body.append(following)
        result[header] = "\n".join(body)
    return result


def _strings(value: Any) -> list[str]:
    if isinstance(value, dict):
        return [item for entry in value.values() for item in _strings(entry)]
    if isinstance(value, list):
        return [item for entry in value for item in _strings(entry)]
    return [str(value)]


# --- what is emitted ----------------------------------------------------------------------


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_one_pair_of_locations_per_released_collection(destination: str) -> None:
    document = load(destination)
    text = rendered(destination)
    prefix = document["proxy"]["released"]["prefix"]

    for identifier in document["proxy"]["released"]["collections"]:
        assert f"location = {prefix}/{identifier}" in text
        assert f"location ^~ {prefix}/{identifier}/" in text


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_a_collection_absent_from_the_list_has_no_location_at_all(destination: str) -> None:
    """FR-003 is structural: there is nothing in the served file for it to be reached through."""
    document = load(destination)
    prefix = document["proxy"]["released"]["prefix"]
    withheld = list(document["proxy"]["released"]["collections"])
    document["proxy"]["released"]["collections"] = ["kept"]

    text = render_from_document(document)
    configured = "\n".join(directives(text))
    proxied = [header for header, body in location_bodies(text).items() if "proxy_pass" in body]

    assert f"location = {prefix}/kept" in text
    for identifier in withheld:
        assert identifier not in configured
    # The page's surface, where the destination declares one, is the only other thing
    # allowed to proxy: enumerated from the document exactly as the collections are, so a
    # location this list does not predict is still a failure here.
    page = document["proxy"].get("page") or {"paths": [], "prefixes": []}
    assert sorted(proxied) == sorted(
        [
            f"location = {prefix}/kept",
            f"location ^~ {prefix}/kept/",
            f"location = {document['proxy']['control']['upgrade_prefix']}",
            *(f"location = {path}" for path in page["paths"]),
            *(f"location ^~ {entry}/" for entry in page["prefixes"]),
        ]
    )


def test_rendering_is_deterministic() -> None:
    assert rendered() == rendered()


def test_the_order_of_the_release_list_does_not_change_the_output() -> None:
    """A review diff should show what changed, not how a list happened to be typed."""
    document = load("local")
    forwards = dict(document)
    backwards = json.loads(json.dumps(document))
    backwards["proxy"]["released"]["collections"] = list(
        reversed(backwards["proxy"]["released"]["collections"])
    )

    assert render_from_document(forwards) == render_from_document(backwards)


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_nothing_is_invented(destination: str) -> None:
    """Every location, upstream and file name in the output comes from the input document."""
    document = load(destination)
    known = set(_strings(document))
    text = rendered(destination)

    invented = []
    for line in directives(text):
        for token in re.split(r"[\s;'\"]+", line):
            label = classify(token.strip())
            if label is None:
                continue
            if any(token == value or token.startswith(value) for value in known):
                continue
            invented.append(token)

    assert not invented, (
        f"values in the served configuration that no configuration named: {invented}"
    )


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_the_templates_hold_no_location_of_their_own(destination: str) -> None:
    """SC-006, checked with the repository's own literal-path classifier.

    Prose is excluded, because the templates argue for themselves at length and an ADR
    reference or a test file name in a comment is not a deployment location. What is
    checked is every line that configures something.
    """
    for template in sorted(TEMPLATES.glob("*.template")):
        for line in directives(template.read_text(encoding="utf-8")):
            bare = re.sub(r"@\{[a-z0-9_]+\}", "", line)
            for token in re.split(r"[\s;'\"]+", bare):
                assert classify(token.strip()) is None, f"{template.name}: {token!r}"


# --- the properties the boundary depends on -----------------------------------------------


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_a_refusal_never_happens_before_the_credential_is_examined(destination: str) -> None:
    """FR-006, and the reason it is not written as `return 404`.

    `return` runs in nginx's rewrite phase, which is before the access phase where
    `auth_basic` lives. A deny location written that way answers 404 without ever looking
    at the credential, so an uncleared caller learns which paths are released by seeing 401
    on those and 404 on everything else. `try_files` runs in the precontent phase, after
    the access phase, which is what makes the three responses in SC-003 identical.

    The published listener is what this is about. The health listener is a separate server
    with no clearance on it at all, so `return` there is exactly what is wanted.
    """
    text = rendered(destination)
    published, _health = blocks(text, "server")

    for header, body in location_bodies(published).items():
        if "proxy_pass" in body:
            continue
        assert "return" not in body, f"{header} refuses in the rewrite phase, before the clearance"
        assert f"try_files $uri{DENY_PROBE_SUFFIX} =404;" in body, header


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_the_clearance_is_declared_once_at_server_level(destination: str) -> None:
    """A location that forgot it would be a released surface nobody chose to release.

    The clearance is still declared exactly once, at server level. What this test now also
    pins is the single location permitted to step outside it: the control upgrade, which a
    browser cannot reach through HTTP Basic at all, and whose boundary is delegated to the
    broker's own ACL instead. That exemption is PROVISIONAL — see
    docs/agent-sessions/long-run-01/DECISIONS.md and the *proposed* amendment to ADR-0001.

    Written as "one declaration, and one named opt-out" rather than relaxed to a count,
    because the failure this guards against is a location added later that quietly carries
    `auth_basic off` — which is indistinguishable from the released set growing by accident.
    A second opt-out, or an opt-out anywhere but the upgrade, fails here.
    """
    published, _health = blocks(rendered(destination), "server")
    declarations = [
        line
        for line in published.splitlines()
        if line.startswith("auth_basic") and not line.startswith("auth_basic_user_file")
    ]

    document = load(destination)
    realm = document["proxy"]["credentials"]["realm"]
    assert [line for line in declarations if line != "auth_basic off;"] == [
        f'auth_basic "{realm}";'
    ]
    assert declarations.count("auth_basic off;") == 1

    opted_out = [
        header
        for header, body in location_bodies(rendered(destination)).items()
        if "auth_basic off;" in body
    ]
    upgrade_prefix = document["proxy"]["control"]["upgrade_prefix"]
    assert opted_out == [f"location = {upgrade_prefix}"]


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_no_directive_can_alter_a_response_body(destination: str) -> None:
    """FR-005 and ADR-0001. Binary access is what makes path-prefix policy sufficient."""
    configured = "\n".join(directives(rendered(destination)))

    for forbidden in (
        "sub_filter",
        "xslt_stylesheet",
        "image_filter",
        "proxy_intercept_errors",
        "proxy_set_body",
        "echo ",
    ):
        assert forbidden not in configured


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_the_upgrade_location_is_exact_and_reaches_the_broker(destination: str) -> None:
    """ADR-0008. One path, and it is the only way into the control namespace."""
    document = load(destination)
    upgrade = document["proxy"]["control"]["upgrade_prefix"]
    text = rendered(destination)

    assert f"location = {upgrade}" in text
    assert f"location ^~ {upgrade}/" not in text
    body = location_bodies(text)[f"location = {upgrade}"]
    assert "proxy_set_header Upgrade $http_upgrade;" in body
    assert document["proxy"]["upstream"]["control_websocket"]["url"] in body


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_the_health_listener_is_a_second_server_on_its_own_port(destination: str) -> None:
    """A location answering 200 to an uncleared caller is what FR-006 forbids."""
    document = load(destination)
    published, health = blocks(rendered(destination), "server")

    assert f"listen {document['proxy']['health']['port']};" in health
    assert "auth_basic" not in health
    assert str(document["proxy"]["health"]["port"]) not in published


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_every_refusal_is_logged_with_the_rule_that_refused_it(destination: str) -> None:
    """FR-020. A refusal nobody can explain is a refusal somebody loosens policy to explain."""
    text = rendered(destination)
    published, _health = blocks(text, "server")

    assert "rule=$harness_rule" in text
    for header, body in location_bodies(published).items():
        assert "set $harness_rule" in body, header


def test_tls_is_terminated_where_the_destination_says_so() -> None:
    document = load("local")
    document["proxy"]["tls"]["enabled"] = True

    text = render_from_document(document)

    assert "listen 0.0.0.0:8080 ssl;" in text
    assert f"ssl_certificate {document['proxy']['tls']['certificate']};" in text
    assert f"ssl_certificate_key {document['proxy']['tls']['key']};" in text


def test_a_destination_that_terminates_tls_and_names_no_protocol_is_a_render_failure() -> None:
    """The alternative is a listener quietly serving plaintext on the published TLS port."""
    document = load("droplet")
    document["proxy"]["tls"]["protocols"] = []

    with pytest.raises(MissingConfigurationValueError):
        render_from_document(document)


# --- values that would change the grammar --------------------------------------------------


@pytest.mark.parametrize(
    "certificate",
    [
        "/etc/drogna/tls/x.crt; root /etc",
        '/etc/drogna/tls/"x".crt',
        "/etc/drogna/tls/x.crt}\nserver {",
    ],
)
def test_a_value_that_would_end_a_directive_is_refused_not_escaped(certificate: str) -> None:
    document = load("droplet")
    document["proxy"]["tls"]["certificate"] = certificate

    with pytest.raises(UnrenderableValueError):
        render_from_document(document)


def test_the_realm_is_a_quoted_string_because_a_human_reads_it() -> None:
    document = load("local")
    document["proxy"]["credentials"]["realm"] = 'drogna "released" data'

    text = render_from_document(document)

    assert 'auth_basic "drogna \\"released\\" data";' in text


def test_a_missing_key_names_the_key_and_where_it_belongs() -> None:
    document = load("local")
    del document["proxy"]["logs"]["access"]

    with pytest.raises(MissingConfigurationValueError) as refusal:
        render_from_document(document)

    assert refusal.value.placeholder == "access"
    assert "config/<destination>/" in str(refusal.value)


def test_every_placeholder_in_every_template_is_substituted() -> None:
    """A placeholder left in the output is a directive nginx would refuse, discovered late."""
    for destination in DESTINATION_NAMES:
        assert "@{" not in rendered(destination)

    for template in sorted(TEMPLATES.glob("*.template")):
        assert template_text(template.name) == template.read_text(encoding="utf-8")
