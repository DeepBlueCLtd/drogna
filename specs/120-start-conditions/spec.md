# Feature Specification: Start conditions, chosen on a welcome page

**Feature Branch**: `claude/welcome-page-start-conditions-6d4c6z`

**Created**: 30 August 2026

**Status**: Built

**Input**: "We currently start off with just the archive dataset. Let's offer several start
conditions - this will appear before the app page, as a 'welcome' page. The choice so
starting status will be: leaving quay-side (only archive and recent forecast); arriving in
work area, lots of measured data, but none for work area, but some forecasts; loitering in
area, archive, recent, measurements in area, forecasts in area, shore forecasts received;
returning to quay-side: lots of data (but still within easily within browser storage
limits), lots to view/review, ability to export NetCDF for shore exploitation. These will
allow different usages of the app to be considered. For now, let's make 'arriving in work
area' the default."

**Second input**, after the first was built and measured: "If it helps performance, it
would be ok to pre-generate some of this state, to be loaded once the above choice has
been made." Asked what it could cost, the author chose to pre-generate the fields
themselves. That is ADR-0040 and FR-14 to FR-18 below.

## Context

Every visit to drogna has begun in the same place since feature 101. The page opens, the
environment generator authors twenty years of monthly archive and one now-cast through the
coverage store's seam, the platform starts loitering over the eddy, and from that instant
the run is a minute old. Almost everything the harness has built since then only means
something once there is something to work on: the Holdings tab lists two holdings, the
map draws a track one point long, the analysis has nothing to correct the field with, the
offload packager has nothing to stage, and the shore link has said nothing. A reader who
wants to see any of it has to leave the page running, or raise the clock rate and wait.

That is the whole of the problem. The harness is not missing the behaviour — it is
missing a way to arrive in the middle of it.

**Feature number.** 120, and it was 118 while it was being built. Features 118 (the
downstream consumers) and 119 (the shape of the system, drawn and moving) reached `main`
first, and this branch renumbered when it merged them in — as 115 and 117 did before it,
for the same reason: a number taken by whichever branch merges first is a fact about merge
order and not about the work, and the branch still open is the one that moves. The
requirements moved with it, FR-76 and FR-77 becoming FR-91 and FR-92, and the decision
records with them, ADR-0039 and ADR-0040 becoming ADR-0040 and ADR-0041. *They moved a
second time at feature 123, to FR-104 and FR-105: feature 118 had taken FR-91 and FR-92 on
its own branch and both landed, leaving the SRD defining each number twice.*

Like 111 to 119 it sits outside the arc: it adds no component to the arc,
authors no new kind of data, and asserts nothing new about the ocean. What it adds is a
choice about *when* a visit begins, and the machinery to make that choice true.

## What a start condition is

Four situations, in the order of a passage: **leaving quay-side**, **arriving in the work
area**, **loitering in the work area**, **returning to quay-side**. Each is a card on a
welcome page. Each card carries a sentence saying where the platform is, and a list saying
what the run will hold when the console opens.

Behind each card is a **pre-roll**: the run, built and provisioned exactly as it always
was, then driven forward through the operator plane's own HTTP endpoints before the shell
is mounted. Stop a component, publish a demand, prompt an event, step the clock — every
one of them a control a reader can work by hand in the Operator tab, every message on the
broker where the Messages tab can see it, every request through the release gate.

The alternative was to write the measurements into the observation store and the forecasts
into the coverage store, and SRD-v2 FR-11 has forbidden that since the beginning: seed data
is authored by the components and seams that author it during a run, so the guards a run
enforces are the guards the seed data passed through. That rule is the reason this feature
is a scripted operator and not a fixture — and the reason a card's promise is a claim the
suite can fail rather than a description of a file somebody wrote.

## Requirements

- **FR-01** A **welcome page** is shown before the shell on a bare visit. It offers every
  start condition the configuration document declares, in the order it declares them, each
  with its label, its situation and what the run will hold. The statement that the data is
  synthetic is on it, in full, because it is now the first thing a visit sees (FR-007).
- **FR-02** The default is **arriving in the work area**, named in configuration and marked
  on the card. A condition that the configuration's `default` does not name is a
  configuration fault and is refused at boot rather than survived.
- **FR-03** The choice travels in the address as `?start=<id>`, beside rather than inside
  the view address: `?start=loitering#/view/map` opens the map of a run on station. The
  hash grammar (ADR-0032) is untouched.
- **FR-04** An address that **names a view** opens the shell at that view without asking.
  Views have been addressable since feature 101 so that a pull request or a blog entry can
  point a reader at the thing being discussed (D16); a welcome page in front of such a link
  would put the work of finding it back on the reader. An address naming a condition this
  build does not offer **says so** on the welcome page rather than quietly opening the
  default — a link that has gone stale is a thing the reader wants to know about.
- **FR-05** A start condition is **configuration**. It supplies the platform's initial
  vector, replacing the platform document's own, and a script of **legs**: for each leg, how
  many ticks it advances, which components are running, what the platform is told to do,
  and what it is asked to do now. All of it on disk, in `run.json`, validated against
  `config.start-conditions.schema.json`.
- **FR-06** The pre-roll runs **through the seam**. The clock is pinned to rate zero for
  the duration — so the pre-roll's ticks are the only ticks, and the run ends where the
  script says rather than where the host got to — and given its configured rate back at
  the end, whether the script finished or was refused. Components are stopped and started
  through the operator plane's control endpoints, demands through its demand endpoint,
  prompts through its event endpoint, ticks through its step endpoint in the bursts that
  plane declares a bound for. Nothing writes to a store.
- **FR-07** A refusal from the control plane **stops the pre-roll and names the fault**. A
  leg naming a protected component or an event this plane does not offer is a fault in the
  script; a component *declining* what it was prompted to do — the scheduler declining a
  run inside its minimum interval — is answered 200 and published on that component's own
  topics, exactly as when a reader prompts by hand, and is not a refusal.
- **FR-08** The page **says what is happening** while the pre-roll runs: the leg's own note,
  which leg of how many, and how many of the total ticks have been stepped. Control returns
  to the host between bursts so the reading can paint.
- **FR-09** A start condition **enters the run's identity**. The run id is scenario, start
  condition and root seed, so two visits that chose differently can never share one — a run
  id is stamped into every holding id and every observation id. The run manifest records the
  condition as a field as well, because reading meaning out of an identifier is not reading
  a record, and an **imported manifest replays the condition it was exported from**, refusing
  a manifest whose condition this build does not offer.
- **FR-10** The pre-roll is **inside AT-04's replay claim**. Operator commands are ordinarily
  outside it, and a demanded run replays identically only when the same demands are issued at
  the same ticks; a condition's demands and prompts are configuration issued at ticks the
  configuration fixes, so that proviso is met by construction. Proved by test: one seed and
  one condition, the same holdings, observations and advisories twice.
- **FR-11** Every condition the configuration offers is **held to what its card says** by
  test, against the stores the pre-roll actually leaves behind — and the table of promises is
  checked for completeness against the configuration, so a fifth condition fails the suite
  until somebody says what it promises.
- **FR-12** The pre-roll **hands back a whole machine**: whatever it stopped is running again
  and the clock is at its configured rate. A condition describes how the run got here, not a
  console with pieces missing.
- **FR-14** A condition's coverage eras may be **committed as a build artefact** and
  republished instead of computed (ADR-0040, and the constitution's Data constraint as
  amended at 2.1.0). Three things hold together or it is a fixture: the artefact is
  produced by the same components, by constructing the backend and driving that
  condition's pre-roll; a **drift gate** regenerates it and fails on any difference; and it
  re-enters through the **coverage store's own publication seam**, republished on the clock
  by a declared component at the instant each descriptor records — so the digest check, the
  atomicity and the announcement are the ones a live publication passes.
- **FR-15** Each condition declares its **root seed**. The fields are a function of it, so
  a visit that drew a fresh one would sample an ocean the artefact does not describe.
  `crypto.getRandomValues` leaves the application; two people following one link now see
  the same ocean.
- **FR-16** A missing or unreadable artefact is a **slow run, not a broken one**. The run
  authors the fields live and the snapshot source reports, degraded, which artefact it
  could not use — a deployment that had silently lost its assets would otherwise look like
  one that never had them.
- **FR-17** The artefact is **refused at construction** when its header does not describe
  this run: another condition, another seed, another run id, another generator
  configuration. Each is named.
- **FR-18** Which eras are committed is **configuration**. The shipped value was the ocean —
  archive and now-cast — with the forecast eras guarded by a test rather than merely unset.
  Feature 125 declared all four. The guard is not retired but **inverted**: the test that
  refused the forecast eras now requires every condition to declare every era the snapshot
  source names an author for, so narrowing the cut point is still a configuration edit and is
  now also a test edit, which is where the reason for one goes. The reason the original
  refusal was wrong is in ADR-0041's amendment.
- **FR-13** The scenario gains a **quay approaches** reference area, so "leaving quay-side"
  and "returning to quay-side" name a place on the map rather than a figure of speech. It is
  reference geometry like the domain and the loiter region, provisioned from configuration
  into the read-only feature store and served through the features face.

## The four situations, and what makes each true

The work area is the loiter region the feature store already declared: 45.7°–46.5°N,
11.8°–10.6°W. The quay approaches are at the domain's north-eastern corner, about 240 km
from it, which is why no condition simulates the passage between them whole — the run
begins at the point in the passage the card names, and the pre-roll covers what happened
recently enough to be in the stores.

| | ticks | what the pre-roll does | what the run holds |
|---|---|---|---|
| **leaving** | 1,800 | clears the quay with the instruments not yet streaming; the cadence floor warrants the departure run | archive, now-cast, one analysis and forecast from the now-cast alone, the ownship track, **no measurement of the ocean** |
| **arriving** | 5,940 | a long passage in from the north-east, instruments streaming, shore link and packager stopped | archive, now-cast, two cycles' analyses and forecasts, ~790 measurements along the passage, **none inside the work area**, no advisory |
| **loitering** | 4,800 | three legs of a box inside the area, shore link up, a run prompted on what the box gave up | archive, now-cast, three cycles, ~640 measurements **all inside the work area**, four shore advisories |
| **returning** | 9,300 | a period on station, a last advisory and run, then outbound across the area's edge, staging a package | archive, now-cast, four cycles (~20 MB of holdings), ~1,240 measurements in the area and out along the passage home, advisories through the period, **a staged offload bundle with its measurement geometry** |

## Why the planner is held back, and nothing else is

The first pre-roll built here stopped the scheduler, the analyst and the model runner
through the quiet legs, on the reasoning that assimilation is the expensive part. It was
the wrong component. Measured leg by leg: with the loop stopped and the planner running, a
tick inside the work area cost about 3 ms and a single pre-roll reached 25 seconds; with
the planner alone stopped and the whole loop running live, the same four conditions cost
**1.1, 3.0, 3.0 and 5.2 seconds**. The planner's prize-collecting route search, with seeded
restarts, over H3 cells of the loiter region, is by far the dearest thing in a tick, and it
runs every 600. In a browser, measured end to end from the address bar to a console with a
clock in it, the four come out at 2.1, 5.3, 4.1 and 8.3 seconds — bundle, build and pre-roll
together, and a spread on top of that because the seed is fresh each visit and a run that
diverges more turns the loop more.

So the planner is the only component any condition holds back, and it is held back for the
whole of every pre-roll. The reason it is the right one to hold back is not only that it is
dear: it **recommends**. It publishes a plan and changes nothing else, so no card's promise
depends on it, and it replans within 600 ticks of the console opening — live, where a
reader can watch it, which is where that work belongs.

Stopping the scheduler turned out to be actively harmful, and the reason is worth recording
because it is a fault in the harness rather than in the script. The scheduler holds one run
request in flight at a time and clears it only when a run is published, so stopping the
analyst underneath it strands it: the request is never answered and every later prompt is
declined by that policy, for the rest of the run. Worse, restarting it resets its run
sequence, and a run identifier was `<run>-run-<sequence>` — so the second restart's first run
reused the first's identifier and silently replaced its holdings in the store. Both were
reachable from the Operator tab's own restart control, and neither was fixed here; the
script simply never stops the scheduler. **Both are answered in feature 125**: a watchdog
releases a run nobody is working on; identifiers derive from the request tick, which narrows
the reuse to a restart inside the requesting tick; and the coverage store closes the
remainder by refusing a second set of bytes under a holding id it already holds.

## What pre-generation cost and bought

Measured, because both obvious answers were wrong. Switching components off one at a time
put 300 of a tick's 568 microseconds in the **environment generator** rather than in the
assimilation: it re-evaluates a 48×40×26 grid over four time steps every 900 ticks and the
coverage store keeps only the newest, so `returning` computed ten now-casts and discarded
eight. Nothing reads the intermediate ones — the monitor scores against the forecast, the
analyst falls back to a now-cast only on a cold start.

Then the sizes, which are not alike across eras. Field bytes are float32 and compress
badly, but the archive is a smooth analytic field on a coarse grid and the forecast
instances carry per-cell ensemble noise:

| era | raw | shuffled + gzipped |
|---|---|---|
| archive ×1 | 0.9 MB | **0.01 MB** (158:1) |
| now-cast ×1 | 1.5 MB | **0.42 MB** (3.5:1) |
| analysis ×12 | 5.9 MB | 2.54 MB (2.3:1) |
| instance ×8 | 11.8 MB | 8.31 MB (1.4:1) |

Pre-generating the ocean is 45% of the saving for 4% of the bytes; the forecast eras are
the other 10.9 MB for the rest. End to end in a browser, address bar to a console with a
clock in it, with the ocean committed:

| | before | after |
|---|---|---|
| leaving | 2.06 s | **1.58 s** |
| arriving | 5.25 s | **3.60 s** |
| loitering | 4.14 s | **2.83 s** |
| returning | 8.35 s | **4.93 s** |

for 1.73 MB of artefacts across all four.

**Superseded by feature 125, which committed the forecast eras too.** The table above is the
ocean-only cut point this feature shipped and is left as the record of it; the numbers on the
line above it are not the current ones. Across the four the artefacts are now 27.7 MB, and
`arriving` opens in 2.2–2.5 s against 3.8–4.0 s over three runs of each, measured in headless
Chromium rather than in the browser this table used — a different machine and a different stopwatch, so the two tables
are not comparable row for row. The per-era counts here (`analysis ×12`, `instance ×8`) are
`returning` before feature 124 added a fourth analysis holding; it is 16 and 8 now.
ADR-0041's amendment carries the current account.

**Byte-plane shuffling** earns its line in the codec: deinterleaving float32 into four
planes before gzip takes the archive from 63:1 to 158:1 and the now-cast from 2.1:1 to
3.5:1. It is a permutation, so the digest the store checks is untouched.

## The pre-roll samples on a passage cadence

Feature 103 landed on `main` while this branch was open and took the instruments from a
sample every 30 ticks to one every 5 — six times the observations, which makes the live
demo livelier and made every pre-roll three times dearer, because the analysis scales
super-linearly in the observations it assimilates. `arriving`, the default, went from 3.0
to 9.8 seconds.

The answer is the plane's own control rather than a shorter pre-roll. A leg may **tune** a
setting the operator plane declares, by the tunable's id, and the first leg of every
condition puts the sampling cadence and the ownship reporting interval to 30 for the
passage. It is what a vessel does — a passage samples more coarsely than a box worked on
station — it is published as a command and visible in the Messages tab, and the plane
enforces its own declared bounds, so a leg cannot ask for something a reader could not ask
for by hand.

A **leg of its own, advancing nothing**, puts both back before the console opens, so the
run opens at the cadence the configuration ships. That the handover is a leg rather than a
side effect of whichever leg came last is the point: a 3,600-tick final leg at the dense
cadence would have spent most of what the coarse one saved. A test holds every condition
to putting back everything it tuned — planted by deleting that leg, and it reports
`arriving leaves 'sampling-cadence' at 30, not the configured 5`.

| | before 103 | after 103 | with the passage cadence |
|---|---|---|---|
| leaving | 1.07 s | 0.86 s | **0.82 s** |
| arriving | 3.04 s | 9.80 s | **2.32 s** |
| loitering | 3.02 s | 5.80 s | **2.33 s** |
| returning | 5.24 s | 15.44 s | **4.02 s** |

## Not done, and why

- **NetCDF export is not implemented.** The input names it under "returning to quay-side",
  and SRD-v2 FR-39 holds that offload is announcement-only in V2, keeping the export's
  shape: the packager stages the bundle and its run-manifest sibling and announces the
  departure, and the ledger states beyond *staged* hold zero, honestly. What this feature
  does is make that path reachable — the returning condition arrives with a package already
  staged and its measurement geometry beside it, which is what the surface needs in order
  to be worth exercising. Writing the bytes as NetCDF is a change to FR-39's scope and
  belongs in its own feature, against the engine decision ADR-0031 defers to V3.
- **The scheduler's stranded request and its repeating run identifiers were not fixed here.**
  Both were pre-existing and both reachable from a control the Operator tab already offers,
  and the second was load-bearing: it was what stood between the shipped cut point and the
  remaining seconds. **Feature 125 fixed both** — a watchdog releases a run outstanding longer
  than its declared cost plus the release margin, and identifiers derive from the request
  tick. The blocker as stated here named the wrong mechanism; ADR-0041's amendment records
  what was actually there.
- **The forecast eras were not committed here.** They are the other seconds. **Feature 125
  committed them**: 27.7 MB across the four, against the 44 MB this section estimated — the
  estimate predated features 121–124 and the run's own cycle count moved. The second-order
  cost this section named is real and unchanged: the artefacts are regenerated and
  re-committed whenever the analytic form, a kernel, a seed or a leg changes.
- **No start condition simulates the passage between the quay and the work area whole.**
  It is 240 km, which is nineteen hours at the platform's maximum speed and something like
  three minutes of pre-roll. The conditions place the platform where it is at the moment
  the card names, and the pre-roll covers the recent stretch — stated on the cards rather
  than implied.
- **The pre-roll does not persist.** V2 persists nothing between visits (FR-10); reloading
  the page with the same `?start=` runs the same script again under a fresh seed. The
  manifest is still the replay mechanism, and it now carries the condition.
