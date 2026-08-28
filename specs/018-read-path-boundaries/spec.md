# Feature Specification: Read-Path Boundaries and the Topology Contract

**Feature Branch**: `018-read-path-boundaries`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "The read side of the boundary story: a standards overlay on
the client's existing panes, a generated-and-gated topology artefact, and a read-path
view — the query-side twin of feature 012's message inspector — with witnessed and
inferred edges distinguished, bounded per-edge history, and a viewer-triggered genuine
re-ask." Extends the boundary pedagogy 012 delivered for the command side (MQTT
boundaries, the message inspector, the bespoke/plumbing classification) to the
standards-governed read side, and turns the pub/sub topology from prose in
`docs/architecture/repo-layout.md` into a checked contract.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The request that just crossed (Priority: P1)

The client draws the read path — coverage store to query layer to proxy to this browser —
with each edge labelled by the standard that governs it, and the client's own requests
visibly crossing it. A viewer can select any boundary and read the last crossing in full:
the request the client composed, the response that came back, the simulation time it
carried, and the standard or schema governing it. The two server-side hops the browser
cannot witness are drawn, but marked as inferred from the response rather than witnessed.

**Why this priority**: it is the missing half of the system's boundary story. 012 lets a
viewer read the byte that crossed any command boundary; the architecture's central bet —
that reads are served only through published standards — currently has no equivalent
window. This story is that window, built only from traffic the client genuinely sent and
received.

**Independent Test**: change the route so the client issues a trajectory query; one
crossing is drawn per hop; selecting the browser-facing edge shows the actual request URL
and the actual response; selecting a server-side edge shows the same crossing marked
"inferred from the response, not witnessed".

**Acceptance Scenarios**:

1. **Given** the client issues a read (a trajectory query on route change, or the field
   fetch that follows a run-published announcement), **When** the read completes, **Then**
   a crossing is recorded on each edge of the read path, and no crossing is recorded for
   any read that did not occur.
2. **Given** a recorded crossing, **When** the viewer selects the proxy-to-browser edge,
   **Then** the request line, the response's declared type and size, the simulation time
   the response carried, and the governing standard are shown in full.
3. **Given** the two server-side edges, **When** either is selected, **Then** it is
   visibly and textually marked as inferred rather than witnessed, and the marking
   explains what the client actually knows and from where.
4. **Given** a boundary nothing has crossed since page load, **When** it is selected,
   **Then** the display says so — the absence of traffic, not the absence of a display.
5. **Given** the client in any state, **When** its behaviour is examined, **Then** every
   drawn crossing traces to a request the client genuinely made: no replay, no fixture,
   no demonstration path (Constitution VII).

---

### User Story 2 - The topology is generated, and it is gated (Priority: P1)

The repository's pub/sub topology — which component may publish and subscribe to which
topic, and which schema governs each — becomes a generated artefact: derived from the
tree by a scanner, consumed by the client in its generated form, and protected by a
drift gate registered alongside the existing gates. The hand-kept topic list in the
repository layout document stops being the authority and starts pointing at the artefact.

**Why this priority**: equal-first, because Story 3 renders this artefact and the
repository has already learned what an unmaintained record costs. A topology drawing that
can rot silently is a second `tasks.md`; the gate is what makes the drawing evidence.

**Independent Test**: plant a phantom topic in a component's source; the drift gate
reports the committed artefact stale and fails; regenerate; the gate passes; revert the
phantom. The failure is watched before the gate is believed, per the house habit.

**Acceptance Scenarios**:

1. **Given** the tree as committed, **When** the scanner runs, **Then** it emits the
   topology — publishers, subscribers, topics, governing schemas — from the tree's own
   sources, and the committed artefact matches its output byte for byte.
2. **Given** a topic added to any component, **When** the gates run without the artefact
   being regenerated, **Then** the drift gate fails naming the mismatch.
3. **Given** the artefact, **When** types are generated, **Then** both language forms are
   produced by the established generation chain, committed, and covered by the existing
   drift checking (Constitution III).
4. **Given** the repository layout document, **When** it describes topics, **Then** it
   defers to the artefact as authority rather than restating the list.

---

### User Story 3 - Who talks to whom, lit by real traffic (Priority: P2)

The client renders the topology as a matrix — components against topics, a mark where a
component may publish, another where it subscribes — whose structure comes from the
generated artefact and whose cells light only when real traffic crosses. The deliberate
choices become visible geometry: the observation topics consumed twice on purpose, and
the sensors' near-empty row on the control side (ADR-0012). Selecting a cell opens the
governing schema and the last real payload, through the same inspector 012 delivered.

**Why this priority**: it is the structural companion to 012's temporal loop view, and
the first consumer of Story 2's artefact. It depends on Story 2 and is independent of
Story 1.

**Independent Test**: with the loop running, cells light as messages genuinely arrive;
a cell whose topic has seen no traffic since page load renders its structural mark and
no lighting; selecting a lit cell shows the last payload and its schema.

**Acceptance Scenarios**:

1. **Given** the generated topology, **When** the matrix renders, **Then** every
   structural mark traces to the artefact and none to a value written in client source.
2. **Given** a message genuinely received on a topic, **When** the matrix updates,
   **Then** exactly the cells for that topic's publisher and subscribers light, and
   lighting decays or persists by the same rules the loop view uses for transits.
3. **Given** the ACL rule confining sensors to the observation branch, **When** the
   matrix renders, **Then** the forbidden region is visibly distinct from
   permitted-but-quiet cells.
4. **Given** a selected cell, **When** the inspector opens, **Then** it is the existing
   message inspector showing that topic's last real payload, schema name and simulation
   time — not a duplicate implementation.

---

### User Story 4 - The badges, the history, and the re-ask (Priority: P3)

Every existing pane gains a small badge naming the standard that delivered its contents,
linking to that standard's primer on the published site. The read-path view keeps a
bounded history of crossings per edge, browsable backwards. And a viewer arriving in a
quiet moment can press a control that issues one genuine request — a real read, really
answered — so the read path always has something to teach.

**Why this priority**: the badges are the cheapest orientation the client can offer; the
history and re-ask resolve the cadence question (a visitor should not need to wait for
the loop's natural rhythm) without ever rendering anything that did not happen.

**Independent Test**: toggle the badges and follow one link to the site's primer; browse
an edge's history to a crossing that is no longer the latest; press re-ask and watch a
genuine new crossing appear.

**Acceptance Scenarios**:

1. **Given** the badges enabled, **When** any data-bearing pane is inspected, **Then**
   its badge names the standard that delivered the pane's contents and links to the
   corresponding primer.
2. **Given** several crossings on one edge, **When** the viewer browses its history,
   **Then** at most the configured number are retained, the retained ones are shown in
   order, and the buffer bound is stated (the buffering idiom the client already uses).
3. **Given** the re-ask control, **When** the viewer presses it, **Then** the client
   issues one genuine request of a kind it already makes, the crossing is drawn from the
   real response, and the control is bounded so it cannot be driven faster than a stated
   minimum interval.
4. **Given** the re-ask control's provenance, **When** its crossings are inspected,
   **Then** they are indistinguishable in honesty from loop-driven crossings — because
   they are the same thing: a real request, really answered.

---

### Edge Cases

- A read that fails (network error, refusal, malformed response): the failure is a
  crossing too — drawn as a failure with the refusal or error the client actually
  received, never suppressed.
- The proxy is reachable but the query layer is not: the crossing shows what the client
  can witness (the proxy's answer) and the inferred edges state that nothing further is
  known.
- A response too large to retain in full: the history stores the facts and a bounded
  excerpt, and says it truncated — never a silently shortened payload presented as
  whole.
- The topology artefact and the running system disagree (a component publishes a topic
  the artefact lacks): the matrix shows the traffic in an "undeclared" region rather
  than dropping it — the tree is the authority and the artefact is a claim about it, and
  a live contradiction is surfaced, not hidden. CI's drift gate makes this transient.
- Re-ask pressed while its request is in flight: the control is disabled until the
  crossing completes; no queue builds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A topology master MUST exist under the contracts directory describing the
  shape of the topology artefact, with the artefact's instance derived from the tree by a
  scanner and both language forms generated by the established chain (Constitution III).
- **FR-002**: A drift gate MUST be registered by appending to the gates registry,
  failing when the committed artefact does not match a fresh scan, and MUST be watched
  failing on a planted violation before it is trusted, with the observation recorded in
  the commit message.
- **FR-003**: The client MUST render the read path with every edge labelled by its
  governing standard, drawing crossings only from requests it genuinely made and
  responses it genuinely received (Constitution VII).
- **FR-004**: The two server-side hops MUST be drawn marked as inferred, with the
  marking stating what is actually known and from where; the browser-witnessed hop
  carries no such marking.
- **FR-005**: The three read-path boundaries MUST join the existing boundary
  classification under its stated rule, each with its reason, held by the same
  classification test that holds every other boundary. *Amended 2026-08-28, under this
  spec's own Assumptions rule*: as drafted this requirement proposed store-to-query and
  query-to-proxy as bespoke core, but the tree already classified all three — plumbing,
  with reasons — in `client/src/legibility/classification.ts`, and under that table's
  stated rule (bespoke is what carries drogna's own judgement; a standard read interface
  is plumbing even where drogna wrote the provider) the tree's reading is the defensible
  one. The classification test wins, as the Assumptions said it would, and the
  requirement now records the reconciled reading rather than the superseded one. The
  count "twenty-two" was likewise stale against a layout that had grown; the test counts
  the table rather than trusting a number.
- **FR-006**: Selecting any edge MUST show the last crossing's request, response facts,
  simulation time carried, and governing standard or schema, reusing the established
  inspector idiom; a boundary without traffic states its absence.
- **FR-007**: The matrix MUST derive all structure from the generated artefact, light
  cells only on genuinely received traffic, and render the ACL-forbidden region
  distinctly from permitted-but-quiet cells.
- **FR-008**: Standards badges MUST be available on every data-bearing pane, naming the
  delivering standard and linking to the corresponding primer on the published site.
- **FR-009**: Per-edge history MUST be bounded with the bound stated, browsable in
  order, and truncation of stored payloads declared.
- **FR-010**: The re-ask control MUST issue only request kinds the client already makes,
  at most once per stated minimum interval, with each resulting crossing drawn solely
  from the real response.
- **FR-011**: All of this MUST arrive by progressive reveal from existing surfaces — no
  new top-level navigation; the read-path view opens from the standards edge context and
  the matrix from the topology context.
- **FR-012**: Traffic the artefact does not declare MUST be surfaced as undeclared
  rather than dropped.

### Key Entities

- **Topology artefact**: the generated statement of publishers, subscribers, topics and
  governing schemas; master in contracts, instance derived from the tree, gated.
- **Crossing**: one read recorded against one edge — request facts, response facts,
  simulation time carried, governing standard, witnessed-or-inferred.
- **Edge**: a boundary on the read path, classified bespoke or plumbing with a reason,
  witnessed or inferred.
- **Badge**: a pane-level statement of the delivering standard, linking to its primer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A planted phantom topic fails the gate run; after regeneration the gates
  pass; the failure was observed and recorded before first merge.
- **SC-002**: After a route change, a viewer can read the actual trajectory request and
  response on the browser-facing edge in two interactions or fewer.
- **SC-003**: A viewer arriving during a quiet loop can produce a fresh, genuine
  crossing via re-ask in one interaction, at most once per stated interval.
- **SC-004**: Every structural mark in the matrix is traceable to the generated
  artefact, and every lit cell to a received message; a review of the client finds no
  third source.
- **SC-005**: From any data-bearing pane, the delivering standard's primer is reachable
  in two interactions or fewer.
- **SC-006**: The repository layout document no longer carries an authoritative topic
  list; the artefact does, and the gate holds it current.

## Assumptions

- The boundary classifications named in FR-005 were settled by interview during
  planning; if the classification test rejects a reading, the test wins and the spec is
  amended (a specification that disagrees with the code is not automatically wrong, and
  the reverse holds too).
- The re-ask control is not a new query capability: it re-issues a read the client
  already performs (a trajectory query for the current route, or a field fetch for the
  current run). Anything beyond that is out of scope.
- Instrumentation of the client's fetch layer rides the injection seams the client
  already has; no service, store, or proxy changes are required, and none are in scope —
  the inferred-edge decision deliberately avoids trace headers.
- **Parallelism**: this feature owns the topology master (an append to contracts), the
  scanner and one registry line (appends to scripts), and read-path-owned areas of the
  client source. It shares only the client shell's integration point with feature 017,
  treated as an append-only coordination point, and shares nothing with features 019 and
  020. All four can proceed in parallel; within this feature, Story 2 blocks Story 3 but
  not Story 1.
