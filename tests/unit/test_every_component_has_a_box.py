"""A component that publishes a heartbeat and has no box can never be seen.

The client draws eighteen boxes and lights one when a heartbeat naming it arrives. The name
it matches on is the box's own id, and the name the heartbeat carries is the component's
`/component/id` — `contracts/schemas/heartbeat.schema.json` says so in as many words. Those
two names are written in different trees, in different languages, by different features, and
nothing until now compared them.

They disagreed. C-09's box was `query_layer` and its heartbeat says `query`, so the message
arrived, was understood, and matched nothing: the client listed it under the components it
had heard from and could not place, and drew the box dark. The display whose whole purpose is
that a box is lit only when something was genuinely heard from was reporting the opposite,
and had been for as long as the box existed — invisibly, because C-09 published no heartbeat
at all until feature 008's T064 finally constructed one. The bug and the thing that would
have revealed it landed years apart.

So this is the comparison, made once, in the direction that catches it: every component with
source in this repository — which is every component that can publish a heartbeat — must have
a box under exactly its own id. The reverse direction is deliberately not asserted, because
the client legitimately draws five things that are not drogna processes: the broker, the
proxy and the three stores.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TOPOLOGY = REPOSITORY_ROOT / "contracts" / "topology.json"
COMPONENTS = REPOSITORY_ROOT / "client" / "src" / "layout" / "components.ts"

_BOX_ID = re.compile(r'^\s*id:\s*"([a-z_]+)",\s*$', re.MULTILINE)


def _box_ids() -> set[str]:
    return set(_BOX_ID.findall(COMPONENTS.read_text(encoding="utf-8")))


def _component_ids() -> set[str]:
    document = json.loads(TOPOLOGY.read_text(encoding="utf-8"))
    return {component["id"] for component in document["components"]}


def test_the_regex_finds_the_boxes_at_all() -> None:
    """A search that matched nothing would pass the assertion below for the wrong reason.

    The count is not asserted: the drawing gains boxes as the SRD gains components, and a
    test that has to be edited for each one is a test that gets edited without being read.
    What is asserted is that the search found things only this file could have supplied —
    the broker and the coverage store are drawn here and appear in no topology, so finding
    them proves the regex parsed the drawing rather than echoing the list it is compared to.
    """
    found = _box_ids()
    assert {"broker", "coverage_store", "proxy"} <= found, (
        f"the search did not find the plumbing boxes, so it is not reading the drawing: "
        f"{sorted(found)}"
    )


def test_every_component_that_can_heartbeat_has_a_box_under_its_own_id() -> None:
    missing = sorted(_component_ids() - _box_ids())
    assert not missing, (
        f"{missing} publish a heartbeat under an id the client draws no box for. Each one "
        "will be heard from, understood, and drawn dark"
    )
