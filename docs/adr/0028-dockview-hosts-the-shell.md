# ADR-0028: dockview hosts the shell

**Status:** Accepted; amended by ADR-0031 (addressability goes below the panel)
**Date:** 29 August 2026
**Feature:** 101 (foundations & shell)

## Context

SRD-v2 FR-14 requires a dockable multi-panel shell — tabs Intro, System, Map, Messages
at first run, user-rearrangeable by drag and drop — hosting React panel content, with
the arrangement serialisable as a per-viewer convenience. The plan (§9.5) deliberately
did not pin a library: dockable drag/drop tabs are the requirement, and feature 101
opens with a spike comparing golden-layout 2.x against maintained alternatives.

## Decision

**dockview 8.x** (`spikes/layout-manager/FINDING.md`). golden-layout has had no release
since February 2023 and hosts React only by the manual-root pattern that made V1's
shell wrapper its most delicate code; flexlayout-react is a sound second choice,
recorded as such.

The React-hosting pattern, which this ADR exists to record:

- One `DockviewReact` element owns the shell. Each panel is registered in a
  `components` map as an ordinary React component receiving `IDockviewPanelProps`;
  dockview mounts each into its own React subtree, so a panel re-renders on its own
  state and never re-mounts on layout changes.
- Panels are added once, in `onReady`, from the shell's configuration document —
  never from literals in the shell source (Constitution IV).
- The panel `id` is the unit of URL addressability (FR-15): `#/view/<id>` activates
  the panel via `api.getPanel(id).api.setActive()`, and activation writes the hash
  back, so the address bar always names the active view. **Amended by ADR-0031**: an
  address is now a view id and an opaque remainder the shell hands to the panel and
  never parses, so a panel may address positions inside itself. `#/view/<id>` and every
  link of that shape are unchanged.
- Layout serialisation (`api.toJSON`) is presentation only. It is never persisted by
  the harness and never consulted by any component; a deep link selects what is
  shown, never what happened.

## Alternatives rejected

- **golden-layout 2.x** — unmaintained upstream; manual React roots.
- **flexlayout-react** — viable; larger surface, more dependencies; kept as fallback.
- **Hand-rolled tabs** — drag/drop docking is real work already done well elsewhere,
  and the shell is not the demonstration.
