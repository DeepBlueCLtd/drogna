"""Nothing the planner publishes could be mistaken for an order.

Constitution VIII is the principle this component exists under and crossing into tactical
advice is the failure it owns. FR-022 asks for an automated test over both the schema and
emitted payloads against a forbidden-vocabulary list, and SC-010 asks for zero findings; this
is that test, and it is deliberately stricter than a word list alone.

Three checks, in increasing order of how much they actually prove.

**A vocabulary scan** over the master and over emitted payloads. Necessary, and the weakest of
the three: a schema could avoid every word on a list and still carry a free-text field into
which somebody later writes an instruction.

**A structural check** over the master: every string-typed property in the contract is an
enumeration, a constant, a pattern-constrained identifier, or a simulation instant. That is
the guarantee worth having, because it means there is nowhere in this message a sentence
addressed to a person could be written at all. A property that admits arbitrary text would
fail here on the day it was added rather than on the day somebody filled it in.

**A consumer check**: nothing in the repository subscribes to ``ctl/plan`` in order to act on
it. SC-011 counts automatic actions taken on a plan across the system, and the count is zero.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MASTER = REPO_ROOT / "contracts" / "schemas" / "plan.schema.json"
PACKAGE = REPO_ROOT / "services" / "planner" / "src" / "harness_planner"

# Words that would only appear in a message that told somebody to do something. Compared
# against property names and against every string a payload carries, never against prose:
# the schema's descriptions explain what the document is not, and they have to be allowed to
# say the word in order to say it.
INSTRUCTION_WORDS = frozenset(
    {
        "addressee",
        "recipient",
        "assignee",
        "operator",
        "command",
        "commands",
        "order",
        "orders",
        "instruction",
        "instructions",
        "directive",
        "directives",
        "tasking",
        "task",
        "tasks",
        "shall",
        "must",
        "should",
        "priority",
        "urgency",
        "acknowledge",
        "acknowledgement",
        "execute",
        "comply",
        "advise",
        "advice",
        "recommendation_text",
        "message_to",
        "display_text",
        "note",
        "notes",
        "comment",
        "remarks",
    }
)

_WORD = re.compile(r"[a-z]+")


def schema() -> dict[str, Any]:
    return json.loads(MASTER.read_text(encoding="utf-8"))


def canonical() -> dict[str, Any]:
    return json.loads(json.dumps(schema()["examples"][0]))


def property_names(node: Any) -> list[str]:
    """Every property name the document declares, at every level."""
    names: list[str] = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "properties" and isinstance(value, dict):
                names.extend(value)
            names.extend(property_names(value))
    elif isinstance(node, list):
        for item in node:
            names.extend(property_names(item))
    return names


def string_schemas(node: Any, pointer: str = "") -> list[tuple[str, dict[str, Any]]]:
    """Every subschema that admits a string value, with the pointer that reaches it."""
    found: list[tuple[str, dict[str, Any]]] = []
    if isinstance(node, dict):
        declared = node.get("type")
        admits = declared == "string" or (isinstance(declared, list) and "string" in declared)
        if admits:
            found.append((pointer or "/", node))
        for key, value in node.items():
            found.extend(string_schemas(value, f"{pointer}/{key}"))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found.extend(string_schemas(item, f"{pointer}/{index}"))
    return found


def strings_in(node: Any) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [value for item in node.values() for value in strings_in(item)]
    if isinstance(node, list):
        return [value for item in node for value in strings_in(item)]
    return []


def test_no_property_in_the_contract_is_named_like_an_instruction() -> None:
    offending = sorted(
        {
            name
            for name in property_names(schema())
            if INSTRUCTION_WORDS & set(_WORD.findall(name.lower()))
        }
    )

    assert offending == [], (
        f"the plan contract declares {offending}, which could only be part of an instruction; "
        "Constitution VIII makes the harness headless with respect to decisions"
    )


def test_no_string_the_canonical_payload_carries_is_addressed_to_a_person() -> None:
    offending = [
        value
        for value in strings_in(canonical())
        if INSTRUCTION_WORDS & set(_WORD.findall(value.lower()))
    ]

    assert offending == []


@pytest.mark.parametrize("pointer", [pointer for pointer, _ in string_schemas(schema())])
def test_every_string_in_the_contract_is_constrained_to_something_that_is_not_prose(
    pointer: str,
) -> None:
    """The structural guarantee: there is nowhere a sentence could be written.

    A string property is acceptable when it is an enumeration, a constant, or constrained by
    a pattern. Anything else admits arbitrary text, and arbitrary text is where an
    instruction would live.
    """
    subschema = dict(string_schemas(schema()))[pointer]

    constrained = (
        "enum" in subschema or "const" in subschema or "pattern" in subschema or "$ref" in subschema
    )

    assert constrained, (
        f"{pointer} admits an unconstrained string. Every string in this contract is an "
        "enumeration, a constant, an identifier matching a pattern, or a simulation instant, "
        "because that is what makes 'this message contains no instruction' a property of the "
        "document rather than a promise about its authors"
    )


def test_the_message_says_in_its_payload_that_it_is_a_recommendation() -> None:
    """A reader who has only the bytes can tell what kind of message this is."""
    document = schema()

    assert document["properties"]["kind"]["const"] == "sampling-recommendation"
    assert "enum" not in document["properties"]["kind"]


def test_the_planner_publishes_on_the_control_namespace_and_nowhere_else() -> None:
    """FR-013 and Constitution X: no exposed path is added here."""
    published = set()
    for path in PACKAGE.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        published.update(re.findall(r'"(ctl/[a-z-]+)"', text))

    assert published == {"ctl/plan", "ctl/run-published"}, (
        f"the planner names {sorted(published)} on the control namespace; it publishes a "
        "recommendation and its heartbeat, and subscribes to the run announcement"
    )


def test_no_component_subscribes_to_the_plan_in_order_to_act_on_it() -> None:
    """SC-011: the count of automatic actions taken on a plan across the system is zero."""
    consumers = []
    for path in (REPO_ROOT / "services").rglob("*.py"):
        if "harness_planner" in path.parts:
            continue
        if "ctl/plan" in path.read_text(encoding="utf-8"):
            consumers.append(str(path.relative_to(REPO_ROOT)))

    assert consumers == [], (
        f"{consumers} name ctl/plan. Consumers of a recommendation render and record; "
        "a service acting on one would be the harness making a decision (SRD FR-36)"
    )


def test_the_planner_emits_no_display_text() -> None:
    """FR-023: rendering happens downstream, and this component does not describe a picture."""
    document = schema()
    text = json.dumps(document["properties"]) + json.dumps(document["$defs"])

    for forbidden in ("label", "colour", "color", "legend", "caption", "tooltip", "icon"):
        assert f'"{forbidden}"' not in text, (
            f"the plan contract declares {forbidden!r}; the plan is consumed by the client "
            "for rendering, and how it is drawn is that feature's business"
        )
