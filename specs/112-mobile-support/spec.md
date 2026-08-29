# Feature Specification: the shell on a phone

**Feature Branch**: `claude/mobile-support-spec-preview-97nkic`

**Feature directory**: `specs/112-mobile-support`

**Created**: 29 August 2026

**Status**: Draft, written against the tree as it stands on this branch

**Input**: "Produce a spec for support on mobile. Keep the tabs, but consider how the
space can be optimised, with progressive discovery. Then implement the spec, providing
a preview URL that mocks a standard mobile size."

## Context

The shell is a dockable multi-panel layout with seven top-level tabs (SRD-v2 FR-14,
ADR-0028): Intro, Background, System, Holdings, Operator, Map, Messages. dockview owns
the arrangement, panels are registered from `config.run`'s `shell` document, and every
view is addressable as `#/view/<id>` (FR-15).

None of it was designed for a phone, and the tree says so plainly. Before this feature
there is not one media query, container query or viewport measurement anywhere in
`app/src` outside Background — feature 111 alone reasoned about width, because it had
to (FR-021, FR-024). Everything else assumes a desktop window:

| Where | What a 390px-wide viewport gets today |
|---|---|
| `.shell-header` | seven items on one wrapping row; the run id, export and import push the clock strip onto a third line |
| dockview's tab bar | seven tabs on one non-scrolling row, each with a drag handle no finger can use for its purpose |
| `.messages-split` | three columns — topic tree, list, detail — side by side in 390px, so each is about 130px |
| `.messages-list td` | `white-space: nowrap` on a JSON summary, `max-width: 28em` |
| `.map-body` | canvas and a `width: 22rem` composer side by side; 22rem is 352px of 390px |
| `.map-advisories table`, `.system-grid` | fixed-column tables with no scroll container |
| Background | the rail collapses at 560px (it was built for this), but below a figure's minimum the viewer is told to *widen the panel* — advice a phone cannot take |

So the harness is not unusable on a phone so much as untested on one, and the two
failures it has are different in kind: some are layout (columns that will not fit), and
one is a **claim that stops being true** — an instruction to widen a window that has no
width to give.

### What the request settles, and what it rules out

| Decision | Consequence |
|---|---|
| **Keep the tabs** | The seven views stay the unit of navigation and keep their order, their labels and their addresses. No hamburger menu, no "more" overflow that hides three views behind a word that names none of them. |
| **Optimise the space** | The chrome shrinks before the content does. What is on screen at a phone width is the panel, not the harness's own furniture. |
| **Progressive discovery** | Secondary surfaces are one labelled gesture away rather than absent. A disclosure names its content — never "more", never "options". |
| **A preview at a standard mobile size** | The deliverable includes a hosted frame at a phone's dimensions, so a reviewer sees the narrow presentation from a desktop browser without resizing anything. |

### What "mobile" is taken to mean here

**A width, not a device.** Every rule below is keyed to the width of the element it
governs, so a panel docked narrow on a 27-inch display gets the same treatment as the
same panel on a phone. This is not a generalisation for its own sake: it is the only
version of the rule that a component can enforce about itself, and it is the rule
feature 111 already arrived at independently (`layout.tsx` measures its own column, and
the comment there records what went wrong when it measured something else). A separate
mobile build, a device sniff, or a user-agent branch would each be a second code path
that only one kind of viewer ever exercises.

**Touch is assumed, never required.** Nothing may become reachable *only* by touch, and
nothing already reachable may become pointer-only. Feature 111's keyboard guarantee
(FR-014, SC-006) is inherited by everything this feature touches.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The seven views, on a phone (Priority: P1)

Someone opens a hosted instance on a phone, from a link in a pull request. They land on
the view the link named. All seven tabs are there in their configured order; they can
reach any of them with a thumb, and the address in the bar keeps naming what is shown,
so they can send the link on.

**Why this priority**: It is the whole of "support on mobile" that cannot be
decomposed. A panel that lays out beautifully in a shell whose tab bar cannot be
operated is not delivered.

**Independent Test**: At 390×844, open the instance at `#/view/messages`; reach every
one of the seven views by touch alone; confirm the address names each in turn and that
no page-level horizontal scrolling is ever needed to see a tab.

**Acceptance Scenarios**:

1. **Given** a 390px-wide viewport, **When** the shell loads, **Then** one view fills the
   body, the tab strip lists all seven views in configured order, and the document does
   not scroll horizontally.
2. **Given** the tab strip is too wide for the viewport, **When** the viewer scrolls it
   sideways, **Then** every tab is reachable, and the active tab is scrolled into view
   whenever the active view changes — including when it changes from the address bar.
3. **Given** a deep link `#/view/map`, **When** it is opened at a phone width,
   **Then** the Map view is shown and the address is unchanged.
4. **Given** the shell at a phone width, **When** the window is widened past the
   threshold, **Then** the dockable presentation returns showing the same view, and the
   address does not change.

---

### User Story 2 - One thing at a time, and the rest one gesture away (Priority: P2)

The same viewer opens Messages. They see the message list — the thing the tab is for —
not three 130px columns. The topic tree is there, named, closed. Tapping a message shows
its document over the list with a control that goes back. Nothing they could reach on a
desktop has gone; it has moved one gesture away.

**Why this priority**: This is the "progressive discovery" the request asked for, and
the panels are where the space is actually won. It is second only because a viewer who
cannot change tabs never reaches it.

**Independent Test**: At 390×844, in each of Messages, Holdings, Map and Operator, list
what is on screen at rest and what is behind a disclosure, then open every disclosure
and confirm that the union is what the same panel shows at 1440px.

**Acceptance Scenarios**:

1. **Given** a narrow panel with a primary surface and secondary ones, **When** it is
   first shown, **Then** exactly the primary surface is open and every secondary surface
   is present as a labelled, closed disclosure.
2. **Given** a closed disclosure, **When** the viewer reads its label, **Then** the label
   names the content it holds rather than describing that there is more of something.
3. **Given** Messages at a narrow width, **When** a message is selected, **Then** its
   document is shown over the list with an explicit control that returns to the list, and
   the list's scroll position is where it was left.
4. **Given** any panel at a narrow width, **When** every disclosure is opened, **Then**
   nothing is missing that the same panel offers at a desktop width.
5. **Given** a keyboard and no pointer, **When** the viewer traverses a narrow panel,
   **Then** every disclosure can be opened and closed and every control reached.

---

### User Story 3 - The claim that has to stay true (Priority: P3)

A viewer works through the Background course on a phone. The rail is a dropdown, as it
already was. A diagram that wants 480px does not tell them to widen a window they cannot
widen: it is drawn at the width it needs inside a frame they can pan, at full legibility
and with its labels intact.

**Why this priority**: Background is eleven explainers and the largest single body of
content in the shell, and this is the one place where the existing behaviour is not
merely cramped but *wrong* — it gives an instruction that cannot be followed. It is
third because it is one message and one scroll container, not a presentation.

**Independent Test**: At 390×844, walk an explainer whose figure minimum exceeds the
panel width; confirm the diagram is drawn, that no label is clipped, and that the
"widen the panel" wording appears nowhere.

**Acceptance Scenarios**:

1. **Given** a figure whose minimum exceeds the panel width, **And** the panel is
   already as wide as the viewport, **When** the step is shown, **Then** the figure is
   drawn at its own minimum width inside a horizontally scrollable frame.
2. **Given** the same figure in a panel docked narrow inside a much wider window,
   **When** the step is shown, **Then** the existing statement of the width it wants is
   shown instead, because widening is advice the viewer can actually take.
3. **Given** either case, **When** the figure is measured, **Then** no label is drawn
   outside its viewBox — feature 111's capture proof is unchanged and still passes.

---

### User Story 4 - Seen without a phone (Priority: P4)

A reviewer on a laptop opens the preview URL from the pull request and sees the shell in
a phone-shaped frame at a standard mobile size, opened at the view the link named. They
can switch the frame between a few common sizes and rotate it, and the address they can
copy names both the size and the view.

**Why this priority**: The repository's standing rule is that a pull request with
anything visible in it links its own instance, and a reviewer cannot be assumed to have
a phone in their hand. It is last because it demonstrates the work rather than being it.

**Independent Test**: Open the preview URL on a desktop browser; confirm the framed
shell is the narrow presentation, change size and orientation, deep-link to a view, and
copy an address that reopens exactly what was on screen.

**Acceptance Scenarios**:

1. **Given** the preview page with no address of its own, **When** it loads, **Then** it
   frames the shell at 390×844 and says plainly that the frame mocks a size and is not a
   device.
2. **Given** the preview page at `#/view/map`, **When** it loads, **Then** the framed
   shell opens at Map.
3. **Given** a view changed inside the frame, **When** the viewer copies the outer
   address, **Then** it names that view.
4. **Given** the size selector, **When** a size or orientation is chosen, **Then** the
   frame resizes and the framed shell re-lays itself out with no reload of the shell.

### Edge Cases

- **A width between the two presentations.** The threshold is a single number and the
  switch is a step, not a blend. Crossing it must not lose the active view, and must not
  rewrite the address.
- **A panel whose width is unknown.** An unmeasured width is not evidence of a narrow
  one (111's rule, inherited verbatim): the wide presentation is the default, and a
  panel that cannot measure itself renders as it does today.
- **Rotation.** Landscape at 844×390 is a *short* viewport, not a wide one: it is above
  the width threshold and has no room to dock at all, which is why FR-001 tests both axes.
  The tab strip and the header together must not take more than a quarter of the height,
  or the presentation has optimised the wrong axis — and this is the case that fails first,
  so it is the case the proof runs.
- **The Map with no WebGL.** The existing refusal text stands; it must wrap rather than
  force the page wide.
- **A configured eighth view.** Views come from configuration (Constitution IV). Nothing
  in the narrow presentation may assume seven, or assume that seven labels fit.
- **A disclosure that would hide the disclaimer.** Out of the question; see FR-007.
- **A panel that accumulates while unseen.** Messages counts every message received,
  seen or not. The narrow presentation must not quietly change what is running.

## Requirements *(mandatory)*

### Functional Requirements

#### The presentation

- **FR-001**: The shell MUST have two presentations of the same views: the **dock**
  (dockview, as today) where there is room to dock, and the **stack** where there is not.
  The choice MUST be made from the measured size of the shell's own body, never from a
  user agent, a device class, or a build flag. **Either axis is enough on its own**:
  docking divides space in both, so a viewport below the width threshold *or* below the
  height threshold gets the stack. *Amended during implementation: the first version of
  this requirement said width alone, and the capture proof reported the dock
  presentation at 844×390 — a phone turned sideways, which is one of the two orientations
  this feature exists to serve.*
- **FR-002**: Each threshold MUST be declared once, in one module, and any CSS breakpoint
  that partners one MUST carry the same number. Held by a gate, because a breakpoint
  duplicated across five stylesheets is a number that will drift and drift silently.
  Rules that follow the *presentation* rather than a width MUST be keyed to the
  presentation the shell chose, not to a second copy of the condition — which is both
  one fewer thing to keep in step and the only version that is correct in landscape.
- **FR-003**: The stack MUST present exactly one view at a time, filling the body.
- **FR-004**: **The tabs are kept.** The stack MUST render every configured view as a tab,
  in configured order, with its configured label, in a strip that scrolls horizontally
  when the labels do not fit. No view may be hidden behind an overflow control, and no
  label may be abbreviated or replaced by an icon. The active tab MUST be scrolled into
  view whenever the active view changes, including when it changes from the address.
- **FR-005**: Both presentations MUST render from the same panel registry, so a view
  cannot exist in one and not the other. Asserted by a test that enumerates the
  configured views rather than a hand-written list.
- **FR-006**: A view MUST be addressable identically in both presentations (FR-15).
  Crossing the threshold MUST preserve the active view and MUST NOT write to the address.
- **FR-007**: The stack MUST NOT hide the statement that the data is synthetic. Chrome
  may be compacted or disclosed; the disclaimer is the one element that may not, and it
  is stated in the same words as at desktop width rather than in a shorter second copy.
- **FR-008**: Panel rearrangement by drag is a pointer affordance and is NOT offered in
  the stack. This is permitted because FR-14 already holds arrangement to be presentation
  only: no arrangement changes what any component does. The stack MUST say nothing that
  implies rearrangement is available.
- **FR-009**: The stack MUST NOT change what is running. Every view's panel is mounted in
  both presentations, exactly as dockview mounts an inactive panel, so a panel that
  accumulates (Messages) accumulates whether or not it is the shown view.

#### Progressive discovery

- **FR-010**: Every panel MUST name one **primary surface** — the thing the tab is for —
  which is what is shown at rest at a narrow width.
- **FR-011**: Every other surface a panel offers MUST remain reachable at a narrow width,
  as a **disclosure**: a labelled control that is closed at rest and opens in place.
  Nothing is removed; it moves one gesture away.
- **FR-012**: A disclosure's label MUST name its content ("topic tree", "view controls",
  "advisories"). A label that describes the existence of more content rather than naming
  it — "more", "options", "…" — is a defect, because it puts the viewer's decision
  behind the thing they need to make it.
- **FR-013**: Disclosures MUST be built from the platform's own disclosure element, so
  that keyboard operation, focus order and assistive-technology semantics are inherited
  rather than reimplemented (FR-014 of feature 111 is inherited by everything here).
- **FR-014**: At a width above the threshold a panel MUST render as it does today: its
  disclosures are open, and their labels are not chrome the desktop viewer has to read.
- **FR-015**: Whether a disclosure is open is a per-viewer convenience. It MUST NOT enter
  the address, MUST NOT enter the run manifest, and MUST NOT change what any component
  does (Constitution VII; SRD FR-14, FR-15).
- **FR-016**: Where a panel shows a list beside a detail at desktop width, the narrow
  presentation MUST show the detail **over** the list with an explicit control that
  returns to it. Returning MUST leave the list where the viewer left it.
- **FR-017**: A table that cannot fit MUST scroll inside its own container. The page
  itself MUST NOT scroll horizontally at any supported width.
- **FR-018**: The controls a viewer *navigates* with — the tab strip and the disclosure
  summaries — MUST be at least 44 CSS pixels on their smaller side in the stack. The
  chrome's own occasional controls (the clock rates, the manifest buttons) take a floor of
  32 instead: they are hit rarely, and six full-size controls cost more of a 390-pixel-tall
  screen than the compaction gives back. Both floors are measured by the capture proof, so
  the exception is visible in a run rather than only in a comment.

#### The claim that has to stay true

- **FR-019**: Where a figure's minimum width exceeds the width available **and the panel
  is already as wide as the viewport**, the figure MUST be drawn at its own minimum
  inside a horizontally scrollable frame rather than replaced by an instruction to widen
  the panel. Feature 111's FR-024 is amended by this feature: a diagram is still never
  scaled past legibility and never renders having silently dropped its labels — those
  guarantees are what make panning the correct answer rather than a workaround.
- **FR-020**: Where the panel is narrow inside a window that is not, feature 111's
  existing statement of the width the figure wants MUST be shown unchanged. The advice is
  kept exactly where it can be taken.

#### The preview

- **FR-021**: The build MUST publish a **preview page** beside the app that frames the
  shell at a standard mobile size, so the narrow presentation can be reviewed from a
  desktop browser. It is part of the ordinary static build and is published with every
  instance (NFR-03, NFR-04).
- **FR-022**: The preview page MUST offer a small fixed set of common sizes and an
  orientation control, and MUST default to 390×844.
- **FR-023**: The preview page MUST carry the shell's address vocabulary: its own
  `#/view/<id>` opens the framed shell at that view, and a view chosen inside the frame
  is written back to the outer address, so one copied link reopens what was on screen.
- **FR-024**: The preview page MUST state plainly that it mocks a viewport size and is
  not a device: it reproduces neither touch input, nor browser chrome, nor safe areas,
  nor device pixel ratio. A frame that lets a reviewer believe otherwise is worse than no
  frame.
- **FR-025**: The preview page MUST NOT be a second implementation of anything. It frames
  the same built app; it holds no panel, no configuration and no copy of the shell.

### Key Entities

- **Presentation**: dock or stack. A function of measured width, chosen per shell.
- **Threshold**: the declared width, and the declared height, below either of which the
  presentation changes. Each is one number in one module, and the number every partnering
  CSS breakpoint must carry.
- **Primary surface**: the one region of a panel that is open at rest at a narrow width.
- **Disclosure**: a labelled, closed-at-rest container for a secondary surface. Open by
  default above the threshold.
- **Preview frame**: the published page that mocks a viewport size around the built app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At each supported size, in every configured view, **nothing scrolls sideways
  except the few containers built to** — a table, a diagram at its own minimum, the tab
  strip, a document. Asserted by a capture proof that measures every element against the
  declared list, watched failing on a planted regression before it is trusted.
  *Written this way during implementation, and the reason is worth keeping.* The first
  version measured the **document's** scroll width, which is a check nothing in this
  application can fail: every panel clips, so no arrangement of content inside one can
  widen the page. A 900-pixel table planted in a panel passed it clean. The check that
  replaced it fails on that same plant, naming the panel and the width.
- **SC-002**: At 390×844 every tab in the strip is reachable and each is at least 44 CSS
  pixels high. Asserted by the same proof, measuring the rendered strip rather than the
  stylesheet.
- **SC-003**: The shell's own chrome — header and tab strip together — takes no more than
  a quarter of the viewport height at 390×844 and at 844×390. Measured, not estimated:
  the landscape case is the one that fails first, which is why it is in the criterion.
- **SC-004**: Both presentations render every configured view. Asserted by a test that
  enumerates `config.shell.views`, so an eighth view is in scope automatically.
- **SC-005**: Crossing the threshold in either direction preserves the active view and
  leaves the address untouched. Asserted by test.
- **SC-006**: Every CSS breakpoint in `app/src` carries the one declared threshold value.
  Asserted by a gate, watched failing on a planted second number.
- **SC-007**: No panel loses a surface at a narrow width: for each panel, the set of
  controls reachable with every disclosure open is the set reachable at desktop width.
  Asserted by test for the panels this feature changes.
- **SC-008**: A figure whose minimum exceeds a full-viewport panel is drawn rather than
  withheld, and the "widen the panel" wording does not appear in that case. Asserted by
  test, and visible in the capture.
- **SC-009**: Feature 111's existing proofs — keyboard traversal, greyscale, no clipped
  label, the spine control not moving — still pass unchanged. A regression in them is a
  regression in this feature.
- **SC-010**: The preview page is published with every instance and opens the framed
  shell at the view its address names. Verified by the capture proof, which drives the
  published page rather than the source.

## Out of Scope

- **A separate mobile build or a mobile-only route.** One app, one address vocabulary,
  two presentations. A second build is a second thing to keep true.
- **Touch gestures beyond what the platform and deck.gl already give.** No pinch-zoom
  choreography, no swipe-between-tabs. Swiping between tabs was considered and declined:
  it competes with the horizontal scrolling that FR-004 and FR-017 both rely on.
- **Offline support, installability, service workers.** Nothing here needs them, and each
  is a claim about behaviour the harness does not have.
- **Persisting the layout, the presentation or a disclosure's state between visits.**
  V2 persists nothing between visits by design (Constitution II, manifest export/import).
- **A full accessibility audit.** Keyboard operation and tap-target size are held here
  because this feature moves them; contrast, reading order and assistive-technology
  labelling across the whole shell are a piece of work in their own right and are not
  smuggled in under a layout change.
- **Real-device testing.** The preview mocks a size (FR-024). What it cannot mock is
  stated on the page rather than left for a reviewer to discover.
- **Redesigning any panel's content.** This feature moves surfaces and shrinks chrome. A
  panel that is hard to read at a desktop width is still hard to read afterwards.

## Assumptions

- Features 101 to 109 and 111 have landed; the shell, the seven views, the addressing and
  the Background course all exist and are what this is written against.
- The instances workflow publishes `app/dist` wholesale into the estate, so a second page
  in the build is published with no change to the workflow. Verified against
  `.github/workflows/instances.yml` rather than assumed.
- `ResizeObserver` and CSS container queries are available in the browsers the demo
  targets. Both are used by feature 111 or by this one; where `ResizeObserver` is
  missing, the existing behaviour is the wide presentation, which is the safe default.
- No configuration change is needed: the views, their labels and their order already come
  from `config.run`. This feature adds no configuration document and no seam shape, and
  therefore engages neither Constitution III nor XI.

## Open Questions

- **Q1. Are 720px and 500px the right thresholds?** 720 because below it two docked
  panels cannot both be usable, and because it puts every phone and most small tablets in
  portrait on the stack side; 500 because a viewport shorter than that has nothing to
  divide in the other axis, which is what a phone in landscape is. Each is one number in
  one module and a gate holds the stylesheets to them, so moving one is cheap — the
  property that matters more than either value being right first time.
- **Q2. Should the tab strip be at the foot rather than the head?** A bottom bar is the
  phone idiom and is easier to reach with a thumb. It is not taken here: the views come
  from configuration, seven do not fit as a fixed bar at 390px without abbreviating
  labels, and abbreviating them is what FR-004 forbids. If the view count ever falls, or
  if labels ever gain configured short forms, this is worth revisiting on its own merits
  rather than as part of a layout change.
- **Q3. What holds the "nothing is lost" rule as panels grow?** SC-007 asserts it for the
  panels this feature changes, by test. A general check — every control present at a wide
  width is present at a narrow one with the disclosures open — would be a genuine gate
  and is not obviously cheap; it wants the two renders compared, which is a capture
  concern rather than a source scan. Left open rather than guessed at.
- **Q4. Does the preview page belong in the app build or in the site?** It is in the app
  build here, because it must be published with every *instance* and the site is built
  and published separately (ADR-0031). If the site ever grows a "try it" page, the two
  should be reconciled rather than both kept.
