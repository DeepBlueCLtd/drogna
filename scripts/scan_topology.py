#!/usr/bin/env python3
"""Derive the broker topology from the tree, and write it to ``contracts/topology.json``.

Feature 018 story 2. The pub/sub topology used to be four lines of prose in
``docs/architecture/repo-layout.md`` — a hand-kept list of control topics that nothing
checked and that the feature adding a topic was asked to remember to extend. This
repository has already paid for one unmaintained record; a second one describing who may
talk to whom is not a risk worth carrying, and a drawing built on it would be a
``tasks.md`` with a legend.

So the topology is derived. Four sources, each already tracked and each already the thing
something else depends on:

``deploy/broker/acl``
    Which role may read and write which topic filter. Mosquitto enforces this file, so it
    is not a description of the boundary — it *is* the boundary, and
    ``tests/integration/test_topic_isolation.py`` already asserts its refusals against a
    running broker.

``config/<destination>/*.json``
    Which role each component authenticates as, from the user name in its broker URL.
    Every destination is read and they are required to agree; a disagreement stops the
    scan rather than being resolved silently in favour of one.

component source
    Which topics the tree actually names, with the file, line and constant. Module-level
    string constants, found by parsing rather than by grepping, so a topic quoted in a
    docstring is prose and not a declaration.

``contracts/schemas/``
    Which master governs a topic, by the naming convention the repository layout states:
    ``contracts/schemas/<topic-noun>.schema.json``.

**Two layers, and they are not the same thing.** ``publishers`` and ``subscribers`` are
permissions. They are complete, because the access control list is complete, and they are
coarse where it is coarse: ``drogna_control`` carries ``readwrite ctl/#``, so nine
components may publish a run request even though only one does. The narrowing that
sentence describes is not enforced at the broker and this document must not pretend it is.
What records it is ``named_by``, the places in the tree that name the topic. A reader
wanting "who sends this" reads the second; a reader wanting "who could" reads the first.

**Nothing here is a claim about a running system.** No component is asserted to exist, to
be alive, or ever to have sent anything (Constitution VII). The matrix feature 018's story
3 draws takes its structure from this document and its illumination from received traffic,
and the two are never the same source.

Run it two ways::

    uv run python scripts/scan_topology.py            # rewrite contracts/topology.json
    uv run python scripts/check_topology_drift.py     # scan to memory, diff, fail on drift

Neither reaches the network, starts a service, or needs a broker; the check mode writes
nothing whatever it finds. That is what lets the gate run in the same job as every other.
"""

from __future__ import annotations

import argparse
import ast
import difflib
import json
import re
import sys
from collections.abc import Iterator, Mapping, Sequence
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gate_lib import REPO_ROOT, exempted, is_excluded, is_test_path, marker_index, read_text

GATE = "topology-scan"

ACL_FILE = Path("deploy") / "broker" / "acl"
CONFIG_DIRECTORY = Path("config")
SCHEMA_DIRECTORY = Path("contracts") / "schemas"
ARTEFACT = Path("contracts") / "topology.json"
SHARED_SOURCE_ROOTS = (Path("libs") / "harness_core",)
GENERATOR = "scripts/scan_topology.py"

SCHEMA_SUFFIX = ".schema.json"
NAMESPACES = ("obs", "ctl")

EXIT_CLEAN = 0
EXIT_DRIFT = 1
EXIT_FAILURE = 2

# A string that names a topic rather than merely beginning with one of the two words. The
# trailing separator is what makes it a topic: `obs` on its own is the namespace, and it
# appears in three components as the first element of a topic being built, which is not a
# declaration of anything.
TOPIC_PATTERN = re.compile(r"^(?:{})/".format("|".join(NAMESPACES)))

# `export const NAME = "ctl/thing";` or the same without `export`, at the left margin. The
# client declares its topics exactly this way and nothing else in it does, so the rule is
# narrow on purpose: a wider one would collect the labels the layout module writes for
# display, which are prose about topics rather than a component's declaration of one.
TYPESCRIPT_DECLARATION = re.compile(
    r"^(?:export\s+)?const\s+(?P<name>[A-Za-z_$][\w$]*)"
    r'(?:\s*:\s*[^=]+?)?\s*=\s*"(?P<topic>[^"]+)"\s*;?\s*$'
)

# The one alias, and the argument for it. Eight topics resolve to a master by the naming
# convention; the observation branch does not, because ADR-0005 named the shape
# `observation` and the repository layout named the branch `obs`. The alias is stated here
# rather than inferred, and `resolve_schema` fails if what it names is absent, so an alias
# that stopped resolving is loud rather than quietly producing a null.
SCHEMA_ALIASES: Mapping[str, str] = {"obs": "observation"}


class ScanError(Exception):
    """Something the scan will not proceed past, stated in one readable line."""


# ---------------------------------------------------------------------------------
# The access control list
# ---------------------------------------------------------------------------------


def parse_acl(text: str) -> list[dict[str, Any]]:
    """Read ``deploy/broker/acl`` into roles and their rules, in the file's own order.

    Only the two directives the file uses are understood. Anything else stops the scan:
    an access control directive this function silently ignored would be a permission the
    artefact does not show, which is the failure mode the whole document exists to close.
    """
    roles: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for number, raw in enumerate(text.splitlines(), start=1):
        # A comment is a line that begins with `#`, and only that. Mosquitto has no
        # trailing-comment syntax, and treating one as though it had would truncate
        # `obs/#` to `obs/` — a filter that grants one topic where the file grants a
        # branch. That is not a cosmetic difference: it is the artefact understating the
        # boundary, which is the one direction it must never err in.
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        words = line.split()
        directive = words[0]
        if directive == "user":
            if len(words) != 2:
                raise ScanError(f"{ACL_FILE}:{number}: a user directive names one role")
            current = {"role": words[1], "rules": []}
            roles.append(current)
        elif directive == "topic":
            if current is None:
                raise ScanError(
                    f"{ACL_FILE}:{number}: a topic rule before any user directive applies "
                    "to anonymous clients, which this broker refuses; the scan will not "
                    "guess what it means"
                )
            rest = words[1:]
            # Mosquitto's default access when a rule states none is readwrite. Spelled out
            # rather than left implicit, because a rule read as narrower than the broker
            # applies it would understate the boundary.
            access = "readwrite"
            if rest and rest[0] in {"read", "write", "readwrite", "deny"}:
                access, rest = rest[0], rest[1:]
            if access == "deny":
                raise ScanError(
                    f"{ACL_FILE}:{number}: a deny rule changes how every other rule is "
                    "read; the scan will not model it until one exists"
                )
            if len(rest) != 1:
                raise ScanError(f"{ACL_FILE}:{number}: a topic rule names one filter")
            current["rules"].append({"access": access, "filter": rest[0]})
        else:
            raise ScanError(
                f"{ACL_FILE}:{number}: unhandled access control directive {directive!r}; "
                "add it here rather than letting the artefact omit what it grants"
            )
    if not roles:
        raise ScanError(f"{ACL_FILE} declares no role; an empty scan is not a clean one")
    return roles


def topic_matches(filter_: str, topic: str) -> bool:
    """MQTT filter matching: ``+`` covers one level, ``#`` covers the rest."""
    filter_parts = filter_.split("/")
    topic_parts = topic.split("/")
    for index, part in enumerate(filter_parts):
        if part == "#":
            return True
        if index >= len(topic_parts):
            return False
        if part != "+" and part != topic_parts[index]:
            return False
    return len(filter_parts) == len(topic_parts)


def permits(rules: Sequence[Mapping[str, str]], topic: str, direction: str) -> bool:
    """Whether these rules permit ``direction`` on ``topic``. Absence is refusal."""
    wanted = {"publish": {"write", "readwrite"}, "subscribe": {"read", "readwrite"}}[direction]
    return any(rule["access"] in wanted and topic_matches(rule["filter"], topic) for rule in rules)


# ---------------------------------------------------------------------------------
# Components and the role each authenticates as
# ---------------------------------------------------------------------------------


def _source_root(root: Path, component: str) -> str | None:
    """The directory holding a component's own source, or ``None`` if it has none."""
    for candidate in (Path("services") / component, Path(component)):
        if (root / candidate).is_dir():
            return candidate.as_posix()
    return None


def read_components(root: Path) -> list[dict[str, Any]]:
    """Component id to broker role, read from every destination and required to agree."""
    destinations = sorted(entry for entry in (root / CONFIG_DIRECTORY).iterdir() if entry.is_dir())
    if not destinations:
        raise ScanError(f"no destination under {CONFIG_DIRECTORY}; there is nothing to read")

    seen: dict[str, dict[str, str]] = {}
    for destination in destinations:
        for path in sorted(destination.glob("*.json")):
            document = json.loads(read_text(path))
            broker = document.get("broker")
            if not isinstance(broker, Mapping) or "url" not in broker:
                continue
            role = urlparse(str(broker["url"])).username
            if not role:
                raise ScanError(
                    f"{path.relative_to(root)}: the broker url names no role; the role is "
                    "the identity the broker authenticates and the artefact reports"
                )
            component = document.get("component", {}).get("id") or path.stem
            previous = seen.setdefault(component, {})
            previous[destination.name] = role

    components: list[dict[str, Any]] = []
    for component, by_destination in sorted(seen.items()):
        roles = set(by_destination.values())
        if len(roles) != 1:
            stated = ", ".join(f"{name}={role}" for name, role in sorted(by_destination.items()))
            raise ScanError(
                f"{component} authenticates as a different role at different destinations "
                f"({stated}); one of the two configurations is wrong and the scan will not "
                "choose"
            )
        components.append(
            {
                "id": component,
                "role": roles.pop(),
                "source_root": _source_root(root, component),
            }
        )
    return components


# ---------------------------------------------------------------------------------
# The topics the tree names
# ---------------------------------------------------------------------------------


def normalise(topic: str) -> str:
    """A branch prefix and a branch filter are the same branch, spelled as the filter.

    The monitor and the planner name ``obs/`` because they compare a prefix; the ingest
    client names ``obs/#`` because it subscribes to a filter. Both mean the observation
    branch, and an artefact that listed them as two topics would draw two rows for one.
    """
    if topic.endswith("/"):
        return topic + "#"
    return topic


def _module_level_literals(tree: ast.Module) -> dict[int, str]:
    """Constant nodes bound by a module-level assignment, mapped to the name they bind."""
    bound: dict[int, str] = {}
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Constant):
            names = [target.id for target in statement.targets if isinstance(target, ast.Name)]
            if names:
                bound[id(statement.value)] = names[0]
        elif (
            isinstance(statement, ast.AnnAssign)
            and statement.value is not None
            and isinstance(statement.value, ast.Constant)
            and isinstance(statement.target, ast.Name)
        ):
            bound[id(statement.value)] = statement.target.id
    return bound


def _docstrings(tree: ast.Module) -> set[int]:
    """Constant nodes that are docstrings. A topic named in prose declares nothing."""
    identifiers: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        body = getattr(node, "body", [])
        if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
            identifiers.add(id(body[0].value))
    return identifiers


def _python_sites(
    root: Path, path: Path, component: str | None, findings: list[str]
) -> Iterator[dict[str, Any]]:
    text = read_text(path)
    try:
        tree = ast.parse(text)
    except SyntaxError as error:
        raise ScanError(f"{path.relative_to(root)}: cannot be parsed: {error}") from error

    bound = _module_level_literals(tree)
    prose = _docstrings(tree)
    index = marker_index(path, text)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        if id(node) in prose or not TOPIC_PATTERN.match(node.value):
            continue
        name = bound.get(id(node))
        if name is None:
            # The completeness rule. A topic written straight into a call, a list or a
            # default argument is a topic this scan would not see, and an artefact that
            # cannot see a topic is worse than none: it reads as a complete list. The
            # tree obeys this today — every one of its topic literals is a module-level
            # constant — so the rule costs nothing and closes the hole.
            allowed, marker = exempted(index, node.lineno, GATE)
            if allowed:
                continue
            reason = (
                "exemption marker carries no reason, so it exempts nothing"
                if marker is not None
                else "bind it to a module-level constant so the topology scan can see it"
            )
            findings.append(
                f"{path.relative_to(root)}:{node.lineno}: topic {node.value!r} is not a "
                f"module-level constant — {reason}"
            )
            continue
        yield {
            "component": component,
            "path": path.relative_to(root).as_posix(),
            "line": node.lineno,
            "constant": name,
        }


def _typescript_sites(root: Path, path: Path, component: str | None) -> Iterator[dict[str, Any]]:
    for number, line in enumerate(read_text(path).splitlines(), start=1):
        match = TYPESCRIPT_DECLARATION.match(line)
        if match is None or not TOPIC_PATTERN.match(match.group("topic")):
            continue
        yield {
            "component": component,
            "path": path.relative_to(root).as_posix(),
            "line": number,
            "constant": match.group("name"),
        }


def _walk(root: Path, source_root: Path) -> Iterator[Path]:
    for path in sorted((root / source_root).rglob("*")):
        if not path.is_file() or path.suffix not in {".py", ".ts", ".tsx"}:
            continue
        if is_excluded(path, GATE, root) or is_test_path(path.relative_to(root)):
            continue
        yield path


def scan_sources(
    root: Path, components: Sequence[Mapping[str, Any]], findings: list[str]
) -> dict[str, list[dict[str, Any]]]:
    """Every place in the tree that names a topic, grouped by the normalised topic.

    A shared library is walked with no component. ``harness_core`` names ``ctl/clock`` and
    ``ctl/heartbeat``, and it is a library rather than a component: whoever calls
    ``HeartbeatPublisher`` publishes a heartbeat. Attributing those sites to a guessed set
    of components — by import graph, or by chasing the symbol through its default argument
    — would produce a plausible list that nothing checks, and a plausible unchecked list is
    exactly what this artefact exists to abolish. The question of who may use a shared
    topic is answered by the permission layer, which is enforced.
    """
    targets: list[tuple[str | None, Path]] = [
        (str(component["id"]), Path(str(component["source_root"])))
        for component in components
        if component["source_root"] is not None
    ]
    targets.extend((None, shared) for shared in SHARED_SOURCE_ROOTS)

    sites: dict[str, list[dict[str, Any]]] = {}
    for component, source_root in targets:
        for path in _walk(root, source_root):
            if path.suffix == ".py":
                found = _python_sites(root, path, component, findings)
            else:
                found = _typescript_sites(root, path, component)
            for site in found:
                topic = normalise(_topic_of(root, site))
                sites.setdefault(topic, []).append(site)
    return sites


def _topic_of(root: Path, site: Mapping[str, Any]) -> str:
    """Re-read the literal at a recorded site, so the site and the topic cannot disagree."""
    line = read_text(root / str(site["path"])).splitlines()[int(site["line"]) - 1]
    match = re.search(r"""(['"])((?:obs|ctl)/[^'"]*)\1""", line)
    if match is None:  # pragma: no cover - the site was found by reading this line
        raise ScanError(f"{site['path']}:{site['line']}: the topic is no longer on this line")
    return match.group(2)


# ---------------------------------------------------------------------------------
# The governing master
# ---------------------------------------------------------------------------------


def resolve_schema(root: Path, topic: str) -> str | None:
    """The master governing a topic, by the repository layout's naming convention."""
    parts = topic.split("/")
    noun = parts[0] if len(parts) == 2 and parts[1] == "#" else parts[-1]
    alias = SCHEMA_ALIASES.get(noun)
    candidate = SCHEMA_DIRECTORY / f"{alias or noun}{SCHEMA_SUFFIX}"
    if (root / candidate).is_file():
        return candidate.as_posix()
    if alias is not None:
        raise ScanError(
            f"the alias {noun!r} -> {alias!r} names {candidate}, which does not exist; "
            "an alias that has stopped resolving must be corrected, not left to produce a "
            "null nobody reads"
        )
    return None


# ---------------------------------------------------------------------------------
# The document
# ---------------------------------------------------------------------------------


def build(root: Path = REPO_ROOT) -> tuple[dict[str, Any], list[str]]:
    """Scan the tree. Returns the document and any findings that stop it being written."""
    findings: list[str] = []
    roles = parse_acl(read_text(root / ACL_FILE))
    components = read_components(root)
    sites = scan_sources(root, components, findings)

    rules_by_role = {str(role["role"]): role["rules"] for role in roles}
    for component in components:
        if component["role"] not in rules_by_role:
            findings.append(
                f"{component['id']} authenticates as {component['role']}, which "
                f"{ACL_FILE} grants nothing; mosquitto denies by default, so this "
                "component can do nothing at all once it has connected"
            )

    named = set(sites)
    # A wildcard-free filter in the access control list is a topic somebody meant, whether
    # or not any source names it yet. Including it is what lets the artefact show a topic
    # that is granted and unused, which is a fact worth seeing rather than an omission.
    declared = {
        rule["filter"]
        for role in roles
        for rule in role["rules"]
        if "#" not in rule["filter"] and "+" not in rule["filter"]
    }
    topics: list[dict[str, Any]] = []
    for topic in sorted(named | declared):
        namespace = topic.split("/")[0]
        if namespace not in NAMESPACES:
            findings.append(
                f"{topic!r} is in neither namespace; obs/ and ctl/ are the two the "
                "repository layout fixes and the access control list enforces"
            )
            continue
        topics.append(
            {
                "topic": topic,
                "namespace": namespace,
                "schema": resolve_schema(root, topic),
                "publishers": sorted(
                    str(component["id"])
                    for component in components
                    if permits(rules_by_role.get(str(component["role"]), ()), topic, "publish")
                ),
                "subscribers": sorted(
                    str(component["id"])
                    for component in components
                    if permits(rules_by_role.get(str(component["role"]), ()), topic, "subscribe")
                ),
                "named_by": sorted(
                    sites.get(topic, []),
                    key=lambda site: (str(site["path"]), int(site["line"])),
                ),
            }
        )

    document = {
        "generator": GENERATOR,
        "roles": roles,
        "components": components,
        "topics": topics,
    }
    return document, findings


def render(document: Mapping[str, Any]) -> str:
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def _report(findings: Sequence[str], out: Any) -> None:
    for finding in findings:
        print(f"topology: {finding}", file=out)


def main(argv: Sequence[str] | None = None, *, stream: Any = None) -> int:
    parser = argparse.ArgumentParser(description="derive the broker topology from the tree")
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare a fresh scan with the committed artefact and write nothing",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=REPO_ROOT,
        # The scan is a pure function of a tree, so it can be pointed at a tree other than
        # this one. That is how its own tests give it a phantom topic to find without
        # planting one in a component anybody depends on — the same reason the gate runner
        # takes a --registry.
        help="the tree to scan; this repository by default",
    )
    arguments = parser.parse_args(argv)
    out = stream or sys.stdout
    root = arguments.root.resolve()

    try:
        document, findings = build(root)
    except ScanError as error:
        print(f"topology: {error}", file=out)
        return EXIT_FAILURE

    if findings:
        _report(findings, out)
        print(
            f"topology: {len(findings)} finding(s); the artefact was not "
            f"{'checked' if arguments.check else 'written'}.",
            file=out,
        )
        return EXIT_FAILURE

    fresh = render(document)
    target = root / ARTEFACT

    if not arguments.check:
        target.write_bytes(fresh.encode("utf-8"))
        print(f"topology: wrote {ARTEFACT} — {len(document['topics'])} topic(s).", file=out)
        return EXIT_CLEAN

    if not target.is_file():
        print(
            f"topology: there is no {ARTEFACT}. Run `uv run python {GENERATOR}` and commit "
            "what it writes.",
            file=out,
        )
        return EXIT_DRIFT

    committed = read_text(target)
    if committed == fresh:
        print(
            f"topology: {ARTEFACT} matches the tree — {len(document['topics'])} topic(s).",
            file=out,
        )
        return EXIT_CLEAN

    diff = difflib.unified_diff(
        committed.splitlines(keepends=True),
        fresh.splitlines(keepends=True),
        fromfile=f"{ARTEFACT} (committed)",
        tofile=f"{ARTEFACT} (a fresh scan of the tree)",
    )
    out.writelines(diff)
    print(
        f"\ntopology: {ARTEFACT} disagrees with the tree. The tree is the authority: run "
        f"`uv run python {GENERATOR}` and commit what it writes.",
        file=out,
    )
    return EXIT_DRIFT


if __name__ == "__main__":
    raise SystemExit(main())
