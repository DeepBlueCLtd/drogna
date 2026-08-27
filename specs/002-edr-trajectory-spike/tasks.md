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

## Reconciliation, 27 August 2026

This list was written before the spike ran and had never been ticked, so it claimed that none of
the work existed. That was false and, for a spike, dangerously so: a fresh reader would have
concluded the M-ordinate question was still open and re-run an experiment that has already been
run, recorded and acted on. It is reconciled against the tree here rather than rewritten to match
it.

**A spike's deliverable is the record, not working code**, and the record exists:
`spikes/edr-trajectory/FINDING.md`, dated 26 August 2026, with the evidence it quotes in
`spikes/edr-trajectory/results/`, and ADR-0003 carrying the decision. Twenty-nine of the thirty
tasks are done. The reproduction (`./run.sh`) is kept working, but nothing under `spikes/` is
imported by drogna and nothing here is promoted into it; the real trajectory provider was written
fresh by feature 008.

Three things this list turned out to be wrong about are recorded on the tasks themselves rather
than tidied away:

1. **The finding is `FINDING.md`, not `findings-<run date>.md`** (T023). The date is inside the
   document, and it is that filename ADR-0003 and `deploy/images/query-layer-pin-check.py` cite.
2. **The failure below the pin is not NaN** (T005). The spike measured two combinations below the
   pin and found M *absent* in the shipped pygeoapi image and M *misread as Z* on an older GEOS.
   The NaN mode this list, FR-51 and ADR-0003 all name needs Shapely >= 2.1 on GEOS < 3.12, and
   that combination was never built: it is the one row of the three-mode table stated from
   Shapely's docstring rather than from a run.
3. **The fixture is regenerated, not committed** (T015, the one task left partial). `.gitignore`
   excludes `*.nc`, so what is in the tree is the seed, the generator and
   `fixture/fixture_manifest.json`.

---

## Phase 1: Setup

- [x] T001 Create `spikes/edr-trajectory/README.md` stating the narrow question in one sentence —
      does the M ordinate survive WKT parsing — the single command that runs the reproduction, the
      prerequisites, and how to read each output file.
- [x] T002 [P] Write `spikes/edr-trajectory/compose.spike.yml`: a pygeoapi container pinned by
      digest, bound to a local port only, plus a second, minimal image pinned to a Shapely and GEOS
      combination below the FR-51 pin, so both halves of the probe run from one command.

---

## Phase 2: User Story 1 - M survives parsing, and is seen to (Priority: P1) 🎯 MVP

**Goal**: The load-bearing proof, and a demonstration of the failure mode it guards against.

**Independent Test**: Run the probe at both version sets; M values are recovered exactly at the pin
and are NaN below it.

- [x] T003 [US1] Implement `spikes/edr-trajectory/version_probe.py`: build a `LINESTRINGZM` whose
      vertices carry distinct Z and M values, parse it with `shapely.wkt.loads`, and report the
      recovered ordinates alongside the Shapely version and the GEOS version it was built against.
      Write it as an assertion the deployment can adopt unchanged.
- [x] T004 [US1] Run the probe at Shapely 2.1 or later on GEOS 3.12 or later; capture the output to
      `results/`.
- [x] T005 [US1] Run the probe below the pin; capture the NaN result and the absence of any exception
      to `results/`, since that silence is the whole reason FR-51 exists. **Done, and it found
      something better than this task expected.** Two combinations below the pin were run and both
      captured — `results/version-probe-below-pin-pygeoapi-image.{txt,json}` (Shapely 2.0.3 on GEOS
      3.12.1, the shipped image: M *absent*, not NaN) and
      `results/version-probe-below-pin-geos311.{txt,json}` (Shapely 2.0.7 on GEOS 3.11.4: M returned
      in the **Z** slot). Neither raised, which is the silence this task was after. **Note what is
      still unmeasured**: the NaN mode this task and FR-51 name needs Shapely >= 2.1 on GEOS < 3.12,
      and no such image was built. Both `FINDING.md` and ADR-0003 state that row of the three-mode
      table from Shapely's docstring rather than from a run, and it is the only row that rests on
      something other than this spike's own evidence.
- [x] T006 [US1] Extend the probe to record the vertical convention: whether Z is carried as
      elevation, what the coverage's depth axis will require, and which reconciliation the real
      provider must apply.
- [x] T007 [US1] Record the same probe for `LINESTRINGM` without a Z ordinate, so the
      three-dimensional route case is documented separately from the four-dimensional one.

**Checkpoint**: the one unproven thing is proven, or is proven false, in writing.

---

## Phase 3: User Story 2 - The geometry reaches a provider untouched (Priority: P2)

**Goal**: Verify the hand-off that FR-50 rests on.

**Independent Test**: One command up, one trajectory request, and the recorded hand-off matches the
request vertex for vertex.

- [x] T008 [US2] Implement `spikes/edr-trajectory/provider_stub.py`: the crudest EDR provider plugin
      that pygeoapi will accept, declaring the trajectory query type and recording the geometry,
      per-vertex coordinates, M values and query parameters it is handed, to `results/`.
- [x] T009 [US2] Write `spikes/edr-trajectory/pygeoapi.spike.yml` declaring one EDR collection over
      the fixture and selecting the throwaway provider.
- [x] T010 [US2] Implement `spikes/edr-trajectory/query.py` to build and issue a trajectory request
      with a time on every vertex, capturing the exact request URL, status, headers and body.
- [x] T011 [US2] Fetch and capture the collection metadata document, recording whether `trajectory`
      is advertised among the query types once the plugin declares it.
- [x] T012 [US2] Compare the recorded hand-off with the issued request vertex by vertex, and record
      every difference; the finding quotes this comparison rather than summarising it.
- [x] T013 [US2] Probe and record the practical trajectory length limit: the vertex count at which
      the request URL becomes unacceptable to the server or a proxy, and whether a POST form of the
      query exists.

**Checkpoint**: the seam the real plugin will sit at is documented from observation.

---

## Phase 4: User Story 3 - One four-dimensional route, sampled and scored (Priority: P3)

**Goal**: Turn the parsing proof into a demonstration of FR-20's actual claim.

**Independent Test**: The query script prints returned values beside both expectations and the
resulting errors.

- [x] T014 [US3] Design the analytic field in `spikes/edr-trajectory/make_fixture.py`: one parameter
      varying in latitude, longitude, depth and time, with time variation strong enough that a
      single-time evaluation is obviously wrong. Record the formula in the module docstring.
- [~] T015 [US3] Generate and commit the fixture under `fixture/` as CF-conventions NetCDF from a
      fixed seed, under 5 MB, carrying a metadata attribute stating that the data are synthetic.
      **Generated, not committed.** `make_fixture.py` writes `fixture/spike_coverage.nc` from seed
      `20260826`: CF-1.8, 342,037 bytes, `drogna_synthetic = "true"`, all three confirmed in
      `results/selfcheck.txt`. It is not in the tree because the repository's `.gitignore` excludes
      `*.nc`; `fixture/fixture_manifest.json` is committed in its place and `run.sh` regenerates the
      file. The finding records the conflict rather than resolving it — the spike owned only its own
      directory — and argues the regenerated form is the better one under NFR-07 ("seed data is
      produced by scripts, never accumulated"). Left partial rather than ticked because a reader
      cloning this repository does not get the fixture this task says is committed.
- [x] T016 [US3] Implement `spikes/edr-trajectory/expectation.py`: the route of the order of twenty
      vertices crossing latitude, longitude and depth, with vertex times deliberately falling between
      the coverage's time steps, and evaluation of the analytic field under both hypotheses.
- [x] T017 [US3] Implement `spikes/edr-trajectory/selfcheck.py`: the written fixture matches the
      analytic form within a stated tolerance, and the two hypotheses differ at every vertex by at
      least ten times that tolerance. Fail loudly if not.
- [x] T018 [US3] Extend `provider_stub.py` to evaluate the fixture at each vertex's own time and
      return CoverageJSON of the Trajectory domain, with a composite axis of per-vertex (t, x, y, z)
      tuples.
- [x] T019 [US3] Run the route query and capture the response; print returned values beside both
      expectations with the errors against each.
- [x] T020 [US3] Validate the response as CoverageJSON and record the domain type, the axis structure
      and anything a browser client would have to work around for the four-dimensional route
      rendering of FR-47.
- [x] T021 [US3] Probe and record boundary behaviour: vertices outside the horizontal domain, below
      the deepest level, beyond the last time step, non-monotonic vertex times, and a repeated
      vertex.
- [x] T022 [US3] Record whether values between coverage time steps were interpolated or snapped, and
      state which behaviour the real provider should implement and how the choice changes the error
      AT-01 will report.

**Checkpoint**: a four-dimensional route has been sampled and scored, not merely accepted.

---

## Phase 5: User Story 4 - The finding, and the groundwork handed to the build (Priority: P4)

**Goal**: One page the query-layer feature can build from, and an ADR that outlives the spike.

**Independent Test**: A reader drafts the provider plan without opening the spike's code.

- [x] T023 [US4] Create `spikes/edr-trajectory/findings-<run date>.md` with sections: question,
      method, evidence, result, handover to the build, deployment requirements, contingency.
      **Written as `spikes/edr-trajectory/FINDING.md`**, not under the dated filename this task
      proposed; the run date is the second line of the document instead, which is what ADR-0003 and
      `deploy/images/query-layer-pin-check.py` both cite. Every section asked for is present, plus
      two the task did not ask for: secondary findings, and a shelf-life note saying when the spike
      must be re-run.
- [x] T024 [US4] Write the result in one sentence near the top — whether M survives parsing at the
      pinned versions — with the Shapely version, GEOS version, pygeoapi version, image digest,
      fixture seed and run date beneath it, and the captured evidence quoted.
- [x] T025 [US4] Write the handover: the provider base class, the methods the real plugin must
      implement, where it lives under `query/`, how a collection selects it, and what FR-21 requires
      of the collection configuration so a new run becomes servable without editing it.
- [x] T026 [US4] Write the deployment requirements: the exact version pin, the comment that must
      accompany it saying what silently breaks below it, and the parsing test the deployment adopts
      from T003.
- [x] T027 [US4] Write the contingency section: what happens if M does not survive even at the pinned
      versions — parsing `coords` from the raw query string inside the plugin — with its cost and its
      consequence for the read path and the client's centrepiece.
- [x] T028 [US4] Write the ADR in `docs/adr/` (next free number) with Status, Context, Decision and
      Consequences: drogna builds a bespoke EDR trajectory provider because no supplied provider
      implements trajectory, and pins Shapely and GEOS because M is lost silently below those
      versions. Name the rejected alternatives and cite the finding by filename and date.

---

## Phase 6: Closure

- [x] T029 Confirm that nothing outside `spikes/` imports anything inside it, and that `spikes/`
      appears in the shared gate exclusion list delivered by feature 001. If that list has not landed
      yet, record the requirement in the finding so it is not lost. **Both halves now hold.** The
      finding recorded the requirement at run time, when feature 001's list had not landed; it has
      since, and `spikes` is in the single exclusion list in `scripts/_gate_lib.py`. Nothing outside
      `spikes/` imports anything inside it — the only reference is a docstring in
      `deploy/images/query-layer-pin-check.py`, which reimplements the assertion rather than
      importing it. The finding's other housekeeping item is still open and is deliberate:
      `spikes/` is not in `pyproject.toml`'s `[tool.ruff] extend-exclude`, because the spike's code
      passes `ruff check` and `ruff format --check` as configured, so the exclusion would be a
      convenience rather than a necessity.
- [x] T030 Verify the closure criteria: the fixture is under 5 MB, the reproduction completes within
      ten minutes on a clean checkout, and the timebox has not been exceeded. If it has, record what
      was established and what was not. **Two of the three are recorded against evidence**: the
      fixture is 342,037 bytes (`results/selfcheck.txt`), and the timebox — two sessions allowed,
      one used — is in `FINDING.md` under Closure, together with what was deliberately not
      established. The ten-minute figure is stated in `README.md` from the run ("a few minutes"
      first, "about twenty seconds" afterwards) rather than timed into a file in `results/`, so it
      is a report rather than a measurement.

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
