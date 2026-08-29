# drogna Version 2 — the plan

**Status:** Draft for review — nothing in this directory is adopted until the review says so
**Date:** 29 August 2026
**Provenance:** an interview with the author, conducted 29 August 2026. Every decision
below was put as a question and answered; the open questions at the end were not asked.

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

Version 2 answers both at once: a **pure client-side JavaScript system** in which the
backend components are genuine programs that happen to run in the browser, separated
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
| D7 | **React + Deck.gl inside GoldenLayout.** GoldenLayout 2.x owns the layout; each panel hosts a React root; the Map panel keeps Deck.gl. Top-level tabs at first run: **Intro, System, Map, Messages**; users may drag/drop to rearrange. | V1's rendering knowledge is reused. The GoldenLayout↔React integration is part of the foundations feature. |
| D8 | **Arc = build order = demo.** One ordering serves all three: each feature adds the next beat of the story, and the Intro tab narrates it. Build runs in chronograph order: data generation first, map display last. | See §5 for the proposed beats. |
| D9 | **Artefact order: SRD-v2 → constitution 2.0.0 → fresh spec series.** V1 specs are archived, never edited. The new series is far coarser — one feature per narrative beat. | Drafts of the first two accompany this plan. |
| D10 | **All-JS toolchain, gates included.** pnpm / TypeScript 5 / vitest / Playwright only; the constitution gates are rewritten as TypeScript scripts behind a new gates registry; Python leaves the repository. | One toolchain, one language — the reviewability the rewrite exists for. The watched-failing discipline carries unchanged. |
| D11 | **Static site, in-memory.** V2 builds to static assets; every visit is a fresh seeded run (which V1's constitution already demanded of instances); manifest export/import gives replay without storage. | The demo becomes a URL. No server, no droplet dependency for the core demonstration. |
| D12 | **The pub/sub seam is a broker component with MQTT semantics**: topic tree, wildcard subscription, ACL-shaped rules, behind a transport interface whose wire shape is MQTT-over-WebSocket. | The Messages tab and topic-tree view keep their V1 meaning; V3 swaps in a real broker. |
| D13 | **Foundations feature first.** The GoldenLayout shell (four tabs, mostly empty), the clock, the RNG, the manifest, the seam skeleton and the gates land as feature one, so every later beat is *visible* the day it is built. | "Demonstrable before the next begins" holds from the first feature. |
| D14 | **Principle X survives as a release-gate component at the seam**: the fetch layer routes through an in-browser boundary component applying a path-prefix allowlist with default deny, observable in System/Messages when a request is denied. | The release-boundary story stays tellable in V2; V3 replaces the component with the real proxy. |

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
constitutional (see the constitution 2.0 draft, Principle XI):

- **No import across the seam.** Front-end code never imports a backend component's
  modules, and vice versa; the only shared code is the generated types and the seam's
  client interfaces. A TypeScript import-boundary gate enforces this.
- **Every crossing validates.** Traffic on both carriageways is validated against the
  committed masters under `contracts/` — in tests always, and in the browser behind a
  debug flag. This is what makes the V3 swap credible, and it is acceptance-tested
  (AT-05 in the SRD-v2 draft): a recorded corpus of seam traffic is the conformance
  suite a real backend must pass.

## 4. What carries, what is reframed, what retires

Read alongside the constitution 2.0 draft, which carries the full argument per principle.

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
eviction to V3. The one genuinely open scope question this raises is recorded in §8.

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
| **101 foundations & shell** | The stage is lit | GoldenLayout shell with the four tabs; clock component beating; System lights its first component from a real heartbeat; seam skeleton; gates in TS, each watched failing; static build deployed |
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

## 6. Repository mechanics

- **Branching:** this plan and its drafts land via PR from `claude/drogna-v2-planning-ae8ln2`.
  Adoption (below) happens on the repository's normal flow after review.
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
├── docs/                         adr/ (carried, 0027+ are V2), architecture/ (rewritten), v1 archive banners
├── app/                          the one deliverable
│   └── src/
│       ├── shell/                GoldenLayout + panel hosts
│       ├── panels/               Intro, System, Map, Messages (+ any later)
│       ├── backend/              the in-browser components, one directory each
│       ├── seam/                 transport, interception, release gate, client interfaces
│       └── generated/            GENERATED TS types (do not edit)
├── scripts/                      TS gates + gates.registry (pattern carried)
└── site/                         fate is an open question, §8
```

- **The import-boundary gate** polices `shell|panels` ↔ `backend` (only `seam/` and
  `generated/` are importable from both sides), replacing V1's service-dependency gate
  at the same rank.

## 7. Adoption sequence (after this review)

1. Review comments on this PR are resolved; the three drafts are amended in place.
2. **SRD-v2 adopted:** `docs/v2/srd-v2.md` moves to the root as `srd.md`;
   `harness-srd.md` gets its archival banner.
3. **Constitution 2.0.0 adopted:** the draft replaces `.specify/memory/constitution.md`;
   ADR-0027 moves from Proposed to Accepted; the version log records the major bump.
4. **Feature 101 specified** (spec-kit, against the new constitution), beginning with
   the retirement commit and the seam spike.
5. Beats 102–109 follow in order, each demonstrable before the next begins.

## 8. Open questions — raised here, not silently resolved

These were *not* asked in the interview. Each needs an answer before the feature that
touches it, none blocks adoption of the plan itself.

1. **The published site and blog** (`site/`, PR-06–PR-08): does one-post-per-feature
   continue for the V2 series, and does the V1 site stay published as part of the
   record? (Recommendation: yes to both; the rewrite is itself good material.)
2. **The droplet** (NFR-06): a static site removes the need for it for the demo. Retire
   it, or keep it serving the published site until V3 needs a host again?
3. **Capture tooling:** V1's three-moment Playwright capture discipline (PR-10) and the
   rate-zero rule (FR-53) carry naturally — but the capture scripts are Python. Confirm
   they are rewritten in feature 101 rather than carried.
4. **Offload's V2 shape** (§4): is announcement-only offload acceptable for V2, with
   verified-receipt eviction deferred to V3?
5. **GoldenLayout pin:** golden-layout 2.6.x (MIT) is the assumption. Confirm, and
   record the React-hosting pattern chosen in feature 101's ADR if it proves contested.
6. **Spec numbering from 101:** confirm, or choose another scheme, before feature 101's
   directory is created.
