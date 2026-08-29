# Spike: the layout manager for the V2 shell

**Date:** 29 August 2026
**Question:** SRD-v2 FR-14 requires a dockable multi-panel shell with drag/drop tabs,
hosting React panel content, serialisable arrangement, and a maintained upstream. The
plan (§9.5) names golden-layout 2.x the leading candidate and requires this spike to
compare it against maintained alternatives before pinning anything.

## What was measured

Registry metadata on 29 August 2026, plus an installation and a render smoke test of
the winner (the smoke test lives on as `app/src/shell/shell.test.tsx`, so it cannot
rot in this file):

| Candidate | Version | Last publish | Unpacked | React hosting |
|---|---|---|---|---|
| golden-layout | 2.6.0 | 2023-02-21 | 2.0 MB | none built in: caller owns React roots per stack item, the pattern V1's client wrapped by hand |
| flexlayout-react | 0.10.6 | 2026-08-25 | 1.8 MB | native (it *is* a React component) |
| dockview | 8.2.0 | 2026-08-19 | 1.6 MB | native (`DockviewReact`, one React component per panel), zero runtime dependencies |

## Finding

**dockview.** golden-layout eliminates itself: no release in three and a half years is
not a maintained upstream, and its React hosting is the manual-root pattern that made
V1's shell wrapper the most delicate part of the client. Both remaining candidates are
genuinely maintained and natively React. dockview wins on: zero runtime dependencies;
first-class TypeScript; a serialisable layout model (`api.toJSON`/`fromJSON`) that maps
directly onto FR-14's "saved arrangement is a per-viewer convenience"; per-panel React
components with a stable `api` object for activation, which is what FR-15's
URL-addressable views hang from; and an active release cadence (8.x, ten days before
this spike).

flexlayout-react would also work; nothing here disqualifies it beyond dockview's
smaller surface and dependency count. If dockview's model fights the shell in practice,
flexlayout-react is the recorded second choice.

Decision recorded as ADR-0028, with the React-hosting pattern the ADR requires.
