# Feature Specification: the downstream consumer tabs

**Feature Branch**: `claude/srd-three-tab-spec-g7kwly`

**Created**: 30 August 2026

**Status**: Draft for development

**Input**: *Drogna — Downstream Consumer Tabs*, a Software Requirements Document supplied
by the author, reproduced in full at `specs/115-downstream-consumers/source-srd.md`.

## 1. What this feature delivers, visibly

Three new tabs — **Sampling**, **Courses** and **Feasibility** — appear beside the
harness's own, in bright yellow with black text, each under a strip that says
**"Downstream consumer — not part of drogna"** and will not scroll away.

They answer the question the harness has never answered on screen: *so what?* Drogna
samples an ocean, assimilates what it hears and serves the result. These tabs are three
notional systems that take that result and use it to reach a decision — where to go next,
which of four courses to take, and which of eight competing tasks can actually be done
tonight. None of them is part of drogna, and the screen says so from every angle a
screenshot can be taken.

The mechanism that makes the claim checkable is the **stale-then-refresh** ceremony. When
a new forecast is published, a consumer tab does not recompute. It grows a halo, offers
**"New forecast available — update"**, and waits. On the click it recomputes and keeps the
previous answer beside the new one as a ghost. A tab that faked its inputs would have
nothing to be stale about.

## 2. Scope, and the source of it

The author's SRD is the source of scope and is carried in this directory unmodified, so
that a reader can see what was asked for beside what was decided. This specification is
the implementable form of it: it settles the five open questions in the source's §6,
resolves the places where the source's illustrative numbers disagree with the tree, and
states the constitutional argument the source did not have to make.

**Feature number.** 114 is the highest taken (twice: `114-operator-controls`, landed, and
`114-engaging-tabs`, specified and unbuilt). This is **115**, and like 111–114 it sits
outside the arc of `docs/v2/plan.md` §5: it adds no component, changes no simulation and
moves no data across the seam that was not already crossing it.

**SRD-v2 change.** A new §5.15 carries **FR-71 to FR-80**. The numbering starts at 71
rather than 68 because the unbuilt `114-engaging-tabs` draft has already claimed
FR-63 to FR-70, and two features numbering the same requirement differently is exactly
the disagreement between record and tree this repository has paid for twice.

**Out of scope, and said so.** The source's §1.2 rules out every consumer that needs
drift — search and rescue, spill trajectory, man overboard — because drogna models no
current field. Nothing here assumes one. Adding a 2D current field would unlock that
class of consumer and is a separate piece of work.

## 3. The load-bearing decisions

### 3.1 The consumers are downstream, and that is what makes them lawful

Constitution VIII draws the line the harness lives behind: *the planner emits
recommendations; it does not command, task or advise a human directly* — and it names the
boundary explicitly as **who recommends, not who renders**. These three tabs are the
downstream that principle presumes. They advise. They rank. They say what you are giving
up. That is admissible precisely because none of it happens inside the harness, and the
yellow chrome is not decoration: it is the visible form of the boundary the constitution
draws.

Constitution V is the other line, and Tab 2 stands closest to it. It holds no third-party
entity: no track, no position anyone inferred, nothing the harness did not place. What it
holds is a **hypothesis about classes of vessel that may be present**, seeded across the
whole domain from a likelihood the reader sets on a slider. The distinction is the one V
already draws — what is forbidden is *an entity the harness did not place, whose position
it infers rather than knows* — and a Monte Carlo cloud over the entire domain infers no
position at all. To keep the code as clean as the argument, the words `contact` and
`detection` appear nowhere in it; the score Tab 2 computes is **exposure risk**, and the
vocabulary gate holds it to that.

### 3.2 A consumer may synthesise its inputs; it may never synthesise drogna's

The source's §1.1 permits synthesis freely, and Tab 3 needs it: drogna models no ferry
timetable, no satellite overpass and no crew watch cycle. Constitution VII forbids fixture
data. Both are right, and ADR-0036 records why they do not collide:

- A synthesised quantity is an input to a **consumer's own reasoning**, never a claim
  about a drogna component. Nothing synthesised is ever published back over the seam,
  and nothing in the harness's own tabs changes by a pixel.
- Every synthesised source is **labelled on screen as synthesised by this tab**, beside
  the sources that genuinely crossed the seam, which carry the collection or topic they
  came from.
- Synthesis is **seeded from the run manifest's root seed** through a named per-tab
  stream (Constitution II), so a replayed run produces the same ferry timetable, the same
  Monte Carlo cloud and the same candidate ranking.

The distinction a reader can check: turn the clock off and the synthesised lanes stand
still with everything else, because they are functions of simulation time, not of a
generator that runs on its own.

### 3.3 Every number comes from the tree, not from the source document

The source's §2.6 states the grid as 96 × 96 across 8 depth zones and the platform as
reaching the top three. The tree says otherwise: `app/config/run.json` declares a now-cast
grid of 96 × 80 × 6 over a domain 0–1000 m deep, and the platform's declared limit is
400 m. The shape of the requirement — *the vessel reaches the top of the water column and
the rest is forecast but unreachable* — survives exactly; the figures do not, and this
specification takes the tree (CLAUDE.md, lesson 1).

So no consumer tab contains a grid size, a depth-zone count or a reachable depth:

| Fact | Where the tab reads it |
|---|---|
| Horizontal extent of the domain | the EDR collection's own `extent`, fetched over the seam |
| Vertical extent | the same collection's vertical extent |
| How deep the vessel reaches | the deepest `maximum_depth_m` in the planner's published `indexing.depth_bands` — the planner plans only where the platform can go, so its own message says where that is |
| Depth-zone count, hex resolution range, time budgets, expendable rates, the roster, the lanes, the tasks, the confidence weights | a new `consumers` block in the shell's configuration document (Constitution IV) |

The consequence worth stating: with six zones over 1000 m and a vessel that reaches 400 m,
**the top three zones are reachable and the bottom three are not**, which is the source's
asymmetry arriving at the same place by a route that cannot go stale.

### 3.4 The tabs consume the seam, not the harness's insides

Everything a consumer tab reads arrives the way any downstream client's data would:

- **The forecast field** — a genuine EDR area query against the configured relative
  prefix, the same request the Map issues (`endpoints.edr`).
- **A new forecast exists** — the `run/published` message on the configured topic. That
  message is the halo's only trigger; nothing polls, and nothing recomputes without a
  click.
- **Observation coverage** — the observations that genuinely crossed the broker on the
  configured observation filter, binned by the consumer into its own hexes. Counted here
  and marked as counted here (FR-008's rule, carried).
- **Where the vessel is, and how deep it can go** — the platform state topic and the
  planner's published plan.

No consumer tab imports a backend module, reads a store, or knows whether the seam is
answered in this page or over a network (Constitution XI). The import-boundary gate holds
it to that.

### 3.5 One family, three tabs

The source's §2 asks that the tabs feel like one family, and each reuse the decisions of
its predecessors. The shared behaviour is therefore built once, in
`app/src/panels/consumers/`, and the three tabs are three panels over it:

- the frame — yellow chrome, the provenance strip, the synthetic-source legend;
- the freshness latch — the halo, the update click, the ghost;
- the hex grid — a resolution control and the aggregation of the underlying field;
- the seeded stream — one named per-tab generator derived from the run manifest.

## 4. Shared requirements

### 4.1 Visual separation *(source §2.1)*

A view declares its kind in configuration (`views[].kind`, default `harness`). A view of
kind `consumer` renders its tab in bright yellow with black text, in **both**
presentations — dockview's dock and the narrow stack — because a phone-width screenshot
carries exactly the same claim as a desktop one. The shell holds no list of which tabs are
yellow; it reads the kind.

Contrast is a requirement, not a preference: the yellow and the black on it must clear
WCAG AA for normal text, and the tab must remain distinguishable in greyscale — the
Background capture already proves greyscale legibility for that panel and the same proof
is extended here (`pnpm capture:background` grows a consumer-tab frame).

### 4.2 The provenance strip *(source §2.2)*

Every consumer tab's content area begins with a strip reading **"Downstream consumer —
not part of drogna"**. It is not dismissible, does not scroll, and is rendered by the
shared frame rather than by each panel, so a fourth consumer tab cannot be built without
it. It is present at both widths and is never abbreviated: the shell already holds this
rule for its own disclaimer (FR-007) and this is the same rule.

### 4.3 What a consumer stands on: the now-cast, then the forecast

**Corrected during the build, from watching it.** The first implementation waited for a
published forecast and drew nothing until one arrived — which, at the scenario's own
cadence, is several minutes of three blank yellow tabs. Honest and useless: a downstream
system opening at 0900 does not sit in the dark until the next model run, it works from
whatever the service is already holding.

So a consumer **starts from the now-cast the coverage store already holds**, read through
the ordinary inventory endpoint, and names which of the two bases it is standing on. Its
EDR collection identifier is the holding's own era, which is how the query layer names it.

This makes the ceremony of §4.4 stronger rather than weaker. With a now-cast answer on
screen, the **first** published forecast is already a change of basis: the halo goes up,
the answer does not move, the click produces the ghost — the whole demonstration from the
first minute, instead of after the first model run.

What does **not** raise a halo: the now-cast is itself replaced on its own cadence and
that replacement is announced. A consumer standing on a now-cast does not chase those.
FR-73's trigger is a published run becoming current, and a second staleness source would
make the halo mean two things.

### 4.4 Stale-then-refresh *(source §2.3)*

- A `run/published` message announcing a run that has become **current** marks every
  consumer tab stale. A publication that is not current is not a new forecast to a
  consumer and does not raise the halo; the message says which it is, so nothing here
  has to guess.
- A stale tab shows a halo on its tab and a control inside it reading **"New forecast
  available — update"**, naming the run and the simulation instant it became visible.
- **Nothing recomputes until the control is clicked.** The displayed answer keeps saying
  what it said, against the forecast it was computed from, and says which one that was.
- A forecast arriving when there is **no basis at all** — not even a now-cast — is taken
  up without ceremony and raises no ghost: there is nothing to be stale against. Found by
  a test, which read a ghost legend naming an empty run.
- On the click, the tab refetches and recomputes, and the previous answer is retained as
  a **ghost**: reduced opacity and a dashed outline, drawn beneath the new answer, with a
  legend naming the run it came from.
- **Ghost persistence** (source §6, open question 4, settled): the ghost is replaced by
  the next accepted update and may be dismissed explicitly. It is not cleared on a local
  control change, because a local change is exactly when the comparison is most useful —
  the reader is asking what the new forecast did, and re-tuning while looking at both.

### 4.5 Local controls recompute immediately *(source §2.4)*

Every control that is not the update button recomputes on the spot: resolution, depth
zone, time budget, expendable rate, roster, likelihoods, objective, weightings,
thresholds, confidence, task locks. No debounce, no apply button. The ceremony of §4.3
belongs to newly arrived upstream data and to nothing else.

Because the recomputation is synchronous and on the interaction path, each tab's
computation carries a stated bound — sample counts, candidate counts and cell counts come
from configuration and are chosen so the recompute stays interactive. Where a chosen
resolution would exceed the stated cell bound, the control refuses that resolution and
says why, rather than freezing the page.

### 4.6 Honest labelling *(source §2.5)*

The scalar Tab 1 colours its hexes by is labelled **"observation-driven uncertainty"**,
everywhere it is named, and the tab states in one sentence what it is derived from. It is
never called forecast uncertainty or ensemble spread, both of which drogna genuinely
publishes and neither of which this is.

The same rule generalises: a derived quantity carries the word that says what it is
derived from, and the panel names its ingredients. Tab 2's scores are `exposure risk` and
`objective achievement`; Tab 3's output is a **feasible set**, never a schedule.

## 5. Tab 1 — Sampling *(source §3)*

**The decision it supports:** where should the vessel go next, and where should it drop
what it cannot carry back?

### 5.1 Presentation

A map of the domain under a **hexagonal grid at reader-adjustable resolution** (H3, the
index the planner already publishes in). A hex aggregates the underlying grid cells it
covers, and the panel says how many — at the coarsest resolution that is a genuine
coarsening and the number makes it visible.

The vessel's current position is drawn from the platform state topic and is the planner's
starting point.

### 5.2 Observation-driven uncertainty

A hex's uncertainty is a proxy derived from observation coverage, per zone:

- **recency** — simulation time since the most recent observation binned into that hex
  and zone;
- **density** — how many observations that hex and zone have received;
- **age decay** — uncertainty grows monotonically with time since the last observation,
  toward a saturation it never exceeds.

A hex and zone that has received nothing sits at saturation.

**Where the observations come from, corrected during the build.** Counting only what
arrives after the tab opens draws an empty ocean for the first hour and calls it
uncertainty — watched happening. A downstream client reads the served history first, so
the view makes one paged SensorThings GET on opening (the last page of Observations,
filtered to the ocean datastreams by their CF standard names, so the platform's own
course, speed and depth are left out without this view holding a list of instrument
identifiers), and hears everything after that over the broker. It says on screen how many
it read and how many the service holds. A fresh visit is a fresh run, so early on that
history is genuinely short, and the number says so rather than the picture implying
otherwise.

**The shading runs between the values present**, not from zero to saturation, and the
range is printed beneath the map. Early in a run almost every hex is at saturation, and a
zero-to-saturation ramp draws one flat dark field that says nothing; scaling to the
observed range makes the water that *has* been sampled visible, which is the question the
tab exists to answer. It is the Map's own idiom.

The interface is deliberately the one a true ensemble spread would fit: the tab consumes a
scalar per hex per zone. Replacing the proxy with the published spread would change the
source and nothing else.

### 5.3 Depth *(source §3.3; open question 2, settled)*

All zones carry a value. The vessel reduces uncertainty only in the zones it can reach
(§3.3 of this document derives which). The chosen idiom is **a zone selector with a
per-hex stack**: the selector chooses the zone the hexes are coloured by, and each hex
carries a small vertical stack of ticks — one per zone, reachable zones marked distinctly
from unreachable ones — so a reader can see at a glance that a hex which looks well
sampled at the surface is blind at 600 m. It was chosen over small multiples because the
count of zones is configuration and a small-multiple layout that works for six breaks
for twelve.

### 5.4 Planning inputs *(source §3.4)*

| Control | Values | Source |
|---|---|---|
| Time budget | 3 h, 6 h, 12 h, 24 h | configuration |
| Expendable rate | 1 per hour, per 6 h, per 12 h, per 24 h | configuration |

The rate couples to the budget and the resulting **drop count is shown beside the
controls**, recomputed as either changes: twelve hours at one per six hours is two drops,
and the reader should not have to do that arithmetic to discover it.

### 5.5 Planning behaviour *(source §3.5)*

**Objective:** maximise uncertainty reduction within the time budget.

**Value per mile, not greedy-worst-first.** The planner scores a candidate hex by the
uncertainty it would collapse divided by the transit cost of reaching it from the current
route end, and it inserts rather than appends. The observable consequence, and the
acceptance criterion: between a 3 h and a 24 h budget the route changes **shape**, not
merely length — the short plan services a nearby cluster, the long plan reaches the
isolated worst cell it could not previously afford. A planner that always heads for the
worst cell fails this feature even if every test passes.

Transit cost uses the platform's own declared speed where the platform has reported one,
and says so; it never invents a speed.

**The route does not return to its start.** It ends where the budget expires.

**Expendable drops** address the zones the vessel cannot reach, are **constrained to lie
on the route**, and are drawn as distinct markers. Selecting one states which zone it
addresses and how much uncertainty it collapses there. Because a drop must lie on the
route, servicing a deep hotspot bends the route — **depth changes route shape**, and the
tab makes that visible by drawing the route it would have planned with no drops as a
faint comparison line.

### 5.6 Interaction sequence *(source §3.6)*

Budget and rate → plan → route with drop markers → new forecast arrives, halo, nothing
moves → update → new route, previous route ghosted.

## 6. Tab 2 — Courses *(source §4)*

**The decision it supports:** of three or four ways to do this, which one, and what am I
trading?

### 6.1 What it holds, and what it does not *(source §4.1)*

Hypothetical classes, seeded across the domain from a likelihood. No track, no position
anyone claims to know, nothing the harness did not place. The panel says this in its own
words on screen, under the provenance strip, because the yellow tab explains the boundary
to someone who knows the argument and this sentence explains it to someone who does not.

### 6.2 The roster *(source §4.2)*

Three classes, each includable and each carrying a likelihood from 1 to 10:

| Class | Behaviour |
|---|---|
| Ferry on timetable | a fixed corridor on a schedule — predictable in space and time |
| Fishing vessel | loiters over the shallows — clustered in space, unpredictable in time, indifferent to the vessel |
| Evasive submarine | seeks poor detectability, reading the forecast field drogna already publishes — responsive |

The likelihood sets **Monte Carlo seeding density**, so a submarine at 2 beside a trawler
at 9 produces a materially different cloud, and therefore a different ranking, from the
reverse. The tab is expected to be driven live with exactly that comparison.

### 6.3 Behaviour drives motion *(source §4.3, a requirement)*

Each class has its own motion model, not its own multiplier. The ferry advances along its
corridor at its scheduled speed; the fishing vessel executes a seeded random walk confined
to the shallow band, resampling its loiter centre rarely; the submarine performs a seeded
descent toward locally low detectability, read from the forecast field the tab already
fetched. **The three clouds must be visibly different in character**, and that is an
acceptance criterion with a picture attached, not a note.

Every draw comes from the tab's seeded stream (Constitution II).

### 6.4 Objective and candidates *(source §4.4, §4.5)*

An objective is chosen from **evasion, investigation, monitoring, stealthy
reconnaissance**. The tab produces **three or four candidate courses**, never one, each
carrying at minimum:

- **exposure risk** — how much of the course sits where the cloud is dense and the water
  carries well;
- **objective achievement** — how much of what the chosen objective wants the course gets;
- **a headline score** — the weighted combination, with the weighting on screen.

A single recommendation is refused deliberately: it invites disagreement with the whole
idea rather than with the weighting, which is the argument actually worth having.

### 6.5 The weighting flips the ranking *(source §4.6)*

Sliders set the weighting and recompute instantly. **The ranking must be able to flip**
within the slider's range for a representative roster — a candidate set whose order never
changes has not demonstrated a trade-off, and the tab would be reciting. This is a
property of the candidate generator: candidates are drawn to span the trade rather than
sampled at random, and a test holds the flip.

**And the view says when there is no trade to make.** Under *evasion* the two components
move together — staying clear of the density is both what the objective wants and what
lowers exposure — so no weighting reorders anything. That is a property of the objective
rather than a defect, and a slider that cannot change the answer is worse than no slider
if nobody is told; the view states it in its own words. The view therefore opens on an
objective where the trade is real (`default_objective`), rather than on whichever happens
to be first in the list.

## 7. Tab 3 — Feasibility *(source §5)*

**The decision it supports:** it is 1800; which of these eight things can I still do?

**No map.** Deliberately: the point is that environmental data settles questions that are
not about *where*.

### 7.1 Presentation *(source §5.1)*

A Gantt-style timeline, time running horizontally from the forecast's own validity start.
Two bands: **source lanes** below, **derived feasibility** above.

**The horizon is longer than the forecast, and says so.** The first draft of this
specification cut the horizon to the forecast's validity span, on the argument that a
consumer should reason over exactly the window drogna claims to know about. The tree
disagreed, in the shape of a run whose validity span is one hour: with a horizon of one
hour, a three-hour task cannot be scheduled at all, and the tab answered "nothing is
feasible" for the least interesting reason available. So the horizon is configuration
(`horizon_hours`), anchored at the forecast's validity start, and it is the **served lane**
that stops where the forecast stops — blank thereafter, so a task depending on it cannot be
scheduled past that point. That is a truer picture than a line drawn confidently across
water nobody forecast, and it makes the forecast's own reach visible on the timeline
instead of hiding it in the axis.

### 7.2 Sources *(source §5.2)*

Ten lanes, declared in configuration, each marked with its provenance — from the seam, or
synthesised by this tab (§3.2):

| Source | Lane | Provenance |
|---|---|---|
| Tidal state | continuous | synthesised |
| Daylight and twilight | boolean | synthesised |
| Moon illumination | continuous | synthesised |
| Sea state | continuous | synthesised |
| Ferry timetable | boolean | synthesised |
| Satellite overpasses | boolean | synthesised |
| Fuel and endurance | continuous | seam-derived: the platform's reported speed, this tab's consumption rate |
| Crew rest and watch cycles | boolean | synthesised |
| Range from port or rendezvous | continuous | seam-derived: the platform's reported position, this tab's rendezvous |
| Downloaded vector forecast | continuous | seam: genuine EDR position queries at the forecast's own steps |

**Sea state is synthesised, and this is the correction the first draft needed.** It was
listed as coming from the forecast field, and it cannot: drogna models temperature,
salinity and pressure, and no reading of those is a sea state without an invented wave
model in between. Deriving one and labelling it *from the forecast* would have been
precisely the dishonesty FR-75 exists to prevent, so the lane is marked synthesised and the
tab says so on its face.

### 7.3 Lane types and thresholds *(source §5.3)*

A boolean lane is a bar: present or absent. A continuous lane is a trace with a
**threshold line drawn across it**, and the threshold is **draggable** and **per-task** —
a task becomes feasible where its own threshold is crossed, so two tasks may disagree
about the same sea state and both be right. Dragging a threshold recomputes the feasible
sets instantly.

### 7.4 Confidence *(source §5.4; open question 1, settled)*

Each lane carries **High / Medium / Low / Off**, drawn as a second visual dimension —
hatching over the lane, distinct from the value it carries.

The weights are **1.0 / 0.66 / 0.33**, declared in configuration rather than typed into
the code. High, Medium and Low all contribute, weighted down accordingly, and a
low-confidence source cannot veto a task on its own: it lowers a task's feasibility
margin, and only a High source can drive it below the line alone. **Off** removes the
source from the computation entirely — one click, live, to answer "what if this one is
rubbish?".

### 7.5 Tasks, sets and locking *(source §5.5, §5.7; open question 3, settled)*

Tasks are a **fixed list in configuration with editable thresholds**, which is the cheaper
starting point the source names and the one that keeps the demonstration reproducible. The
output is **the top two or three maximal feasible sets**, ranked, with what each set gives
up stated beside it — *A and B, or B and C, never A and C* is the sentence the tab exists
to make visible, and one set alone hides it.

A task may be **locked as mandatory**. The sets recompute around it and the tasks that no
longer survive are shown as excluded, with the source and instant that excluded them.

### 7.6 Framing *(source §5.6)*

The panel says, in its own chrome, that it is **a triage aid, not an optimiser**, and its
headline output is what you are giving up. The constraint set is heavy on purpose.

## 8. Requirements as they enter SRD-v2 §5.15

- **FR-71** The shell shall host **downstream consumer views**, declared in configuration
  as a view kind, rendered in bright yellow with black text in both presentations, each
  under a persistent, non-dismissible strip naming it as not part of drogna. The shell
  holds no list of which views these are.
- **FR-72** A consumer view shall reach drogna **only through the seam** — configured
  relative endpoints and configured broker topics — and shall import no backend module.
- **FR-73** A consumer view shall be marked **stale by a published run becoming
  current**, shall recompute **only** on an explicit reader action, and shall retain the
  superseded answer as a **ghost** naming the run it was computed from.
- **FR-74** Every control that is not the update action shall recompute **immediately**,
  and every computation bound shall come from configuration.
- **FR-75** A derived quantity shall be **named for what it is derived from**, and the
  view shall state its ingredients. The coverage proxy is *observation-driven
  uncertainty*.
- **FR-76** A consumer view **may synthesise inputs drogna does not model**, provided
  each is labelled as synthesised, is drawn from a seeded stream derived from the run
  manifest, and is never published back over the seam nor shown as a claim about a drogna
  component.
- **FR-77** The Sampling view shall present the domain under a **reader-adjustable hex
  grid** coloured by observation-driven uncertainty **per depth zone**, distinguishing
  the zones the vessel can reach from those it cannot, reading both from what crossed the
  seam rather than from a constant.
- **FR-78** The Sampling view shall plan a route **by value per unit transit**, under a
  reader-chosen time budget, ending where the budget expires, with **expendable drops
  constrained to lie on the route**, each justified by the zone and the uncertainty it
  addresses. The plan's **shape**, not only its length, shall change with the budget.
- **FR-79** The Courses view shall seed **hypothetical vessel classes** across the domain
  from reader-set likelihoods, shall give each class a **motion model** rather than a
  score multiplier, and shall present **three or four candidate courses** with separately
  scored components under a reader-adjustable weighting whose range can **reorder** them.
  It holds no third-party entity (Constitution V).
- **FR-80** The Feasibility view shall present source lanes of two kinds — boolean and
  continuous with **per-task draggable thresholds** — each carrying a **confidence**
  setting weighted from configuration with an **Off** that excludes it, and shall output
  the **top two or three maximal feasible sets** with what each gives up, recomputing
  around any task the reader **locks**.

## 9. Acceptance

Watched happening in the running shell and captured, never inferred from green tests
(Constitution IX, PR-06). Each is a link to the published instance at the view it names.

| # | Watched |
|---|---|
| AC-01 | The three tabs are yellow in the dock and in the stack, and the strip is present in both, at the top, after scrolling |
| AC-02 | A forecast is published; the halo appears; the displayed answer does not move; the tab still names the older run |
| AC-03 | The update is clicked; the answer changes; the previous answer is visible as a ghost naming its run |
| AC-04 | The time budget goes 3 h → 24 h and the route changes shape, not only length |
| AC-05 | The expendable rate changes and the drop count changes with it, coupled to the budget |
| AC-06 | A deep hotspot bends the route: the with-drops route differs from the no-drops comparison line |
| AC-07 | Submarine 2 / trawler 9 and its reverse produce visibly different clouds and a different top candidate |
| AC-08 | A weighting slider is dragged and the candidate ranking flips |
| AC-09 | A threshold is dragged and a marginal window opens; a lane is switched to Off and the sets change |
| AC-10 | A task is locked and two others go excluded, each naming what excluded it |

## 10. What is deliberately not done

- **No current field, and therefore no drift consumer** (source §1.2).
- **No task composition UI** — tasks are configuration with editable thresholds (source
  §6.3, settled that way here).
- **No true ensemble spread in Tab 1.** The coverage proxy is what the operational
  question needs, and the interface is shaped so that swapping the source later changes
  nothing else (source §3.2).
- **No persistence.** A consumer tab keeps nothing between visits, exactly as the harness
  keeps nothing (NFR-03). The manifest replays the run, and with it every seeded thing
  these tabs synthesise.
- **No fourth consumer.** The frame is shared so a fourth is cheap; adding one is not
  this feature.
