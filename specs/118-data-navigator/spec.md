# Feature Specification: The Data tab

**Feature Branch**: `claude/data-navigator-tab-blzdtm`

**Created**: 30 August 2026

**Status**: Specified

**Input**: "Let's discuss a new tab: Data Navigator. It should allow viewing of all
stored data, from pygeoapi perspective: to include: measurements, archive, recent,
nowcast, forecast, updates from shore. When possible it would be good to view graphs of
measurements against time, graphical view of shore updates, maybe some 3-d/4-d volume of
NetCDF volumes. I expect this will have some combination of trees, tables, deck.gl
visualisations. Interview me, you know how I like it."

## Context

Three stores hold everything this harness knows, and three standard interfaces serve
them: OGC API-EDR over the coverage store, SensorThings over the observation store, OGC
API-Features over the advisory store. What the shell offers a reader is narrower than
that. **Holdings** shows the coverage inventory and nothing else. The **Map**'s composer
asks one EDR question at a time, brilliantly, and answers nothing until a reader has
composed something. The measurements the sensors publish have no face at all beyond the
message that carried them past the Messages tab, and the advisories — a store, a
publisher, a Features collection, a whole feature's work in 108 — have never been drawn.

So the honest description of the read path today is: one of the three stores is
browsable, one is queryable by an expert, and one is invisible. This feature makes all
three browsable from one place, organised the way a reader thinks about the data rather
than the way it happens to be served.

**Feature number.** 118. Like 111 to 117 it sits outside the arc: it adds one component
behaviour to the ocean (§ the departure era, below) and otherwise changes no simulation,
moves nothing new across the seam, and asserts nothing new about the world.

### What the interview settled, and what it cost

The tab **absorbs Holdings** rather than sitting beside it. Two tabs both answering
"what does the system hold" is the divergence V2 exists to end, and the coverage store's
inventory is a third of the answer, not the whole of it. Holdings' timeline (FR-69) and
its forecast-versus-truth comparison (FR-70) carry across whole; nothing shipped is
retired.

The spine is **by data kind**, not by API. Seven branches, in the order the author named
them: measurements, archive, departure, nowcast, analysis, forecast, shore updates. This
is a regrouping — measurements come from SensorThings, five branches from EDR, one from
Features — and the tree does not say which standard answers each. That is a deliberate
loss, and it is affordable only because the Background tab explains all three and the
Map's composer shows EDR on the wire, in full.

The views are **rendered**, with no request URL on screen. The one exception is the
comparison, which keeps its three URLs because ADR-0036 is right that a derived figure a
reader cannot re-derive is an assertion. Where a fetch is refused or a response fails its
master, the node says so in a line where its content would have been — an empty table is
a claim the shell is not entitled to make (Constitution VII, FR-46) — and makes no more
ceremony of it than that.

**"Recent" turned out to be a thing the store does not hold.** The author meant the
forecast issued to the vessel before it left the quay-side: newer than the archive, older
than everything the loop has done since, and never refreshed. The coverage store's eras
are `archive | nowcast | analysis | instance`; nothing issues a brief at sailing time. So
this feature publishes one, and the trap it walks around is that the environment
generator evaluates the *true* field — a forecast authored from truth is a perfect
forecast, which is not a forecast. The departure holding is therefore **persistence**:
the true field at the scenario origin, held constant across its whole validity window.
That is a classic forecast baseline, it is already the reference FR-70's comparison uses,
and its error grows on its own as the real ocean evolves away from it. It ages in front
of the reader, which is the entire reason the branch is worth having.

## Requirements

### The tab

- **FR-01** A view **`data`, labelled "Data"**, occupies the slot Holdings held: Intro,
  Background, Data, Operator, Map, Messages. Still six tabs. It renders in both
  presentations feature 112 requires — docked and, below the width threshold, in the
  narrow stack — from the one panel registry, and the label is short enough to survive
  the narrow tab strip, which is why it is not "Data Navigator".
- **FR-02** The panel is a **tree beside a detail region**. The tree's seven branches are
  the data kinds above, in that order. Selecting a node fills the detail region; nothing
  opens in a second window and nothing floats over the tree.
- **FR-03** The **selected node is addressable** (FR-15): the hash carries the branch and
  the node within it, so a pull request or a blog entry links a reader to a chosen
  datastream or a chosen holding rather than to the tab's front door. An address that
  names a node the store does not hold opens the branch and says which node was asked
  for; it never opens silently on something else.
- **FR-04** Every branch **refreshes on the announcement its store publishes** — coverage
  publications for the five coverage branches, the observation topic for measurements,
  the advisory topic for shore updates — and **nothing polls anywhere** (FR-46). An open
  chart or an open volume grows as data arrives rather than going stale under a reader
  who is watching it.
- **FR-05** Everything the tab draws is fetched **through the seam**, as relative-path
  GETs against configured prefixes, validated against the master the response declares
  before anything is displayed. No path literal in the panel (FR-17), no import across
  the boundary (FR-02), no store reached directly.
- **FR-06** Where a fetch is refused or fails its master, the node **states the refusal
  where its content would have been**, quoting what the query component said — which
  names the thing refused (FR-27). It never draws an empty table, an empty canvas or a
  chart with no points as though those were the answer.

### Measurements

- **FR-07** The measurements branch walks **Thing → Datastream → chart**: the sensor
  platform, then each datastream it publishes, then that datastream's account. The
  grouping is SensorThings' own; the tree does not invent a second one.
- **FR-08** A datastream's account is a **chart of value against simulation time over its
  full history**, drawn from real Observations paged through until the store is
  exhausted, with the observation table beside it. The chart is hand-rolled SVG: no
  charting library enters the tree for one chart, and the existing dependency frugality
  is the reason.
- **FR-09** The chart states its units from the datastream's own document and its extent
  from the observations it actually received — never from a configured expectation. A
  datastream with no observations yet says so; it does not draw empty axes.

### The coverage branches

- **FR-10** Archive, departure, nowcast, analysis and forecast are each presented as the
  **simulation-time timeline** FR-69 specifies, each holding drawn at the interval its own
  manifest says it covers, the panel stating the scale it is showing. Selecting a holding
  opens its **embedded manifest whole** (FR-46). The keyboard and screen-reader
  obligations FR-69 carries come with it, and so does its parity check, bounded by the
  `coverage-holding` master.
- **FR-11** The **analysis branch lists cycles, not fields**. An assimilation cycle
  publishes three holdings at once — the corrected field, the error it left, the per-cell
  provenance — and they are presented as three views inside the one node, because they
  were published together and that is the fact worth keeping.
- **FR-12** The **comparison** of FR-70 rides on a selected forecast instance whose
  validity has elapsed, unchanged in every respect: three genuine EDR area queries, two
  difference fields on one scale, which is closer said plainly, telemetry's own skill
  figure beside it and not recomputed, and **its three request URLs on screen and
  copyable** — the tab's one stated exception to FR-01's rendered-only surface.
- **FR-13** A coverage holding offers a **volume**: longitude, latitude and depth drawn
  as the Map's cube already draws them, from genuine EDR area queries per level, with a
  **fourth axis** stepping the time values the holding's own manifest declares — months
  for the archive, hours for a forecast run.
- **FR-14** The volume fetches **lazily, per step, and keeps what it fetched**. It states
  which steps have been loaded, and draws nothing it has not fetched: scrubbing to an
  unloaded step shows that step arriving, never a neighbour's data standing in for it.

### Shore updates

- **FR-15** Advisories are drawn on a **canvas as their advised regions**, coloured by
  kind — sound-speed outlook, sampling window, caution region — with those whose validity
  has lapsed drawn **spent rather than removed**, so a reader watches advice accumulate
  and expire as the clock runs. Selecting one shows its guidance document whole.
- **FR-16** The canvas is driven by the Features collection, which is
  present-and-stating-empty before any advisory exists; the branch says that in those
  terms rather than drawing an empty sea.

### The departure era

- **FR-17** A fifth era, **`departure`**, is appended to the `coverage-holding` master's
  era enumeration, and the generated types are regenerated from it. The master is amended,
  never rewritten.
- **FR-18** The environment generator **authors one departure holding at provisioning**,
  beside the archive and the now-cast: the true field evaluated once at the scenario
  origin and **held constant** across every step of its validity window — a persistence
  forecast, issued at sailing time and never refreshed. Its manifest records that
  derivation in those words, so no reader mistakes it for a model run.
- **FR-19** EDR serves it **by convention** as the collection `departure`, with no query
  configuration edited (FR-29), and it therefore appears in the Map composer's collection
  list without the composer being told about it.
- **FR-20** The departure holding is truth-derived, and **nothing may initialise a
  forecast from it**. The truth-initialisation gate is extended to watch its accessor as
  it watches `currentNowcast()`, with the same permitted callers and the same reason: the
  leak that gate exists to stop is the easiest field to hand being reached for, and a new
  truth-derived accessor is a new easiest field.

## SRD amendments this feature requires

Each is written in the same commit as the code, per the working practice; none is left
for a tidier moment.

- **FR-14 (tab list)** — Holdings becomes Data, in the same slot. Still six tabs.
- **FR-21 (eras)** — a fifth era, with the persistence derivation stated.
- **FR-46, FR-69, FR-70** — re-homed under the Data tab, obligations unchanged, with the
  comparison's URL requirement noted as the tab's stated exception.
- **New requirements** for the navigator itself, numbered from FR-84 onward — the SRD's
  numbers are cited across `specs/` and the ADRs, so they are appended, never inserted.

## What is deliberately not done

- **The tree does not name the standard that answers each branch.** A kind-first spine
  and an API-first spine cannot both be the top level, and the author chose the one a
  reader thinks in. The cost is real: the tab is the best view of what the system holds
  and says nothing about the conformance story that is half of what the harness
  demonstrates. Background carries that, and the Map's composer shows it on the wire.
- **The request URLs are not on screen**, except the comparison's three. This is a
  deliberate step back from the composer's discipline, taken because the tab is for
  reading data and the composer already exists for reading the wire. If the tab ever
  starts being used as evidence rather than as a browser, this is the decision to revisit
  first.
- **No cross-tab wiring.** No "show this on the map", no filtering of the Messages
  traffic display from a selected datastream. Both were offered and declined: the address
  of FR-03 is the linkage this feature builds, and anything more is a second feature's
  worth of coupling between four panels.
- **The chart shows one datastream, not a residual.** Drawing a measurement against the
  forecast it was scored on is the more interesting picture and needs an EDR position
  query per observation; the monitor already computes that residual and the Operator tab
  already draws it. This branch answers what was measured.
- **The volume does not step across forecast instances.** Watching successive forecasts
  of one instant change as assimilation bites is a comparison, and FR-12 is where
  comparisons live.
- **The departure forecast is not climatology.** A seasonal mean from the archive would
  contrast more sharply with the now-cast, being blind to all four seeded features, and
  nothing in the tree computes a mean across archive months. Persistence costs nothing
  new and is already a named reference in this system.

## Acceptance

- **SC-001** The configured views are exactly Intro, Background, Data, Operator, Map,
  Messages, and both presentations render every one of them — the enumeration test of
  feature 112, over the new list.
- **SC-002** Every one of the seven branches renders something the stores actually
  answered: coverage branches from the inventory, measurements from Observations, shore
  updates from the Features collection. No branch renders from a fixture.
- **SC-003** With a store made to refuse, the branch states the refusal text and draws no
  empty table, empty chart or empty canvas. Watched failing before it is trusted: the
  refusal is planted, seen stated, reverted.
- **SC-004** An address naming a datastream opens the tab with that datastream's chart
  shown; an address naming a holding opens its manifest; an address naming neither says
  which node was asked for.
- **SC-005** No branch issues a request on a timer. Held by a test that advances the
  clock with no announcement published and asserts no fetch was made, then publishes one
  and asserts the branch refetched.
- **SC-006** A datastream's chart plots as many points as the store holds observations
  for it, and its extent equals the extent of those observations.
- **SC-007** The departure holding exists at provisioning, its era is `departure`, its
  manifest names persistence as its derivation, and every time step of its field is
  identical to the first — the property that makes it a persistence forecast, checked
  rather than asserted in prose.
- **SC-008** `GET {edr_prefix}/collections` lists `departure` with no query configuration
  changed, and a position query against it returns the same value at every instant in its
  validity window.
- **SC-009** The extended truth-initialisation gate fails on a planted call to the
  departure accessor from a component not permitted it, and passes once reverted.
- **SC-010** The volume draws only steps it has fetched: scrubbing to an unfetched step
  shows that step loading and never a neighbour's values, and the panel names the steps
  it holds.
- **SC-011** An advisory whose validity has lapsed is still drawn, in its spent
  treatment, and the count of drawn regions equals the count the Features collection
  returned.
- **SC-012** The comparison's three request URLs are present and copyable, and everything
  the comparison states — which is closer, telemetry's skill figure, the derived label —
  is what feature 116's tests already require of it.
