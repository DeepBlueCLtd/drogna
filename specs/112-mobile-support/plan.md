# Feature 112 — plan

Written against the tree on this branch, not against the plans for 101 or 111. Where a
plan and the tree differ, the tree wins.

## Structure

```
app/
├── mobile.html                         NEW — the preview frame (FR-021 to FR-025).
│                                       A second Vite entry, published with every
│                                       instance because instances.yml copies app/dist
│                                       wholesale.
├── vite.config.ts                      TOUCHED — two html inputs instead of one
└── src/
    ├── shell/
    │   ├── viewport.ts                 NEW — the one threshold (FR-002), the width
    │   │                               measurement, and `isNarrow`. Background's own
    │   │                               `useMeasuredWidth` moves here and is imported
    │   │                               back, so there is one measurement, not two.
    │   ├── registry.ts                 NEW — `PanelParams`, `PanelProps`, and the id →
    │   │                               component map, lifted out of Shell.tsx so both
    │   │                               presentations read the same registry (FR-005)
    │   │                               without importing each other.
    │   ├── Stack.tsx                   NEW — the narrow presentation: the tab strip
    │   │                               and the single shown view (FR-003, FR-004).
    │   ├── Disclosure.tsx              NEW — the shared progressive-discovery control
    │   │                               (FR-011 to FR-014), a thin wrapper over
    │   │                               <details>/<summary>.
    │   ├── Shell.tsx                   TOUCHED — measures its body, chooses the
    │   │                               presentation, compacts its own header.
    │   └── shell.css                   TOUCHED — the narrow rules for the chrome.
    └── panels/…                        TOUCHED — each panel measures its own root and
                                        discloses its secondary surfaces. Background
                                        gains the pannable figure (FR-019).
scripts/
├── gates/check-one-breakpoint.ts       NEW — every CSS breakpoint carries the declared
│                                       threshold (FR-002, SC-006).
├── gates.registry                      one line appended; the runner still names no gate
└── capture/mobile.ts                   NEW — the proofs SC-001 to SC-003 and SC-010.
```

## The three decisions worth recording

### 1. Two presentations, not one responsive dock

dockview is a desktop docking manager: its tab bar does not scroll, its drag handles are
its reason to exist, and two docked panels at 390px are two 195px panels. Three ways out
were on the table.

- **Squeeze dockview with CSS.** Rejected. The tab bar would still not scroll, drag would
  still be offered and still be useless, and every rule would be a fight with a library's
  own stylesheet — the kind of fix that works until the library's next minor version.
- **A separate mobile app or route.** Rejected. Two builds, two addresses, two things to
  keep true, and a reviewer's deep link would work in one and not the other.
- **Two presentations behind one address, chosen by measured width.** Taken. dockview
  owns the layout where docking means something; below the threshold the same panels are
  stacked one at a time behind the same tabs. ADR-0028 said dockview hosts the shell;
  this narrows that to a width range and is recorded as ADR-0033.

The property that makes this cheap is that **the panels do not know which presentation
they are in**. Each measures its own width and discloses accordingly, so a panel docked
narrow on a desktop behaves identically. There is no presentation flag threaded through
the tree, and no context to propagate through dockview's portals.

### 2. The panel props change, and it is small

Every panel is typed `IDockviewPanelProps<PanelParams>` and every panel uses exactly one
field of it: `params`. The stack cannot manufacture a dockview panel API, so the panels
are re-typed to `PanelProps = { params: PanelParams }`. dockview still accepts them —
`IDockviewPanelProps<P>` is assignable to `{ params: P }`, so a component taking the
narrower props is a valid component for the wider ones — and nothing about how dockview
mounts them changes. `PanelParams` moves to `registry.ts` in the same edit, because seven
files import it and it was only ever in `Shell.tsx` by accident of arrival.

### 3. Mount everything; show one

dockview keeps an inactive panel's React tree mounted but detached from the document —
that is exactly what `panels/map/attach.ts` was written for, and its comment records what
happened when deck.gl met a detached canvas. The stack therefore mounts every view and
hides the inactive ones, rather than mounting only the shown one:

- **What is running does not change with the presentation** (FR-009). Messages counts
  every message it receives, seen or not, in both.
- The failure mode `attach.ts` guards is *less* likely, not more: a hidden panel is in
  the document, where a detached one is not.

The cost is seven mounted panels on a phone. It is the same seven the desktop mounts, and
the alternative — mounting on first show — would make the harness's behaviour depend on
which tab a viewer happened to open, which is precisely what "presentation only" denies.

## Progressive discovery, panel by panel

The rule is FR-010: name the primary surface, disclose the rest. Applied:

| Panel | Primary at narrow | Disclosed, closed at rest |
|---|---|---|
| Shell chrome | title, disclaimer, clock, tab strip | run id, export manifest, import manifest |
| Intro | the prose | — (nothing to disclose; it is one column already) |
| Background | the stage and its spine | the rail is already a dropdown below 560px (111 FR-021) |
| System | the component table | — (one table; it scrolls in its container) |
| Holdings | the inventory list | the manifest, over the list (FR-016) |
| Operator | telemetry | commands; components as they report themselves |
| Map | the canvas | view controls; advisories; the composer keeps its own toggle |
| Messages | the message list | topic tree; the document, over the list (FR-016) |

The disclaimer is not on the right-hand side of that table and never will be (FR-007).

## What is deliberately not built

- **No gate for "nothing is lost at a narrow width."** It wants two renders compared,
  which is a capture concern, not a source scan. SC-007 holds it by test for the panels
  this feature changes and Q3 records the gap rather than papering over it.
- **No new configuration document, no new seam shape.** The views are already
  configuration; nothing crosses the seam that did not before. Constitution III and XI
  are not engaged, and there is nothing to generate.
- **No swipe-between-tabs.** It competes with the horizontal scrolling the tab strip and
  the wide tables both need.

## Watched failing

Per the repository's standing rule, each new check is planted against a violation and
watched catching it before it is trusted:

- `check-one-breakpoint` — a second breakpoint value added to a stylesheet.
- `capture:mobile`'s overflow proof — a panel given a fixed width wider than the frame.
- `capture:mobile`'s tap-target proof — the tab strip's minimum height removed.
- The figure-panning test — the pannable frame removed, so the floor message returns
  where the viewport cannot be widened.

Each is recorded in the commit message that lands it.
