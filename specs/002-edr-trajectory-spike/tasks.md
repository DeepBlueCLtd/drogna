---

description: "Task list for 002-edr-trajectory-spike"
---

# Tasks: EDR Trajectory Spike

**Input**: Design documents from `/specs/002-edr-trajectory-spike/`

**Prerequisites**: `spec.md`, `plan.md`

**Tests**: Requested, in the form appropriate to a spike. The spike's test is `selfcheck.py`, which
proves the fixture matches its analytic form and that the two hypotheses are separated widely
enough for the verdict to mean something. It is written before the query is ever issued.

**Organization**: Grouped by user story. Stories 2 to 4 write successive parts of one document, so
they are sequential by nature rather than by dependency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: the user story the task serves

## Path Conventions

Every path is under `spikes/edr-trajectory/` unless stated otherwise. The single exception is the
ADR in `docs/adr/`.

---

## Phase 1: Setup

- [ ] T001 Create `spikes/edr-trajectory/README.md` stating the question in one sentence, the single
      command that runs the reproduction, the prerequisites, and how to read the output.
- [ ] T002 [P] Write `spikes/edr-trajectory/compose.spike.yml` bringing up pygeoapi from a published
      image pinned by digest, bound to a local port only, mounting the fixture read-only.
- [ ] T003 [P] Write `spikes/edr-trajectory/pygeoapi.spike.yml` declaring one EDR collection over the
      fixture with the provider the harness intends to use for NetCDF coverage.

---

## Phase 2: Foundational (the discriminating fixture)

**Purpose**: A coverage whose right answer and wrong answer are far apart. Nothing else in the
spike is worth doing until this holds.

**Blocking**: the query cannot be trusted before this phase is complete.

- [ ] T004 Design the analytic field in `spikes/edr-trajectory/make_fixture.py`: one parameter
      varying in latitude, longitude, depth and time, with the time variation strong enough that a
      single-time evaluation is obviously wrong. Record the formula in the module docstring.
- [ ] T005 Generate and commit the fixture under `spikes/edr-trajectory/fixture/` as CF-conventions
      NetCDF from a fixed seed, under 5 MB, carrying a metadata attribute stating that the data are
      synthetic.
- [ ] T006 Implement `spikes/edr-trajectory/expectation.py`: evaluate the analytic field at a list of
      vertices under both hypotheses — each vertex at its own time, and every vertex at the first
      vertex's time.
- [ ] T007 Define the test trajectory in `spikes/edr-trajectory/expectation.py`: of the order of
      twenty vertices, changing latitude, longitude and depth, with vertex times deliberately falling
      between the coverage's time steps so that interpolation behaviour is exposed.
- [ ] T008 Implement `spikes/edr-trajectory/selfcheck.py`: the written fixture matches the analytic
      form within a stated tolerance, and the two hypotheses differ at every vertex by at least ten
      times that tolerance. Fail loudly if not.

**Checkpoint**: the experiment can distinguish the answers it is asking about.

---

## Phase 3: User Story 1 - A reproduction anyone can run (Priority: P1) 🎯 MVP

**Goal**: One command, one query, one captured response.

**Independent Test**: From a clean checkout, the documented command brings the instance up and the
query script prints request, response and both expectations.

- [ ] T009 [US1] Implement `spikes/edr-trajectory/query.py`: build the trajectory request with a time
      per vertex, issue it, and write the exact request URL, status, headers and body to
      `spikes/edr-trajectory/results/` with a run-stamped filename.
- [ ] T010 [US1] Capture the collection metadata document — advertised query types, parameters,
      extents — into `results/`, so the finding can cite what the server said it could do.
- [ ] T011 [US1] Run the reproduction end to end and capture the first result set; print the
      response values beside both hypotheses' expected values.
- [ ] T012 [US1] If the request is rejected, try each plausible spelling of the trajectory geometry
      and query parameters in turn, capturing every attempt and its response. A rejection is a result,
      not a failure of the spike.
- [ ] T013 [US1] Complete `README.md` with the verified command, the expected runtime, and the
      meaning of each output file.

**Checkpoint**: the evidence exists and is reproducible.

---

## Phase 4: User Story 2 - A dated finding that answers the question (Priority: P2)

**Goal**: The verdict, with its provenance and its shelf life.

**Independent Test**: A reader states the verdict, the version it applies to and what would change
it, after one page.

- [ ] T014 [US2] Create `spikes/edr-trajectory/findings-<run date>.md` with the sections: question,
      method, evidence, verdict, secondary findings, options, recommendation.
- [ ] T015 [US2] Record the verdict — supported, partially supported, or unsupported — in one
      sentence near the top, with the pygeoapi version, provider class, image digest, fixture seed and
      run date beneath it.
- [ ] T016 [US2] Probe and record the secondary questions, each with a captured response: is the
      vertical coordinate honoured; does parameter selection work; what domain type does the
      CoverageJSON response carry; are values interpolated in time between coverage steps or snapped
      to the nearest step.
- [ ] T017 [US2] Probe and record boundary behaviour: vertices outside the horizontal domain, below
      the deepest level, and beyond the last time step. Record whether the server errors, returns
      null, returns the nearest value or extrapolates.
- [ ] T018 [US2] Probe and record the practical limit on trajectory length: the vertex count at which
      the request URL becomes unacceptable, and whether a POST form of the query exists.
- [ ] T019 [US2] Record whether the response is well-formed CoverageJSON that the browser client could
      consume for the four-dimensional route rendering of FR-47.

**Checkpoint**: the question is answered, in writing, with evidence attached.

---

## Phase 5: User Story 3 - Fallback options treated as outcomes (Priority: P3)

**Goal**: Five ways forward, costed, so features 008 and 012 can be planned from this page.

**Independent Test**: Someone drafting the query-layer plan picks a path and lists its consequences
without asking a further question.

- [ ] T020 [US3] Write options (a) native support used as is, and (b) a custom pygeoapi EDR provider
      plugin: cost in working sessions, where the plugin would live under `query/`, what it must
      implement, and what it means for FR-21.
- [ ] T021 [US3] Write options (c) client-side decomposition into one position query per vertex,
      (d) a non-standard trajectory endpoint in front of the query layer, and (e) changing the client
      centrepiece to a time-animated section of the forecast volume: cost, read-path consequence,
      client consequence.
- [ ] T022 [US3] For each option, state the claim the harness may honestly make about standards
      conformance afterwards, and name any SRD requirement no longer met in full together with the
      weaker claim that replaces it.

**Checkpoint**: the negative answer, if that is what it is, has a fully specified consequence.

---

## Phase 6: User Story 4 - The decision recorded and handed on (Priority: P4)

**Goal**: One recommendation, one ADR.

**Independent Test**: The ADR reads on its own, without the spike.

- [ ] T023 [US4] Write the recommendation into the finding: one option, and the criteria on which it
      won — fidelity to FR-20, standards conformance, implementation cost, risk to the client
      centrepiece.
- [ ] T024 [US4] Write the ADR in `docs/adr/` (next free number) with Status, Context, Decision and
      Consequences, naming the rejected alternatives and citing the finding by filename and date.
- [ ] T025 [US4] Record the re-run conditions in the finding: the version, provider or upstream change
      that would justify repeating the spike, so its shelf life is visible.

---

## Phase 7: Polish and closure

- [ ] T026 Confirm that nothing outside `spikes/` imports anything inside it, and that `spikes/`
      appears in the shared gate exclusion list delivered by feature 001. If that list has not landed
      yet, record the requirement in the finding so it is not lost.
- [ ] T027 Verify the closure criteria: the fixture is under 5 MB, the reproduction completes within
      ten minutes on a clean checkout, and the timebox has not been exceeded. If it has, record what
      was established and what was not, and recommend on risk.

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (Phase 1) has no dependencies, though T003 is easier to write once the fixture's variable
  names are settled in T004.
- Foundational (Phase 2) blocks everything: a query against a fixture that cannot discriminate
  produces a finding that cannot be trusted.
- User Story 1 (Phase 3) depends on Phases 1 and 2.
- User Story 2 (Phase 4) depends on User Story 1 for its evidence.
- User Story 3 (Phase 5) depends on the verdict from User Story 2, since the verdict determines
  which options matter, though the option list itself can be drafted in parallel with T016 to T019.
- User Story 4 (Phase 6) depends on User Story 3.
- Polish (Phase 7) depends on everything.

### Parallel opportunities

- T002 and T003 in Setup.
- T016, T017 and T018 are independent probes and can be run in any order or together.
- T020 and T021 are separate sections of the options list and can be drafted in parallel.

---

## Parallel Example: secondary probes

```bash
# Once the primary query has been captured, the secondary probes are independent:
Task: "Probe vertical coordinate handling and parameter selection; capture responses"
Task: "Probe boundary behaviour outside the domain and beyond the horizon"
Task: "Probe trajectory length limits and whether a POST form exists"
```

---

## Implementation Strategy

1. Build the discriminating fixture first and prove it discriminates. Everything else is worthless
   without it.
2. Issue the query, capture what comes back, and write the verdict before writing anything else —
   including before deciding how you feel about the verdict.
3. Cost the options with the same care whichever way the verdict went.
4. Transcribe the recommendation into an ADR, then stop. The spike is disposable; the ADR is not.

## Notes

- The outcome to guard against is a response that returns HTTP 200 with plausible wrong numbers.
  T008 is the task that makes that outcome impossible to miss.
- A negative verdict is a successful spike. The delivery order in SRD §10 exists because that
  outcome was thought likely enough to test for second.
- Nothing in this directory may be promoted into the harness. When feature 004 needs a synthetic
  field it writes its own, to its own standard.
