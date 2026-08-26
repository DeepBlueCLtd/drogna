---

description: "Task list for 002-edr-trajectory-spike"
---

# Tasks: EDR Trajectory Spike

**Input**: Design documents from `/specs/002-edr-trajectory-spike/`

**Prerequisites**: `spec.md`, `plan.md`

**Tests**: Requested. The version probe is both the experiment and the test the deployment adopts to
satisfy FR-51, so it is written first and written to be kept. The fixture self-check is written
before any query is issued.

**Organization**: Grouped by user story, in increasing order of commitment: parse, hand off, sample,
hand over.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: the user story the task serves

## Path Conventions

Every path is under `spikes/edr-trajectory/` unless stated otherwise. The single exception is the
ADR in `docs/adr/`.

---

## Phase 1: Setup

- [ ] T001 Create `spikes/edr-trajectory/README.md` stating the narrow question in one sentence —
      does the M ordinate survive WKT parsing — the single command that runs the reproduction, the
      prerequisites, and how to read each output file.
- [ ] T002 [P] Write `spikes/edr-trajectory/compose.spike.yml`: a pygeoapi container pinned by
      digest, bound to a local port only, plus a second, minimal image pinned to a Shapely and GEOS
      combination below the FR-51 pin, so both halves of the probe run from one command.

---

## Phase 2: User Story 1 - M survives parsing, and is seen to (Priority: P1) 🎯 MVP

**Goal**: The load-bearing proof, and a demonstration of the failure mode it guards against.

**Independent Test**: Run the probe at both version sets; M values are recovered exactly at the pin
and are NaN below it.

- [ ] T003 [US1] Implement `spikes/edr-trajectory/version_probe.py`: build a `LINESTRINGZM` whose
      vertices carry distinct Z and M values, parse it with `shapely.wkt.loads`, and report the
      recovered ordinates alongside the Shapely version and the GEOS version it was built against.
      Write it as an assertion the deployment can adopt unchanged.
- [ ] T004 [US1] Run the probe at Shapely 2.1 or later on GEOS 3.12 or later; capture the output to
      `results/`.
- [ ] T005 [US1] Run the probe below the pin; capture the NaN result and the absence of any exception
      to `results/`, since that silence is the whole reason FR-51 exists.
- [ ] T006 [US1] Extend the probe to record the vertical convention: whether Z is carried as
      elevation, what the coverage's depth axis will require, and which reconciliation the real
      provider must apply.
- [ ] T007 [US1] Record the same probe for `LINESTRINGM` without a Z ordinate, so the
      three-dimensional route case is documented separately from the four-dimensional one.

**Checkpoint**: the one unproven thing is proven, or is proven false, in writing.

---

## Phase 3: User Story 2 - The geometry reaches a provider untouched (Priority: P2)

**Goal**: Verify the hand-off that FR-50 rests on.

**Independent Test**: One command up, one trajectory request, and the recorded hand-off matches the
request vertex for vertex.

- [ ] T008 [US2] Implement `spikes/edr-trajectory/provider_stub.py`: the crudest EDR provider plugin
      that pygeoapi will accept, declaring the trajectory query type and recording the geometry,
      per-vertex coordinates, M values and query parameters it is handed, to `results/`.
- [ ] T009 [US2] Write `spikes/edr-trajectory/pygeoapi.spike.yml` declaring one EDR collection over
      the fixture and selecting the throwaway provider.
- [ ] T010 [US2] Implement `spikes/edr-trajectory/query.py` to build and issue a trajectory request
      with a time on every vertex, capturing the exact request URL, status, headers and body.
- [ ] T011 [US2] Fetch and capture the collection metadata document, recording whether `trajectory`
      is advertised among the query types once the plugin declares it.
- [ ] T012 [US2] Compare the recorded hand-off with the issued request vertex by vertex, and record
      every difference; the finding quotes this comparison rather than summarising it.
- [ ] T013 [US2] Probe and record the practical trajectory length limit: the vertex count at which
      the request URL becomes unacceptable to the server or a proxy, and whether a POST form of the
      query exists.

**Checkpoint**: the seam the real plugin will sit at is documented from observation.

---

## Phase 4: User Story 3 - One four-dimensional route, sampled and scored (Priority: P3)

**Goal**: Turn the parsing proof into a demonstration of FR-20's actual claim.

**Independent Test**: The query script prints returned values beside both expectations and the
resulting errors.

- [ ] T014 [US3] Design the analytic field in `spikes/edr-trajectory/make_fixture.py`: one parameter
      varying in latitude, longitude, depth and time, with time variation strong enough that a
      single-time evaluation is obviously wrong. Record the formula in the module docstring.
- [ ] T015 [US3] Generate and commit the fixture under `fixture/` as CF-conventions NetCDF from a
      fixed seed, under 5 MB, carrying a metadata attribute stating that the data are synthetic.
- [ ] T016 [US3] Implement `spikes/edr-trajectory/expectation.py`: the route of the order of twenty
      vertices crossing latitude, longitude and depth, with vertex times deliberately falling between
      the coverage's time steps, and evaluation of the analytic field under both hypotheses.
- [ ] T017 [US3] Implement `spikes/edr-trajectory/selfcheck.py`: the written fixture matches the
      analytic form within a stated tolerance, and the two hypotheses differ at every vertex by at
      least ten times that tolerance. Fail loudly if not.
- [ ] T018 [US3] Extend `provider_stub.py` to evaluate the fixture at each vertex's own time and
      return CoverageJSON of the Trajectory domain, with a composite axis of per-vertex (t, x, y, z)
      tuples.
- [ ] T019 [US3] Run the route query and capture the response; print returned values beside both
      expectations with the errors against each.
- [ ] T020 [US3] Validate the response as CoverageJSON and record the domain type, the axis structure
      and anything a browser client would have to work around for the four-dimensional route
      rendering of FR-47.
- [ ] T021 [US3] Probe and record boundary behaviour: vertices outside the horizontal domain, below
      the deepest level, beyond the last time step, non-monotonic vertex times, and a repeated
      vertex.
- [ ] T022 [US3] Record whether values between coverage time steps were interpolated or snapped, and
      state which behaviour the real provider should implement and how the choice changes the error
      AT-01 will report.

**Checkpoint**: a four-dimensional route has been sampled and scored, not merely accepted.

---

## Phase 5: User Story 4 - The finding, and the groundwork handed to the build (Priority: P4)

**Goal**: One page the query-layer feature can build from, and an ADR that outlives the spike.

**Independent Test**: A reader drafts the provider plan without opening the spike's code.

- [ ] T023 [US4] Create `spikes/edr-trajectory/findings-<run date>.md` with sections: question,
      method, evidence, result, handover to the build, deployment requirements, contingency.
- [ ] T024 [US4] Write the result in one sentence near the top — whether M survives parsing at the
      pinned versions — with the Shapely version, GEOS version, pygeoapi version, image digest,
      fixture seed and run date beneath it, and the captured evidence quoted.
- [ ] T025 [US4] Write the handover: the provider base class, the methods the real plugin must
      implement, where it lives under `query/`, how a collection selects it, and what FR-21 requires
      of the collection configuration so a new run becomes servable without editing it.
- [ ] T026 [US4] Write the deployment requirements: the exact version pin, the comment that must
      accompany it saying what silently breaks below it, and the parsing test the deployment adopts
      from T003.
- [ ] T027 [US4] Write the contingency section: what happens if M does not survive even at the pinned
      versions — parsing `coords` from the raw query string inside the plugin — with its cost and its
      consequence for the read path and the client's centrepiece.
- [ ] T028 [US4] Write the ADR in `docs/adr/` (next free number) with Status, Context, Decision and
      Consequences: drogna builds a bespoke EDR trajectory provider because no supplied provider
      implements trajectory, and pins Shapely and GEOS because M is lost silently below those
      versions. Name the rejected alternatives and cite the finding by filename and date.

---

## Phase 6: Closure

- [ ] T029 Confirm that nothing outside `spikes/` imports anything inside it, and that `spikes/`
      appears in the shared gate exclusion list delivered by feature 001. If that list has not landed
      yet, record the requirement in the finding so it is not lost.
- [ ] T030 Verify the closure criteria: the fixture is under 5 MB, the reproduction completes within
      ten minutes on a clean checkout, and the timebox has not been exceeded. If it has, record what
      was established and what was not.

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (Phase 1) has no dependencies.
- User Story 1 (Phase 2) depends only on T002 for the version matrix, and blocks nothing else
  logically — but it is first because a negative result there changes what the rest of the spike is
  for.
- User Story 2 (Phase 3) depends on Setup, and on T014 to T015 only insofar as the collection needs
  a fixture to point at; the hand-off recording itself does not need the fixture to be correct.
- User Story 3 (Phase 4) depends on User Story 2 for the provider stub and on its own fixture tasks.
- User Story 4 (Phase 5) depends on the evidence produced by Stories 1 to 3.
- Closure (Phase 6) depends on everything.

### Within each story

- The probe before the interpretation.
- The fixture self-check (T017) before any conclusion is drawn from a query result.
- The hand-off recording before the provider is asked to compute anything.

### Parallel opportunities

- T002 alongside T003.
- T014 and T015 can proceed in parallel with T008 and T009, since the provider stub records the
  hand-off before it needs data to answer with.
- T021 and T013 are independent probes.

---

## Parallel Example: fixture and provider stub

```bash
# Once the version probe has reported, these two tracks are independent:
Task: "make_fixture.py and the committed CF NetCDF fixture"
Task: "provider_stub.py and pygeoapi.spike.yml — record the hand-off"
```

---

## Implementation Strategy

1. Run the version probe first. It is cheap, it is the one unproven thing, and its result determines
   whether the rest of the spike is a demonstration or an investigation.
2. Record the hand-off before computing anything, so the claim that the geometry arrives untouched
   rests on observation.
3. Build the discriminating fixture and prove it discriminates before drawing any conclusion from a
   returned value.
4. Write the finding, hand over the seam and the pin, write the ADR, and stop. The build belongs to
   the query-layer feature.

## Notes

- The outcome to guard against is a trajectory query that returns HTTP 200 with values evaluated at a
  meaningless time. T005 and T017 are the two tasks that make that outcome impossible to miss.
- Nothing in this directory may be promoted into drogna. The real provider is written fresh, to its
  own standard, behind the coverage output port.
