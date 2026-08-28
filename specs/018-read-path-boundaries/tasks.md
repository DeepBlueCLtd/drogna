---

description: "Task list for 018-read-path-boundaries"
---

# Tasks: Read-Path Boundaries and the Topology Contract

**Input**: Design documents from `/specs/018-read-path-boundaries/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested for this project. The gate carrying this feature is watched failing
against a planted phantom topic before it is trusted, and that observation is repeatable
as a test rather than a thing that happened once (SC-001, and the house habit).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US4)
- Paths are exact and relative to the repository root

## Path Conventions

This feature appends two files to `contracts/`, two scripts and one line to `scripts/`,
two test files to `tests/` and `scripts/tests/`, and edits one section of
`docs/architecture/repo-layout.md`. The two generated type modules under
`libs/harness_types/` and `client/src/generated/` are written by
`scripts/generate_types.sh` and are never hand-authored. It writes nothing under
`services/`, `query/`, `proxy/`, `deploy/` or `client/src/`.

## Scope of this session, and what is deliberately not started

**Only User Story 2 is implemented here.** Stories 1, 3 and 4 are client work that follows
feature 017's map surface, which owns the client shell integration point all three arrive
through; the delivery plan places them in wave 7 for that reason and this session is wave
6's lane F. Their tasks are listed below, unticked, each carrying the reason it is
unticked — an unticked task with an explanation is a decision, and an unticked task
without one is an unmaintained record, which this repository has already paid for once.

---

## Phase 1: Setup

- [x] T001 Read `deploy/broker/acl`, `deploy/broker/README.md`, `config/local/*.json` and `config/droplet/*.json` and establish what is actually authoritative about roles, components and permissions, recording the finding in `plan.md` rather than in the scanner's comments alone.
- [x] T002 Establish, by AST probe over `services/`, `libs/`, `query/` and `proxy/`, that every topic literal in the tree today is a module-level constant — so that a completeness rule over Python is a rule the tree already obeys rather than one it would have to be edited to satisfy.

**Checkpoint**: The four sources are named and their authority argued.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The master. Everything else is derived from it or checked against it.

- [x] T003 Write `contracts/schemas/topology.schema.json`: roles and their rules, components and the role each authenticates as, and per topic its namespace, governing master, permitted publishers, permitted subscribers and the places in the tree that name it. Every field carries its own description, including the two the reader will otherwise misread — that `publishers`/`subscribers` are permissions rather than behaviour, and that the document makes no liveness claim (Constitution VII).
- [x] T004 Run `./scripts/generate_types.sh` and commit `libs/harness_types/src/harness_types/messages/topology.py` and `client/src/generated/messages/topology.ts` (FR-001, Constitution III).
- [x] T005 Append the topology shape's registration to `tests/unit/test_generated_models.py` — an append to a shared file, never a rewrite.

**Checkpoint**: The shape exists in three languages and the existing drift check covers two of them.

---

## Phase 3: User Story 2 - The topology is generated, and it is gated (Priority: P1) 🎯 MVP

**Goal**: The topology becomes an artefact derived from the tree, and a gate holds it current.

**Independent Test**: Plant a phantom topic in a component's source; the drift gate reports
the committed artefact stale and fails; regenerate; the gate passes; revert the phantom.

### Tests for User Story 2

- [x] T006 [P] [US2] Build the test tree in `tmp_path` from strings in `scripts/tests/test_topology_scan.py` — its own access control list, destination configurations and component sources, including a role refused a branch — so the derivation rules are tested against something other than the repository they were written for. *Not* committed under `scripts/tests/fixtures/`, as first planned: a tree of `.py` files there would be linted and formatted with the repository's own source, and a fixture that must obey the rules of the thing it is a fixture for is one that will be corrected rather than read.
- [x] T007 [P] [US2] Write `scripts/tests/test_topology_scan.py`: the access control list parses, MQTT filter matching handles `#` and `+`, permissions come out per component, topic literals are found and docstrings are not, `obs/` and `obs/#` normalise to one topic, and the schema alias resolves. Then mutate the scanner six ways and watch each mutation caught — the docstring rule survived the first pass, because the fixture's docstring only *mentioned* a topic where the scan matches one that *starts* a string, and a rule tested against prose that could never have matched is a rule tested against nothing.
- [x] T008 [US2] Add the planted-phantom case to `scripts/tests/test_topology_scan.py`: a phantom topic written into a fixture component's source makes the check mode fail and name the topic (SC-001, FR-002).
- [x] T009 [P] [US2] Write `tests/unit/test_topology_artefact.py`: the committed instance validates against its master and parses through its generated model, equals a fresh scan of the tree, its `named_by` entries all point at a line that still holds that topic, and the three boundary claims the access control list argues for at length — sensors confined to the observation branch, the query layer subscribing to nothing, the browser publishing nowhere — are read out of the derived document rather than out of prose. Watched failing against a shifted line number and against a widened access control list.

### Implementation for User Story 2

- [x] T010 [US2] Implement `scripts/scan_topology.py`: parse the access control list into roles and rules; read both destinations' configurations for component→role and refuse a disagreement; walk the component source trees for module-level topic literals by AST, excluding docstrings; read the client's `export const` declarations; normalise branch filters; resolve each topic's governing master by the repository layout's naming convention with the one argued alias; and emit the sorted document.
- [x] T011 [US2] Give `scan_topology.py` a `--check` mode that writes nothing and reports the difference between a fresh scan and the committed instance as a readable diff naming the topics and components that differ.
- [x] T012 [US2] Add the Python completeness rule: a topic-shaped literal in a scanned Python file that is not a module-level constant is a finding, so a topic cannot be added in a position the scan does not see.
- [x] T013 [US2] Generate `contracts/topology.json` and commit it.
- [x] T014 [US2] Write `scripts/check_topology_drift.py` — the gate, a thin wrapper over the scan's check mode, in the shape `check_types_drift.sh` already established.
- [x] T015 [US2] Append one line to `scripts/gates.registry` registering the gate, with the reason it exists written above it. `scripts/gates.sh` is not edited (FR-002, FR-036's second half).
- [x] T016 [US2] Watch the gate fail: plant a phantom topic in a component's source, run `./scripts/gates.sh`, observe the drift gate name the mismatch, regenerate, observe it pass, revert the phantom, and record the observation in the commit message (SC-001).
- [x] T017 [US2] Amend `docs/architecture/repo-layout.md` so the topic list defers to the artefact instead of restating it, and says what the artefact records and what it deliberately does not (FR-004 of this story, SC-006).

**Checkpoint**: Story 2 is complete and independently valuable. The artefact exists, both
language forms are generated, and the gate has been seen to fail on the thing it describes.

---

## Phase 4: User Story 1 - The request that just crossed (Priority: P1)

**Not started. Reason: client work behind feature 017.** The read-path view opens from the
standards edge context in the client shell (FR-011, progressive reveal from existing
surfaces), and feature 017 owns that shell integration point this wave. The delivery plan
places this in wave 7 for that reason, and wave 6's lane F is the server-side artefact
only. Nothing in Story 2 blocks it: the crossings are drawn from the client's own traffic
and need no topology artefact.

- [ ] T018 [US1] Instrument the client's fetch layer on the seams it already has, recording one crossing per read: request line, response type and size, the simulation time the response carried, and the governing standard.
- [ ] T019 [US1] Draw the three read-path edges — coverage store to query layer, query layer to proxy, proxy to browser — each labelled by the standard that governs it.
- [ ] T020 [US1] Mark the two server-side edges as inferred from the response rather than witnessed, with the marking stating what the client actually knows and from where (FR-004).
- [ ] T021 [US1] Selecting an edge shows its last crossing in full through the existing inspector idiom; a boundary nothing has crossed states the absence of traffic rather than rendering nothing (FR-006).
- [ ] T022 [US1] Add the three read-path boundaries to the existing boundary classification, held by the same test that holds the existing twenty-two (FR-005).
- [ ] T023 [US1] A read that fails is a crossing too, drawn as a failure carrying the refusal or error the client actually received.

---

## Phase 5: User Story 3 - Who talks to whom, lit by real traffic (Priority: P2)

**Not started. Reason: client work behind feature 017, and it consumes this session's
artefact.** Story 3 is the first consumer of `contracts/topology.json` and the reason
Story 2 was done first; the artefact and its gate are what make the matrix evidence rather
than a drawing that can rot. The rendering itself is client work behind 017's shell
integration point, in wave 7.

- [ ] T024 [US3] Render the matrix — components against topics — with every structural mark read from the generated artefact and none from a value written in client source (FR-007, SC-004).
- [ ] T025 [US3] Light a cell only on genuinely received traffic, decaying or persisting by the same rules the loop view uses for transits (Constitution VII).
- [ ] T026 [US3] Render the access-control-forbidden region visibly distinct from permitted-but-quiet cells, which is what the artefact's permission layer is for.
- [ ] T027 [US3] Selecting a cell opens the existing message inspector on that topic's last real payload, schema name and simulation time — not a second implementation of it.
- [ ] T028 [US3] Surface traffic the artefact does not declare in an "undeclared" region rather than dropping it: the tree is the authority and the artefact is a claim about it (FR-012).
- [ ] T029 [US3] Replace `client/src/loop/transitRouting.ts`'s hand-written publisher and consumer lists with the artefact, or record why they must stay hand-written. That file is the second topology record this feature exists to retire, and leaving it unexamined would leave two.

---

## Phase 6: User Story 4 - The badges, the history, and the re-ask (Priority: P3)

**Not started. Reason: client work behind feature 017, and it builds on Story 1.** The
badges attach to existing panes, the history is per read-path edge, and the re-ask
re-issues a read Story 1 instruments. None of it is reachable before Story 1 exists.

- [ ] T030 [US4] A standards badge on every data-bearing pane, naming the delivering standard and linking to its primer on the published site (FR-008).
- [ ] T031 [US4] Bounded per-edge history with the bound stated, browsable in order, declaring truncation of stored payloads rather than silently shortening them (FR-009).
- [ ] T032 [US4] The re-ask control: one genuine request of a kind the client already makes, at most once per stated minimum interval, disabled while its request is in flight (FR-010).
- [ ] T033 [US4] Assert that a re-ask crossing is indistinguishable in provenance from a loop-driven one, because it is the same thing — a real request, really answered.

---

## Dependencies

- Phase 2 blocks Phase 3: the scanner emits a document, and the master is what says what
  the document is.
- Story 2 blocks Story 3 and nothing else. Story 1 is independent of Story 2 entirely.
- Stories 1, 3 and 4 are blocked on feature 017 landing the client shell integration point,
  which is wave 6's lane B and this feature's only shared surface.
