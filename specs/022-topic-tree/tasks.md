# Tasks: The Topic Tree

**Input**: Design documents from `specs/022-topic-tree/` — plan.md, research.md,
data-model.md, quickstart.md, and the spec.

**Tests**: included — the spec's FR-011 fixes unit tests at the state layer as the
feature's verification, so the test tasks are the deliverable, not an option. Every test
is watched failing on the fault it describes before it is trusted, and the commit message
says so (the repository's standing habit).

**Ticking discipline**: tick as you go, and where a task is decided against, write the
reason at that moment. The record is a claim about the tree; keep it true.

**Organization**: grouped by user story after a foundational phase. The foundational
phase is genuinely blocking: both the skeleton (the expanded artefact) and the live feed
(the new role) come out of it.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Verify the baseline is green before touching it: `uv run pytest tests/unit -k topology`, `uv run python scripts/check_topology_drift.py`, and `cd client && pnpm install && pnpm test` — a later failure must be attributable to this feature's change, not inherited

## Phase 2: Foundational (the role, the expanded artefact, the ADR)

**Purpose**: declare `drogna_observer` in the tracked sources the topology derivation
reads, extend the derivation with the configured expansion, regenerate the artefact with
the drift gate watched failing first, and record the decision. Blocks all stories: US1
needs both the skeleton rows and the live observation feed.

- [x] T002 Append the `drogna_observer` block to `deploy/broker/acl`: `topic read obs/#`, `topic read ctl/#`, no write rule, with a comment arguing the grant the way the file's other blocks do (and pointing at ADR-0025)
- [x] T003 Append `"drogna_observer": "HARNESS_BROKER_SECRET_OBSERVER"` to `ROLE_SECRETS` in `deploy/lib/render_credentials.py`; confirm secret generation, password file and render all follow from the table (check `scripts/up.sh` and any deploy tests that enumerate `SECRET_NAMES`)
- [x] T004 Change the broker URL username from `drogna_viewer` to `drogna_observer` in `config/local/client.json` and `config/droplet/client.json` (destinations must agree; this line is the role declaration the scanner reads)
- [x] T005 Extend `scripts/scan_topology.py`: derive the configured observation topics `obs/<thing>/<datastream>` from the sensors configuration of every destination (located by shape — a `sensors` section naming a platform and datastreams — not by filename), require destinations to agree as roles already must, and emit them as ordinary topic rows; extend `resolve_schema` so any topic under the observation branch resolves to the observation master
- [x] T006 Extend `tests/unit/test_topology_artefact.py` (or a sibling module beside it): the expansion derived from a fixture tree, the disagreeing-destinations failure, the obs-branch schema resolution — each watched failing against the unextended scanner first
- [x] T007 Run `uv run python scripts/check_topology_drift.py` and watch it FAIL against the committed artefact (the role and the expansion are in the sources, not the artefact); then `uv run python scripts/scan_topology.py`, watch the gate pass, and commit `contracts/topology.json` with a message recording both observations
- [x] T008 [P] Append the new role's cases to `tests/integration/test_topic_isolation.py`: `drogna_observer` receives on `obs/#` and on `ctl/#`, and every publish it attempts — `obs/`, `ctl/heartbeat`, `ctl/run-request` — is refused at a running broker (run locally under dockerd before CI sees it)
- [x] T009 [P] Write `docs/adr/0025-the-observation-namespace-reaches-the-browser-read-only.md`: the three options the interview weighed (current-grant restriction, digest relay, explicit role), the extension of ADR-0008's routing decision, the ADR-0020-shaped non-secret argument for the observer credential and its two transferred obligations, and the accepted consequences (the `/ctl` location name now carries observation traffic; the artefact is coupled to the deployed sensor configuration under the destinations-agree rule)

**Checkpoint**: `./scripts/gates.sh` and `uv run pytest` green; the artefact carries the
role and the configured rows; the stack still comes up (`./scripts/run_local.sh` after
`dockerd` and `export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"`) with the client connecting
as the new role.

## Phase 3: User Story 1 — From sensor to decision, visibly (P1) 🎯 MVP

**Goal**: the declared tree drawn cold from the artefact, the consumer-role column beside
it, arrivals lighting leaf, ancestors and exactly the matching roles' connections.

**Independent Test**: stack running, panel open, one observation topic watched — leaf
pulses on arrival, ancestors ripple, every matching role's connection lights, no
non-matching role changes (spec US1).

- [x] T010 [P] [US1] Implement `client/src/topictree/match.ts`: pure MQTT filter matching (`+`, `#`, exact), the same semantics as the scanner's `topic_matches`, plus `coveringFilters(topic, roles)` returning every declared filter that matches with its role and access
- [x] T011 [P] [US1] Implement `client/src/topictree/skeleton.ts`: pure construction of the declared tree and role column from `DrognaBrokerTopology` (build-time import of `contracts/topology.json`, typed by `client/src/generated/messages/topology.ts`): one node per segment path, concrete rows as leaves, wildcard filters kept as covering declarations, roles with their filters and components
- [x] T012 [US1] Implement `client/src/topictree/activity.ts`: arrival folding per data-model.md — bounded ring of `{receivedAt, simTime}`, sim stamp from payload `sim_time` where its JSON carries one else latest clock sample else absent-and-stated; grafting with the three tiers (declared / observed-under-declaration / undeclared, via `match.ts`); view-time pure functions `decayPhase`, `aggregate` (the ripple), rates
- [x] T013 [US1] Write `client/tests/topictree/match.test.ts`, `skeleton.test.ts`, `activity.test.ts`: wildcard semantics incl. non-matching cases (acceptance 1-3); skeleton drawn whole and cold from the artefact with SC-003's role-exactness asserted against `contracts/topology.json` itself, not a fixture; arrival folding, ripple aggregation, graft tiers, retained-message stamping — each watched failing on a planted fault first
- [x] T014 [US1] Implement `client/src/topictree/transport.ts`: the panel's own read-only subscription through the existing upgrade — narrow the `BrokerClient` interface from `client/src/transport/mqtt.ts`, subscribe `obs/#` and `ctl/#`, client id derived from the configured id by suffix, connection states in the shell's vocabulary, no publish call anywhere
- [x] T015 [P] [US1] Write `client/tests/topictree/readonly.test.ts`: walk `client/src/topictree/` sources and assert no publish call appears (SC-005's checkable form), in the manner of `client/tests/no-mock.test.ts`
- [x] T016 [US1] Implement `client/src/topictree/TopicTreePanel.tsx`, `TreeView.tsx`, `RoleColumn.tsx`: self-contained panel owning its subscription (opened only from a validated config) and its frame redraw; horizontal tree, root left; pulse-and-decay from `decayPhase`; ripple from `aggregate`; role column with connections lit by `match.ts` on arrival; cold state visibly cold; undeclared grafts visibly marked; styles appended to `client/src/styles.css`
- [x] T017 [US1] Append the panel to `client/src/App.tsx`: one import block, one `<TopicTreePanel …>` element passing the validated configuration — append-only, nothing else in the file touched (lane J is appending a different panel in parallel)
- [x] T018 [US1] Verify live: — done 28 Aug against the running stack; found and fixed on the way: the client image's own dockerignore excluded `contracts/topology.json` (the documented trap, met on schedule), and the glance capture's settle check needed the traffic-lit panel named in `ALIVE_WHILE_RUNNING` beside the loop's transits. Original text: `dockerd`, `export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"`, `./scripts/run_local.sh`, watch one observation topic per the story's independent test; then `HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs` and confirm the panel renders beside the existing surfaces, which are unchanged

**Checkpoint**: US1 demonstrable end to end; `pnpm exec tsc --noEmit && pnpm lint &&
pnpm test` green.

## Phase 4: User Story 2 — The system has a visible pulse (P2)

**Goal**: the rate-adaptive crossover, simulation-time figures with the factor shown, and
the honesty states.

**Independent Test**: at a low simulated rate, arrivals read individually; raise the
clock rate and the node crosses to sustained intensity with no user action; pause the
clock and the panel states the pause while stated per-simulation-second rates are
unchanged (spec US2).

- [x] T019 [US2] Extend `client/src/topictree/activity.ts`: the crossover decision — sustained iff measured mean inter-arrival ≤ the pulse decay duration the display itself uses (derived, not typed); edge-flow intensity from the same recent rate; per-simulation-second rate from the sim-stamp ring
- [x] T020 [US2] Extend `client/src/topictree/state.ts` (create it): panel state per data-model.md — connection, latest clock sample, session start, the four honesty derivations (disconnected, paused, young, absent-route/disabled), each a distinct state
- [x] T021 [US2] Write `client/tests/topictree/activity.test.ts` additions and `honesty.test.ts`: crossover asserted as the relationship between the module's own two quantities, never a typed rate; stated sim-rate invariant under a changed acceleration factor (SC-004); paused stated with in-flight decays completing in wall time and no figure claiming idleness; disconnection stated, never rendered as quiet; cold-after-refresh stated as young — each watched failing first
- [x] T022 [US2] Render the P2 states in `TopicTreePanel.tsx` / `TreeView.tsx`: sustained intensity and edge flow past the crossover; every stated figure in simulation time with the acceleration factor in force beside it; the pause, disconnection and youth statements in words
- [x] T023 [US2] Verify live: at the default rate watch discrete pulses; raise the rate through the speed control and watch the crossover; pause and confirm the statement and the unchanged per-simulation-time figures

**Checkpoint**: US1 and US2 both demonstrable; client suite green.

## Phase 5: User Story 3 — Where a new process would plug in (P3)

**Goal**: the integration catalogue — selection reveals payload, sim-time stats, matching
roles with access, and the governing schema; unobserved facts stated as unobserved.

**Independent Test**: select an observation leaf and read its last payload, stats, roles
and schema; select a never-heard topic and read the declared facts with the observed ones
honestly absent (spec US3).

- [x] T024 [US3] Implement `client/src/topictree/detail.ts`: pure selection detail — last payload verbatim, pretty-printed where it parses as JSON, else shown safely with the reason, size-capped with the cap stated; arrival/rate/recency in simulation time; matching roles with access via `match.ts` (none omitted, none invented); governing master from the artefact row or inherited from the covering branch, stated which; unobserved facts stated as unobserved
- [x] T025 [US3] Write `client/tests/topictree/detail.test.ts`: acceptance 1–3 of US3 including role exactness under wildcard semantics against the artefact, the never-observed statement, and the non-JSON / oversized payload edges — each watched failing first
- [x] T026 [US3] Implement `client/src/topictree/DetailView.tsx` and selection wiring in `TopicTreePanel.tsx` / `TreeView.tsx` (click to select, keyboard accessible)
- [x] T027 [US3] Verify live: select an active leaf and a silent declared topic; confirm the detail against the artefact and the stated absences

**Checkpoint**: all three stories demonstrable independently.

## Phase 6: Polish & cross-cutting

- [x] T028 [P] Implement subtree collapse: — the state-layer half (the aggregate a summary node carries) is the tested part; the fold/expand control is view logic exercised live. Original text: a wide branch collapses to a summary node carrying its children's aggregate activity (the aggregate already exists), with a unit test in `client/tests/topictree/activity.test.ts` or `skeleton.test.ts`
- [x] T029 Run the whole bar: — done 28 Aug. One genuine finding from CI rather than the local bar: the pair capture's zero-pixel contract collided with a panel that pulses on real-time heartbeats under a pinned clock; resolved by pinning the panel's animation (steady marks, in-flight decays completing to a floor) whenever the simulation is not advancing, watched failing on the planted CI fault. The full `uv run pytest` failed two compose-driving modules while this session's own live stack and captures were using the same project name — both pass clean in isolation, which is the contention CLAUDE.md warns about read in the other direction. Original text: `uv run ruff check . && uv run ruff format --check .`, `uv run pytest`, `./scripts/gates.sh`, `cd client && pnpm exec tsc --noEmit && pnpm lint && pnpm test`; bring the stack back up afterwards (`pytest` takes it down) and re-run the glance capture

**A second CI finding, and the one worth carrying.** The pair check failed with the
*speed control* never acknowledging a pin — three files from the cause. The readiness
check (`client/e2e/shared/readiness.ts`) decided the page had settled by blanking each
held-aside element's `innerHTML` on the live page and putting it back: a mutation of a
running application's DOM, taken in order to observe it. React owns that DOM, so
re-inserting a string of the same shape leaves its fibres pointing at nodes no longer in
the document. On the shell's four small text spans it never surfaced; on this panel —
keyed children, conditional branches, an SVG — it broke the client outright and the page
stopped updating. It measures from a clone now, which takes the observation without
touching what is observed, and the panel states `data-animating` so it is held aside only
while it animates and takes part in the stability check under a pin. Watched failing both
ways against the running stack: before, the two determinism specs failed at the pin and
with 116 pixels differing; after, both pass and the glance capture still produces its
image.

- [x] T030 Reconcile this file against the tree — every tick checked, every deliberate omission carrying its reason — and stage/verify/commit per the repository's snapshot discipline

## Dependencies & execution order

- Phase 2 blocks everything: US1 needs the expanded artefact (T005–T007) for its skeleton
  and the role (T002–T004) for its feed. T008/T009 can run parallel to T005–T007.
- US1 (Phase 3) → US2 (Phase 4) → US3 (Phase 5) in priority order; US2 and US3 both
  build on US1's modules but each checkpoint is independently demonstrable.
- Within US1: T010/T011 parallel; T012 needs T010; T013 follows its modules; T014
  independent of T010–T013; T016 needs T011/T012/T014; T017 last append; T018 last.
- Polish after the stories.

## Implementation strategy

US1 is the MVP and the stated point of the feature; stop-and-validate at its checkpoint
with the live independent test before starting US2. Each later story deepens the panel
without changing its shape, matching the spec's staging assumption. One PR carries the
feature; commits land per task group with the watched-failure notes in their messages.
