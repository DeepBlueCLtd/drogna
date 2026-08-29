# Feature 111 — plan

Written against feature 101 as landed on `claude/v2-implementation-ron0ev` (ADR-0028,
`app/src/shell/`), not against the plan for it. Where the two differ the tree wins.

## Structure

```
app/
├── config/run.json                     shell.views gains `background`; the eight
│                                       explainer ids and labels join it (Constitution IV)
└── src/
    ├── shell/views.ts                  EXTENDED — addressing below the panel; see below
    ├── shell/Shell.tsx                 TOUCHED — hash writeback must preserve a sub-path
    └── panels/background/
        ├── BackgroundPanel.tsx         the panel dockview mounts; sub-tab strip + course position
        ├── Slides.tsx                  the bespoke slide component (FR-006)
        ├── ValuePanel.tsx              the fixed closing beat (FR-008)
        ├── sea.tsx                     shared schematic SVG primitives — the nameless sea,
        │                               the four seeded features, the grid (FR-011, FR-012)
        ├── explainers/
        │   ├── why-a-standard.tsx      slides
        │   ├── points-and-fields.tsx   interactive
        │   ├── netcdf.tsx              interactive
        │   ├── sensorthings.tsx        interactive
        │   ├── edr.tsx                 interactive
        │   ├── pygeoapi.tsx            slides
        │   ├── mqtt.tsx                interactive
        │   └── control-loop.tsx        interactive
        └── background.css
scripts/
├── gates/check-background-inert.ts     NEW — the static half of FR-004
└── gates.registry                      one line appended; the runner still names no gate
```

## What 101 landed, and the two places this feature must reach into it

**1. Addressability stops at the panel, and FR-003 needs it to go further.**
`app/src/shell/views.ts` matches `^#/view/([a-z][a-z0-9_-]*)$` — one segment — and
ADR-0028 states the position outright: "the panel `id` is the unit of URL addressability
(FR-15)". FR-003 asks for `#/view/background/mqtt/3`, which that scheme cannot express.

Three ways out, and the choice is contested enough to be recorded rather than assumed:

- **Extend `views.ts` to a view plus an opaque remainder**, the shell passing the
  remainder to the panel and panels that do not understand one ignoring it. Preferred:
  the remainder is meaningless to the shell, so no panel's internal vocabulary leaks
  into shell code, and every existing `#/view/<id>` link keeps working unchanged.
- **A hash query** (`#/view/background?step=mqtt.3`). Rejected: two parsers for one
  address, and query semantics inside a fragment surprise everyone who reads it.
- **Eight top-level panel ids** (`background-mqtt`, …). Rejected: it would put the
  explainers in the tab bar beside Intro and Map, which is what a sub-tab exists not
  to do.

This amends ADR-0028 and earns its own record — the decision is hard to reverse once
links are shared, which is the whole point of FR-15.

**2. The hash writeback will erase a step, silently.** `Shell.tsx`'s `onReady`
registers `onDidActivePanelChange` and rewrites the address to `hashForView(panel.id)`
whenever the active panel changes and the hash does not already name it. Land a
sub-path without touching this and the first activation — including the one dockview
fires while restoring a layout — replaces `#/view/background/mqtt/3` with
`#/view/background`. It would look like a working deep link that quietly forgets where
it was pointing, and only on a second visit. **Watch it happen before fixing it**: the
regression test asserts the sub-path survives an activation event, and must be seen
failing against the unmodified writeback.

## Constitution check (2.0.0)

- **I — no wall-clock.** Background reads no clock at all, simulation or host. No
  exemption marker anywhere in this feature; if one appears, something has gone wrong.
  Any animation is driven by viewer input or CSS, never by a timer sampling a clock.
- **II — seeded randomness.** No RNG. An illustration that looks stochastic uses a
  fixed sequence held in its own module; nothing here draws from the run's streams, and
  nothing here is recorded in the manifest.
- **III — generated types.** Background declares no seam shape, so it generates
  nothing — and must not therefore hand-write one. Its content types are local view
  models, never boundary shapes. Called out because "the gate does not apply here" is
  the sentence that preceded two hand-written `Measurement` classes in V1.
- **IV — no literal paths or hosts.** Explainer ids and labels come from
  `config.run`'s `shell` document alongside the existing views, not from literals in
  panel source. Illustrative URLs *inside* an explainer are different: they are drawn
  artwork about a standard, not endpoints this page calls, and they need the gate's
  marker with that reason stated.
- **V — no tracked-entity vocabulary.** The live hazard of this feature. The gate scans
  `app/src` including `.tsx`, and forbids `contact(s)` and `detection(s)` outright.
  Eight explainers about sensing are exactly where "the sensor's detection range" gets
  typed. Write around it — a sensor *samples*, an instrument *reports* — and never
  reach for the marker to get prose through. (`track` is ordinary navigational English
  and permitted, so EDR's trajectory story is safe.)
- **VII — liveness, not configuration.** Background is not a component: no heartbeat,
  no entry in `shell.components`, no lamp on the System panel. It is a panel that
  renders prose and SVG, and the inventory must not grow a nineteenth box for it.
- **XI — one seam, wire-shaped.** The import-boundary gate already stops a panel
  importing `backend`. It permits `seam`, which for this panel is still too much:
  FR-004 says Background issues no request at all. Hence the new gate below.

## The new gate

`scripts/gates/check-background-inert.ts`, appended to `scripts/gates.registry`:
nothing under `app/src/panels/background/` may import `seam`, and no module there may
name `fetch`, `subscribe` or `publish`. This is the static half of SC-002; the runtime
half is a test that mounts the panel with a client whose every method throws. Both
halves are watched failing against a deliberately-wired explainer held permanently in
`scripts/gates/tests/fixtures/violations/`, in the pattern T031 established.

Two checks rather than one because they fail differently: the gate catches the import
that has not been called yet, and the test catches the call that came in by a route the
gate did not model.

## Decisions to record

- **An ADR amending ADR-0028**, for addressability below the panel. Number taken when
  it lands, after 0030.
- **No ADR for the slide component.** Nothing contested survives: the interview settled
  bespoke-over-reveal.js, the reason is in `spec.md`, and no dependency is added, so
  there is nothing hard to reverse.
- **No ADR for the eight topics or their order.** That is the specification's content,
  and it is recorded there with the interview that produced it.

## Sequencing

The spine first (US1), because it defines the shape the other seven fill and because
the addressing work is the only part that can go wrong for anyone but this feature. The
explainers then land in their course order, each independently reviewable: US2 (points
and fields, NetCDF), US3 (SensorThings, EDR, pygeoapi), US4 (MQTT, the control loop).

## The SRD amendment, resolved

`spec.md`'s FR-001 amends FR-14 to name Background a top-level tab. The amendment was
written against `docs/v2/srd-v2.md`, which feature 101's adoption commit renames to
`srd.md` at the repository root; merging that branch in carried the edit across on
git's rename detection, and it was checked in place rather than assumed.

Re-reading the amended paragraph against the tree found two further faults, both from
101 and 102 and both now corrected in `srd.md`, because publishing a list known to be
wrong is worse than the list being short:

- **Holdings was missing.** The shell serves Intro, System, Holdings, Map, Messages;
  FR-14 named four of the five. Adding Background to a list already wrong would have
  compounded it. Holdings is named now, with its debt admitted: §5.2 still owes it a
  requirement of its own, which is 102's to write, not this feature's.
- **The layout library was still an open question in the prose.** FR-14 read "chosen by
  feature 101's spike ... golden-layout 2.x the leading candidate" after the spike had
  run and chosen dockview. It now records dockview 8.x and ADR-0028 as settled.
