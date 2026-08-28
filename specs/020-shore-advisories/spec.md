# Feature Specification: Shore Advisories

**Feature Branch**: `020-shore-advisories`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "Small forecast updates from shore during the voyage, in
the form of a concise vector product describing where dominant environmental features —
fronts, eddies — are or will be. They arrive mid-voyage over the message fabric, are
kept in a store of their own, and are served read-only through a feature-data standard,
leaving the pre-sail feature store's read-only-during-run rule intact." Decided in
planning: the advisory takes a new mutable path rather than relaxing C-07's rule, so
what was aboard at departure and what was sent en route stay structurally distinct.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An advisory arrives and becomes queryable (Priority: P1)

Mid-voyage, shore issues an advisory: a compact description of a dominant environmental
feature — a front's line, an eddy's centre and extent — with the time it was issued, the
period it claims validity for, and the geometry it describes. The advisory crosses the
message fabric like every other message (schema-validated, visible in the client's loop
view as a real transit), is persisted, and is thereafter queryable through the query
layer as feature data.

**Why this priority**: it is the whole point of the feature — a second, deliberately
different kind of forecast update, small where a field is large — and everything else
(discovery, conciseness claims, rendering) stands on an advisory actually arriving and
being served.

**Independent Test**: author one advisory into the running scenario; observe its transit
in the existing loop view; query the advisory collection and receive it with its
geometry, issue time, validity and provenance intact.

**Acceptance Scenarios**:

1. **Given** a running scenario, **When** shore issues an advisory, **Then** it is
   published on its declared topic, validates against its schema, and is drawn as a
   transit in the existing loop view — because it is a real message, and the client
   already shows those.
2. **Given** a persisted advisory, **When** the advisory collection is queried, **Then**
   the advisory is returned with its geometry, feature kind, issue time, validity
   period and shore provenance, unaltered from what was published.
3. **Given** a malformed advisory, **When** it arrives at the ingestion seam, **Then**
   it is refused with the schema violation named, is not persisted, and the refusal is
   observable — the quality-flagging seam's discipline applied to a new path.
4. **Given** the sensors' ACLs, **When** the advisory topic is examined, **Then**
   sensors can neither publish nor need to see it: the observation-branch confinement
   is unchanged.
5. **Given** a scenario replayed from its manifest, **When** the advisory set is
   compared, **Then** it is identical — same advisories, same times, same geometries
   (Constitution II).

---

### User Story 2 - The advisories are discoverable, and their provenance is structural (Priority: P2)

The advisory collection appears in the query layer's enumeration alongside the coverage
holdings, with a temporal extent that grows as advisories arrive. What was aboard at
departure (the pre-sail feature store: bathymetry, coastlines) and what was sent en
route (advisories) are different collections from different stores, so the distinction
survives every query without any consumer having to remember it.

**Why this priority**: discovery is what makes the advisory part of the data landscape
rather than a message that happened; the structural provenance is the reason planning
chose a new store over relaxing C-07's rule.

**Independent Test**: enumerate collections before any advisory has arrived and after
two have; the collection is present throughout, its extent empty then spanning the two
issue times; the pre-sail feature data remains served exactly as before, from its own
collection.

**Acceptance Scenarios**:

1. **Given** a scenario with no advisories yet, **When** collections are enumerated,
   **Then** the advisory collection is present and states that it is empty — the
   absence of advisories, not the absence of the collection.
2. **Given** arrived advisories, **When** the collection's discovery document is read,
   **Then** its temporal extent spans the advisories actually held, verified by test
   against the store.
3. **Given** the pre-sail feature store, **When** this feature is delivered, **Then**
   that store's read-only-during-run rule, provisioning path, and served collections
   are untouched.
4. **Given** the boundary, **When** the advisory collection is added, **Then** it is
   exposed only by the explicit opt-in path prefix, and the leakage gate's corpus
   grows to include a released advisory sample (Constitution X).

---

### User Story 3 - The advisory is small, and the claim is measured (Priority: P3)

The advisory's reason to exist is conciseness: a vessel on a constrained link can
receive "the front has moved here" when it cannot receive a full gridded field. The
harness states an advisory size ceiling in configuration, enforces it at authoring with
a refusal that names the limit, and measures the claim: the corpus records advisory
sizes against the size of the smallest gridded update carrying comparable information.

**Why this priority**: without the measurement the conciseness story is an assertion,
and the harness does not assert — it scores (Constitution IX, in spirit). It depends on
Story 1's advisories existing.

**Independent Test**: author an advisory over the ceiling; it is refused with the limit
named. Run the corpus measurement; the recorded ratio is reported, not asserted.

**Acceptance Scenarios**:

1. **Given** the configured ceiling, **When** an advisory exceeding it is authored,
   **Then** authoring refuses with the ceiling named — counted first, never truncated
   into something that looks complete.
2. **Given** the advisory corpus of a scenario, **When** the measurement runs, **Then**
   it reports each advisory's size and the comparison figure, and the numbers land in
   the scenario's recorded outputs rather than only in a log.

---

### User Story 4 - Advisories on the map (Priority: P4)

Where the map surface (feature 017) is present, advisories are drawn on it: the front's
line or the eddy's extent, within its validity, visibly distinct from measured and
forecast data, with issue time and validity readable on selection.

**Why this priority**: the visible payoff — but deliberately last and separable, because
it depends on another feature's surface and everything above it delivers value through
the loop view and the query layer without it.

**Independent Test**: with 017 delivered and an advisory in validity at the displayed
time, the geometry is drawn and selectable; outside its validity it is not drawn, and
its absence is a statement of validity, not a bug.

**Acceptance Scenarios**:

1. **Given** the map and an advisory valid at the displayed simulation time, **When**
   the map renders, **Then** the advisory's geometry is drawn, visibly distinct in a
   greyscale-legible way, and selection shows kind, issue time, validity and
   provenance.
2. **Given** an advisory whose validity has passed at the displayed time, **When** the
   map renders, **Then** it is not drawn, and the advisory remains queryable — display
   honours validity; the record honours history.

---

### Edge Cases

- Overlapping advisories describing the same feature: both are retained and served,
  ordered by issue time; nothing merges or supersedes silently. If explicit
  supersession is ever wanted, it is a schema change argued then, not an implicit rule
  now.
- An advisory stale on arrival (validity already passed): persisted and served with its
  validity honestly stated; consumers judge staleness, the store does not censor.
- Shore issues nothing all voyage: every display and collection states emptiness
  plainly; nothing invents an advisory for the demonstration (Constitution VII).
- The advisory store and the message fabric disagree after a fault: the store is the
  served record; re-delivery is idempotent by deterministic advisory identity
  (Constitution II), so a replayed message cannot double an advisory.
- Constitution V at the schema boundary: the advisory schema can express environmental
  geometry — fronts, eddies, gradients — and cannot express any entity the harness did
  not place. There is no field for another party's identity, position or motion, and
  the vocabulary gate plus schema review hold that line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The advisory shape MUST be defined once as a schema master under the
  contracts directory, with both language forms generated by the established chain
  (Constitution III), and MUST be expressible only in environmental terms: geometry,
  feature kind, issued and valid times, shore provenance — no field capable of naming
  an entity the harness did not place (Constitution V).
- **FR-002**: Advisories MUST be authored deterministically within the scenario from
  the root seed and simulation time (Constitutions I and II), on a configured cadence
  or trigger, so replay reproduces the advisory set exactly.
- **FR-003**: Advisories MUST travel the message fabric on a declared topic under the
  control namespace's conventions, schema-validated, with sensor ACL confinement
  unchanged.
- **FR-004**: A store of their own MUST hold advisories: writable during the run only
  through the advisory ingestion path, append-only (no update, no delete during a
  scenario), and read by the query layer alone. The pre-sail feature store is
  untouched in rule, content and provisioning.
- **FR-005**: The query layer MUST serve advisories read-only as a feature-data
  collection, enumerated alongside the existing collections, with a truthful temporal
  extent verified against the store.
- **FR-006**: Exposure MUST follow the boundary's explicit opt-in, and the leakage
  corpus MUST grow to include a released advisory sample (Constitution X).
- **FR-007**: A size ceiling MUST be stated in validated configuration and enforced at
  authoring with a refusal naming the limit; the scenario's outputs MUST record
  advisory sizes and the comparison figure against a comparable gridded update.
- **FR-008**: Malformed advisories MUST be refused at the ingestion seam with the
  violation named, and the refusal observable.
- **FR-009**: Map rendering of advisories (Story 4) MUST draw only advisories valid at
  the displayed simulation time, greyscale-legibly, with facts on selection — and MUST
  be separable from this feature's core so its absence never blocks Stories 1–3.

### Key Entities

- **Advisory**: one shore-issued statement about a dominant environmental feature:
  deterministic identity, feature kind, geometry, issue time, validity period, shore
  provenance, bounded size.
- **Advisory store**: the mutable-during-run, append-only holding of advisories,
  distinct from the pre-sail feature store.
- **Advisory collection**: the served, discoverable, read-only view of the store.
- **Shore authoring**: the deterministic in-scenario source that stands in for a shore
  organisation, and says so.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Within 10 seconds of an advisory's publication at the default rate, it is
  returned by the advisory collection with all facts intact.
- **SC-002**: Two replays of a scenario produce byte-identical advisory sets, and
  re-delivery of any advisory message changes nothing.
- **SC-003**: Every advisory in the demonstration corpus is at most the configured
  ceiling, and the recorded comparison shows at least a ten-fold size advantage over
  the smallest comparable gridded update — reported from measurement, not asserted.
- **SC-004**: The pre-sail feature store's tests pass unmodified, and no write to it
  succeeds during a scenario, exactly as before this feature.
- **SC-005**: With no advisories issued, every surface involved states emptiness; a
  reviewer finds no path that could draw or serve an advisory that was never published.

## Assumptions

- The SRD now names shore advisories. The scope extension this specification was
  written against was recorded by the v0.4 amendment of 28 August 2026:
  `harness-srd.md` §5.11 carries FR-59 to FR-66 (the advisory and its synthetic shore,
  seeded-feature vocabulary only, deterministic authoring, the message fabric and its
  ingestion seam, the store of its own, the read-only collection, the measured size
  ceiling, and the separable map rendering), §2's write story becomes one ingestion
  seam per store, §4's component table gains C-19 (shore advisory source) and C-20
  (advisory store), §10 places this feature below the line until the control loop's
  turn is demonstrable live, and §11 records the resolved question. The plan's
  Constitution Check therefore cites the amendment rather than proposing one.
- Where the advisory store lands is now decided: it is a **third schema in the one
  Postgres instance**, alongside `observations` and `features`. SRD FR-12 was amended to
  say three schemas rather than two, and FR-63 records the argument — what has to be
  separate here is who may write and when, which is a rule rather than an engine, and a
  second engine would buy that rule at the price of a second operational surface. Two
  things still belong to this feature's plan: the ADR (the decision was contested, and a
  lighter store outside the database was the rejected alternative), and the matching
  amendment to the constitution's technology line, which still reads "one instance
  carrying two schemas". Lane G did not amend the constitution; that is this plan's.
- "Shore" is a role played deterministically by the harness itself, and every surface
  that names it says it is synthetic; no external party or link is modelled beyond the
  message fabric already present. SRD FR-59 now states this in the requirement itself.
- A vector-product schema for fronts and eddies can borrow vocabulary from the
  generator's own feature parameters (the entities the harness places), keeping
  authoring honest against ground truth (Constitution IX) — the advisory describes what
  the generator seeded, at a stated fidelity.
- **Parallelism**: this feature owns the advisory schema (append to contracts), its
  topic declaration, its authoring path, its store, and the query layer's advisory
  collection. It shares only append-only files with feature 019 (contracts,
  configuration registries, the compose file if a service is added) and nothing with
  017 and 018 — except Story 4, which depends on 017's surface and is deliberately
  separable. Stories 1–3 can be delivered while 017, 018 and 019 are all in flight.
