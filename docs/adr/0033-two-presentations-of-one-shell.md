# ADR-0033: two presentations of one shell

**Status:** Accepted
**Date:** 29 August 2026
**Feature:** 112 (the shell on a phone)
**Amends:** ADR-0028, which stated that dockview owns the shell's layout, without
qualifying the width at which that holds.

## Context

The shell is a dockable multi-panel layout: dockview owns the arrangement, panels are
registered from configuration, and every view is addressable (ADR-0028, SRD-v2 FR-14 and
FR-15). At a desktop width that is exactly right. At 390px it is not a layout at all.

dockview is a docking manager, and docking is the thing a phone cannot do. Its tab bar
does not scroll, so seven tabs at 390px either compress past reading or overflow
invisibly. Its drag handles are its reason to exist and are useless on a surface where a
drag means a scroll. Two docked panels at 390px are two panels of about 195px each. None
of this is a defect in dockview; it is a library being asked for something outside its
subject.

The tree also showed that nothing else in the app had ever reasoned about width. Before
this feature there was not one media query, container query or width measurement in
`app/src` outside feature 111's Background panel, which had to think about it and did
(`layout.tsx`, `Rail.tsx`). Everything else assumed a window.

## Decision

**dockview hosts the shell at and above a declared width threshold. Below it, the same
views are presented as a stack: one view at a time, behind the same tabs.**

- The thresholds are **720 CSS pixels wide** and **500 CSS pixels tall**, declared once in
  `app/src/shell/viewport.ts`. Either is enough on its own, because docking divides space
  in both axes: a phone turned sideways is 844 wide, passes the width test, and has no
  room to dock whatsoever. That second condition was not in the first draft; the capture
  proof reported the dock presentation at 844×390 and it went in. Any CSS breakpoint that
  partners a threshold carries the same number, and a gate (`check-one-breakpoint`) fails
  the build when one does not — while rules that follow the *presentation* are keyed to
  the presentation the shell chose, which is one fewer copy to keep in step and the only
  version that is right in landscape.
- The choice is made from the **measured width of the shell's own body** — never a user
  agent, a device class, or a build flag. An unmeasured width is not evidence of a narrow
  one, so the dock is the default; this is feature 111's rule, inherited verbatim.
- **One panel registry** (`app/src/shell/registry.ts`) serves both presentations, so a
  view cannot exist in one and not the other. A test enumerates the configured views and
  renders both.
- **One address vocabulary.** `#/view/<id>` and ADR-0032's remainder work identically in
  both. Crossing the threshold preserves the shown view and writes nothing to the
  address.
- **The presentation does not reach the panels.** No flag is threaded through the tree
  and no context is propagated through dockview's portals. Each panel measures its own
  root and discloses its own secondary surfaces, so a panel docked narrow on a large
  display behaves exactly as it does on a phone. This is the property that keeps the
  feature small: one switch at the top, and a rule each panel applies to itself.
- **Everything is mounted; one is shown.** dockview keeps an inactive panel's React tree
  mounted but detached (`panels/map/attach.ts` exists because of it). The stack mounts
  every view and hides the inactive ones, so what is running does not change with the
  presentation: Messages counts every message it receives in both.
- **Drag rearrangement is not offered in the stack.** FR-14 already holds arrangement to
  be presentation only — no arrangement changes what any component does — so a
  presentation in which there is nothing to arrange loses nothing that a requirement
  claims.

## Consequences

- One more presentation to keep true, and the tests say so: both presentations are
  rendered from the configured view list, and the threshold crossing is asserted in both
  directions.
- Panel components are re-typed from `IDockviewPanelProps<PanelParams>` to
  `PanelProps = { params: PanelParams }`, because the stack cannot manufacture a dockview
  panel API and no panel ever used one. dockview accepts the narrower props unchanged.
- The narrow presentation cannot show two panels at once, which is a real loss for anyone
  who wants Map beside Messages. It is a loss the width imposes, not one this decision
  chose.
- A panel that has not yet been taught to disclose still *works* at a narrow width; it is
  merely cramped. The feature can therefore land panel by panel, and a new panel is not
  blocked on it.

## Alternatives rejected

- **Squeeze dockview with CSS.** The tab bar still would not scroll, drag would still be
  offered and still be useless, and every rule would be a fight with a library's own
  stylesheet — a fix that works until its next minor version.
- **A separate mobile build or route.** Two builds, two addresses, two things to keep
  true, and a reviewer's deep link would work in one and not the other. The whole value of
  FR-15 is that one link opens the running thing.
- **A user-agent or touch-capability branch.** It answers the wrong question. The problem
  is the width available to a panel, which a desktop viewer can produce by docking one
  narrow, and which a tablet changes by rotating.
- **Render only the shown view.** Cheaper on a phone, and it would make what is running
  depend on which tab a viewer happened to open. "Presentation only" would stop being
  true the first time somebody read the Messages counter.
