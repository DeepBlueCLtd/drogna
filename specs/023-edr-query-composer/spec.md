# Feature Specification: The EDR Query Composer

**Feature Branch**: `023-edr-query-composer`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "interview me, to develop the requirements for deck.gl map
visualisation and interactions. I'm really interested in how it could be use to help an
operator create an OGC API EDR query for a range of different EDR query type (plus the
type of stored data that's being queries) then the query goes to pygeoapi, and the
results rendered in deck.gl. The output of this will be a new spec." Decided in the
interview that shaped this specification: the operator this serves first is a
demonstration driver, so the surface must make the query-building story legible to a
watching audience — each step names itself, and cause and effect are visible; the
composer is a guided sequence — collection, then query type, then geometry drawn on the
map, then parameters, then execution — offering at every step only what the query layer
genuinely serves; the literal request URL is always visible, assembling live as the
operator draws, and copyable; seven query types are in scope — position, radius, area,
trajectory, corridor, cube and locations — and the query layer grows the four it does
not yet serve rather than the composer offering anything stubbed; the targets are the
current forecast, retained runs through instances, and the observations; named locations
are both the seeded synthetic features and current sensor positions derived from
observations; observation selection is served by growing spatial predicates into the
SensorThings filter subset; a query that would breach a declared budget is predicted
before it is sent and the genuine refusal is still there to be seen; composition happens
as a mode on the existing map surface, not on a second canvas; one result is live at a
time; and the first story that must stand alone is a drawn area becoming a rendered
field. The sentence the composer must land: **the query is built where the data lives,
and the request is always shown**.

This is the amendment the SRD promised in §10: a graphical composer of EDR requests in
the client, deferred until the operator plane was standing and the map surface of
feature 017 had a selection model to build on. Both now exist.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A drawn area becomes a rendered field (Priority: P1)

A presenter opens the composer beside the map. They choose the forecast collection,
choose the area query type, and draw a polygon over the eddy on the same map the
audience has been watching. As each vertex lands, the request URL beside the map grows
the coordinates; as they pick temperature and a forecast hour, the URL grows
`parameter-name` and `datetime`. Nothing has been sent yet, and the audience can read
exactly what will be. On execute, one request goes to the query layer and the
temperature field paints inside the drawn polygon — and only inside it — on the map
where it was drawn. The presenter copies the URL, pastes it into a plain browser tab,
and the same response comes back: the map was never doing anything a curl could not.

**Why this priority**: it is the stated point of the feature — gesture to query to
rendered answer, visibly, in one screen. Every other query type is a variation on this
path once it stands.

**Independent Test**: with the local stack running and a run published, draw a polygon
over part of the extent, watch the URL assemble, execute, and see the chosen parameter
rendered inside the polygon and nowhere outside it; paste the copied URL into another
client and receive the same response through the boundary.

**Acceptance Scenarios**:

1. **Given** a published run and the composer in area mode, **When** the operator draws
   a polygon and selects a parameter and a time, **Then** the displayed URL contains
   the polygon's coordinates, the parameter and the closed datetime interval before
   anything is sent, and updates within a perceptible moment of each change.
2. **Given** a composed area query, **When** the operator executes it, **Then** exactly
   one request is made, and the response's values render inside the drawn geometry on
   the same map, in the established palette, with the run and parameter stated beside
   the result.
3. **Given** a rendered result, **When** the operator executes a different query,
   **Then** the previous result is replaced — one result is live at a time, and the
   display always states which query produced what is shown.
4. **Given** the displayed URL, **When** it is issued by any HTTP client through the
   boundary, **Then** the response is the same one the composer rendered.

---

### User Story 2 - A point becomes a profile (Priority: P2)

The operator chooses the position query type and clicks a point in the water. The URL
carries the point as WKT; execution returns the water column at that point, and a depth
profile draws beside the map — depth downward on the vertical axis, the parameter along
the horizontal, in the same palette as the map. Choosing radius instead and dragging a
circle out from the point asks for the neighbourhood rather than the point, and the
profile view states what the answer summarises. Clicking a point outside the forecast
extent is answered honestly: the composer states the extent before sending, and a sent
query renders the nulls as the refusal to extrapolate that they are.

**Why this priority**: position is the simplest full path through
composer → query layer → renderer, and the profile view it introduces is what
trajectory and corridor sections build on. Radius rides along as position with a
distance.

**Independent Test**: click a point inside the extent, execute, and read a depth
profile whose values match a position query issued directly for the same point;
click a point outside the extent and see the absence stated rather than drawn.

**Acceptance Scenarios**:

1. **Given** position mode, **When** the operator clicks the map, **Then** the URL
   carries the clicked coordinates as WKT and execution renders a depth profile of the
   returned column beside the map, in simulation time, with units stated.
2. **Given** radius mode, **When** the operator clicks and drags a radius, **Then** the
   URL carries the point and the distance with its units, and the drawn circle on the
   map is the circle the request describes.
3. **Given** a clicked point outside the announced extent, **When** the composer
   assembles the query, **Then** it states the extent and the fact the point is outside
   it before execution, and a returned all-null column is presented as
   refusal-to-extrapolate, not as a measurement of nothing.

---

### User Story 3 - A track becomes a section (Priority: P3)

The operator draws a line across the front — a planned transit — vertex by vertex.
Trajectory mode assigns each vertex its arrival time, and the URL carries the
`LINESTRING` with per-vertex times, exactly as the route surface already queries.
Execution renders an along-track section beside the map: distance along the line
horizontally, depth downward, the parameter's values as the curtain the vessel would
pass through, each column at the conditions forecast for its arrival moment. Corridor
mode is the same line with a width: the drawn buffer on the map is the corridor the
request describes. A vertex that falls outside the forecast extent comes back declined,
and the section shows it as declined — named, with the axis and extent that excluded it
— visibly distinct from a null.

**Why this priority**: it is the most operationally evocative story an ocean harness
can tell, and it exercises the hardest plumbing — per-vertex time encoding, the
request-line ceiling, declined vertices — early. It builds directly on the profile
view of Story 2.

**Independent Test**: draw a line of a handful of vertices inside the extent, execute,
and read a section whose per-vertex values match trajectory queries issued directly;
extend the line past the extent's edge and see those vertices declined by name rather
than silently null.

**Acceptance Scenarios**:

1. **Given** trajectory mode, **When** the operator draws vertices, **Then** each
   vertex carries an arrival time derived from announced simulation time — never from
   the host clock — and the URL updates with the growing linestring.
2. **Given** a drawn trajectory approaching the vertex budget, **When** vertices are
   added, **Then** the composer states the count against the declared budget before
   the limit is reached, and a request that would exceed the measured request-line
   ceiling is stopped in the composer with the reason — because past that ceiling the
   server's refusal has no readable body to render.
3. **Given** a response carrying declined vertices, **When** the section renders,
   **Then** declined vertices are marked as declined with the reason the response
   gives, distinguishable from vertices whose value is null.
4. **Given** corridor mode, **When** a width is set on a drawn line, **Then** the
   buffer drawn on the map is the corridor the URL describes, and the rendered result
   is labelled as the corridor's answer.

---

### User Story 4 - A volume in depth and time (Priority: P4)

The operator draws a rectangle, sets a depth range, and picks a time interval: a cube.
The URL carries bbox, `z` and the closed `datetime` interval. The result arrives as the
four-dimensional block it is, and the existing volume mode shows it in three
dimensions, exactly as the map surface already renders the announced field — entering
the volume view fetches nothing new. A time control steps the rendered result through
the time axis the response actually contains: the animation is a walk through received
data, never an interpolation between moments. Drawing a cube bigger than the declared
cell budget is predicted as such before sending, and sending it anyway renders the
server's refusal verbatim, naming the count and the limit.

**Why this priority**: cube is already served and already rendered — this story is
mostly composition and the time control — but it is the demonstration's spectacle, and
it is where the predict-then-refuse behaviour earns its keep on stage.

**Independent Test**: compose a cube within budget and step the result through its
time axis; compose one over budget, read the predicted cost, send it, and read the
server's own refusal naming the same numbers.

**Acceptance Scenarios**:

1. **Given** cube mode, **When** bbox, depth range and time interval are set, **Then**
   the URL carries all three, the projected cell count is stated live against the
   declared budget, and the datetime interval is always closed at both ends.
2. **Given** an executed cube, **When** the operator enters volume view or steps
   through time, **Then** no new request is made: both read the response already held,
   and every rendered cell is a cell the response contained.
3. **Given** a composed cube over budget, **When** the operator sends it regardless,
   **Then** the query layer's refusal is rendered verbatim — the count, the limit and
   the type of refusal — and the composer's prediction and the server's verdict agree.

---

### User Story 5 - Query the eddy (Priority: P5)

The operator opens locations mode and is offered a list the server advertises: the
seeded synthetic features — the eddy, the front — and the current positions of sensors,
derived from what they have reported, each named and marked on the map with its kind.
Choosing "eddy_a" composes a query by name — no drawing skill required — and execution
renders that feature's water column. It is the safest live-demonstration opener: one
click, and the named structure of the synthetic ocean answers.

**Why this priority**: it needs the locations query type built server-side and a
location list advertised, but the rendering it needs already exists by Story 2. It is
deliberately after the drawing stories because its value is convenience and narrative,
not new capability.

**Independent Test**: request the advertised locations list, see the same names marked
on the map, pick one of each kind, and receive a result for the advertised geometry;
confirm no location is a history — a sensor location is one current position, not a
path.

**Acceptance Scenarios**:

1. **Given** locations mode, **When** the list is shown, **Then** every entry is one
   the server advertises — features and sensor positions distinguished by kind — and
   nothing is offered that the server would not answer.
2. **Given** a chosen location, **When** the query executes, **Then** the URL names the
   location by its advertised identifier and the result renders at the advertised
   geometry.
3. **Given** the advertised list, **When** it is inspected over time, **Then** a
   sensor's entry is its current position only: the harness holds no location history,
   and the list never becomes one (Constitution V).

---

### User Story 6 - Other runs, and what was measured (Priority: P6)

The operator turns from the current forecast to the record. Choosing an instance —
a retained run picked from the catalogue — composes the same query types against that
run's paths, and the result is labelled with the run that answered. Choosing the
observations collection changes the vocabulary: the drawn geometry and time window
select observations — genuinely, server-side — and the result renders as the points the
sensors reported, each at its reported position and depth, coloured by its value in the
same palette as the fields. Forecast and measurement can thus be asked the same
question in turn, which is the harness's whole story told through one surface.

**Why this priority**: both targets ride on machinery the earlier stories build. They
complete the "type of stored data" half of the feature's brief but the demonstration
stands without them.

**Independent Test**: run the Story 1 area query against a retained instance and
receive that run's answer, labelled; draw the same area against observations with a
time window and receive only observations inside both the geometry and the window,
rendered at their reported positions.

**Acceptance Scenarios**:

1. **Given** an instance target, **When** any supported query type executes, **Then**
   the URL addresses the instance's own path, the result is labelled with the run
   identifier, and the offered time bounds are that run's, not the current run's.
2. **Given** the observations target and a drawn geometry with a time window, **When**
   the query executes, **Then** the request filters spatially and temporally
   server-side, and every rendered point is an observation the response contained, at
   its reported position and depth.
3. **Given** an observations query answering nothing, **When** the result renders,
   **Then** the emptiness is stated — a region and window with no observations is a
   fact, not a blank.

---

### Edge Cases

- **No run has been published yet**: the forecast target states its absence and
  composition against it is disabled with the reason — there is no extent to draw in
  and no time bounds to offer. The composer never invents an extent to make the
  demonstration look ready (Constitution VII).
- **The current pointer moves mid-composition**: a run published while the operator is
  composing is announced on the control channel; the composer restates the bounds it
  offers from the new run's manifest. A query already executed keeps its label: what
  is shown is what was answered, by the run that answered it.
- **A drawn query would breach a declared budget**: the projected cost — cells,
  vertices — is stated live against the limit, read from what the server declares and
  never typed into the client. The send is not blocked: the server is the authority,
  and its verbatim refusal naming count and limit is demonstration material. The one
  exception is the request-line ceiling, where the refusal arrives with no readable
  body; that case is stopped in the composer, with the reason stated (spike 002
  measured the ceiling; the composer predicts from the assembled URL's actual length).
- **Geometry wholly or partly outside the forecast extent**: stated before sending;
  values outside the domain come back null and are rendered as the refusal to
  extrapolate, and trajectory's declined vertices are named as declined. Null,
  declined and absent are three different facts and are never rendered alike.
- **An open-ended time interval**: cannot be composed. The query layer refuses
  open-ended intervals, so the composer's time controls always produce both ends,
  bounded by the manifest's extent — and offer no "now", because the harness has no
  now that is not a clock sample (Constitution I).
- **A query type or collection the server does not advertise**: not offered. The
  composer enumerates capability from the server's own metadata at composition time,
  so during rollout a not-yet-served type is absent with its absence stated, never
  greyed forever into the UI as a promise (Constitution VI, VII).
- **Rendering capability is absent**: the map cannot host drawing, and the composer
  states the degradation through the existing capability path rather than offering
  gestures that cannot land. The URL panel remains honest about why there is nothing
  to compose from.
- **The result is large**: rendering follows the established drawn-cell budget — a
  reduced resolution is stated, values are never averaged into cells the response did
  not contain.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The client SHALL provide a query composer as a mode of the existing map
  surface — same canvas, same extent, same rendering-capability probe and readiness
  signals — following a guided sequence: collection, query type, geometry, parameters,
  execution. Each step SHALL name itself in the UI, and the step order SHALL be
  visible, so a watching audience can follow the construction.
- **FR-002**: The composer SHALL offer only what the query layer genuinely serves:
  collections, query types per collection, parameters, extents and budgets SHALL be
  enumerated from server metadata and configuration delivered through the client's
  configuration document, never hard-coded (Constitution IV) and never stubbed
  (Constitution VI, VII). A capability the server does not advertise is absent, and
  stated as absent.
- **FR-003**: The literal request URL SHALL be visible at all times during
  composition, assembling live as geometry and parameters change, and SHALL be
  copyable. Each part of the URL SHALL be attributable to the gesture or control that
  produced it. The copied URL SHALL be a genuine GET that any HTTP client can issue
  through the boundary with the same result — the composer holds no session state the
  request depends on.
- **FR-004**: The composer SHALL support seven query types — position, radius, area,
  trajectory, corridor, cube, locations — and the query layer SHALL genuinely serve
  all seven over the coverage store: the bespoke EDR provider grows radius, area,
  corridor and locations alongside its existing position, cube, trajectory and
  instances. Advertised query types, the emitted OpenAPI document and the conformance
  statement SHALL be widened together, so what is claimed, what is advertised and what
  is served never disagree (Constitution VI).
- **FR-005**: Every new query type SHALL carry a declared budget with a named refusal,
  in the discipline the cube cell budget and trajectory vertex budget already
  establish: a request over budget is refused with the measured quantity and the
  limit, never truncated. The interface remains GET-only; budgets and limits SHALL be
  discoverable by the client rather than duplicated into it.
- **FR-006**: The composer SHALL predict a query's cost live during composition —
  projected cells, vertices, request-line length — against the server-declared limits,
  and state a predicted refusal before sending. Except for the request-line ceiling
  (stopped client-side with the reason, because the refusal past it carries no
  readable body), a predicted-over-budget query SHALL remain sendable, and the
  server's refusal SHALL be rendered verbatim.
- **FR-007**: The composer SHALL target the current forecast, any retained run through
  the instances mechanism (picked from the catalogue, with that run's own bounds
  offered), and the observations. An executed result SHALL always be labelled with the
  target that answered it.
- **FR-008**: The locations query type SHALL be backed by a server-advertised list of
  named locations of two kinds, distinguished: the seeded synthetic features, and
  sensor positions derived from reported observations. A sensor's advertised location
  SHALL be its current position only — the harness holds no location history, and this
  surface introduces none (Constitution V).
- **FR-009**: Observation selection SHALL be served by growing spatial predicates over
  the observation geometry into the SensorThings filter subset, so a drawn geometry
  filters server-side in combination with the existing temporal filtering. The subset's
  refusal discipline is unchanged: every unimplemented option is refused with the
  option named, and the conformance statement is widened to match what is now served.
- **FR-010**: Results SHALL render where they were asked for: gridded and area answers
  as cells on the map within the queried geometry, point answers as marked points,
  observations at their reported positions and depths — in the established palette and
  its greyscale discipline, under the established drawn-cell budget with any reduction
  stated. Vertical structure SHALL render in companion views beside the map: a depth
  profile for point-like answers, an along-track section for trajectory and corridor.
  Cube results SHALL be viewable in the existing volume mode and steppable through the
  response's own time axis; neither the volume view nor the time step SHALL fetch
  anything — both read the response already held, and nothing is ever drawn that the
  response did not contain (Constitution VII).
- **FR-011**: One result is live at a time: executing a query replaces the rendered
  previous result, and the display SHALL always state which query produced what is
  shown. Replacing a result discards it; the composer claims no history it does not
  hold.
- **FR-012**: Null, declined and absent SHALL be rendered as the three different facts
  they are: a null value is a refusal to extrapolate at a place the response
  addressed; a declined trajectory vertex is named as declined with the reason the
  response carries; an absent capability or empty result is stated in words. No
  placeholder, no zero-fill, no silent omission.
- **FR-013**: No instant in a composed query SHALL come from the host clock
  (Constitution I, ADR-0007): time controls are bounded by the target's manifest
  extents, produce closed intervals only, and offer no "now". Vertex arrival times in
  trajectory composition derive from announced simulation time.
- **FR-014**: A composer request SHALL happen only as the direct consequence of an
  explicit operator execution: exactly one request per execution, no timer, no retry,
  no polling, no background refresh. This is a deliberate, bounded exception to the
  client's announcement-caused fetch discipline and SHALL be argued in an ADR at the
  plan phase (see Assumptions) rather than slipped past the existing invariant's
  tests.
- **FR-015**: Every new shape crossing a boundary for this feature — the advertised
  locations list, discoverable limits, any addition to the client configuration
  document — SHALL be a declared schema with generated types on both sides of the
  chain (Constitution III), and every new server path SHALL sit under the existing
  collection prefix so the boundary's default-deny is undisturbed (Constitution X).
- **FR-016**: The feature's verification SHALL include: unit tests over the pure
  composition functions (URL assembly per query type, geometry-to-WKT conversion
  including the depth sign and per-vertex time encoding, cost prediction) with bounds
  read from declared limits rather than typed into tests; provider tests for each new
  query type including its refusal; and a stack-level check that a composer-built URL
  for each query type answers through the running boundary. Each check SHALL have been
  seen to fail on the fault it describes before it is trusted.

### Key Entities

- **Composed query**: the operator's construction in progress — target, query type,
  geometry, parameters, time interval — from which the URL derives at every change.
- **Advertised capability**: what the server says it serves — collections, query types
  per collection, parameters, extents, budgets — the composer's sole source of what to
  offer.
- **Query geometry**: the drawn thing — point, circle, polygon, line, buffered line,
  box with depth and time — as both the shape on the map and the coordinates in the
  request, kept identical by construction.
- **Named location**: one server-advertised queryable place — identifier, kind
  (feature or sensor), geometry — never a history.
- **Result coverage**: one response, held whole — its domain, values, declined
  vertices and reference systems — from which map cells, profiles, sections, volume
  and time steps all read without further requests.
- **Refusal**: a server's no, carried whole to the display — the quantity measured,
  the limit named, the type of refusal — and the composer's prediction of it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the local stack running and a run published, an operator can go
  from an empty composer to a rendered area result in under a minute, with the request
  URL visible and current at every step — observed through the boundary with no port
  published beside the proxy.
- **SC-002**: For every one of the seven query types, a query built in the composer
  returns a genuine response through the running stack and renders; none is stubbed,
  and the conformance statement names exactly the set that is served.
- **SC-003**: A URL copied from the composer and issued by a plain HTTP client through
  the boundary returns the same response the composer rendered, for every query type.
- **SC-004**: For queries composed at, just under and just over each declared budget,
  the composer's stated prediction agrees with the server's verdict in every case —
  verified with the limits read from the server's declarations, not from constants in
  the tests.
- **SC-005**: A viewer who has not seen the system before can, watching one
  composition, say afterwards what was asked (where, what parameter, when) and what
  came back — the gesture-to-URL-to-result correspondence is that legible.
- **SC-006**: Changing the simulation clock rate changes nothing about a composed
  query, and no composed instant can be traced to the host clock.

## Assumptions

- **Staging**: the stories are viable stopping points in priority order. Area to
  rendered field (P1) is the feature's spine; position and profile (P2) introduces the
  vertical view; trajectory and corridor (P3) the section and the declined-vertex
  honesty; cube (P4) the time control over an already-rendered kind; locations (P5)
  and the record targets (P6) complete the brief. Server-side growth can be staged the
  same way: area before radius before corridor before locations matches the stories'
  need order.
- **The server half is the heavier half, and its semantics are fixed here, not its
  implementation.** Radius, area, corridor and locations each answer only with data
  inside their geometry, each refuse over budget by name, and each return the same
  response format the served types already return. How each is computed over the
  gridded store — and what each one's budget is measured in — is the plan's to decide.
  The existing provider's structure (a base the trajectory provider extends) is the
  substrate; feature 008 owns those modules and this feature extends them additively.
- **Non-goals, decided in the interview**: the items query type; more than one live
  result, and any overlaying or comparison of results; free-draw-first composition
  (the guided sequence is the only entry in this feature); persisting or recalling
  composed queries; vector or current rendering (no such parameters exist in the
  store, and sound speed remains derived-not-stored per ADR-0005); any basemap. Each
  of these was weighed and deliberately not chosen; none is an oversight.
- **Two ADRs are owed at the plan phase.** First, the fetch invariant: the client's
  standing rule is that requests are caused by announcements, and spec 018's
  viewer-triggered re-ask is confined to request kinds the client already makes. FR-014
  creates a genuinely new class — operator-caused, once per execution, never timed.
  The interview weighed confining the composer to re-asking existing request kinds
  (rejected: it guts the feature) and routing execution through the operator plane's
  command channel (rejected: indirection that changes nothing about who caused the
  request); the ADR should record all three and the bound that keeps the exception
  from eroding the rule. Second, the SensorThings widening: spatial predicates enter a
  subset whose honesty has been its narrowness. The interview weighed client-side
  selection after a temporal query (rejected: the drawn geometry would not genuinely
  filter, and the page budget makes it a lie at scale) and serving observations
  through an EDR items type (rejected: it reshapes feature data into a coverage
  interface it does not fit); the ADR should record the choice and the conformance
  statement's amendment.
- **Discoverable limits are an expected new boundary shape.** The budgets live today
  in the query layer's configuration; the composer needs them at composition time.
  Whether they travel in the server's own metadata documents or in a declared shape of
  this feature's making, they cross a boundary and take the generated-types chain
  (Constitution III). The plan decides the carrier; this specification requires only
  that the client never holds a copy that can drift.
- **Verification scope**: unit tests at the composition layer, provider tests per new
  query type, and one stack-level answer check per query type (FR-016) are the chosen
  proof. Inclusion in the glance capture, and a recorded demonstration script, were
  considered and not chosen — the capture shows the running system's own traffic, and
  a composer result is operator-caused by definition; whether a composed result
  belongs in any capture is left to the capture features' own rules. Their
  non-selection here is a decision, recorded so it is not reread as an oversight.
- **Parallelism**: this feature owns this specification's directory and, at
  implementation, a new composer directory in the client beside the map's; it extends
  the map surface at its declared integration points and the query layer's provider
  modules additively, appends to the client configuration schema, the contracts
  masters and the shared append-only files, and rewrites none of them; it touches no
  store layout, no other service, and no existing surface's display beyond hosting
  composition mode on the map.
