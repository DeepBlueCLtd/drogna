# Implementation Plan: Read-Path Boundaries and the Topology Contract

**Branch**: `018-read-path-boundaries` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-read-path-boundaries/spec.md`

## Summary

The specification carries four stories. **This plan covers Story 2 and nothing else**:
the pub/sub topology becomes a generated artefact, derived from the tree's own sources by
a scanner, typed in both languages by the established chain, and held current by a drift
gate registered alongside the existing fourteen. The hand-kept topic list in
`docs/architecture/repo-layout.md` stops being the authority and points at the artefact.

Stories 1, 3 and 4 are client work. Story 3 renders this artefact as a matrix, Story 1
draws the read path, Story 4 adds the badges, the per-edge history and the re-ask. All
three follow feature 017's map surface, which owns the client shell integration point they
would arrive through, and the delivery plan places them in wave 7 for that reason. They
are not started here, and `tasks.md` says so against each one rather than leaving the
absence to be read as an oversight.

The substance of Story 2 is one question: **what in this repository is authoritative about
who may say what to whom?** The answer is not a document. It is `deploy/broker/acl`, which
mosquitto actually enforces, joined to `config/<destination>/*.json`, which is where a
component's broker role is written down and is the identity the broker authenticates. The
scanner reads those two, and then reads the components' own source for the topics they
name. The artefact records both layers without conflating them: what the broker *permits*,
and what the tree *names*. Neither is a claim about a running system — that is Story 3's
lit cells, and it is deliberately not in this artefact.

## Technical Context

**Language/Version**: Python 3.11 for the scanner and the gate, in the `uv` workspace
beside the other gates. The artefact's types are generated into `libs/harness_types/` and
`client/src/generated/` by the existing chain.

**Primary Dependencies**: None new. The scanner uses `ast` from the standard library,
`json`, and `scripts/_gate_lib.py` for findings, exclusions and exemption markers. It
reaches no network and starts no service, exactly like `check_types_drift.sh`.

**Storage**: Two committed files. `contracts/schemas/topology.schema.json` is the master;
`contracts/topology.json` is the instance the scanner writes. Both are tracked; the
instance is generated and carries the same "do not edit" discipline as the generated trees.

**Testing**: `pytest`. The scanner's derivation rules are tested against fixture trees under
`scripts/tests/fixtures/topology/`; the gate is tested against a planted phantom topic and
asserted to report it; the committed instance is asserted to validate against its master
and to equal a fresh scan of the tree.

**Target Platform**: The checkout. No container, no broker, no running stack — which is the
property that lets this gate run in the same CI job as every other.

**Project Type**: Build-time tooling plus one contract. No service, no heartbeat, no
participation in the control loop.

**Performance Goals**: The scan reads a few hundred small files and completes in well under
a second, so the gate costs nothing anybody will want to skip.

**Constraints**: The scanner must not require the components to be annotated. Feature 018
owns `contracts/` and `scripts/` appends, and reads `services/`, `libs/`, `query/`,
`client/src/`, `config/` and `deploy/broker/` without writing to them. Lane A of wave 6 is
concurrently adding broker subscriptions to six services, so the artefact is a scan of the
tree as it stands and will want one regeneration after that lane merges — which is the
case the drift gate exists to make safe rather than silent.

**Scale/Scope**: Nine topics, thirteen components with a broker identity, five broker
roles. One master, one instance, one scanner, one gate, one registry line.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — The scanner reads files and writes a document. It records no
  time of any kind: an artefact carrying the moment it was generated would differ on every
  run and the drift gate would report a difference nobody caused, which is the same reason
  `--disable-timestamp` is passed to the type generator. Compliant.
- **II. Seeded Randomness** — Nothing stochastic. The scan is a pure function of the tree,
  and its output ordering is sorted rather than incidental, because a set iterated in hash
  order is a diff waiting to happen. Compliant.
- **III. Generated Types Only (non-negotiable)** — This is the principle the story serves.
  The topology shape is declared once, under `contracts/schemas/`, and both language forms
  come from the existing chain and are covered by the existing drift check. The instance is
  generated too, by the scanner, and gets a drift gate of its own for the same reason the
  types have one: committed generated content is only trustworthy if something proves it
  current. Compliant.
- **IV. No Literal Paths or Hosts** — The scanner names repository paths, which is what a
  build-time tool over a repository does; `scripts/` is already outside this gate's scan for
  exactly that reason, and no component gains a path. The artefact itself carries topic
  names and repository-relative source locations, and no hostname, port or deployment
  location: where the broker *is* stays in the destination configuration, and the artefact
  says nothing about it. Compliant.
- **V. No Tracked Entities** — Topics, component ids and schema names. Nothing else.
  Compliant.
- **VI. Honest Ports** — No abstraction is introduced. The scanner is one module with one
  entry point and the gate is a thin wrapper over its check mode, in the shape
  `generate_types.sh` / `check_types_drift.sh` already established. Compliant.
- **VII. Liveness, Not Configuration (non-negotiable)** — This is the principle the design
  had to be most careful about, because an artefact listing components is exactly the shape
  of "a configuration file listing what ought to exist". Two things keep it on the right
  side. The artefact makes no liveness claim: it records what the broker permits and what
  the tree names, and nothing about what is running. And Story 3, which renders it, lights
  a cell only on genuinely received traffic — the structure comes from here, the
  illumination comes from the broker, and the two are never the same source. The master's
  description says so, so that a later reader cannot mistake the artefact for a component
  list. Compliant.
- **X. Default Deny at the Boundary** — The artefact is derived from the access control
  list, which is the default-deny boundary at the broker. It restates no credential and no
  secret: roles are named, and the passwords that authenticate them appear in no tracked
  file and are not read by the scanner. Compliant.

No violation requires justification. Complexity Tracking is therefore omitted.

## What the scanner reads, and why each source is the authority

Four sources, each already tracked, each already the thing something else depends on.
Nothing is annotated for this feature's benefit — a scan that requires the tree to be
marked up first is a hand-kept list with extra steps, and it would have to be added to
`services/`, which this feature does not own.

| Source | What it settles | Why it is the authority |
|---|---|---|
| `deploy/broker/acl` | role → which topic filters it may read and write | mosquitto enforces it. It is not a description of the boundary; it *is* the boundary, and `tests/integration/test_topic_isolation.py` already asserts the refusals against a running broker |
| `config/<destination>/*.json` | component id → broker role | the role in `broker.url` is the identity the broker authenticates. Both destinations are read and required to agree; a disagreement is a finding, not a silent choice of one |
| component source (`services/*/src/`, `query/`, `client/src/`, `libs/harness_core/`) | which topics the tree names, and where | the tree is the authority and the record is a claim about it. A topic named nowhere in source is a topic nothing sends |
| `contracts/schemas/` | which master governs a topic | `repo-layout.md`'s own convention: `contracts/schemas/<topic-noun>.schema.json`. The scanner resolves it and fails if the master does not exist |

**Two layers, never conflated.** `publishers` and `subscribers` on a topic are *permissions*
— the components whose role the access control list permits that direction on that topic.
They are complete and enforced, and they are coarse where the list is coarse:
`drogna_control` carries `readwrite ctl/#`, so nine components "may publish" on
`ctl/run-request` even though FR-011 says the scheduler is the only one that does. That
narrowing is not enforced at the broker and the artefact must not pretend it is. What
narrows it is the second layer, `named_by`: the places in the tree that name the topic,
with file, line and constant. Story 3's three cell states — forbidden, permitted-but-quiet,
and lit — fall out of the first layer plus real traffic; `named_by` is what tells a reader
which component the traffic will come from.

**Shared declarations are attributed to no component.** `ctl/heartbeat` and `ctl/clock` are
named in `libs/harness_core/`, which is a library rather than a component: whoever calls
`HeartbeatPublisher` publishes a heartbeat. Guessing which components those are — by import
graph, or by which module a symbol travels through — produces a plausible list that nothing
checks, and a plausible unchecked list is what this whole story exists to abolish. So a
shared declaration is recorded with its path and `component: null`, and the question of who
may use it is answered by the permission layer, which is enforced.

## Phase 0: what was researched, and what it settled

**Could the direction be derived from the call site rather than from the access control
list?** No, and the reason is worth recording. The publish side is derivable —
`publisher.publish(RUN_REQUEST_TOPIC, ...)` is unambiguous — but the subscribe side is not
there to derive: seven components name their subscription topics as module constants and
nothing subscribes with them yet, because wiring the subscriptions is 009 T052–T058 and
wave 6's lane A. A scanner built on call sites would today report six components that
subscribe to nothing, be right about the tree, and be useless. The access control list is
already complete about direction and is enforced, so it is what the artefact reports, and
`named_by` carries the source locations a call-site scan would have found.

**Should the components be annotated with topic markers?** No, twice over. It would mean
writing into `services/`, which is lane A's tree this wave and not this feature's in any
wave. And a marker is a claim beside the code rather than the code itself, so the artefact
would be derived from a second hand-kept record — the failure mode `CLAUDE.md` opens with.

**Where does the instance live?** `contracts/topology.json`, beside `contracts/schemas/`
rather than inside it. The chain discovers masters by globbing `contracts/schemas/*.schema.json`,
and a document in that directory that is not a master would be discovered, bundled and
generated from. Outside it, the instance is picked up by nothing and the chain is untouched.

**One alias, argued rather than assumed.** Eight of the nine topics resolve to a master by
`repo-layout.md`'s naming convention. The ninth does not: the observation branch's noun is
`obs` and its shape's noun is `observation` — ADR-0005 named the shape, the repository
layout named the branch, and they differ by that much. The scanner carries that single
alias with its reason inline, and verifies every resolved master exists, so an alias that
stopped resolving would fail loudly rather than quietly producing `schema: null`.

## Phase 1: design

### The artefact

`contracts/topology.json` is one document with four sections: the broker `roles` and their
rules, the `components` and the role each authenticates as, the `topics`, and for each
topic its namespace, its governing master, its permitted publishers, its permitted
subscribers, and the places in the tree that name it. Every list is sorted. Nothing in it
is a timestamp, a path outside the repository, or a claim about what is running.

The full field-by-field account is in `contracts/schemas/topology.schema.json`, which is the
master and carries the description of each field; repeating it here would create the second
description that goes stale.

### The gate

`scripts/check_topology_drift.py` runs the scan into memory and compares it with the
committed instance. It writes nothing in either outcome, needs no network and no service,
and reports the mismatch as a readable diff naming the topics and components that differ.
It is registered by appending one line to `scripts/gates.registry`. `scripts/gates.sh` is
not edited — it names no gate, which is the whole of FR-036's second half.

Regeneration is `uv run python scripts/scan_topology.py`, which writes the instance and
nothing else.

### Watching it fail

SC-001 is the acceptance, and the house habit is the method: plant a phantom topic in a
component's source, run the gates, watch the drift gate name the mismatch, regenerate, watch
it pass, revert the phantom, and record the observation in the commit message. A check that
has never been seen to fail is worth nothing, and two of the original four gates were
reporting a file of deliberate violations as clean. The planted-violation test in
`scripts/tests/` makes that observation repeatable rather than a thing that happened once.

## Project Structure

### Documentation (this feature)

```text
specs/018-read-path-boundaries/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/
├── schemas/topology.schema.json        the master — additive
└── topology.json                       the instance — generated, committed, gated

scripts/
├── scan_topology.py                    the scanner; --check for the gate
├── check_topology_drift.py             the gate; thin wrapper over the scan's check mode
├── gates.registry                      one appended line
└── tests/
    ├── test_topology_scan.py           derivation rules, against fixture trees
    └── fixtures/topology/              a small tree with an acl, configs and sources

libs/harness_types/src/harness_types/messages/topology.py     generated by the chain
client/src/generated/messages/topology.ts                     generated by the chain

tests/unit/
├── test_generated_models.py            one appended registration
└── test_topology_artefact.py           the instance validates, and equals a fresh scan

docs/architecture/repo-layout.md        the topic list defers to the artefact
```

**Structure Decision**: This feature adds two files to `contracts/`, two scripts and one
registry line to `scripts/`, two test files, and edits one paragraph of
`docs/architecture/repo-layout.md`. The two generated type modules are written by
`scripts/generate_types.sh` and are not hand-authored. `tests/unit/test_generated_models.py`
and `scripts/gates.registry` are shared append-only files and are appended to, never
rewritten.

Nothing under `services/`, `query/`, `proxy/`, `deploy/` or `client/src/` is modified. The
scanner reads those trees; lane A is writing into `services/` concurrently and the two do
not touch. `client/src/generated/` is written only by the chain, which is not client work
in the sense wave 6 reserves for feature 017.

## Complexity Tracking

Not required: the Constitution Check records no violation.
