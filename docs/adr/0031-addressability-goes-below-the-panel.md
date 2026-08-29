# ADR-0031: addressability goes below the panel

**Status:** Accepted
**Date:** 29 August 2026
**Feature:** 111 (the Background tab)
**Amends:** ADR-0028, which stated that the panel `id` is the unit of URL addressability.

## Context

SRD-v2 FR-15 makes views URL-addressable, and ADR-0028 recorded how: `#/view/<id>`
activates the panel of that id, and activation writes the hash back, so the address bar
always names what is shown. `app/src/shell/views.ts` matched `^#/view/([a-z][a-z0-9_-]*)$`
— one segment, exactly — and ADR-0028 said so outright: "the panel `id` is the unit of
URL addressability (FR-15)."

Feature 111 needs more than that. Background is a course of eleven explainers with 69
steps between them, and FR-003 requires each step to be addressable so that a PR comment
or a blog post links to one step rather than to the tab. `#/view/background/mqtt/3`
cannot be expressed by a scheme with one segment.

This is hard to reverse. Once a link is shared, its meaning is somebody else's; changing
what an address selects afterwards breaks a page nobody controls. That is the whole point
of FR-15, and it is why this earns a record rather than a commit message.

## Decision

**An address is a view id and an opaque remainder.** `#/view/<id>` is unchanged. Anything
after the view id is handed to that panel and is never parsed by the shell.

- `addressFromHash` returns `{ view, rest? }`. `viewFromHash` keeps its signature and its
  behaviour, so every existing call site and every existing test is untouched.
- The shell hands each panel a `PanelAddress` — read the remainder, write the remainder,
  hear about a change. A panel that addresses no position inside itself never reads it.
- What a remainder *means* is the panel's business. Background alone knows that its
  remainder is `<explainer-id>/<step>`; that knowledge lives in
  `app/src/panels/background/address.ts` and nowhere else.
- An unknown or malformed remainder resolves to a first step. It never errors and never
  blanks: the anchor is a convenience, never state (FR-15).

**And the writeback must stop erasing what it does not recognise.** `Shell.tsx` rewrote
the address to `hashForView(panel.id)` whenever the hash did not *equal* a bare view
address. Left alone, the first activation — including the one dockview fires while
restoring a layout — would have replaced `#/view/background/mqtt/3` with
`#/view/background`. That is worse than a broken link: it is a link that works, then
quietly forgets where it pointed, and only on a second visit.

The decision is `hashOnActivation(hash, panelId)`, which returns nothing when the address
already names the activated panel, whatever else it carries.

## Consequences

- No panel's internal vocabulary reaches shell source. The shell knows about an opaque
  string; the alternative below did not have that property.
- Every single-segment link keeps working, and the existing `views.test.ts` cases pass
  unchanged — which is the evidence, not the intention.
- The erasure was **watched before it was fixed**. `Shell.test.tsx` asserted that a
  sub-path survives an activation and reported `expected '#/view/intro' to be
  '#/view/background/why-a-standard/3'` against the unmodified writeback.
- A future panel that wants positions inside itself has the mechanism already, and owes
  only its own reading of the remainder.

## Alternatives rejected

- **A hash query** (`#/view/background?step=mqtt.3`). Two parsers for one address, and
  query semantics inside a fragment surprise everyone who reads them.
- **Eleven top-level panel ids** (`background-mqtt`, …). It would put the explainers in
  the tab bar beside Intro and Map, which is what a sub-tab exists not to do.
