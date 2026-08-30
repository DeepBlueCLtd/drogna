# Feature Specification: The tabs beyond Operator

**Feature Branch**: `claude/engaging-tab-uis-01mfby`

**Created**: 30 August 2026

**Status**: Draft — written from a structured interview with the author, 30 August 2026

**Input**: "Let's work on the other tabs becoming more engaging. Interview me, to develop
new UIs for the tabs other than Operator."

## Context

Feature 113 landed and set a bar. The Operator tab is a flow chart with the loop drawn
as a loop, twenty bespoke faces, and three kinds of figure that never mix. Standing
beside it, the rest of the shell divides sharply in two.

Background (feature 111) is designed: ten explainers, a bespoke slide component, a
rail. The Map (109, extended by 113) is a deck.gl surface carrying the field, the
spread, the plan's doubt, advisories, the planner's route, the ownship track and the
EDR composer. Intro is prose and grows one section per beat, which is what it is for.

The other three are tables.

| Tab | What it is today | Lines |
|---|---|---|
| System | one `<table>`: component, beat, status, last heard, detail | 91 |
| Holdings | one `<table>` of holdings, and `<pre>{JSON.stringify(manifest)}</pre>` | 117 |
| Messages | one `<table>` of `JSON.stringify(payload)`, the topic tree behind a disclosure | 156 |

Each is honest, and each shows the least interesting projection of the most interesting
thing it has. Holdings holds a four-dimensional synthetic ocean and shows twelve
characters of a SHA-256. Messages carries every message the harness has ever passed and
shows them as a scrolling list of stringified objects, with the one genuinely animated
component in the shell — the topic tree, which pulses at a leaf and ripples up its
ancestors as traffic lands — folded behind a disclosure labelled "topic tree". System
shows a table of components that the Operator tab now draws better.

**Feature number.** 113 is the highest built. `docs/v2/plan.md` §5 records that the
110 slot was spent by the walkthrough and that 111, 112 and 113 sit outside the arc.
This sits outside the arc too: it changes no simulation, adds no component and moves no
data. It is entirely about what the shell shows of what already runs.

**It was specified as 114 and renumbered to 115** while the implementation was in
flight, when the operator-controls work took 114 on `main` and landed its own §5.14 with
FR-63 to FR-67. That is the same collision feature 113 met and it is settled the same
way: the tree is the authority, so the work still in flight moves rather than argues.
The requirements moved with it, from FR-63 to FR-70 into FR-68 to FR-75, and this
document is written throughout in the numbers that survived.

**SRD change.** New §5.15 carries **FR-68 to FR-75**. FR-14 (the tab list), FR-16 (the
component layout), FR-40 (the map), FR-46 (Holdings), FR-23 and FR-24 (Messages) and
FR-61 (the help control) are amended in place rather than left disagreeing with the
tree.

### What the interview settled, and what it rules out

| Decision | Consequence |
|---|---|
| Three yardsticks, all three: **something is moving**, **the reader can poke it**, **bespoke instruments** | A tab earns its place by showing the harness working, not by rendering its state. A tab that would pass only one of the three is not finished |
| A table may be **replaced** where the new display carries every fact — not kept beside it as 113 kept the list | Licence, not policy, and it is exercised exactly once: Holdings' timeline. Messages keeps its list, and System's table is not replaced but deleted with its tab, its two unique facts moving into a list that already exists. Where a table does go, the display that replaces it must itself be a keyboard and screen-reader surface, because nothing stands behind it to be one |
| **System folds away** | Six tabs become six again only because nothing replaces it: Operator's flow chart already draws every declared component greyed until heard, which is FR-16's whole obligation. Two facts System carried alone move to Operator's list first |
| `#/view/system` is **just gone** | No redirect, no tombstone. The shell handles an unknown view as it already does, and every link in the tree that named it is rewritten. A redirect would have kept a name for a thing that no longer exists |
| Holdings becomes **the store's timeline** and **truth against forecast** | Not a field preview and not a JSON anatomy: the two things a table cannot show are accumulation over time, and whether the forecast was any good |
| The comparison is **derived in the shell**, and says so | A fourth kind of figure joins 113's three. The shell may transform documents it was served; it may not invent a figure no document contains — and both sides of a difference were genuinely published and are re-fetchable by the reader from URLs the panel shows |
| Messages becomes **motion, tree, inspector** — in that order down the page | The traffic display is the headline, because it is what reads from across a room. The tree comes out of the disclosure. The inspector renders a payload against its master rather than as a blob |
| The map gains **no new layer** | The author's answer was parity, not addition: the ownship track and demanded heading appear in every projection, including the cube, where they are currently absent |
| The **yellow button moves into the tab**, and the header loses it | A tab with a walkthrough carries one at its top right; a tab without shows nothing. The absence becomes information: the button means *this tab explains itself* |

### What the second round settled, 30 August 2026

Two items were left open when the specification was first written. Both are now closed,
and the evidence is recorded because it is the part that cannot be reconstructed later.

| Question | Ruling | On what evidence |
|---|---|---|
| One feature, or split? | **One.** | The size argument is empty: 36 tasks against 113's 34 and 111's 43, each of which landed as the single long-lived PR PR-05 asks for. 113 also bundled two subjects — a flow chart and a new component with a motion simulator — less related than these four |
| Is the table-replacement licence a reversal of 113's rule? | **No — one exception, in one panel.** | Read against the requirements: Messages keeps its list, System's table is deleted with its tab rather than replaced. Holdings is the only place a table goes. The first draft of this specification overstated it as a general reversal |
| How is the Holdings parity decided? | **By a check written before the display**, bounded by the `coverage-holding` master | A verification written after the display is one the repository has already watched get squeezed |
| What is built first? | **Messages.** | The traffic display is the yardstick made visible — stop the sensors, watch the lane go still — so the design language is proved before three more surfaces are built on it. SC-01 and SC-02 land with it |

## User scenarios

### Story 1 — Watch the traffic stop (Priority: P1)

A reader opens Messages. Marks are arriving along lanes — the observation lane busiest,
the clock lane metronomic, control quiet. They open Operator in another tab of the same
shell and stop the sensors. Returning to Messages, the observation lane has gone still
while the clock lane beats on. Nothing was refreshed and no number was read: the lane
went quiet because the traffic did.

**Why this first**: it is the yardstick in one gesture. Something is moving, the reader
poked it, and the instrument is specific to the thing.

### Story 2 — Ask whether the forecast was any good (Priority: P1)

A reader opens Holdings after the loop has turned twice. The timeline shows the archive
as a long band, the nowcast advancing, and two instances as bars spanning their
validity. They pick an instance whose validity has elapsed. The panel finds the nowcast
holding covering that instant, fetches three coverages through EDR — the forecast, the
truth and the persistence reference the forecast must beat — and draws where the
forecast was wrong and by how much, with the persistence error beside it and telemetry's
own reported skill figure beside them both. Every URL it asked is on screen and copyable.

### Story 3 — Read a refusal where it happened (Priority: P2)

A message arrives that its master refuses. In the traffic display its mark is refused,
visibly. Selecting it opens the inspector, which renders the payload against the master
its topic declares — each field named, its unit shown — and marks the refusal *on the
field that caused it*, rather than printing a sentence above a blob of JSON.

### Story 4 — Take the tour of the tab you are on (Priority: P2)

A reader arrives at the Map from a deep link. The tab's own top right carries the yellow
button. It walks them through the projections, the layers, the time control and the
composer, and stops. They move to Holdings; that tab has its own button and its own
tour. They move to Intro; there is no button, and that is the honest answer.

### Story 5 — Turn the ship, in the volume (Priority: P3)

A reader watching the depth volume commands a new course from Operator. In the cube the
demanded heading appears as a ray from the platform's current position, and the track
behind it is genuinely three-dimensional — drawn at the depths the platform reported,
against the levels of the field it was sampling. Today the cube draws neither.

## Requirements

### System folds away

- **FR-68** The **System** tab shall be withdrawn, and its obligations discharged by the
  Operator tab. Before withdrawal, Operator's list view shall carry the two facts System
  carried alone: each component's **declared beat**, and the **liveness window** it is
  judged against — the second stated as declared configuration and distinguished
  typographically from reported and observed figures, per FR-58's rule. The tab shall not
  be removed while either fact exists in only one place.
  - `#/view/system` becomes an unknown view and is handled as the shell already handles
    one. No redirect and no tombstone: an address that resolves is a claim that the
    thing still exists.
  - Every reference in the tree shall be rewritten in the same change — `IntroPanel.tsx`
    links it twice, the `104` and `105` sections of the arc name it, and the walkthrough's
    component steps name panels by view id. A gate or test shall hold the shell to
    naming no view that `config.run`'s shell document does not declare, so the next
    withdrawal cannot leave a dangling link unnoticed.
  - The System panel's footnote — *"a grey row is a component that has not run yet, or
    has stopped — the display cannot tell you which, only the silence"* — is a true
    statement that must survive somewhere. It belongs on the Operator flow chart's
    legend, which already distinguishes the six states a node can be in.

### Holdings: the store's timeline

- **FR-69** The **Holdings** tab shall present the coverage store's inventory as a
  **timeline in simulation time**, not a list in arrival order. Each holding is drawn at
  the interval its own manifest says it covers — `grid.time` gives an origin, a start
  offset, a step and a count, so the interval is read from the holding rather than
  assumed — on a lane for its era: `archive`, `nowcast`, `instance`.
  - The timeline shall grow when the store announces a publication on its declared
    topic, and shall not poll (FR-46, unchanged).
  - The archive spans twenty years and an instance spans hours. The axis shall therefore
    carry both without either becoming invisible, and the panel shall say what scale it
    is showing rather than letting a reader infer it from tick spacing.
  - Selecting a holding shall open its embedded manifest whole, as FR-46 requires. The
    manifest is the ground truth AT-01 and AT-03 score against and is not summarised.
  - Where the inventory is refused or fails its master, the panel states the refusal.
    An empty timeline is a claim the shell is not entitled to make (Constitution VII).
  - The timeline replaces the inventory table — the one place in this feature where a
    table is replaced rather than kept or deleted with its tab. It must therefore be
    reachable and readable without a pointer: holdings are focusable in publication
    order, each announcing what the `coverage-holding` master declares about it.
  - **The parity check is written before the timeline is built**, and its bound is that
    master rather than the table's five columns: the master is the authority where the
    columns were one author's choice, it is amended and never casually rewritten, and a
    bound read from disk survives a holding gaining a field (CLAUDE.md, lesson 2). A
    field added to the master that the timeline does not announce is named by the check.
  - The field digest is announced as the twelve-character fingerprint the table already
    shows (`field.sha256` from the seventh character), not as sixty-four characters read
    aloud. Parity needs no argument because it is the same string.
  - **If the check cannot be satisfied, the table stays and the reason is recorded in
    `tasks.md`**, per the interview's condition. The check decides that, not a judgment
    made at the end of the work.

### Holdings: truth against forecast

- **FR-70** The tab shall offer, for a forecast **instance** whose validity has elapsed,
  a **derived comparison** against the truth published for the same instant.
  - Three coverages are fetched through the seam, by genuine EDR area queries at the
    chosen instant and depth: the **instance**, the **nowcast holding covering that
    instant** (the truth), and the **persistence reference** — the field held constant
    from the instance's own initial step. Principle IX admits no forecast-skill claim
    without a persistence reference, and a picture of forecast error alone is such a
    claim.
  - The panel shall draw the difference field for the instance and for the persistence
    reference, on one shared scale, and state which is closer. Where the model is not
    earning its compute, it says so — Principle IX's own words.
  - **The comparison is derived by the shell, and is labelled as derived.** This is a
    fourth kind of figure beside 113's declared, reported and observed, and it shall be
    typographically distinct from all three. The rule that admits it: *the shell may
    transform documents that crossed the seam; it may not invent a figure no document
    contains.* `map-data.ts` has transformed served coverages into cells and ranges
    since feature 109 under exactly that rule.
  - **The three request URLs shall be on screen and copyable**, as the EDR composer's
    are. A derived figure a reader cannot re-derive is an assertion.
  - The panel shall show **telemetry's own reported skill figure beside it**, and shall
    not recompute it. Telemetry scores skill at the observations, over a run's validity,
    and publishes it (`telemetry.schema.json`); this panel draws a field-wide difference
    at one instant. They answer different questions and the panel shall say which is
    which. A second implementation of skill in the shell would be free to disagree with
    the component that owns it.
  - Where no nowcast holding covers the chosen instant — the common case for an instance
    still inside its validity — the panel shall say so and offer nothing. It shall never
    compare an instance against itself, nor against a nowcast published before the
    instant it forecasts.

### Messages: motion, tree, inspector

- **FR-71** The Messages tab shall lead with a **traffic display**: received messages
  drawn as marks on lanes, arriving as they arrive. Lanes are the declared top-level
  namespaces from the topology artefact; a received topic no entry declares is drawn as
  an undeclared lane — a finding, never a silence (FR-24's rule, already honoured by the
  topic tree). A refused message is visibly refused in the display, not only in the
  count.
  - Motion comes from received traffic and nothing else. No animation may run when no
    message is arriving, because a display that keeps moving while the broker is silent
    is asserting traffic that does not exist (Constitution VII).
  - The running counters and the "N refused by their schema" claim survive unchanged
    (FR-23), including for the message kinds suppressed from view: everything received
    is still validated and still counted.
- **FR-72** The **topic tree** shall be a primary region of the panel rather than a
  disclosure. Its structure remains the derived topology artefact and its light remains
  received traffic, the two never mixing (FR-24, FR-25, unchanged). Selecting a node
  filters the traffic display and the list to that subtree.
- **FR-73** The **inspector** shall render a selected payload **against the master its
  topic declares**: fields named, units shown where the master declares them, and a
  refusal marked on the field that caused it. Where no master is declared for a topic,
  the inspector says so by name — the existing refusal — and falls back to the raw
  document. The raw document shall remain reachable for any message, because the wire
  form is the thing the seam actually carried.

### The map: the platform in every projection

- **FR-74** The Map panel shall draw the platform's historic track and its demanded
  course in **every projection it offers** — plan, globe and depth volume. The volume
  currently draws neither: `MapPanel.tsx` selects `cubeLayers` or `geographicLayers`
  whole, and the ownship layers exist only in the second.
  - In the volume the track shall be drawn at the depths the platform reported, against
    the levels the volume already draws. Ownship depth is a reported measurement
    (FR-54); a track flattened to the surface in a display whose subject is depth would
    be the panel discarding the one dimension that view exists for.
  - Nothing else about the map changes. This is parity, not a new layer.

### The walkthrough, per tab

- **FR-75** The help control shall be carried **by the panel it explains**, at that
  panel's top right, and not by the shell header. A view with a tour shows one; a view
  without shows nothing. FR-61 is amended accordingly: the control is still parameterised
  by its tour and still visually distinct from the controls that operate the harness, but
  it no longer needs to open a view before running, because it is already in it.
  - Tours land in this feature for **Operator** (the existing component tour, moved),
    **Map**, **Holdings** and **Messages**.
  - FR-61's completeness rule is generalised. The component tour is held to the declared
    component list; each new tour shall be held to something on disk in the same way —
    the map's to its own layer registry, Holdings' and Messages' to the regions their
    panels declare — so that a surface gaining a feature and not a step is reported by
    name rather than passing unnoticed. A bound typed into a test would not survive the
    next layer (CLAUDE.md, lesson 2).
  - FR-62 is unchanged and now applies four times: a tour teaches and does not report.
    No tour may claim any component's live state, and the test that holds the component
    tour to that shall cover every tour.
  - The narrow presentation folds header controls by presentation (ADR-0033, feature
    112). Moving the control out of the header changes what that fold applies to; the
    control shall reach the same place in both presentations, and FR-50 — the narrow
    presentation changes *where* a panel is, never *whether* it is — governs it.

### Mapping to SRD-v2

| Requirement | SRD | Amendment |
|---|---|---|
| FR-68 | FR-14, FR-16 | The tab list loses System; FR-16's obligation is named as discharged by the Operator flow chart, which already renders every declared component greyed until heard |
| FR-69, FR-70 | FR-46 | Extended: the inventory is a timeline, and a derived comparison joins the manifest view. The refusal rule and the no-polling rule are carried verbatim |
| FR-71 to FR-73 | FR-23, FR-24 | Extended: traffic is drawn as well as listed, the tree is promoted, the inspector is schema-aware. The refusal count claim is unchanged |
| FR-74 | FR-40 | Amended: the track and demand are required in every projection, the volume included |
| FR-75 | FR-61 | Amended: the control belongs to the panel, and the completeness rule generalises to every tour |

## Key entities and masters

No new master, and no change to an existing one. Everything this feature draws is
already published:

| What | Where it comes from | Kind |
|---|---|---|
| Component beat, liveness window | `config.shell`'s component list; `heartbeat.schema.json` | declared |
| Holding era, publication instant, coverage interval | `holdings-inventory`, `coverage-holding`, `manifest` | reported |
| Instance, nowcast and persistence fields | three EDR area queries, `coveragejson` | reported |
| The difference between them | computed here from those three documents | **derived** |
| Forecast skill against persistence | `telemetry.schema.json`, published by telemetry | reported |
| Traffic lanes, rates, refusals | the topology artefact (structure) and received messages (light) | declared + observed |

That the feature needs no new master is the strongest evidence it is the right feature:
everything a reader would want to see was already crossing the seam and was being shown
as a table.

## Success criteria

- **SC-01** Stopping the sensors from Operator visibly stills the observation lane in
  Messages within one publication interval, with no refresh and no reload — watched
  happening in the shell and captured (Constitution IX, PR-06).
- **SC-02** With the broker silent, nothing in the Messages panel moves. Planted and
  watched: a run with publication stopped shows a still display, and the check fails if
  the display animates anyway.
- **SC-03** Every column the Holdings table carried is announced by the timeline to a
  screen reader, and every holding is reachable by keyboard in publication order.
- **SC-04** The three URLs behind a comparison, pasted into the address bar, return the
  three documents the comparison was drawn from. Checked by test, not by eye.
- **SC-05** A comparison offered for an instance whose validity has not elapsed is
  refused with its reason. Planted: an instance in validity is selected, and the panel
  states why there is nothing to compare.
- **SC-06** No view id is named anywhere in `app/src` that `config.run`'s shell document
  does not declare. Planted: a link to `#/view/system` is reintroduced, the gate is seen
  to fail, and the plant is reverted — recorded in the commit message.
- **SC-07** The ownship track appears in all three projections in a captured proof, and
  the volume's track is drawn at reported depths rather than at the surface.
- **SC-08** Every tour is held to a list on disk, and a surface with an unstepped
  feature is named. Planted: a layer is added to the map with no step, and the check
  names it.
- **SC-09** No tour asserts any component's live state — the existing test, extended to
  all four tours.

## Deliberately not in this feature

- **Intro.** It is prose, it grows one section per beat, and it is doing its job. Making
  it "engaging" would mean making it a demonstration, and every demonstration it would
  contain is one tab away and linked from the sentence that mentions it.

  *Superseded by feature 118, 30 August 2026, and the reason is worth recording because
  this bullet was wrong in a specific way. The objection it answers — "engaging" meaning
  a second copy of a demonstration that lives one tab away — still stands, and 118 does
  not do that. What this bullet missed is that the numbered list was never answering the
  question a first-time reader arrives with, and that the tab had a subject of its own
  available: the architecture, which no other tab draws for a reader who has not met the
  system. The three yardsticks are met by that subject rather than by borrowing another
  tab's: something moves (the drawing grows), the reader pokes it (arrow keys, and every
  node is a way into its own step), and the instrument is bespoke to the thing.*
- **Background.** Eleven explainers, a bespoke component and a rail, landed at 111. It
  is the most designed surface in the shell and needs nothing from this feature.
- **New map layers.** The author's answer to "what would extend the map" was parity
  across projections and the walkthrough — not more to draw. A map with more layers than
  a reader can hold is a map that shows less.
- **A field preview per holding.** Considered and dropped: rendering every holding as a
  thumbnail is a picture of the store, where the timeline is a picture of the store
  *filling up*, which is the thing a table hides.
- **Recomputing skill in the shell.** Telemetry owns that figure. This panel draws a
  different thing and says so.
- **A component that serves differences.** The comparison is three ordinary queries and
  a subtraction of what came back. A new backend seam for it would be a component built
  to save the shell an arithmetic it is already entitled to do.
