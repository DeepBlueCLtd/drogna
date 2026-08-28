# Feature Specification: The Coverage Holdings

**Feature Branch**: `019-coverage-holdings`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "The harness's data landscape grows to what a voyage
actually carries: a historic archive of the synthetic ocean at monthly intervals, a
now-cast, and forecasts that accumulate from the moment the vessel leaves the quay —
each discoverable through the query layer's own enumeration, so a reader of the
collections can see what there is to ask and of which era." The shore-delivered
advisory product is a sibling feature (020), deliberately separate because it is
feature data rather than coverage data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Forecasts accumulate from departure (Priority: P1)

Today the harness keeps one current forecast run, with the runs listed as instances of
one collection. This story makes the accumulation explicit and scenario-shaped: from
scenario start ("departure"), every published run is retained and discoverable as an
instance carrying its issue time and its valid-time extent, so a viewer or client can
ask not only "what does the current forecast say" but "which forecasts existed at any
moment of the voyage, and what did each claim about a given instant".

**Why this priority**: it is the smallest step from what exists (instances are already
served) and it unlocks the most-wanted picture — the fan of issue time against valid
time — plus the honest question every voyage asks: which of several overlapping
forecasts should answer for the moment of arrival.

**Independent Test**: run a scenario long enough for three runs to publish; enumerate
the forecast collection's instances; all three appear with distinct issue times and
correct valid-time extents; an instance-addressed query answers from that instance's
field, not the current one.

**Acceptance Scenarios**:

1. **Given** a scenario in which several runs have published, **When** the forecast
   collection's instances are enumerated, **Then** every published run appears with its
   issue time and valid-time extent, and none has been silently discarded.
2. **Given** an instant covered by more than one instance's valid extent, **When** each
   instance is queried for that instant, **Then** each answers from its own field, and
   the answers are attributable to their instances.
3. **Given** the current-run semantics the harness already has, **When** a collection
   query names no instance, **Then** it is answered by the current run exactly as today
   — accumulation changes what is kept, never what "current" means.
4. **Given** a scenario replayed from its manifest, **When** the instances are
   enumerated, **Then** the set is identical — same identities, same extents, same
   count (Constitution II).

---

### User Story 2 - The historic archive (Priority: P2)

The harness carries a legacy archive of its synthetic ocean: one collection whose time
axis spans a multi-decade past at monthly intervals, authored deterministically from the
root seed at scenario provisioning. A reader discovering the collections sees the
archive's extent and resolution before asking anything; a query at a 1990s instant is
answered from the archive exactly as a query at a forecast instant is answered from a
run.

**Why this priority**: it is the holding that teaches discovery best — a temporal extent
radically unlike the forecasts' — and it exercises the query machinery against a coarse
axis. It depends on nothing in Story 1.

**Independent Test**: provision a scenario; enumerate collections; the archive appears
with its full monthly extent; a position query at an in-range historic instant answers
with values; the same query outside the archive's extent is declined, not extrapolated.

**Acceptance Scenarios**:

1. **Given** a provisioned scenario, **When** collections are enumerated, **Then** the
   archive appears with a temporal extent stating its span and monthly interval, and a
   spatial extent matching the synthetic ocean's.
2. **Given** a query at an instant between two monthly steps, **When** it is answered,
   **Then** the established interpolation rules govern — linear between steps, declined
   outside the extent, never snapped and never extrapolated.
3. **Given** two provisionings from the same root seed, **When** the archives are
   compared, **Then** they are identical (seed data is produced by scripts, never
   accumulated).
4. **Given** the archive's ground truth manifest, **When** recovery of an archived
   feature is claimed anywhere, **Then** the claim carries a measured error against the
   generator's recorded parameters (Constitution IX).

---

### User Story 3 - The now-cast (Priority: P3)

The harness serves a now-cast: a collection describing present conditions, refreshed on
its own cadence, whose single instance is continually replaced — the same
current-pointer semantics the forecast already uses, applied to "what it is like now"
rather than "what it will be like".

**Why this priority**: it completes the era triad — past, present, future — that makes
the discovery picture worth drawing. It reuses replacement semantics that already exist
and is deliberately last of the three.

**Independent Test**: with the scenario running, query the now-cast collection twice
across a refresh; the collection's stated temporal position advances; enumeration shows
one instance, not an accumulation.

**Acceptance Scenarios**:

1. **Given** the running scenario, **When** the now-cast refreshes, **Then** the new
   state replaces the old — one instance, its identity and time advancing — and the
   replaced state is not enumerable afterwards.
2. **Given** a now-cast query with no time stated, **When** it is answered, **Then** it
   is answered for the now-cast's own current validity, read from its data — never from
   any clock outside the simulation (Constitution I).
3. **Given** the now-cast's derivation, **When** its manifest is read, **Then** it
   records what the now-cast was derived from, so no consumer can mistake it for an
   independent measurement of truth (Constitution IX).

---

### Edge Cases

- Storage growth: instances accumulate for the length of a scenario; the retention rule
  (everything, for the scenario's duration) is stated in configuration, and reaching a
  configured ceiling is a refusal with the limit named — the house style — never a
  silent eviction.
- A query whose time range spans archive and forecast eras: each collection answers only
  from its own holding; nothing stitches eras together silently.
- The scenario is restarted: departure resets; the previous scenario's accumulation does
  not leak into the new one (a fresh instance is equivalent to a long-running one).
- Discovery documents versus stored data: an extent a collection declares must match
  what its store holds; a mismatch is a defect surfaced by test, not a display quirk.
- Exposure: new collections join the released path only by the explicit opt-in the
  boundary already enforces; adding a holding never exposes it by accident
  (Constitution X), and the leakage gate's corpus grows to cover the new holdings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every published forecast run MUST be retained and discoverable as an
  instance of the forecast collection, carrying its issue time and valid-time extent,
  for the duration of the scenario.
- **FR-002**: An instance-addressed query MUST be answered from that instance's field;
  a collection-addressed query MUST be answered by the current run, unchanged from
  today.
- **FR-003**: The archive MUST be one collection with a monthly time axis spanning a
  configured multi-decade past, authored deterministically from the root seed at
  provisioning, with a ground truth manifest recorded alongside (Constitution IX).
- **FR-004**: The now-cast MUST be one collection whose single instance is replaced on a
  configured cadence, deriving its validity from simulation time and recording its
  derivation in its manifest.
- **FR-005**: Every holding's discovery document MUST state its temporal and spatial
  extent truthfully, with a test comparing declared extents against stored data.
- **FR-006**: All holdings MUST answer through the same query machinery with the same
  interpolation and declinature rules the harness already enforces — linear inside the
  domain, declined outside it, bounds refused with the limit named.
- **FR-007**: Retention and ceilings MUST be configuration, validated by schema, with
  breach behaviour a stated refusal (Constitution IV for the values; house style for the
  refusal).
- **FR-008**: A scenario replayed from its manifest MUST reproduce the holdings
  byte-identically — archive, instance set, and now-cast states at corresponding
  simulation instants (Constitution II, AT-04).
- **FR-009**: New collections MUST NOT be exposed at the boundary except by the
  existing explicit opt-in, and the leakage gate's corpus MUST grow to include a
  released sample of each new holding (Constitution X).

### Key Entities

- **Holding**: a discoverable body of coverage data with an era: archive (past),
  now-cast (present), forecast (future).
- **Instance**: one version of a collection — for forecasts, one model run with issue
  time and valid extent; for the now-cast, the single replaced current state.
- **Archive month**: one step of the archive's time axis, authored from seed with its
  ground truth recorded.
- **Discovery document**: what a collection declares about itself — extents, intervals,
  parameters — required to match the store.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After three publications in a scenario, enumeration shows exactly three
  forecast instances with correct, distinct issue times; after replay, the identical
  three.
- **SC-002**: A reader can determine, from discovery documents alone, which of the three
  eras can answer for any named instant — no query required.
- **SC-003**: An in-extent archive query answers within the same latency bounds the
  forecast collection meets today; an out-of-extent query is declined with the extent
  named.
- **SC-004**: Two provisionings from one root seed produce byte-identical archives.
- **SC-005**: The released-path corpus check reports each new holding's released sample
  clean, and the boundary exposes no new path that was not explicitly opted in.

## Assumptions

- The SRD does not currently name these holdings; this feature extends scope beyond it.
  Recording that extension — an SRD amendment or an argued scope note — is part of this
  feature's delivery, and the plan's Constitution Check must address it rather than
  leave the spec silently wider than the SRD.
- "Departure" is scenario start; no separate pre-departure phase is modelled.
- The archive's parameters are the forecast's parameters (temperature, salinity, and the
  uncertainty treatment as applicable); introducing archive-only parameters is out of
  scope.
- Client-side rendering of the holdings (the discovery shelf) is a later client round;
  this feature's demonstrability is through the query layer's own responses and the
  existing client's unchanged behaviour, and the shelf feature owns the visible picture.
- **Parallelism**: this feature owns authoring and serving work in the services, the
  coverage store's layout convention, and the query layer's configuration. It touches no
  client directory and shares nothing with features 017 and 018. With feature 020 it
  shares only append-only files (contracts additions, configuration registries); the two
  can proceed in parallel under the shared-file rules. Within this feature, Stories 1, 2
  and 3 are mutually independent and can land in any order.
