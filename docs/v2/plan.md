# drogna Version 2 — the plan

**Status:** Endorsed by the author, 29 August 2026. The SRD-v2 and constitution 2.0.0
drafts, written against the endorsed plan, accompany it in this directory; adoption
mechanics are §8.
**Date:** 29 August 2026
**Provenance:** an interview with the author, conducted 29 August 2026, plus a sweep of
the six open pull requests (#43–#47, #49) for emergent requirements (§6), plus a second
interview round the same day resolving the §9 questions and E1, plus a third round of
author direction the same day on how implementation is worked and reviewed (D15–D17),
plus a fourth on the gh-pages estate and the blog's form (D18–D19). Every decision
below was put as a question and answered, or stated by the author directly.

---

## 1. Why a Version 2

Two frustrations, named by the author:

1. **Pace, caused by reviewability.** The backend is twelve services in four languages of
   artefact (Python, SQL, nginx config, Compose), and reviewing a change means reasoning
   across containers. The work is sound — all four acceptance criteria pass — but each
   increment is slow to see, slow to review, and slow to trust.
2. **Divergence.** Requirements were identified as understanding grew (the SRD went
   from four sections to thirteen; 23 specs, 25 ADRs), and the artefact set no longer
   reads as one coherent system. The constitution, the SRD and the specs need refocusing
   more than any one component needs fixing.

Version 2 answers both at once: a **pure client-side TypeScript single-page
application** in which the backend components are genuine programs that happen to run in
the browser, separated
from the front-end by a **wire-protocol seam** — so that Version 3 can replace them with
a real backend by swapping a base URL, not by rewriting the client. All current software
is retired and rewritten clean. The written record is refocused first, and the rewrite
follows it.

## 2. Decisions taken (the interview record)

Each of these was an explicit answer. Reversing one is a review comment on this
document, not a silent divergence later.

| # | Decision | Consequence |
|---|---|---|
| D1 | **Wire-protocol seam.** The in-browser backend answers real HTTP shapes (EDR, SensorThings) and a real pub/sub wire shape, via an in-browser interception layer. | V3 is a base-URL swap. The wire vocabulary is exercised from day one, not deferred. |
| D2 | **The in-browser components are real components, not fixtures.** Constitution Principle VII survives, re-scoped: a display lights only because a component actually running in the browser actually emitted. No fixture data, no "populate for the screenshot" path — that prohibition is unchanged. | "Mock" in V2 means *an implementation of a backend role that runs in the browser*, never *canned data asserting something exists*. The vocabulary is defined once, in constitution 2.0. |
| D3 | **Same repository, clean slate.** V1 code is deleted (git history keeps it); the ADRs, spikes, specs and SRD are archived in place as the historical record the new constitution cites. | No parallel maintenance period. The record survives; the software does not. |
| D4 | **All capabilities carry into V2**, connected by a **narrative arc** that logically joins them and forms the basis of a demo/walkthrough. Nothing is retired by scope; anything deferred says why. | The arc is the organising artefact — see §5. |
| D5 | **EDR + SensorThings remain the seam's vocabulary**, as genuine subsets with the subset stated (the honest-ports discipline carries). | Standards conformance stays demonstrable; the V3 backend implements the same standards. |
| D6 | **Determinism carries in full.** No wall-clock (Principle I) and seeded-RNG replay (Principle II) both survive: a simulation-clock component drives all time, every component draws from seeded streams, and replay-from-manifest remains a test. | The harness keeps its identity, and one language makes the gates *easier* to enforce, not harder. |
| D7 | **React + Deck.gl inside a dockable multi-panel shell.** A layout manager owns the shell; each panel hosts a React root; the Map panel keeps Deck.gl. Top-level tabs at first run: **Intro, System, Map, Messages**; users may drag/drop to rearrange. *Amended in the second round (§9.5): dockable drag/drop tabs are the requirement, not a named library — GoldenLayout 2.x is the leading candidate, and feature 101 opens with a short spike choosing between it and maintained alternatives (e.g. dockview, flexlayout-react), recorded as an ADR.* | V1's rendering knowledge is reused. The layout-manager choice and its React-hosting pattern are settled in the foundations feature. |
| D8 | **Arc = build order = demo.** One ordering serves all three: each feature adds the next beat of the story, and the Intro tab narrates it. Build runs in chronograph order: data generation first, map display last. | See §5 for the proposed beats. |
| D9 | **Artefact order: SRD-v2 → constitution 2.0.0 → fresh spec series.** V1 specs are archived, never edited. The new series is far coarser — one feature per narrative beat. | This plan is reviewed first; the SRD and constitution drafts follow its approval (§8). |
| D10 | **All-TypeScript toolchain, gates included.** pnpm / TypeScript 5 / vitest / Playwright only; the constitution gates are rewritten as TypeScript scripts behind a new gates registry; Python leaves the repository. | One toolchain, one language — the reviewability the rewrite exists for. The watched-failing discipline carries unchanged. |
| D11 | **Static site, in-memory.** V2 builds to static assets; every visit is a fresh seeded run (which V1's constitution already demanded of instances); manifest export/import gives replay without storage. | The demo becomes a URL. No server, no droplet dependency for the core demonstration. |
| D12 | **The pub/sub seam is a broker component with MQTT semantics**: topic tree, wildcard subscription, ACL-shaped rules, behind a transport interface whose wire shape is MQTT-over-WebSocket. | The Messages tab and topic-tree view keep their V1 meaning; V3 swaps in a real broker. |
| D13 | **Foundations feature first.** The shell (four tabs, mostly empty), the clock, the RNG, the manifest, the seam skeleton and the gates land as feature one, so every later beat is *visible* the day it is built. | "Demonstrable before the next begins" holds from the first feature. |
| D14 | **Principle X survives as a release-gate component at the seam**: the fetch layer routes through an in-browser boundary component applying a path-prefix allowlist with default deny, observable in System/Messages when a request is denied. | The release-boundary story stays tellable in V2; V3 replaces the component with the real proxy. |
| D15 | **Developer autonomy during implementation** *(third round)*. The system is far better understood than when the repository began: once the plan, SRD-v2 and constitution are adopted, developers make implementation decisions independently, without asking the author — including conducting research spikes when necessary, whose outcomes need no endorsement. | The author reviews *outcomes* — through D16's demo links, D17's notices and blog posts — not through approval gates. The record disciplines carry unchanged: contested or hard-to-reverse decisions still earn ADRs, spikes still write dated `FINDING.md`s. |
| D16 | **One implementation PR** *(third round)*. The whole V2 implementation lands through a single long-lived PR. Progress is narrated in PR comments, each linking to a statically hosted (gh-pages) instance of the app **opening in the relevant view via an anchor URL** — the reviewer clicks from the comment straight into the beat being shown. | Two derived obligations: CI publishes per-stage builds under stable gh-pages paths, and **the shell supports URL-addressable views (deep links) from feature 101** — a comment cannot open "the relevant view" unless views are addressable. Both go into SRD-v2. |
| D17 | **ntfy notices and the blog mark significant arrivals** *(third round)*. When a significant visual component is ready, the author is sent a ntfy message with the demo link. Blog posts on the rebuilt site (§9.1) capture significant new UI components and backend simulations — amending the cadence from one-post-per-feature to one-per-significant-component — and each posting is also announced by ntfy. | The ntfy topic is deployment configuration (a CI secret), never committed — PR-01's "public but unadvertised" discipline applies to the notification channel too. |
| D18 | **The gh-pages estate grows; it is not rebuilt** *(fourth round)*. The site hosts per-PR SPA instances for review, retained once the PR completes; blog articles for significant components **embed a playable instance**; where the significant work is headless, the article embeds an HTML/JS wrapper/visualisation that demonstrates the component working across its range of interactions — possible precisely because the data crosses the seam in wire shape, so a wrapper is just another consumer. The glossary and the component reference are valued V1 site content and carry into the V2 site as first-class pages. | The publishing model changes from a wholesale rewrite at each merge to **additive, discrete deployments**: a review instance cannot wait for a merge to the default branch, so pushes land content into the estate directly, and completed instances stay addressable. SRD-v2's delivery requirements follow. |
| D19 | **Blog articles are terse, to a fixed shape** *(fourth round)*: the background, the requirement, the options considered, the demo — minimal prose beyond that. | The demo (the embedded instance or wrapper) carries the weight the prose used to; a post is a caption on a running thing, not an essay. |

## 3. The seam, precisely

The seam is the one architectural invariant V2 exists to establish. It has three
carriageways, and everything the front-end knows about the backend crosses one of them:

1. **HTTP.** The front-end issues real requests (fetch) against relative URLs taken
   from configuration. In V2 an interception layer answers them from the in-browser
   query components with genuine EDR and SensorThings JSON; in V3 the same URLs resolve
   to a server. Whether the interception is a Service Worker (real requests, visible in
   the devtools network tab — the reviewability argument) or a fetch-level shim is the
   **first spike of the rewrite**, decided in the foundations feature and recorded as an
   ADR.
2. **Pub/sub.** A broker component with MQTT topic semantics (D12). The front-end and
   every backend component hold a client handle to a transport interface; the V2
   transport is in-browser, the V3 transport is MQTT-over-WebSocket, and the topic
   grammar, the ACL-shaped rules and the payload schemas are identical in both.
3. **The release gate.** All HTTP traffic passes the boundary component (D14) before
   any query component sees it: default deny, path-prefix opt-in, denials observable.

Two rules make the seam load-bearing rather than decorative, and both become
constitutional (a new Principle XI in the 2.0.0 draft that follows this plan's
approval):

- **No import across the seam.** Front-end code never imports a backend component's
  modules, and vice versa; the only shared code is the generated types and the seam's
  client interfaces. A TypeScript import-boundary gate enforces this.
- **Every crossing validates.** Traffic on both carriageways is validated against the
  committed masters under `contracts/` — in tests always, and in the browser behind a
  debug flag. This is what makes the V3 swap credible, and it is acceptance-tested
  (AT-05 in the SRD-v2 draft): a recorded corpus of seam traffic is the conformance
  suite a real backend must pass.

## 4. What carries, what is reframed, what retires

The constitution 2.0.0 draft (written after this plan is approved) will carry the full
argument per principle; this section is the summary that draft descends from.

**Carries unchanged:** no wall-clock (I); seeded randomness and deterministic replay
(II); no literal paths or hosts (IV — the config document a component receives at
construction replaces `HARNESS_CONFIG`); the prohibition on third-party entities (V,
verbatim); recommendations-not-decisions (VIII); ground truth scored, not assumed (IX);
the watched-failing gate discipline; the append-only shared-file rule; spec-kit as the
development process; ADRs.

**Reframed:** generated types (III) — one runtime language now, but the masters under
`contracts/` remain the authority and TypeScript is generated from them, because the
masters are what V3's second language will generate from; liveness (VII) — per D2;
honest ports (VI) — the port inventory is rewritten around the seam (transport, clock,
RNG, store interfaces), with the same rule that nothing claims more pluggability than
it has; default deny (X) — per D14.

**Retires, with the reason written:** the container/Compose deployment and everything
that existed to serve it (the proxy image, the CA seam gate, the compose lint, the
bring-up tests — their *lessons* stay in the archived record); Postgres/PostGIS and
NetCDF as engines (the store *semantics* — one writer per store via an ingestion seam,
append-only advisories, read-only features, atomic publication, three coverage eras —
carry into in-memory stores; the engines return in V3); pygeoapi and nginx (their
*roles* carry as in-browser components); the container-resource-sampling wall-clock
exemption (ADR-0026 — there are no containers; the erosion count returns to two);
Python and its toolchain (D10).

**Deliberately deferred, not dissolved:** offload export as a real file leaving a real
system is thin when the whole system is one browser page; V2 keeps the *announcement*
semantics (products observed leaving by subscription) and defers verified-receipt
eviction to V3. The scope question this raised is resolved in §9.4: announcement-only,
keeping the export's shape (E11's run-manifest sibling included).

## 5. The narrative arc, and the proposed feature series

The arc, in one breath: *a world exists and is truthfully recorded → sensors sample it →
the samples are served through standard interfaces → a forecast loop assimilates them →
uncertainty is measured, and shrinks where sampling happens → a planner recommends where
to sample next → the shore sends advice smaller than a field → and the map shows all of
it, queryable by gesture.*

Proposed series — **new numbering from 101**, so the two series can never collide and a
number's century says which system it belongs to. Each feature is one beat, demonstrable
in the shell the day it lands. This list is a proposal for review, not a decision:

| Feature | Beat | Lands visibly as |
|---|---|---|
| **101 foundations & shell** | The stage is lit | The dockable shell with the four tabs (layout library chosen by spike, §9.5) and URL-addressable views (D16); clock component beating; System lights its first component from a real heartbeat; seam skeleton; gates in TS, each watched failing; static build deployed |
| **102 the synthetic ocean** | A world exists | Generator: 4D fields, four seeded features, the tau field, ground-truth manifest; the historic archive authored at provisioning; manifest inspectable in the shell |
| **103 sensing** | It is sampled | Sensors publishing SensorThings-vocabulary observations over the broker; ingestion seam; observation store; Messages tab shows real traffic |
| **104 the query seam** | It is served | EDR + SensorThings answered through the seam over the archive, now-cast and observations; subset statements; the release gate with default deny; AT-01's descendant passes |
| **105 the forecast loop** | It is assimilated | Monitor, scheduler, model runner (ensemble), publisher; run instances accumulate as holdings; AT-02's descendant: a breach becomes a published run, watched from System |
| **106 uncertainty & planning** | Doubt is measured, and directed | Spread + observation-age uncertainty; the planner's committed route and projections; recommendations on the control namespace |
| **107 the operator's view** | The machinery is interrogated | Telemetry, throughput per simulation second, skill vs persistence, topic tree; commands — rate, step, stop/start of in-browser components — with refusals surfaced |
| **108 shore advisories** | Advice travels light | Advisory authoring, the append-only advisory store, the advisories collection through the gate |
| **109 the map** | It is seen | Deck.gl panel: fields, uncertainty decaying and refreshing, the route as a 4D curve, advisories, and the EDR composer — the arc's final beat and the demo's closing scene |

The Intro tab grows one section per landed beat, in the same order — by 109 it *is* the
walkthrough script. Interactive walkthrough machinery (a step-through mode driving the
other panels) is deliberately not in this series; it is a candidate feature 110 once the
arc exists to walk through.

**Feature 111, the Background tab**, is specified (`specs/111-background-tab/spec.md`,
SRD-v2 §5.10) and sits outside the arc: eight self-contained explainers of the standards
the architecture rests on, reading no run state and depending only on 101's shell. It
took 111 rather than 110 so that the walkthrough candidate above keeps its named slot;
if that candidate is dropped, reconcile the numbers here rather than quietly.

**Feature 112, the Operator flow chart and the platform**, is specified
(`specs/112-operator-flowchart/`, SRD-v2 §5.11) and also sits outside the arc, though it
reaches into it: it gives the sampling platform its own component with a motion
simulator — demanded and current course, speed and depth, commandable over the broker —
publishes ownship state as ordinary SensorThings measurements so the map can draw the
track, and redraws the Operator tab as the picture §2 of the V1 SRD always said the
architecture is: a flow chart with a loop in it, every component wearing an instrument
designed for what it does. It took 112 for the same reason 111 took 111.

## 6. Emergent requirements from the open pull requests

Six PRs are open besides this one (#43–#47, #49). Their markdown — spike findings, ADRs,
spec artefacts, trap entries — was swept for capabilities and requirements that V1's SRD
never carried, because a requirement discovered in a PR and not written down here would
be exactly the divergence V2 exists to end. Fifteen candidates, each with where it lands
in SRD-v2; **E1 is the only one that changes behaviour rather than recording it, and
needs an author's answer**.

**From #49 (the watched turn — `spikes/watched-turn/FINDING.md`):**

- **E1 — The loop can become permanently becalmed, and V1 recorded the question as
  open.** Once the newest run's validity span lapses, the monitor scores no residual
  against it, no divergence can ever fire again, nothing else requests a run — and every
  component reports healthy. Watched live in the first scenario. SRD-v2's forecast-loop
  beat (105) must *answer* what V1 deliberately left open: score against a lapsed field,
  hold a scheduling cadence as a floor, or declare the calm a scenario's intended end
  state — and whichever it is, the state must be legible in the shell. **Answered in
  the second interview round: the cadence floor (§9.7).**
- **E2 — Quiet must be legible.** The scheduler correctly declining a breach inside its
  minimum interval looks identical to a stall from the outside. The System view should
  say *why* the loop is quiet: declined-by-policy, becalmed, or genuinely stalled.
- **E3 — Provisioning goes through the components' own paths.** The initial run is
  seeded by publishing it through the real publisher, so the first page load finds a lit
  publish phase — seed data in the constitution's sense, never a fixture. V2's
  provisioning requirement should mandate this shape: seed by running component code,
  never by poking a store.
- **E4 — The client validates every received message against its schema and shows a
  refusal counter** ("0 refused by their schema" was itself a watched claim). Carries
  into the Messages tab requirement.
- **E5 — Publication integrity is checked, and refusals were watched.** A staged run
  whose field does not match the digest its descriptor records is refused with that
  sentence, the pointer untouched. Carries into V2's coverage-store publication
  requirement.
- **E6 — The watched turn as method.** The acceptance gate was *seen happening in the
  client* and captured, not inferred from green tests. Candidate process requirement:
  each beat's acceptance is watched live in the shell, with the capture as the record.

**From #47 (one door):**

- **E7 — One origin, relative URLs, structurally.** A client document naming an absolute
  URL breaks behind a clearance at the preflight, so endpoints are relative and
  same-origin *by requirement*, not convention. This independently confirms the seam
  decision (D1/FR-04): V2 satisfies it trivially, and it binds V3's topology — page,
  data and control through one door under one clearance.
- **E8 — Measure at least one cleared request.** The proxy's credential fault hid for
  the file's whole life because every test exercised refusals; the first cleared request
  ever made found it in seconds. The release gate's tests (V2 and V3 alike) must include
  the allowed path, not only the denials.

**From #46 (the SensorThings spatial predicate — its ADR-0027):**

- **E9 — A subset grows one predicate at a time, and every refusal names the thing
  refused.** `st_within` on the observation's own location only; single-ring polygon
  only; everything else refused by name; the conformance statement amended in the same
  commit and its agreement with the served account held by a test. This grain — not just
  "state the subset" — carries into the query-seam requirement.

**From #45 (replay and residue):**

- **E10 — AT-04's stronger form is now the standard.** Two-participant byte-identical
  *lockstep* replay, a one-command replay proof, watched failing against three planted
  violations. V2's AT-04 descendant inherits the strong claim, not the weaker original.
- **E11 — The measurement geometry travels beside the export, never inside it.** A
  run-manifest sibling carries the identification radius and every sampled
  position/time — the ground truth the leakage gate scores the updated-region shape
  against — deliberately outside the released members list, with producer/boundary
  radius parity held by a test. Refines the leakage-test requirement; §9.4's resolution
  keeps this shape in V2's announcement-only offload.

**From #44 (the topic tree — its ADR-0027 and spec):**

- **E12 — The topic tree is a richer requirement than V1's SRD ever recorded**:
  structure from the declared topology artefact and nothing else, illumination from
  genuinely received traffic and nothing else, the two never mixing; consumer roles as a
  first-class column connected to the subtrees their filters cover; pulse, ripple,
  sustained intensity; wide branches collapsing to a summary node. Carries into the
  Messages/System requirements at this grain.
- **E13 — A display may not show cold where there is traffic.** V1 had to add a
  read-only observer role because a tree that cannot hear a namespace misrepresents the
  running system. V2's in-browser broker hears everything, so this is trivially
  satisfied — but the requirement is recorded so V3's transport inherits it, together
  with the role discipline (the shell's identity reads both namespaces and may never
  publish).
- **E14 — The topology is derived, committed, and drift-gated.** The topic list comes
  from scanning declarations in the tree, never from a hand-maintained document. The
  mechanism carries into V2 (the scanner reads component configuration instead of an
  ACL file).

**From #43 and issue #34 (the ocean reaches the browser):**

- **E15 — "Delivered" is not "wired": a feature can pass while the path through it is
  broken.** The V1 map surface was delivered and had never drawn a field — five broken
  links, none in the client itself. This is the strongest argument for D8 (each beat
  demonstrable end-to-end): SRD-v2 should require that a beat's demonstration exercises
  the full path through the seam — generator to pixel — not the panel in isolation.

One mechanical finding from the same sweep: PRs #44 and #46 *each* add an ADR numbered
0027 (the number-collision gate `site/gates/check_adr_numbers.py` exists precisely for
this, and one of the two records having been renumbered once already). The V2 reversal
ADR will therefore take whatever number is free when it lands, after those PRs merge —
the plan refers to it as "the reversal ADR" rather than by number.

## 7. Repository mechanics

- **Branching:** this plan and its drafts land via PR from `claude/drogna-v2-planning-ae8ln2`.
  Adoption (below) happens on the repository's normal flow after review. Implementation
  then proceeds per D16: one long-lived branch, one PR, for the whole of 101–109 — PR
  comments with anchor-URL demo links are the running review surface, gh-pages carries
  the hosted instances, and ntfy carries the significant-arrival notices (D17).
- **Archiving:** `specs/001–023`, `docs/adr/0001–0026`, `spikes/`, and `harness-srd.md`
  stay where they are. Each gets a one-line archival banner at the top ("V1 record —
  describes retired software; superseded by …") in the adoption commit, nothing else is
  edited. The V1 `CLAUDE.md` traps section is rewritten for V2 at retirement — most of
  its traps are container-shaped and retire with the containers, but its two portable
  lessons head the new file: *the tree is the authority and the record is a claim about
  it*, and *a check that has never been seen to fail is worth nothing*.
- **The retirement commit:** deletes `services/`, `libs/`, `deploy/`, `query/`,
  `proxy/`, `stores/`, `client/`, `config/`, and the Python halves of `scripts/`;
  `contracts/` is kept and pruned to the masters V2 consumes. Deletion happens as the
  *first act of feature 101*, not before review and not piecemeal — a half-retired tree
  is worse than either whole.
- **Proposed V2 layout** (final form belongs to feature 101's plan, argued against the
  repo-layout rule):

```text
.
├── srd.md                        SRD-v2 (source of scope)
├── .specify/memory/constitution.md   2.0.0
├── specs/1NN-slug/               the V2 series
├── contracts/                    masters: JSON Schema + OpenAPI (carried)
├── docs/                         adr/ (carried; V2 records continue the numbering), architecture/ (rewritten), v1 archive banners
├── app/                          the one deliverable
│   └── src/
│       ├── shell/                layout manager + panel hosts
│       ├── panels/               Intro, System, Map, Messages (+ any later)
│       ├── backend/              the in-browser components, one directory each
│       ├── seam/                 transport, interception, release gate, client interfaces
│       └── generated/            GENERATED TS types (do not edit)
├── scripts/                      TS gates + gates.registry (pattern carried)
└── site/                         rebuilt for V2, V1 posts archived within it (§9.1)
```

- **The import-boundary gate** polices `shell|panels` ↔ `backend` (only `seam/` and
  `generated/` are importable from both sides), replacing V1's service-dependency gate
  at the same rank.

## 8. Adoption sequence (after this review)

1. **This plan is reviewed and approved first.** ✔ Endorsed by the author,
   29 August 2026.
2. **SRD-v2 drafted** against the endorsed plan, folding in the E-items and resolved
   questions — `docs/v2/srd-v2.md`, in this directory. On adoption it moves to the
   root as `srd.md`; `harness-srd.md` gets its archival banner.
3. **Constitution 2.0.0 drafted** against the SRD, with the reversal ADR —
   `docs/v2/constitution-2.0-draft.md` and `docs/v2/adr-reversal-draft.md`, in this
   directory. On adoption it replaces `.specify/memory/constitution.md`; the ADR moves
   to Accepted under the next free number (plan §6's collision note); the version log
   records the major bump.
4. **Feature 101 specified** (spec-kit, against the new constitution), beginning with
   the retirement commit and the seam and layout spikes. Implementation opens the
   single long-lived PR of D16.
5. Beats 102–109 follow in order in the same PR, each demonstrable before the next
   begins — demonstrated by a PR comment deep-linking into the hosted instance, with
   ntfy and the blog marking the significant arrivals (D17). Decisions along the way
   are the developers' own (D15); the author reads the outcomes.

## 9. Questions raised open — resolved by the second interview round, 29 August 2026

These were not asked in the first interview, were recorded here as open rather than
silently resolved, and were then put to the author. Each now carries its answer; the
original question wording is kept so the answer can be read against it.

1. **The published site and blog** (`site/`, PR-06–PR-08): does one-post-per-feature
   continue for the V2 series, and does the V1 site stay published as part of the
   record? — **A fresh V2 site, with V1 archived.** The site is rebuilt for V2 (a
   static site beside a static site), and the V1 posts move to an archive section
   within it rather than disappearing. The rebuild's feature placement is decided at
   101's planning; the archive move rides the retirement commit's wake. *Extended by
   the fourth round: the estate grows additively with live instances and embedded
   demos (D18), and the articles take a fixed terse shape (D19).*
2. **The droplet** (NFR-06): retire it, or keep it serving the published site until V3?
   — **Retired at V1 retirement.** Demo and site are both static, so nothing V2 runs
   needs a server; V3 provisions fresh when it needs a host. The droplet is
   decommissioned in the retirement commit's wake.
3. **Capture tooling:** rewritten in feature 101 or carried? — **Rewritten in
   TypeScript in feature 101.** The three-moment discipline (PR-10) and the rate-zero
   rule (FR-53) carry unchanged; the glance mechanism — headless-Chromium shot with the
   simulated rate printed beside it — is rebuilt first so every beat from 102 on has
   capture from day one. Python leaves whole (D10 holds without exception).
4. **Offload's V2 shape** (§4): — **Announcement-only, keeping E11's shape.** V2 keeps
   the announcement semantics and the export's *shape*, including the run-manifest
   sibling carrying the measurement geometry, so the leakage tests keep their ground
   truth; no real transfer and no verified-receipt eviction until V3.
5. **GoldenLayout pin:** — **Evaluate alternatives first.** Dockable drag/drop tabs are
   the requirement, not a named library. Feature 101 opens with a short spike comparing
   golden-layout 2.x against maintained alternatives (e.g. dockview, flexlayout-react)
   and pins the winner with an ADR recording the React-hosting pattern. D7 is amended
   in place to match.
6. **Spec numbering from 101:** — **Confirmed.** `specs/101-…` through `specs/109-…`;
   V1's 001–023 sort separately and no number is ever reused.
7. **E1, the becalmed loop** (§6, put to the author in the same round): — **A cadence
   floor.** The scheduler gains a maximum interval: when no run has been requested
   within it and the current run's validity has lapsed, a run is warranted on schedule
   alone, so the loop cannot be permanently becalmed. The System view labels such runs
   *scheduled*, distinct from divergence-triggered, so the two causes stay legible
   (which also serves E2).
