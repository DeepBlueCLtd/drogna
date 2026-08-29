# Feature Specification: The Background tab

**Feature Branch**: `111-background-tab`

**Created**: 29 August 2026

**Status**: Draft — written from a structured interview with the author, 29 August 2026

**Input**: "A series of visualisations, added to a new Background tab in the V2 UI, to
explain some architectural choices, including SensorThings, OGC API-EDR, NetCDF, MQTT.
Each will be a tab inside the Background tab, and be either a slides presentation or an
interactive infographic."

## Context

Features 101 and 102 have landed (`app/`, `srd.md` at the root, constitution 2.0.0),
so this feature builds on a real shell rather than a planned one: dockview hosts the
layout (ADR-0028), panels are registered from `config.run`'s `shell` document, and
`app/src/shell/views.ts` addresses a panel by hash. `plan.md` records the two places
this feature must reach into that shell, and why one of them amends ADR-0028.

**Feature number.** `docs/v2/plan.md` §5 reserves "a candidate feature 110" for
interactive walkthrough machinery. That candidate is unclaimed but named, so this
feature takes 111 rather than renumbering somebody else's slot.

**SRD change.** `srd.md` FR-14 named four top-level tabs. Background joins them, and
FR-14 is amended by this feature rather than the tab arriving without a requirement
behind it. Amending it surfaced a second omission and fixed that too: **Holdings**
shipped with feature 102 and the tab list never followed it, so the requirement named
four tabs while the shell served five. §5.2 still owes Holdings a requirement of its
own; that debt is stated in FR-14 rather than left to be discovered again.

### What was decided in the interview, and what it rules out

| Decision | Consequence |
|---|---|
| Audience is the technical evaluator, the domain expert without architecture, and future maintainers — **not** the generalist software engineer | Vocabulary is ocean-first. Every software concept arrives through a domain example. A Thing is a buoy, not an entity. |
| Explainers are **self-contained illustration**, not live | No explainer reads run state. Constitution VII is not engaged, because these tabs teach the standards; they do not stand in for a component. |
| The frame is **the standards themselves, drogna as worked example** | Reusable outside this repo. Where a tab claims something about drogna specifically, it links to the live view rather than depicting it. |
| **Value delivered**, not candidates-and-alternatives | Options are shown only where an option genuinely existed. The recurring axes are through-life cost, interoperability, and what you do not have to build. |
| A **bespoke slide component** | NFR-05's closed toolchain is unchanged. No slide library, no ADR, no amendment. |
| **60–90 seconds** per explainer | One idea per tab. Four to six steps, or a single interaction with one revealed consequence. |
| A **linear course**, dip-in tolerated | Order carries an argument, and each tab still stands alone. |
| **Schematic and abstract** visuals, deliberately unlike the Map panel | A diagram is never mistaken for a readout. |
| Cost claims stay **qualitative, and say so** | No invented figures. Consistent with the repo's habit of marking an unmeasured claim as unmeasured. |

## The eight explainers

Ordered as a course: what shape the data is → how it is stored → the two ways it is
served → the server that serves both → how consumers hear about it → the whole thing
turning.

| # | Explainer | Form | The one idea | The interaction |
|---|---|---|---|---|
| 1 | Why a standard at all | slides | A bespoke interface is cheap to build and expensive to live with. The interface should outlive the vendor. | — |
| 2 | Points and fields | interactive | Two irreducibly different data shapes. This is why 4 and 5 are a pair and not a duplication. | Sample a schematic sea: sparse dots against a filled grid |
| 3 | NetCDF | interactive | Self-describing. Units, CRS and time origin travel *in* the file, so a reader in thirty years needs no side channel. | Peel a 4D block apart: dimensions, coordinates, variables, attributes |
| 4 | SensorThings | interactive | Provenance is structural — every number walks back to the instrument that made it. | Walk buoy → sensor → property → stream → readings, with the URL shown at each step |
| 5 | OGC API-EDR | interactive | The query *is* a geometry. "Conditions along my track" is one request, not a client-side loop. | Choose position, radius, area, cube, trajectory or corridor and see what each returns |
| 6 | pygeoapi | slides | One server, many standards, plugin-shaped. New capability is configuration, not a project. | — |
| 7 | MQTT | interactive | A new consumer is a subscription, not a change to the producer. | A topic tree with wildcards: publish, and watch who catches it |
| 8 | The control loop | interactive | The loop is observable — every transition is a message you can watch. | Step sense → decide → act → publish; nudge it and watch it re-plan |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The course has a spine (Priority: P1)

An evaluator opens the Background tab and is met with a course, not a pile: a fixed
order, a visible position within it, and one explainer that establishes the argument the
other seven serve. They can leave after ninety seconds having understood why any of this
is standards-based, and they can send a colleague a URL that opens exactly what they
were looking at.

**Why this priority**: The tab's frame is the product. Explainer 1 plus the shared
value panel and the anchor scheme is the smallest thing that is genuinely useful, and
every later explainer is a fill of a shape this story defines. Without it, seven good
visualisations are seven orphans.

**Independent Test**: With the whole in-browser backend stopped, open the Background
tab, complete explainer 1's headline path, copy the anchor URL from a middle step, open
it in a fresh browser context, and arrive at that step.

**Acceptance Scenarios**:

1. **Given** no backend component has been started, **When** the viewer opens Background,
   **Then** the tab renders completely and the course is navigable end to end.
2. **Given** the viewer is on step 3 of explainer 1, **When** they copy the address and
   open it in a new context, **Then** step 3 of explainer 1 is shown.
3. **Given** an explainer has reached its final step, **When** the viewer looks at the
   closing panel, **Then** the same three value axes appear in the same position and
   order as in every other explainer.
4. **Given** the viewer is using a keyboard only, **When** they traverse the course,
   **Then** every step and every sub-tab is reachable without a pointer.

---

### User Story 2 - The shape of the data (Priority: P2)

A domain expert who knows a CTD cast from a forecast field, and has never had to care
how either is stored, works through explainers 2 and 3 and can afterwards say why a
sparse set of observations and a gridded field are different animals, and what a
self-describing file buys them in twenty years' time.

**Why this priority**: This is the load-bearing pair. Without it, an evaluator reads
SensorThings and EDR as two ways to do the same thing, and the whole standards argument
reads as indecision.

**Independent Test**: Complete explainers 2 and 3 with the backend stopped; each
finishes inside ninety seconds on its headline path and states its idea without
reference to any other explainer.

**Acceptance Scenarios**:

1. **Given** explainer 2's schematic sea, **When** the viewer samples it as points and
   then as a field, **Then** the two results are visibly different in kind, not merely
   in density.
2. **Given** explainer 3's 4D block, **When** the viewer opens the attributes,
   **Then** units, CRS and time origin are shown as travelling inside the file.
3. **Given** either explainer rendered in greyscale, **When** it is read,
   **Then** every distinction it draws survives the loss of colour.

---

### User Story 3 - The two ways it is served, and what serves them (Priority: P3)

An evaluator works through SensorThings, EDR and pygeoapi and can state what each
standard is for, what a query against each looks like, and what adopting a
standards-serving server hands them that they would otherwise write.

**Why this priority**: The three explainers the request was really about. They depend on
story 2 to land, which is why they follow it rather than lead.

**Independent Test**: Complete explainers 4, 5 and 6 with the backend stopped. Explainer
6 states plainly which system it describes.

**Acceptance Scenarios**:

1. **Given** explainer 4's instrument chain, **When** the viewer walks it,
   **Then** each step shows the URL that walks it, and the last step reaches a reading.
2. **Given** explainer 5's query-type chooser, **When** the viewer selects a query type,
   **Then** the geometry the query takes and the shape of what returns are both shown.
3. **Given** explainer 6, **When** the viewer reads it,
   **Then** it is unambiguous that pygeoapi describes the real deployment and is not
   what this browser is serving.

---

### User Story 4 - The moving parts (Priority: P4)

A viewer works through MQTT and the control loop and can describe how a new consumer is
added without touching a producer, and how a divergence becomes a published forecast run.

**Why this priority**: The most memorable pair, and the right closing impression — but
they teach behaviour rather than interfaces, and the interfaces are what the audience
came for.

**Independent Test**: Complete explainers 7 and 8 with the backend stopped; the control
loop steps through a full cycle from the viewer's input alone.

**Acceptance Scenarios**:

1. **Given** explainer 7's topic tree, **When** the viewer publishes to a topic,
   **Then** exactly those subscribers whose patterns match are shown catching it.
2. **Given** explainer 8 at rest, **When** the viewer steps the loop,
   **Then** each transition names the message that carries it.
3. **Given** explainer 8 mid-cycle, **When** the viewer perturbs the input,
   **Then** the loop is seen to re-plan rather than replay.

### Edge Cases

- **Nothing is running.** The normal case, not an error: Background must render
  identically whether the backend is up or stopped. This is the first thing to test, and
  the whole point of the self-contained decision.
- **A deep link names a step that no longer exists**, because the content was edited
  after the link was shared. The explainer opens at its first step rather than erroring
  or blanking; the anchor is a convenience, never state (SRD FR-15).
- **The panel is docked narrow.** A dockable layout means the viewer chooses the width.
  Below the minimum an explainer can honour, it must say so plainly rather than render a
  diagram too small to read.
- **Greyscale and print.** No explainer may carry a distinction that exists only in hue.
- **No pointer.** A drag-shaped interaction needs a keyboard equivalent, or it is not the
  headline path.
- **A drogna-specific claim goes stale.** Prose about the running system drifts even when
  no screenshot does. Claims about drogna are stated once, linked to the live view, and
  kept out of the diagrams. See Open Questions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Background MUST be a fifth top-level tab, positioned immediately after
  Intro, so a viewer is oriented before they meet the machinery. SRD-v2 FR-14 is amended
  accordingly.
- **FR-002**: Background MUST contain the eight explainers named above, in the order
  given. The order is the course's argument and is not viewer-rearrangeable, although
  the containing panel remains dockable like any other (SRD FR-14).
- **FR-003**: Each explainer, and each step within it, MUST be addressable by anchor URL
  per SRD FR-15, so a PR comment or blog post links to one step rather than to the tab.
- **FR-004**: No explainer may read run state, subscribe to the broker, issue a request
  across the seam, or depend on any component having started. Background MUST render
  completely with every component stopped, and this MUST be the condition its tests run
  under.
- **FR-005**: Where an explainer makes a claim about drogna specifically rather than
  about a standard, it MUST link to the live view that shows it, and MUST NOT depict it.
  A diagram illustrates a standard; the system speaks for itself.
- **FR-006**: The slides MUST be driven by a component built in this feature. No slide
  library is adopted, and SRD-v2 NFR-05's toolchain is unchanged by this feature.
- **FR-007**: Each explainer's headline path MUST be completable in 60–90 seconds. Depth
  beyond that belongs in the linked ADRs and site pages, not in the tab.
- **FR-008**: Each explainer MUST close on the same value panel, in the same position,
  with the same three axes: **through-life cost**, **interoperability**, and **what you
  do not have to build**. An axis carrying little weight for a topic MUST be omitted with
  the reason stated, never padded.
- **FR-009**: Every through-life-cost claim MUST be marked as a qualitative argument and
  not a measurement. No figure appears that the repository cannot support.
- **FR-010**: Language MUST be domain-first. A software concept is introduced through the
  ocean example that motivates it, never through its own vocabulary first.
- **FR-011**: Illustrations MUST be schematic and visually distinct from the Map panel,
  and every distinction they draw MUST survive rendering in greyscale.
- **FR-012**: Illustrations MUST use drogna's own seeded scenario vocabulary — the eddy,
  the front, the thermocline, the drifting feature (SRD FR-06) — so that a viewer moving
  between Background and Map recognises what they are seeing, while FR-005 keeps the
  drawings from claiming to be readouts.
- **FR-013**: The pygeoapi explainer MUST be written in the present tense about the real
  deployment, and MUST state plainly that V2 serves these interfaces in the browser
  rather than through pygeoapi, so no viewer concludes the running page is a pygeoapi
  instance.
- **FR-014**: Every explainer MUST be fully traversable by keyboard alone.
- **FR-015**: Background MUST NOT hold state that belongs to the run manifest. Position
  in the course is presentation, and is discarded like any other per-viewer convenience
  (SRD FR-14, FR-15).

### Key Entities

- **Explainer**: one sub-tab. Carries a title, a form (slides or interactive), an
  ordered sequence of steps, and exactly one closing value panel.
- **Step**: one addressable position within an explainer — a slide, or a named state of
  an interaction. The unit an anchor URL selects.
- **Value panel**: the fixed closing beat. Three axes, each either filled or explicitly
  omitted with a reason.
- **Course**: the ordered sequence of eight explainers, and the viewer's position in it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Background renders completely, and all eight explainers are traversable end
  to end, with every backend component stopped. Asserted by a test that starts nothing.
- **SC-002**: Background originates zero seam traffic. Asserted by a test that fails if
  any fetch or broker subscription is issued while the tab is open — watched failing
  against a deliberately-wired explainer before it is trusted.
- **SC-003**: Every explainer and every step is reachable by anchor URL, and an unknown
  step falls back to the explainer's first step rather than erroring.
- **SC-004**: Each explainer's headline path is completable in 60–90 seconds, measured by
  a walk-through capture rather than asserted.
- **SC-005**: Every explainer is legible with colour removed, verified by capture.
- **SC-006**: Every explainer is completable by keyboard alone.
- **SC-007**: Every value panel carries the three axes in the same order and position, and
  every omitted axis carries a stated reason. Asserted by a test over the content, so a
  ninth explainer cannot be added without one.
- **SC-008**: A reader who has completed the course can state why SensorThings and OGC
  API-EDR both exist, in terms of the shape of the data rather than the names of the
  standards. Assessed by asking one, not by a test.

## Out of Scope

- Live data of any kind in Background, including "show me this for real" controls that
  fire real requests. Explicitly considered and declined in the interview.
- Screenshots or captures of the running system embedded in explainers. Considered and
  declined: a screenshot is a claim about a tree that moves.
- The interactive walkthrough machinery that drives the other panels — the candidate
  feature 110 of `docs/v2/plan.md` §5. Background explains; it does not drive.
- Any explainer for a standard drogna does not use.
- Deep links *into* Background from the site or from blog posts. The anchors exist
  (FR-003); who uses them is another feature's business.

## Assumptions

- Feature 101 has landed: the dockable shell, the top-level tab bar, the panel-hosting
  pattern, and FR-15's URL-addressable views. Background is a consumer of all four and
  builds none of them — except the addressing, which it must extend below the panel
  (`plan.md`, T010 to T013).
- Features 103–109 have landed far enough that FR-005's outward links have somewhere to
  land. Where a target view does not exist yet, the link is omitted rather than left
  dangling, and the explainer still stands.
- The audience reads English and knows the maritime domain. No translation, and no
  glossary of oceanographic terms inside the tab — the site's glossary (SRD PR-04) is the
  place for that.
- Content is authored as data rather than as markup, so that FR-008's panel invariant and
  SC-007's test have something to read. The form that takes is the plan's business.

## Open Questions

Recorded as open rather than dissolved, per the repository's standing rule.

- **Q1. What keeps a drogna-specific claim honest over time?** FR-005 confines such
  claims to prose and links, which is where drift is least visible. The gate that would
  catch a stale claim does not obviously exist, and inventing one before the tab exists
  would be guessing. Revisit once there is content to check.
- **Q2. Is the value panel's third axis real for NetCDF?** "What you do not have to
  build" is strong for pygeoapi and SensorThings and looks thin for a file format.
  FR-008 permits omission with a reason, so this resolves in the authoring rather than
  here — but if two or more explainers omit the same axis, the axis is wrong, not the
  explainers.
- **Q3. Should the course record where a viewer got to?** FR-015 says no persisted state,
  which is right for the manifest and possibly wrong for a viewer returning to a
  half-finished course. Left as it stands; a per-viewer convenience could be added later
  without changing what any component does.
- **Q4. Does 110 or 111 win?** This feature took 111 to leave `plan.md`'s named candidate
  alone. If the walkthrough candidate is dropped, the numbers should be reconciled once,
  in the plan, rather than quietly.
