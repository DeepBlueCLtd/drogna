> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Feature Specification: The Map Surface

**Feature Branch**: `017-map-surface`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "Map surface for the browser client: tile-free deck.gl base
over the synthetic ocean, mounting the tested-but-unmounted uncertainty and route layers
from feature 012, with an OrbitView teaching volume mode." Finishes what feature 012
recorded as partial at T032 and T038: the uncertainty and route layers' data sides are
implemented and tested, and "what is missing in both is the map itself: feature 003
delivered the component diagram and not a map base, so there is nothing to put a layer
on."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The uncertainty field becomes visible (Priority: P1)

A viewer watching the running client sees the forecast uncertainty field drawn over the
scenario's own geography: a spatial surface whose extent, resolution and values come
entirely from data the client genuinely fetched, ageing visibly between model runs and
refreshing visibly when a new run is published. Feature 012 built, tested and recorded
everything about this display except the surface it draws on; this story is that surface.

**Why this priority**: it converts recorded partial work (012 T032) into a visible
deliverable, and every later map ambition — the route, the volume, provenance — stands on
it. It is also the first thing a site visitor will actually look at.

**Independent Test**: with the stack running and at least one run published, the field is
drawn georeferenced within the scenario extent; with no run yet published, the surface
states that plainly instead of drawing anything.

**Acceptance Scenarios**:

1. **Given** a published run whose field the client has fetched, **When** the map renders,
   **Then** the uncertainty field is drawn within the scenario's spatial extent at the
   layer's stated resolution, and nothing outside genuinely fetched data contributes a
   single drawn cell.
2. **Given** the display between two runs, **When** simulation time advances, **Then** the
   drawn field ages according to the decay behaviour 012 implemented, and the quality
   statement remains consistent with what is drawn.
3. **Given** a new `ctl/run-published` announcement, **When** the consequent fetch
   completes, **Then** the drawn field visibly refreshes, and at no point was anything
   drawn that was not fetched.
4. **Given** no run has been published since page load, **When** the map renders, **Then**
   it shows the scenario extent and graticule with a plain statement that no field has yet
   been received — the absence of data, not the absence of a display.
5. **Given** the rendered page in greyscale, **When** the field is inspected, **Then**
   value remains legible without colour (PR-08): magnitude is carried by an encoding that
   survives greyscale printing.

---

### User Story 2 - The route rides the same surface (Priority: P2)

The planner's published route is drawn on the same map: a curve through the scenario's
geography whose per-vertex arrival conditions (from the trajectory query the client
already issues) are readable at each vertex, labelled a recommendation and nothing more.

**Why this priority**: it completes 012 T038's recorded partial and puts the two layers
that motivated the map onto it. Depends on Story 1's surface.

**Independent Test**: publish a plan; the route is drawn with its vertices; selecting a
vertex shows the conditions the trajectory response reported for the arrival instant,
including a declined vertex shown as declined.

**Acceptance Scenarios**:

1. **Given** a published plan, **When** the map renders, **Then** the route is drawn with
   one vertex per published waypoint, and the display labels it a recommendation
   (Constitution VIII) with nothing to accept or execute.
2. **Given** arrival conditions fetched for the route, **When** a vertex is selected,
   **Then** the conditions shown are those the response reported for that vertex's
   arrival instant, and a vertex the response declined is shown as declined with its
   reason — never silently omitted and never invented.
3. **Given** no plan has been published, **When** the map renders, **Then** no route is
   drawn and the absence is stated.

---

### User Story 3 - The volume mode (Priority: P3)

A viewer can switch the same field into a three-dimensional view: the gridded volume with
its depth axis visible, rotatable and tiltable, drawn from exactly the data the flat map
drew. This is the teaching view the EDR anatomy work will later cut query shapes from;
this feature delivers the volume itself.

**Why this priority**: the flat map serves the product need; the volume serves the
teaching ambition. It must exist before the EDR anatomy can ride it, but nothing in
Stories 1 and 2 depends on it.

**Independent Test**: toggle into volume mode and back; the same run's data is shown in
both, no state is lost, and the depth axis is labelled with the coverage's own vertical
convention (depth, positive down).

**Acceptance Scenarios**:

1. **Given** a rendered field, **When** the viewer enters volume mode, **Then** the same
   run's data is drawn as a volume with a labelled depth axis, positive down, and
   returning to the flat view restores it unchanged.
2. **Given** volume mode, **When** the viewer rotates or tilts, **Then** interaction
   remains within the one rendered volume — no additional data is fetched by the act of
   looking.
3. **Given** volume mode with no field received, **When** it renders, **Then** the empty
   state is stated exactly as the flat map states it.

---

### Edge Cases

- Rendering machinery unavailable in the viewer's browser (no GPU surface): the shell
  and every non-map panel render normally, and the map region states what is missing and
  why, rather than presenting a blank or broken page. The shell-first ordering feature
  003 established is preserved.
- A field larger than the drawing budget: the existing downsampling with stated
  resolution (012) governs; the map never silently draws a subset without saying so.
- Viewport resize and narrow viewports: the map yields space rather than forcing the
  honesty statement or liveness panels out of view.
- A run whose grid extent differs from the previous run's: the surface re-derives its
  extent from the data, never from a remembered value.
- Capture (feature 016) drives the page: readiness is exposed as a queryable condition;
  no capture path waits on a fixed delay.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The client MUST render a map surface covering the scenario's spatial
  extent, with a graticule and extent frame, where the extent derives from served data or
  served configuration and never from a value written into client source (Constitution
  IV).
- **FR-002**: The map MUST fetch nothing from outside the harness: no basemap tiles, no
  external fonts, no third-party resources. Everything drawn originates in harness data
  or the client bundle.
- **FR-003**: The map MUST mount the uncertainty display: the field drawn at the layer's
  stated resolution, decaying between runs and refreshing on a genuinely received
  announcement, exactly as the tested data side (012) dictates.
- **FR-004**: The map MUST mount the route display: the published plan as a curve with
  per-vertex arrival conditions, labelled a recommendation, with declined vertices shown
  as declined with their reasons.
- **FR-005**: Every encoding on the map MUST remain legible in greyscale (PR-08): no
  state or magnitude is carried by hue alone.
- **FR-006**: The client MUST offer a volume mode presenting the same fetched field as a
  three-dimensional volume with a labelled depth axis (depth, positive down), entered and
  left without loss of state and without additional fetches.
- **FR-007**: Absence MUST be stated: no field, no plan, or no rendering capability each
  produce a plain statement in place of the missing content, never an empty surface that
  reads as healthy.
- **FR-008**: Nothing on the map may be drawn from data the client did not genuinely
  receive (Constitution VII). There is no demo mode, no fixture path, and no
  populate-for-the-screenshot path.
- **FR-009**: Selecting a drawn value MUST report its value, position, depth and the
  simulation time it belongs to, taken from the fetched data — the foundation later
  provenance work builds on, and no more than that.
- **FR-010**: The map MUST expose capture-compatible readiness: a capture can determine
  that the surface has drawn its current data without waiting a fixed interval (016's
  no-fixed-sleep rule).

### Key Entities

- **Map surface**: the drawable region representing the scenario's spatial extent;
  owns the graticule, the extent frame, and the mounting points for layers.
- **Field display**: the uncertainty/forecast field as drawn — resolution-stated,
  decay-aware, sourced from one fetched run.
- **Route display**: the published plan as drawn — vertices, arrival conditions,
  recommendation labelling.
- **Volume view**: the alternative presentation of the same field with the vertical
  axis made spatial.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the stack running at the default rate, a newly published run's field is
  visible on the map within 10 seconds of its announcement, with no operator action.
- **SC-002**: A viewer can read the value, position, depth and simulation time of any
  drawn cell in two interactions or fewer.
- **SC-003**: A page-load with the network inspector open shows zero requests to any
  origin other than the harness's own.
- **SC-004**: Two replays of the same scenario from the same manifest produce
  pixel-identical map captures at the same simulation instants (Constitution II, AT-04
  lineage).
- **SC-005**: In a greyscale print of the map, a reader can still rank three sampled
  cells by uncertainty magnitude correctly.
- **SC-006**: Volume mode is reachable in one interaction from the flat map, and
  switching either way completes without a fetch.

## Assumptions

- Feature 012's uncertainty and route modules are taken as delivered and tested; this
  feature mounts them and does not reopen their behaviour. Their recorded partials (T032,
  T038) are ticked by this feature's delivery, with the tick recorded in 012's
  `tasks.md` pointing here.
- The client's rendering stack is the one the constitution names for the client; the
  map introduces no new runtime dependency beyond what `client/package.json` already
  declares.
- The scenario spatial extent is available from served configuration or collection
  metadata; if it proves not to be, surfacing it is in this feature's scope on the
  serving side as a minimal addition rather than a client-side literal.
- **Parallelism**: this feature's client work lives in a map-owned area of the client
  source plus the mounting of two existing modules. It shares no directory with feature
  018's read-path work except the client shell's integration point, which both features
  treat as an append-only coordination point. It is independent of features 019 and 020
  and can be delivered in parallel with all three.
- The EDR anatomy's query-shape overlays on the volume are explicitly out of scope here;
  they arrive with the later client round that depends on this feature and 018.
