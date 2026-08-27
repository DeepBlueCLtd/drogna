# Finding: a browser-hosted twin, and where its boundary actually is

**The question.** Downstream browser visualisation is where a lot of effort is going to
go once the internals settle. Can that work be developed, demonstrated and — the part
that matters — *verified*, without standing up eleven services, a broker and a Postgres?
Specifically: can the harness's subsystems be reimplemented as JavaScript components
running in the browser, driving the existing client, without Constitution VII being
quietly abandoned along the way?

**The answer.** Yes, and the constitution is not the obstacle. The obstacle is one
boundary, and this spike found it by running into it rather than by reasoning about it:
**the component twins cannot live inside `client/src`.** The client's own tests forbid it,
for a reason better than the one that would have put them there. Everything else works,
and the evidence is in `results/`.

Two findings were added after the first draft, from questions put to the spike rather than
from the run: F11, that per-pull-request publishing to `gh-pages` is the delivery mechanism
and that only a twin makes it possible at all; and F12, that the seam between a browser
front end and either backend already exists, is one document, one subscription and two
fetches, and should not be replaced by a bespoke REST API.

---

## What was proved, and how to see it

`./run.sh` grafts a candidate transport into `client/src/transport/`, a clock component
into `client/twin/`, and a test into `client/tests/`; applies a 15-line change to
`client/src/transport/mqtt.ts`; runs the client's suite, typecheck, lint and the three
constitution gates that read TypeScript; plants a violation and watches the
no-mocked-traffic test catch it; then restores the tree. It refuses to start if any file
it would touch differs from HEAD.

```
client suite with candidate present:       PASS   (47 files, 454 tests; 446 before)
typecheck:                                 PASS
lint:                                      PASS
constitution gates over client/src:        PASS   (wallclock, literal-path, vocabulary)
no-mocked-traffic test, violation planted:  CAUGHT
no-mocked-traffic test, violation removed:  PASS
```

The eight new tests are the load-bearing part. They do not construct a heartbeat and hand
it to the reducer — `tests/heartbeats.ts` already does that, and FR-023 is explicit that
feeding a value to a pure function is testing a function. They **run a clock component**,
which computes its own output and posts it to a real `BroadcastChannel`; the client then
does everything it does against a live deployment — picks its connector from the URL in
the configuration document, subscribes to the control namespace, validates each arrival
against the generated contract, folds it through the liveness reducer — and the shell view
is asked what is lit. The chain asserted is: nothing was lit; a component ran; that
component is lit; nothing else is. Faking any link leaves the last assertion passing and
the third failing.

The planted violation is in `results/gate-caught-violation.txt`, named and caught:

```
client/src/transport/bus.ts contains a mock: expected true to be false
```

---

## F1 — The transport seam already exists

`openControlSubscription(config, sink, connect = connectOverWebSocket)` already takes its
connector as an injected third argument with a default. Choosing that default from the URL
scheme in the served document is the entire change, and it is in
`candidate/mqtt.patch`: 41 lines including context and the comment explaining itself.

Nothing about liveness changes with the choice. Either branch, a component is lit because
a message from it arrived, and neither branch can manufacture one. The choice comes from
the configuration document, which is the client's one permitted source of deployment
knowledge — not from a build flag, a query parameter, or a literal in the file. Those
three are precisely what `tests/no-mock.test.ts` greps for, and the candidate passes.

## F2 — `BroadcastChannel` is the nearest thing the platform has to a broker

A browser cannot serve itself a WebSocket, so `transport/mqtt.ts` is unreachable with no
backend. `BroadcastChannel` is the substitute, and it is a better one than it looks:
same-origin, many-to-many, asynchronous, crossing worker boundaries without shared memory,
and — importantly — **not delivering to the context that posted**. A component in a worker
publishes, the page receives, and neither holds a reference to the other. That decoupling
is not a nicety. A fabric that delivered synchronously would make the interleaving of
components a fiction, and "where it misbehaves together" would become theatre.

What it does not have: retention, quality of service, wildcard topic matching, and any
ordering guarantee between two publishers in different contexts. The control namespace
uses none of them — every topic in `data/topics.ts` is a literal and the client subscribes
read-only — so the subset is sufficient. Constitution VI obliges us to state which subset
of a standard is implemented; that sentence is already in `candidate/bus.ts` and belongs
in the feature.

The missing ordering guarantee is worth keeping rather than papering over. AT-02 asserts
the four run messages arrive in order. A fabric that does not promise it is a fabric that
will occasionally show us what the client does when the promise breaks.

## F3 — The client must not contain the components, and its own tests say so twice

This is the finding. The first run failed like this:

```
FAIL tests/no-mock.test.ts > the client's source > never publishes on the broker
  client/src/twin/clockTwin.ts publishes
FAIL tests/loop/noSynthesisedTraffic.test.ts > never publishes on the broker
  client/src/twin/clockTwin.ts publishes
```

Both tests scan every `.ts`/`.tsx` file under `client/src` for `/\.publish\s*\(/`. The
client receives and never sends, structurally, and that property is checked by looking —
which is the only way to check an absence. A component twin publishes by definition, so a
twin under `client/src` breaks it.

The right response is not to relax the scan. It is to accept what the scan is telling us:
**a component is a component, not a mode of the page that draws it.** The twin is a sibling
of the client — its own package, built to worker bundles — and the client stays exactly as
honest as it is today, with one extra way for messages to reach it and no way at all to
originate them.

Note what *did* pass: `bus.ts`, in `client/src/transport/`, has no `.publish(` in it and no
`postMessage` on the subscribing path. The seam falls in exactly the right place. The
transport belongs to the client; the components do not.

## F4 — Constitution VII survives; the honesty problem is elsewhere

A JavaScript clock that computes tick *n*, publishes it, and thereby lights the clock box
has asserted nothing that is not true. Something was running, it spoke, and the page
believed it because it heard it. That is Principle VII's mechanism working, not being
circumvented. There is no list of what ought to exist, no `enabled: true`, no prepared
state, and no path that draws without an arrival.

The failure VII exists to prevent is nonetheless available here, one level up: a viewer
looking at a lit diagram infers *"the harness is running"*, and in the twin what is running
is eight JavaScript components and no Python at all. Per-component truth does not add up to
a true page.

The mitigation chosen for this is a visual treatment distinct enough that no image of the
twin is mistakable for an image of the real client — which survives cropping and
screenshotting in a way a banner does not. Two consequences worth budgeting:

- **It should be read from the served document, not from a build.** A `provenance` section
  in `config.client.schema.json` naming which implementation this deployment is running
  keeps Constitution IV whole and keeps the twin from needing a build flag. Illumination
  still comes from heartbeats alone; the document says only how to *draw* what arrives.
  This is the one point a reviewer will push on and it wants an ADR of its own.
- **It invalidates 016's committed captures.** A new visual treatment changes pixels. The
  curated images under the published-screenshot location were taken against the current
  one, and the pair mechanism refuses a diff across incomparable halves by design. Budget
  a re-curation.

## F5 — Determinism is nearly free, and it is the whole verification argument

`contracts/schemas/clock.schema.json` says it outright: *"The value of tick n is epoch +
n \* tick_interval and is unaffected by rate."* So the content of every time sample is a
pure function of the tick index; host time decides only *when* a tick is emitted, never
what it says. The candidate twin is written that way — `simTimeOf(scenario, tick)` — and
its `step()` takes the instant as an argument rather than reading a timer, which is the
shape every other module in this client already takes.

A twin driven by a step count rather than a wall-clock timer is therefore **fully
deterministic**, and that is the answer to the question that prompted this spike.

Today, `scripts/capture/pair/` needs a running scenario, pins the clock to zero for the
duration, and refuses to produce a diff when the two halves came from different scenario
seeds. It is careful, and it is expensive: verifying a change to a downstream
visualisation means the whole stack up, twice. A deterministic twin makes the input to a
visualisation reproducible with nothing running — same scenario, same step count, same
pixels — and does it *without* the property that makes the current mechanism trustworthy
being given up, because the images still come from messages that were genuinely computed
and genuinely received.

That is a stronger case for building this than the demonstration case, and it is the one
to lead with.

## F6 — The wire: a service worker. **Answered by `spikes/service-worker/`.**

Not attempted here, and the second-riskiest unknown after the one this spike closed. It has
since been run as its own spike on this branch, and every item below came back favourable:
scope is the directory the worker is served from, so previews cannot interfere; the
responses are real and Playwright attributes them to the worker independently; a blocked
worker is reported rather than hung on. Two things changed as a result — the race is
answered by keeping the bootstrap document static rather than by winning it, and the page
must wait to be *controlling* rather than merely *ready*, which is an FR-019 amendment
owed. Read `spikes/service-worker/FINDING.md`; the paragraph below is left as it stood so
that what was feared can be read against what was found.

What is known and favourable: `query.collectionsUrl`, `query.trajectoryPath`,
`clock.snapshotUrl` and `clock.controlUrl` all come from the served document, so pointing
them at same-origin paths a service worker answers is invisible to the client's HTTP code.
DevTools then shows a genuine `GET`, a genuine status code and genuine CoverageJSON, which
is what the standards audience came for and what an in-page handler cannot give them.

What is unknown and wants proving before a feature commits to it:

- registration scope on a GitHub Pages project path (path-scoped; expected to work, unverified);
- the first-load race — the worker must be active before the client's first fetch, which
  means `clients.claim()` and a bootstrap that waits on `navigator.serviceWorker.ready`
  *before* the transport opens, which is a change to the sequencing FR-019 pins;
- private windows and browsers with site data blocked, where registration fails and the
  page must say so rather than appearing to be connected;
- 016's Playwright captures, which must not photograph a page whose worker has not warmed —
  and `check_no_fixed_sleep.py` forbids solving that with a delay.

Recommended as the next spike, and run. It came back yes.

## F7 — Environment data: a committed slice, with an obligation attached

A coarse subset exported from a genuine generated field, shipped as an asset, is the
chosen source. It is authentically the real generator's output, which is worth more than a
JavaScript reimplementation of the feature authoring would be.

The obligation nobody has budgeted: it is an artefact reaching a public site, so
Constitution X applies and `scripts/check_leakage.py --bundle` has to cover it. Today that
gate runs over the committed corpus under `tests/leakage/fixtures/`; a published field
slice is a new class of released artefact and needs adding to what the gate is pointed at.
It also needs a provenance record in 016's existing style — scenario seed, generator
version, simulation time, extent — or a year from now nobody will know which run it came
from.

Its fixed extent is a real limitation and should be stated on the page rather than
discovered: a trajectory query outside the slice must return a proper EDR error, not a
plausible-looking answer.

## F8 — Which components to build first

Asked to recommend rather than be told, so, by what each teaches against what it costs:

**Build as bus components (the loop).** C-01 clock, C-04 simulated sensors, C-05 ingest,
C-11 divergence monitor, C-12 scheduler, C-13 model runner, C-14 publisher, C-15 planner.
These eight are the sense → decide → act → publish cycle and the whole of the temporal
story. C-13's numerics can be as cheap as the contract allows; what it must get right is
that it takes time and that the time varies.

**Build as a service worker, not a bus component.** C-09 query layer. It answers HTTP,
which is the point of it (F6).

**Genuinely alive for free.** C-03 broker — the bus *is* the broker's stand-in here, so the
bus implementation publishing its own heartbeat is a true statement rather than a
courtesy. C-18 client already lights itself.

**Leave honestly dark, and say why on the page.** C-02 environment generator (its output
ships as an asset, so nothing is running), C-06/C-07/C-08 stores, C-10 proxy, C-16
telemetry, C-17 offload packager. The client already renders a dark box correctly; eight of
eighteen dark is an honest picture of a browser-hosted deployment, and a page that
explains which eight teaches more than one that glows uniformly.

## F9 — Misbehaviour: put the faults on the components, never on the page. **Proved by `spikes/operator-plane/`.**

All three mechanisms were asked for — a fault panel, honest emergence, curated set-pieces —
and they compose, with one design rule that keeps them constitutional:

**A fault control must make a component behave badly. It must never make the page draw
badly.** Suppressing a component's heartbeats is honest: absence is absence, and the box
greys out because nothing arrived. Making a component report `degraded` is honest: the
schema has that status because a component alive and not working needs to say so.
Fabricating a degraded heartbeat in the page is not honest and is exactly what VII
forbids. The rule is testable by the scan that already exists — the fault controls live in
the twin package, the page keeps its empty `.publish(` scan, and F3's boundary does the
enforcing for free.

Honest emergence needs real concurrency, which means the components run in workers rather
than in one page loop. That is the same requirement F2 already argued for, from a different
direction, which is usually a sign it is right.

Curated set-pieces are then just named scenarios plus a step count, and F5 makes them
replay identically.

The rule turned out to be enforceable rather than merely stated, and `spikes/operator-plane/`
proves it: an impairment becomes part of the component's own state and reaches the display
only through the heartbeat the component composes, so the console has no way to assert a
failure that is not happening. Two rules were added there and belong with this one — an
impairment may worsen a reported status and never improve one, and it must mark itself in
the message, because a provoked degradation and a genuine one report the same status and
nothing else could tell them apart.

## F10 — Cost, against the feature-sized envelope

| Piece | Shape |
|---|---|
| Bus transport, connector selection, schema amendment | Done and proven. Hours. |
| Worker host, component lifecycle, fault controls | A few days. New, but small and well-bounded. |
| Eight component twins at schema fidelity | The bulk of it. Each is a message loop and a rule, not an algorithm. |
| Service worker query layer + committed slice + leakage coverage | A few days, **after** F6 is proved. |
| Provenance section, visual treatment, re-curation of 016's captures | A couple of days, mostly re-capture. |
| Deterministic capture path, joined to `scripts/capture/pair/` | A couple of days, and the piece that pays for the rest. |
| Per-pull-request publishing: the two-publisher split, the gates, the reaper (F11) | A day or two, and the piece that makes the rest visible. |

Comparable to feature 012. Two ADRs at least: the in-page fabric as a second control
transport, and provenance in the served document.

## F11 — Per-pull-request publishing is the delivery mechanism, and only the twin makes it possible

Stage one as first written had no stated way of reaching anybody. It does now, and the
idea belongs in this finding because it and the twin turn out to be the same project.

**A backend-backed preview cannot be built.** Feature 015's publication gate fails any page
that issues a request to a host outside its own origin, and `pages.yml` runs it before
anything reaches `gh-pages`. Independently of that, PR #15 records that `github.io`
enforces HTTPS and that a page served over HTTPS may not open `http://` or `ws://` — so a
published client talking to the droplet is blocked by the browser as well as by the gate.
A preview whose components run in the page makes no off-origin request at all, so it
passes both by construction rather than by exemption. The twin is not a convenience here;
it is the only thing that makes a per-pull-request preview possible.

What is already right, and it is the same property F1 relied on: `client/src/config/runtime.ts`
fetches its bootstrap document by **one relative URL**. A client served from
`/drogna/pr/17/` finds its document at `/drogna/pr/17/config.json` with no base-path
knowledge anywhere in that path. Constitution IV's single-document rule turns out to be
exactly what makes hosting at an arbitrary subfolder work.

Three obstacles, all mechanical, all in `.github/workflows/pages.yml`:

- **`ghp-import --push --force` replaces the whole branch.** Every publish from `main`
  force-pushes `site/build` as the entirety of `gh-pages`, so a `pr/17/` directory would
  survive until the next merge and then vanish. The mechanism was chosen for a stated
  reason — `ghp-import` over `mkdocs gh-deploy` so that "the artefact that was checked is
  the artefact that is published" — so letting a second publisher own `pr/` means main's
  workflow carrying that subtree forward explicitly. Two publishers, disjoint subtrees, and
  a force-push that has to learn about the boundary.
- **The publication gates have to cover previews too.** Today the built output is scanned
  for external sub-resources, for the FR-01 statement and for `noindex` before it is
  pushed. A preview publisher that skips them is a hole straight onto a public branch, which
  is the failure feature 015's second user story exists to prevent. Note also that
  `site/tools/check_no_external_resources.py` is syntactic — `src`, `link href`, `url()`,
  `@import` — so it would pass a page that fetches off-origin at *runtime*. Moot for a
  twin-backed preview, and the reason a backend-backed one would sail through a gate it
  actually violates.
- **The client is not published at all today.** `pages.yml` builds only the documentation.
  Publishing the client is new surface, and it needs `vite build --base=/drogna/pr/<n>/`
  per publish. That must stay a build-time flag: `client/tests/no-mock.test.ts` forbids
  `import.meta.env.<name>` anywhere under `client/src`, and Vite rewrites asset URLs
  without the source ever reading one, so the two are compatible — but only if nobody
  reaches for the environment variable to do it.

And one decision that is not mechanical. `pages.yml` says feature branches deliberately do
not publish, with its reason written down: "the public site follows unmerged work, so a
reader can see a claim about drogna that no longer holds by the time they act on it." That
is a recorded decision, not a gap, and the rule in this repository is to read the reason
before undoing the work. A preview at `/pr/<n>/`, unlinked from the site navigation and
carrying the same `noindex` the root does, is arguably a different object from the site
root changing under a reader — but it is close enough that it should be argued explicitly
and recorded, rather than slipped past. It also needs a reaper on pull-request close, or
the branch grows without bound.

## F12 — The seam already exists, and it is not a REST API

The instinct is to define a rich REST interface that a real backend and a browser backend
both implement. It is the right instinct about *where* the boundary goes and the wrong one
about *what* to build there, because the boundary is already declared and is narrower than
a new API would be.

The browser client's entire dependency on a backend is **one document, one subscription and
two fetches**:

| Surface | Where | Shape |
|---|---|---|
| The served configuration document | `config/runtime.ts:168`, one relative URL | `contracts/schemas/config.client.schema.json` — five required sections |
| The control namespace | `transport/mqtt.ts`, subscribe-only | eight topics in `data/topics.ts`, each with its generated message contract |
| The query layer | `App.tsx:179` | OGC API-EDR, addressed from the document |
| The clock rate | `controls/rateRequest.ts:54` | one POST |

That is the whole of it. `globalThis.fetch` appears at exactly three call sites in
`client/src` and one of them is the bootstrap. SensorThings does not appear in the client
at all — it is the vocabulary of the write path, sensors to ingest, and the browser reads
observations through the query layer.

Three reasons not to put a bespoke REST API in front of that:

- **The control namespace is push, and REST would make it poll.** The client never asks;
  it is told, and it draws what arrived. Turning that into request-response would replace
  the one property the SRD says the harness exists to demonstrate — "the architecture's
  interesting property is temporal" — with a polling loop that shows a different system.
  The proof in this spike drove the *unchanged* subscription path from a component running
  in the browser, which is the seam working rather than a seam needing to be built.
- **The read path is already a rich REST API, and exercising it is the point.** OGC API-EDR
  is what the project exists to try. ADR-0003 records the bespoke trajectory provider as
  sitting *behind* an existing port — the standard is the port. A second, bespoke API
  beside it would untether the client from the thing it is a demonstration of.
- **A new API is a new boundary shape.** Constitution III admits one definition of a shape
  that crosses a language boundary and forbids hand-written boundary types; Constitution VI
  forbids claiming more pluggability than exists. A bespoke API means masters under
  `contracts/schemas/`, generation, registration in `tests/unit/test_generated_models.py`,
  and a third contract to keep in step with two that already agree.

What the seam actually needs is not a new interface but **one implementation of each
transport per backend, chosen by the document**. Half of that is proven here: `Connector`
already existed as an injection point, `bus.ts` satisfies it, and the client cannot tell
the difference. The other half is F6 — the query layer and the rate control behind a
service worker — and it is unproven precisely because it is the remaining half of this
seam rather than a separate concern. Three `fetch` call sites is a small surface for a
service worker to stand behind, which is the reason to expect it to work and the reason to
prove it before committing.

Two parts of the surface are honestly bespoke and should be named as such rather than
folded into "the standards": the bootstrap document, and the clock rate POST. Neither wants
generalising into an API. Both are already schema'd, and the second is one route.

**A caution against over-reading this finding.** It is about the client's *data path* —
how a browser front end reads forecasts and receives control messages. It says nothing
about an operator plane: forcing a component to fail, tracking throughput, browsing a
store. That is a second surface with different consumers, and `spikes/operator-plane/`
finds the opposite answer for it, for the opposite reason. Here a contract already exists
and a second one would be a third thing to keep in step; there nothing exists, so a
declared contract is exactly what is needed.

## What could still sink it

- ~~**F6 is unproven.**~~ Answered on this branch by `spikes/service-worker/`: nine specs,
  every wait on a condition, and the repository's own fixed-sleep gate watched catching a
  planted delay. What remains there is verification rather than risk — Pages' own cache
  policy for `sw.js`, and composing the worker with the twin's components under load.
- **Drift.** Two implementations of eight components will diverge, and schema conformance
  will not catch a behavioural divergence. Mitigation to specify with the feature: record
  the real services' control traffic from an acceptance run and assert the twins produce
  the same topic ordering — AT-02 already asserts an ordering, so the assertion exists and
  wants a second subject.
- **The twin becoming the thing that gets demonstrated.** If it is easier to run, it will
  be what people see, and then the real system's failures stop being observed. Worth a
  sentence in the feature's non-goals, and worth keeping the published captures coming from
  the real stack even after the twin exists.
- **The publishing collision in F11.** Two workflows writing one branch, one of them with
  `--force`, is how a site gets silently deleted by a job that reports success. If the
  preview publisher lands before main's workflow learns about `pr/`, the failure is
  invisible until somebody visits the site.

## Recommendation

Build it, as a feature, in two stages with a genuine stop point between them.

**Stage one — the loop, no HTTP, published per pull request.** Bus transport, worker host,
the eight loop components, provenance and the visual treatment, deterministic step-driven
scenarios wired into the pair capture, and the per-pull-request publishing of F11. This
delivers the verification value in full, delivers the temporal story for the colleague and
the blog reader, and needs nothing that is currently unproven.

F11 is what makes stage one a deliverable rather than a capability. Without it the twin is
something you have to check out and run; with it, a pull request carries a link to itself
running. It is also the half of the seam that is already finished (F12): stage one needs
one new transport implementation and no new interface.

**Stage two — the wire.** The remaining half of the same seam rather than a separate
concern. Query layer, committed field slice, leakage coverage, the request/response panel.

This was written as conditional on a service-worker spike answering F6. That spike has run
and answered it, so the condition is discharged and the stop point between the stages goes
with it. Stage one still comes first, for a different reason than the one originally given:
the twin's components are what a preview has to show, and the worker adds the standards
story on top of a page that already lights up. One item moves the other way — the
blocked-worker message belongs to stage one, because a preview whose worker will not run
should say so whether or not it has a query layer to lose.

Stage one remains worth having on its own, which is the property a staged plan needs and
usually does not have — and with F11 it is worth having *visibly*, which is the property
that gets a spike's recommendation acted on.
