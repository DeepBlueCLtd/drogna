# Feature 112 — tasks

Ticked as they landed, with the reason written at the moment it was decided. Where a
task was done differently from how it was written, the difference is recorded here
rather than reconstructed later.

## Record

- [x] T001 `srd.md` amended: FR-14 gains the two presentations, and §5.11 carries FR-47
      to FR-51. Amending FR-14 found the same fault it had already been amended for
      twice: it named six tabs while the configuration served seven — **Operator**
      shipped with feature 107 and this list never followed it, exactly as Holdings had
      not. Named, with the reason, and the claim is now checked rather than asserted: a
      test enumerates `config.shell.views` and both presentations render what it names.
- [x] T002 ADR-0033, narrowing ADR-0028: dockview hosts the shell where there is room to
      dock, and the stack is the presentation where there is not. ADR-0028's own text
      says it is amended.
- [x] T003 Noted in `docs/v2/plan.md` §5, beside 111's note. Outside the arc, claims no
      beat, adds no component, leaves the named 110 candidate alone.

## Foundations

- [x] T004 `app/src/shell/viewport.ts`: the thresholds, the measurement (moved from
      Background's `layout.tsx` and re-exported there), `isNarrow`, `presentationFor`.
      **Written as one threshold and landed as two.** The capture proof reported the dock
      presentation at 844×390 — a phone turned sideways — so `presentationFor` now asks
      about both axes: docking divides space in both, and a viewport short of either has
      none to divide. `useMeasuredWidth` became a thin call on `useMeasuredSize`, so
      there is still one observer implementation rather than two.
- [x] T005 `app/src/shell/registry.ts`: `PanelParams`, `PanelProps`, the id → component
      map. Seven panels re-typed from `IDockviewPanelProps<PanelParams>`; dockview took
      the narrower props with no change, as the plan predicted.
- [x] T006 `app/src/shell/Disclosure.tsx`. Landed as **two render shapes**, not as one
      `<details>` held open by a prop: a `<details open>` can still be closed by a click,
      and a summary suppressed with CSS is a control that is invisible and still
      focusable. Wide it is a plain named section, which is what "renders as it does
      today" actually means.

## The presentation

- [x] T007 `app/src/shell/Stack.tsx`. Every view mounted, inactive ones hidden, so what
      is running does not change with the presentation. The active tab is scrolled into
      view on every change of the active view, including a change from the address bar —
      the case a click handler alone misses, and the one that makes a deep link to the
      seventh view look like it opened nothing.
- [x] T008 `Shell.tsx` chooses its presentation from its measured body size and compacts
      its header. The disclaimer stays visible at both widths; the run id and the manifest
      controls disclose.
- [x] T009 `shell.css`. **The chrome rules are keyed to the presentation, not to a width
      of their own**, which was a correction: a `max-width` copy of the condition left the
      chrome at desktop size in landscape, where the shell is stacked at 844px wide. The
      only CSS breakpoints left are the panels' container queries and one rule about
      giving the header's parts their own rows, and the gate holds all of them to the
      declared number.

## The panels

- [x] T010 Messages: topic tree disclosed; the document over the list with a back
      control; the list in its own scroll container so that going back goes back to the
      list where it was left.
- [x] T011 Holdings: the same shape, the manifest over the inventory.
- [x] T012 Map: view controls and advisories disclosed, the composer full-width beneath
      the canvas, the advisories table in a scroll container. The status line stays
      visible at both widths — it is what makes every pixel traceable to a document, and
      a map whose provenance is folded away is a picture.
- [x] T013 Operator: commands and the components table disclosed, telemetry primary.
      System: one table, in a scroll container.
- [x] T014 Background: a figure whose minimum exceeds a panel that already has the
      viewport is drawn at its own minimum in a frame that pans. The floor message is
      unchanged where there is a wider width to be had, because there it can be taken.
      Two of the course's 69 steps take the pannable path at 390px, and the proof fails
      if none does — a path nothing reaches is a path nobody has checked.

## The preview

- [x] T015 `app/mobile.html` and the second Vite entry. It holds no panel, no
      configuration and no copy of the shell: an iframe around the built application,
      carrying the shell's own address vocabulary in both directions, and saying on the
      page that it mocks a viewport size and is not a device.

## The checks

- [x] T016 `scripts/gates/check-one-breakpoint.ts`, its registry line, its fixtures and
      its test. Watched failing on a planted second breakpoint, and watched refusing to
      run — rather than passing — against a tree with no threshold to read.
- [x] T017 `scripts/capture/mobile.ts` and `pnpm capture:mobile`, wired into CI beside
      the Background proofs. **The first version of the overflow proof was worth
      nothing**, and the plant is how that was found: it measured the document's scroll
      width, every panel clips, and a 900px table planted in a panel passed it clean.
      What replaced it measures every element against the list of containers declared to
      scroll sideways — and it failed immediately on two real faults: a range input two
      pixels wider than the row holding it, and SVG text measured with HTML semantics.
      Watched failing on a table escaping its scroll container, on the tab strip's
      minimum height removed, and on the landscape chrome bound.
- [x] T018 Tests in `app/src/shell/narrow.test.tsx` and one in `background.test.tsx`.
      The "nothing is lost" check compares regions as well as controls: a first version
      compared controls alone and a planted removal of the topic tree — a surface made
      entirely of text — went straight past it. Watched failing after the fix.

## Showing the work

- [x] T019 Blog entry: `site/docs/blog/posts/the-shell-on-a-phone.md`. A new face in the
      shell qualifies under D17, and the two checks that had to be rewritten are the part
      of it worth reading.
- [x] T020 Pull request links the instance at a view and the preview frame at the same
      view.

## Not done, and why

- **No gate for "nothing is lost at a narrow width."** It wants two renders compared,
  which is a capture concern rather than a source scan. It is held by test for the panels
  this feature changed, and `spec.md` Q3 records the gap rather than papering over it.
- **No swipe between tabs.** It competes with the horizontal scrolling that the tab strip
  and the wide tables both depend on.
- **No bottom tab bar**, which is the phone idiom. Seven configured views do not fit as a
  fixed bar at 390px without abbreviating labels, and abbreviating them is what FR-004
  forbids: a viewer cannot choose between things they cannot read. Recorded as Q2 rather
  than settled, because it is worth revisiting if the view count ever falls.
