"""The topology scan derives what it claims to, and its gate has been seen to fail.

A gate that has never failed is not a gate, and this one guards a document nothing else
would notice going stale: `contracts/topology.json` is read by people and, from feature
018's story 3 onward, drawn by the client. So the planted-phantom case below is not a
formality — it is the acceptance for SC-001, made repeatable so that the observation
recorded in one commit message stays true afterwards.

The trees these tests scan are built in a temporary directory rather than committed as
fixtures. A committed tree of `.py` files under `scripts/tests/fixtures/` would be linted
and formatted with the repository's own source, and a fixture that has to obey the rules of
the thing it is a fixture for is a fixture that will one day be corrected instead of read.
Writing the tree here also puts the access control list, the configurations and the sources
being asserted about in front of the reader of the assertion.
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from scan_topology import (  # noqa: E402
    EXIT_CLEAN,
    EXIT_DRIFT,
    EXIT_FAILURE,
    ScanError,
    build,
    main,
    normalise,
    parse_acl,
    permits,
    render,
    resolve_schema,
    topic_matches,
)

# A tree in miniature: two roles, one of which is refused the control namespace outright,
# two components, a shared library, and one master. Small enough to hold in the head and
# complete enough that every derivation rule has something to bite on.
ACL = """\
# A comment, which is a whole line and never a suffix — `obs/#` below would lose its
# wildcard to a scanner that thought otherwise.
user probe_sensor
topic write obs/#
topic write ctl/heartbeat
topic read ctl/clock

user probe_control
topic readwrite ctl/#
topic read obs/#
"""

SENSOR_CONFIG = {
    "component": {"id": "widget"},
    "broker": {"url": "mqtt://probe_sensor@broker:1883", "client_id": "widget"},
}
CONTROL_CONFIG = {
    "component": {"id": "warden"},
    "broker": {"url": "mqtt://probe_control@broker:1883", "client_id": "warden"},
}

SENSOR_SOURCE = '''\
"""obs/<thing-id>/<datastream-id>, and no other shape.

A docstring that begins with a topic, which is the only way prose can be mistaken for a
declaration: the scan matches a string that *starts* with a namespace, so a sentence
merely mentioning one was never a candidate and a rule tested against one would be
testing nothing.
"""

OBSERVATION_BRANCH = "obs/"
'''

CONTROL_SOURCE = '''\
"""The other one."""

DIVERGENCE_TOPIC = "ctl/divergence"


def describe() -> str:
    """ctl/divergence is what this one carries — prose again, in a function this time."""
    return DIVERGENCE_TOPIC
'''

SHARED_SOURCE = '''\
"""A library, which is not a component."""

HEARTBEAT_TOPIC = "ctl/heartbeat"
'''

OBSERVATION_MASTER = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/observation.schema.json",
    "title": "probe observation",
    "type": "object",
}


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """A miniature repository with the four sources the scan reads."""
    write(tmp_path / "deploy" / "broker" / "acl", ACL)
    for destination in ("here", "there"):
        write(
            tmp_path / "config" / destination / "widget.json",
            json.dumps(SENSOR_CONFIG),
        )
        write(
            tmp_path / "config" / destination / "warden.json",
            json.dumps(CONTROL_CONFIG),
        )
    write(tmp_path / "services" / "widget" / "publisher.py", SENSOR_SOURCE)
    write(tmp_path / "services" / "warden" / "service.py", CONTROL_SOURCE)
    write(tmp_path / "libs" / "harness_core" / "heartbeat.py", SHARED_SOURCE)
    write(
        tmp_path / "contracts" / "schemas" / "observation.schema.json",
        json.dumps(OBSERVATION_MASTER),
    )
    return tmp_path


def topic(document: dict, name: str) -> dict:
    for entry in document["topics"]:
        if entry["topic"] == name:
            return entry
    raise AssertionError(f"no topic {name!r} in {[e['topic'] for e in document['topics']]}")


# -- the access control list ----------------------------------------------------------


def test_a_comment_is_a_whole_line_and_never_a_suffix() -> None:
    """`obs/#` truncated to `obs/` would understate the boundary, which is the one
    direction the artefact must never err in."""
    roles = parse_acl(ACL)

    assert roles[0]["rules"][0] == {"access": "write", "filter": "obs/#"}


def test_a_rule_without_an_access_word_is_readwrite() -> None:
    """Mosquitto's default. Read as narrower, the artefact would omit a granted direction."""
    roles = parse_acl("user probe\ntopic ctl/thing\n")

    assert roles[0]["rules"] == [{"access": "readwrite", "filter": "ctl/thing"}]


@pytest.mark.parametrize(
    "directive",
    ["pattern read ctl/%u", "topic read ctl/thing", "acl_file /somewhere"],
)
def test_an_unhandled_directive_stops_the_scan(directive: str) -> None:
    """A directive quietly ignored is a permission the artefact does not show."""
    with pytest.raises(ScanError):
        parse_acl(directive + "\n")


@pytest.mark.parametrize(
    ("filter_", "subject", "expected"),
    [
        ("ctl/#", "ctl/divergence", True),
        ("ctl/#", "obs/thing/stream", False),
        ("obs/#", "obs/#", True),
        ("obs/+/pressure", "obs/platform/pressure", True),
        ("obs/+/pressure", "obs/platform/depth/pressure", False),
        ("ctl/clock", "ctl/clocks", False),
        ("ctl/telemetry", "ctl/telemetry/ingest", False),
    ],
)
def test_filter_matching(filter_: str, subject: str, expected: bool) -> None:
    assert topic_matches(filter_, subject) is expected


def test_absence_is_refusal() -> None:
    """Mosquitto denies by default, so a rule that is not there is a no, not a maybe."""
    rules = parse_acl(ACL)[0]["rules"]

    assert permits(rules, "obs/thing/stream", "publish")
    assert not permits(rules, "ctl/divergence", "publish")
    assert not permits(rules, "ctl/divergence", "subscribe")


# -- the components ---------------------------------------------------------------------


def test_destinations_must_agree_about_a_component_role(tree: Path) -> None:
    """One of the two configurations is wrong, and the scan will not choose between them."""
    other = json.loads((tree / "config" / "there" / "warden.json").read_text())
    other["broker"]["url"] = "mqtt://probe_sensor@broker:1883"
    (tree / "config" / "there" / "warden.json").write_text(json.dumps(other))

    with pytest.raises(ScanError, match="different role at different destinations"):
        build(tree)


def test_a_component_source_root_is_found_or_stated_absent(tree: Path) -> None:
    document, findings = build(tree)

    assert not findings
    roots = {entry["id"]: entry["source_root"] for entry in document["components"]}
    assert roots == {"widget": "services/widget", "warden": "services/warden"}


# -- the topics -------------------------------------------------------------------------


def test_a_branch_prefix_and_a_branch_filter_are_one_topic() -> None:
    assert normalise("obs/") == "obs/#"
    assert normalise("obs/#") == "obs/#"
    assert normalise("ctl/divergence") == "ctl/divergence"


def test_a_topic_named_in_a_docstring_declares_nothing(tree: Path) -> None:
    """Two docstrings open with a topic — one module, one function — and neither declares.

    Both would otherwise be reported: a docstring binds no name, so the completeness rule
    would call each one a topic written where the scan cannot see it, and the module one
    would put the observation branch's declaration in the wrong file as well.
    """
    document, findings = build(tree)

    assert findings == []
    assert [site["path"] for site in topic(document, "ctl/divergence")["named_by"]] == [
        "services/warden/service.py"
    ]
    assert [site["path"] for site in topic(document, "obs/#")["named_by"]] == [
        "services/widget/publisher.py"
    ]


def test_permissions_come_from_the_access_control_list(tree: Path) -> None:
    document, _ = build(tree)

    observations = topic(document, "obs/#")
    assert observations["publishers"] == ["widget"]
    assert observations["subscribers"] == ["warden"]

    divergence = topic(document, "ctl/divergence")
    assert divergence["publishers"] == ["warden"]
    assert divergence["subscribers"] == ["warden"]


def test_a_shared_library_site_names_no_component(tree: Path) -> None:
    """A library publishes on behalf of whoever calls it, and the scan will not guess who."""
    document, _ = build(tree)

    sites = topic(document, "ctl/heartbeat")["named_by"]
    assert [site["component"] for site in sites] == [None]
    assert sites[0]["path"] == "libs/harness_core/heartbeat.py"
    assert sites[0]["constant"] == "HEARTBEAT_TOPIC"


def test_a_granted_topic_nothing_names_is_still_a_topic(tree: Path) -> None:
    """ctl/clock is granted to the sensor role and named by no source in this tree."""
    document, _ = build(tree)

    assert topic(document, "ctl/clock")["named_by"] == []


def test_the_schema_is_resolved_by_the_naming_convention(tree: Path) -> None:
    document, _ = build(tree)

    assert topic(document, "obs/#")["schema"] == "contracts/schemas/observation.schema.json"
    assert topic(document, "ctl/heartbeat")["schema"] is None


def test_an_alias_that_stops_resolving_is_loud(tmp_path: Path) -> None:
    """A null nobody reads is the failure; the alias is stated, so it must resolve."""
    (tmp_path / "contracts" / "schemas").mkdir(parents=True)

    with pytest.raises(ScanError, match="alias"):
        resolve_schema(tmp_path, "obs/#")


def test_a_topic_the_scan_cannot_bind_a_name_to_is_a_finding(tree: Path) -> None:
    """An artefact that cannot see a topic is worse than none: it reads as complete."""
    source = tree / "services" / "warden" / "service.py"
    source.write_text(source.read_text() + '\n\ndef send(client):\n    client.publish("ctl/sly")\n')

    _, findings = build(tree)

    assert any("ctl/sly" in finding for finding in findings)


def test_an_exemption_with_a_reason_is_honoured(tree: Path) -> None:
    source = tree / "services" / "warden" / "service.py"
    source.write_text(
        source.read_text()
        + "\n\ndef send(client):\n"
        + "    # harness:allow-topology-scan a probe of the marker, not a real topic\n"
        + '    client.publish("ctl/sly")\n'
    )

    _, findings = build(tree)

    assert findings == []


def test_an_exemption_without_a_reason_exempts_nothing(tree: Path) -> None:
    source = tree / "services" / "warden" / "service.py"
    source.write_text(
        source.read_text()
        + "\n\ndef send(client):\n"
        + "    # harness:allow-topology-scan\n"
        + '    client.publish("ctl/sly")\n'
    )

    _, findings = build(tree)

    assert any("carries no reason" in finding for finding in findings)


# -- the gate, watched failing ----------------------------------------------------------


def run(argv: list[str]) -> tuple[int, str]:
    stream = io.StringIO()
    code = main(argv, stream=stream)
    return code, stream.getvalue()


def test_the_gate_passes_an_artefact_that_matches_the_tree(tree: Path) -> None:
    assert run(["--root", str(tree)])[0] == EXIT_CLEAN
    assert run(["--root", str(tree), "--check"])[0] == EXIT_CLEAN


def test_the_gate_reports_a_planted_phantom_topic(tree: Path) -> None:
    """SC-001, made repeatable. Plant, watch it fail naming the topic, regenerate, watch it
    pass, revert, watch it fail the other way."""
    assert run(["--root", str(tree)])[0] == EXIT_CLEAN
    source = tree / "services" / "warden" / "service.py"
    original = source.read_text()

    source.write_text(original + '\nPHANTOM_TOPIC = "ctl/phantom"\n')
    code, output = run(["--root", str(tree), "--check"])
    assert code == EXIT_DRIFT
    assert "ctl/phantom" in output
    assert "PHANTOM_TOPIC" in output

    assert run(["--root", str(tree)])[0] == EXIT_CLEAN
    assert run(["--root", str(tree), "--check"])[0] == EXIT_CLEAN

    source.write_text(original)
    code, output = run(["--root", str(tree), "--check"])
    assert code == EXIT_DRIFT
    assert "ctl/phantom" in output


def test_the_gate_reports_a_hand_edited_artefact(tree: Path) -> None:
    """The other way a generated document goes wrong, and the one nothing else would see."""
    assert run(["--root", str(tree)])[0] == EXIT_CLEAN
    artefact = tree / "contracts" / "topology.json"
    document = json.loads(artefact.read_text())
    topic(document, "obs/#")["publishers"].append("warden")
    artefact.write_text(render(document))

    code, output = run(["--root", str(tree), "--check"])

    assert code == EXIT_DRIFT
    assert "warden" in output


def test_the_gate_says_so_when_there_is_no_artefact_at_all(tree: Path) -> None:
    """An absent artefact must not read as a clean run."""
    code, output = run(["--root", str(tree), "--check"])

    assert code == EXIT_DRIFT
    assert "there is no" in output


def test_a_finding_stops_the_gate_before_it_compares_anything(tree: Path) -> None:
    assert run(["--root", str(tree)])[0] == EXIT_CLEAN
    source = tree / "services" / "warden" / "service.py"
    source.write_text(source.read_text() + '\n\ndef send(client):\n    client.publish("ctl/sly")\n')

    code, output = run(["--root", str(tree), "--check"])

    assert code == EXIT_FAILURE
    assert "not a module-level constant" in output
