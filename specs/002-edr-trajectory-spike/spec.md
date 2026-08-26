# Feature Specification: EDR Trajectory Spike

**Feature Branch**: `002-edr-trajectory-spike`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD FR-20, §5.3 note, §10 delivery priority 2, §11 open question 1. AT-01 depends on the answer.

## User Scenarios & Testing *(mandatory)*

This feature is a spike. Its deliverable is a dated written finding with a runnable reproduction
behind it, not a component. It is complete when the question is answered and the answer is
recorded, whichever way the answer goes.

The question: **does pygeoapi's OGC API-EDR implementation support trajectory queries with
per-vertex timestamps, so that a response reports conditions forecast for the moment of arrival at
each point rather than conditions at a single time?**

### User Story 1 - A reproduction anyone can run (Priority: P1)

The author, or a colleague reading the finding a month later, brings up a pygeoapi instance over a
small synthetic four-dimensional coverage with one command, issues a trajectory query whose
vertices each carry their own time, and sees what comes back. The fixture is built so that a
correct per-vertex answer and an answer evaluated at one single time are obviously different
numbers, not two plausible ones.

**Why this priority**: Without a reproduction the finding is an opinion. The discriminating fixture
is the part that takes thought; a trajectory query that returns HTTP 200 with plausible but
wrong values is the outcome most likely to be believed by mistake.

**Independent Test**: From a clean checkout, run the one command, then run the query script. The
output shows the request, the response, and the two hypotheses' expected values side by side.

**Acceptance Scenarios**:

1. **Given** a clean checkout and a working container runtime, **When** the documented single
   command is run, **Then** a pygeoapi instance is serving an EDR collection over the fixture
   coverage within a few minutes, with no dependency on any other part of the harness.
2. **Given** the instance is up, **When** the trajectory query script runs, **Then** it prints the
   exact request URL, the HTTP status, the response body or its first part, and the values expected
   under each of the two hypotheses.
3. **Given** the fixture, **When** the analytic expectation is evaluated at each vertex's own time
   and at the first vertex's time, **Then** the two sets of values differ by at least an order of
   magnitude more than the fixture's numerical tolerance, so the verdict cannot turn on rounding.
4. **Given** the reproduction has been run, **When** the captured request and response are stored
   under the spike directory, **Then** the finding cites them rather than paraphrasing them.

---

### User Story 2 - A dated finding that answers the question (Priority: P2)

The finding says, in one sentence near the top, whether per-vertex timestamps are supported,
partially supported or unsupported, and then shows the evidence. It names the pygeoapi version, the
provider class, the container image digest and the request spelling used. It is dated, so a reader
knows how much of it to trust a year later.

**Why this priority**: This is the artefact the rest of the delivery order depends on. §10 puts it
second precisely because the read path and the client's centrepiece both change shape if the answer
is no.

**Independent Test**: A reader who has not seen the spike can state the verdict, the version it
applies to, and what would change it, after reading one page.

**Acceptance Scenarios**:

1. **Given** the reproduction has been run, **When** the finding is written, **Then** it states the
   verdict as exactly one of supported, partially supported, or unsupported, and names which part
   is partial where that applies.
2. **Given** the finding, **When** a reader looks for provenance, **Then** the pygeoapi version,
   provider class, image digest, fixture seed and date of the run are all present.
3. **Given** the verdict is negative, **When** the finding is written, **Then** it records the
   negative plainly, with no softening and no implication that a workaround makes the standard
   behave as FR-20 asks.
4. **Given** the finding, **When** a reader asks what would change the verdict, **Then** the
   finding names the specific conditions — a version, a provider, a pull request upstream — under
   which it should be re-run.

---

### User Story 3 - Fallback options treated as outcomes, not consolations (Priority: P3)

Each way forward is specified to the same standard as the happy path: what it costs, what it
changes in the read path, what it changes in the client's centrepiece, and what the harness may
honestly claim about standards conformance afterwards. A reader planning feature 008 or feature 012
can plan from this section without reopening the question.

**Why this priority**: The SRD says the read path and the client centrepiece both change shape if
per-vertex timestamps fail. That change of shape has to be describable before it is needed, or the
spike has answered only half the question.

**Independent Test**: Hand the options section to someone drafting the query-layer plan. They can
choose a path and enumerate its consequences without asking a further question.

**Acceptance Scenarios**:

1. **Given** the finding, **When** the options section is read, **Then** it carries at least the
   five options named in FR-011 below, each with cost, read-path consequence, client consequence and
   conformance consequence.
2. **Given** an option that abandons a single standards-conformant trajectory response, **When** it
   is described, **Then** the description says plainly which SRD requirement is no longer met in
   full and what weaker claim replaces it.
3. **Given** the option of a custom pygeoapi provider plugin, **When** it is described, **Then** it
   states where that plugin would live, what it would have to implement, and what it means for
   FR-21 (a new run becoming servable without editing collection configuration).
4. **Given** any option, **When** its cost is stated, **Then** the cost is in working sessions or
   days, not in adjectives.

---

### User Story 4 - The decision recorded and handed on (Priority: P4)

One option is recommended, the criteria on which it won are stated, and the recommendation is
transcribed into an ADR so it survives the spike directory being deleted.

**Why this priority**: The spike is disposable; the decision is not. PR-03 requires an ADR for
decisions that are hard to reverse or where a plausible alternative was rejected, and this is both.

**Independent Test**: The ADR can be read on its own and gives the decision, the context and the
consequences without reference to the spike.

**Acceptance Scenarios**:

1. **Given** the options have been costed, **When** the recommendation is written, **Then** it names
   one option and the criteria it won on: fidelity to FR-20, standards conformance, implementation
   cost, and risk to the client centrepiece.
2. **Given** the recommendation, **When** the ADR is written, **Then** it carries Status, Context,
   Decision and Consequences, and names the rejected alternatives.
3. **Given** the spike directory is later deleted, **When** a reader asks why the read path is
   shaped as it is, **Then** the ADR answers without the spike.

---

### Edge Cases

- **The dangerous outcome**: the query returns HTTP 200 with values that look reasonable but were
  evaluated at a single time. The fixture must be built so this is caught, which is why the
  discriminating margin in FR-004 exists.
- The trajectory query is rejected outright, or the query type is absent from the collection's
  advertised query types. Both are clean answers and are recorded as such.
- Trajectory support exists for one provider but not for the provider the harness intends to use
  over NetCDF coverage. The verdict must be stated for the provider the harness will actually use,
  not for the one that happens to work.
- The vertical coordinate is ignored while the temporal one is honoured, or the reverse.
- The response is CoverageJSON but not of a trajectory domain type, or carries one time axis for
  the whole trajectory rather than one value per vertex.
- Vertices fall outside the coverage domain in space, in depth, or beyond the forecast horizon. The
  behaviour — error, null, nearest value, extrapolation — is recorded, because AT-01 will meet it.
- The coverage's time steps are coarser than the trajectory's vertex times. Whether the
  implementation interpolates in time or snaps to the nearest step changes the error AT-01 reports,
  so it must be established, not assumed.
- A trajectory with many vertices makes the request URL long enough to hit a server or proxy limit.
  Whether a POST form of the query exists is part of the finding.
- The version tested is not the version the deployment later pins. The finding records the version
  and the re-run condition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The spike MUST determine whether pygeoapi's EDR implementation accepts a trajectory
  query whose geometry carries a time value per vertex and returns, for each vertex, the value at
  that vertex's own time. (SRD FR-20, §11 open question 1)
- **FR-002**: The reproduction MUST run from a clean checkout with one documented command and MUST
  NOT depend on any other part of the harness, none of which exists when the spike runs. (SRD §10
  priority 2)
- **FR-003**: The fixture coverage MUST be generated by a script from a fixed seed, be small enough
  to commit (target under 5 MB), be NetCDF with CF conventions, and vary in latitude, longitude,
  depth and time. (SRD FR-02 in miniature, NFR-07)
- **FR-004**: The fixture MUST make the verdict falsifiable: the values expected under per-vertex
  evaluation and under single-time evaluation MUST differ, at every vertex, by at least ten times
  the fixture's numerical tolerance. (SRD FR-20, AT-01)
- **FR-005**: The spike MUST record the pygeoapi version, the provider class, the container image
  digest, the fixture seed, the exact request URLs and the responses received. (SRD FR-20)
- **FR-006**: The finding MUST state the verdict as exactly one of supported, partially supported
  or unsupported, naming which part is partial where that applies. (SRD §11 open question 1)
- **FR-007**: The spike MUST additionally establish, for trajectory queries: whether the vertical
  coordinate is honoured; whether parameter selection works; what domain type the CoverageJSON
  response carries; and whether values are interpolated in time between coverage steps or snapped
  to the nearest step. (SRD FR-19, FR-20, AT-01)
- **FR-008**: The spike MUST establish whether the trajectory response is well-formed CoverageJSON
  that the browser client could consume for FR-47. (SRD FR-19, FR-47)
- **FR-009**: The finding MUST be a dated markdown document under `spikes/edr-trajectory/`, stating
  the question, the method, the evidence, the verdict, the options and the recommendation. (SRD
  §8.1, repo layout `spikes/`)
- **FR-010**: The finding MUST specify each way forward with its cost in working sessions, its
  consequence for the read path, its consequence for the client's centrepiece, and the claim the
  harness may honestly make about standards conformance under it. (SRD FR-19 to FR-21, FR-47)
- **FR-011**: The options considered MUST include at least: (a) native pygeoapi support used as
  is; (b) a custom pygeoapi EDR provider plugin implementing per-vertex trajectory evaluation;
  (c) client-side decomposition of the trajectory into one position query per vertex at that
  vertex's time, stitched by the client; (d) a non-standard trajectory endpoint in front of the
  query layer; (e) changing the client centrepiece from an arrival-time curve to a time-animated
  section of the forecast volume. (SRD FR-20, FR-47, §11 open question 1)
- **FR-012**: The recommendation MUST name one option and the criteria on which it won: fidelity to
  FR-20, standards conformance, implementation cost, and risk to the client centrepiece. (SRD
  FR-20, §10)
- **FR-013**: The finding MUST state the conditions under which it should be re-run, so its shelf
  life is visible. (SRD §11)
- **FR-014**: The recommendation MUST be transcribed into an ADR, which survives deletion of the
  spike directory. (SRD PR-03)
- **FR-015**: Spike code MUST be throwaway: nothing under `spikes/` may be imported by harness code,
  and the spike MUST NOT become the environment generator by accident. (SRD §1.1, repo layout)
- **FR-016**: The spike MUST be timeboxed. On expiry the finding records what was established, what
  was not, and recommends the option with the lowest risk given what is known. (SRD §10)
- **FR-017**: The fixture MUST be synthetic and MUST say so in its own metadata, so no artefact of
  the spike can be mistaken for real data. (SRD FR-01, Constitution V)

### Key Entities

- **Trajectory query**: A request for values along a path through the forecast volume, whose
  geometry carries latitude, longitude, depth and a time per vertex.
- **Per-vertex timestamp**: The time of arrival at one vertex, which is what the value returned for
  that vertex must be evaluated at.
- **Fixture coverage**: A small synthetic four-dimensional NetCDF field, generated from a fixed
  seed, whose analytic form is known so expectations can be computed rather than eyeballed.
- **Discriminating expectation**: The pair of value sets — per-vertex evaluation and single-time
  evaluation — whose separation makes the verdict falsifiable.
- **Finding**: The dated document: question, method, evidence, verdict, options, recommendation.
- **Option**: A way forward, with cost, read-path consequence, client consequence and conformance
  consequence.
- **Verdict**: Supported, partially supported, or unsupported, bound to a named version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader who has not seen the repository reproduces the result in under ten minutes,
  using one command and the spike's README.
- **SC-002**: The finding names the pygeoapi version, provider class, image digest, fixture seed and
  run date, and quotes the request and response verbatim.
- **SC-003**: At every trajectory vertex, the expected values under the two hypotheses differ by at
  least ten times the fixture's stated numerical tolerance.
- **SC-004**: At least five options are costed, each in working sessions, each naming its read-path
  and client consequences.
- **SC-005**: A reviewer drafting the plans for features 008 and 012 raises no question about EDR
  trajectory support that the finding does not answer.
- **SC-006**: The recommendation exists as an ADR with Status, Context, Decision and Consequences,
  and names the rejected alternatives.
- **SC-007**: No file outside `spikes/` imports anything inside it, verified by inspection and by
  the repository's gate exclusions.
- **SC-008**: The spike closes within its timebox, with a recorded verdict, including the verdict
  "not established within the timebox" if that is what happened.

## Assumptions

- The spike is timeboxed to two working sessions. The SRD sets no timebox; this is chosen so the
  spike cannot become a project, and FR-016 says what happens if the box expires.
- OGC API-EDR expresses trajectory geometry as WKT with measure and elevation components, the
  measure carrying time. If pygeoapi expects a different spelling, the spelling actually accepted is
  recorded as part of the finding rather than treated as a failure.
- The provider tested is the one the harness intends to use for NetCDF coverage under C-08 and C-09.
  If more than one candidate provider exists, each is tested and the verdict names the provider.
- The version tested is the latest pygeoapi release at the date of the spike. If the deployment
  later pins a different version, the finding's re-run condition applies.
- The fixture is a stand-in for the environment generator (feature 004), which does not exist yet.
  It is deliberately cruder: one analytic parameter varying in all four dimensions, enough to
  discriminate and no more.
- `spikes/` is excluded from the wall-clock, seeded-RNG and literal-path gates by the shared
  exclusion list owned by feature 001. The spike nonetheless uses a fixed seed, because a
  reproduction that cannot be reproduced is not one.
- The harness's own client library choice for CoverageJSON is not settled by this spike; the spike
  establishes only whether the response is well-formed and carries per-vertex times.
