# Feature Specification: The shape of the system, drawn and moving

**Feature Branch**: `claude/intro-architecture-diagram-pmb8ff`

**Created**: 30 August 2026

**Status**: Implemented

**Input**: "the intro tab provides a list of numbered features. This is low value. A
dynamic system architecture diagram would be better — a drawn image that shows
SensorThings (measurement and location) being pushed into the store, other sub-systems
tracking measurements, updating forecasts using archive, recent, and current data, and
informing downstream systems which interrogate data store using EDR. The diagram should
'grow' one element at a time, with a short textual description. I should be able to
progress using arrow keys."

Amended twice in flight, both times by the author and both times recorded below: first to
cut the picture down to the significant flows, then — the reversal this feature turns on —
to stop drawing components at all and to put the links between the parts in motion.

## Context

The Intro tab was nine numbered sections, one per landed beat, each a paragraph of prose
with links into the views. It was honest, it grew as the arc grew, and it answered the
wrong question. A reader arriving at drogna for the first time wants to know what the
thing is made of and how the parts fit together; a changelog ordered by when the work
landed answers that only for somebody who already knows the answer. It also had to be
extended by hand for every beat, which is a record kept separately from the tree — the
shape of every stale document this repository has paid for, and the first of CLAUDE.md's
two headline lessons.

Feature 115 put Intro in its "deliberately not in this feature" list, on the reasoning
that making it engaging would mean making it a second copy of a demonstration that lives
one tab away. That objection still stands and this feature does not do that. What 115
missed is that the tab has a subject of its own: the shape of the system, which no other
tab draws for a reader who has not met it. The Operator flow chart draws all twenty
components with all fifty-eight wires, which is the right picture for somebody
interrogating a running system and the wrong one for somebody meeting it. That bullet is
amended in place rather than left disagreeing with the tree.

**SRD change.** New §5.17 carries **FR-86 to FR-90**. FR-42 (the Intro tab) is amended in
place.

### The first design, and why it went

Four wireframe passes drew the **declared components**: nodes labelled from configuration,
wires derived from the same topology module the Operator chart derives from, the store's
eras read out of a schema enum, and every component left out recorded on screen with its
reason. A gate — `check-intro-storyboard` — failed the build on any component in neither
the drawing nor the omissions.

**That gate earned itself and is worth the record.** It stopped the build the day it was
written, when a merge landed the `analyst` component and left the picture silently short
of it; and in fixing that it surfaced a second fault no check was looking for — a step's
prose said the model runner assimilates the observations, which had stopped being true
once the analyst existed. A drawing derived from declarations does not protect the
sentences written beside it.

The author then asked for something more abstract still, naming no component at all, and
animated. That retires the storyboard, the geometry module, the diagram component and the
gate together. The trade is stated plainly because it is a real one: a derived picture
makes a checkable claim and a gate holds it; an abstract picture makes a claim no merge
can falsify, and needs no gate because there is nothing left to check. What the gate was
holding up was the claim *these are all the parts* — and that question is the Operator
tab's, which answers it better and completely.

Two things from the first design do not survive and should not be looked for: the box
labelled for the observation store (the requirement said "stored in postgres"; this build
runs no such engine, and the shipped drawing names no store at all), and the disclosure of
omitted components (there is nothing to omit from a picture that never claimed to be a
list). All four passes are kept in `mockup.html`.

### What the shipped design settled

| Decision | Consequence |
|---|---|
| **Roles, not components** | Six parts — what is measured, what tests it against belief, what re-forecasts, what is believed, who is told, what came back — and not one component id among them. A picture that names nothing cannot fall behind the tree |
| **The gaps are channels, with room in them** | A line says *A talks to B* and stops. Each gap is a track wide enough to hold what is crossing it, at a size a reader can aim at and click |
| **Every message opens** | A mark on a channel is a real `<button>`; clicking it shows the shape of what crosses there — an observation with its location, a divergence event, an announcement, an EDR request and its CoverageJSON response |
| **Every sample says it is a sample** | The inspector carries "a sample of the shape, not a value this run produced" on all six, and the frame above the drawing calls the motion an illustration. A schematic mistaken for a readout is this design's one real risk |
| **It still grows, one part at a time** | The author kept the growth when asking for the motion. Six steps; a channel is never drawn before both the parts it runs between |
| **The motion is a fixed CSS cycle** | FR-90, and a recorded exception to FR-71. Chosen by the author over driving it from real traffic, so the tab reads the same on a stopped clock, in a screenshot and on a printed page |
| **Nothing reads a clock** | The animation is entirely CSS on one shared `--cycle`, so Constitution I is never engaged and no wallclock exemption is spent on decoration |
| **The step's address is its name** | `#/view/intro/asked`, not `#/view/intro/6`, which quietly starts naming a different part of the system the moment a step is inserted |

## User scenarios

### Story 1 — Meet the shape (Priority: P1)

A reader opens drogna for the first time. The Intro tab shows one box — Measurements —
and a paragraph saying what a reading is. They press the right arrow. A channel labelled
SensorThings appears with observations crossing it, and Divergence at the far end. Five
presses later they have the whole loop and the downstream flow, and they have read a
sentence about every part of it as it arrived.

### Story 2 — Read what is crossing (Priority: P1)

Something is travelling along the gap between Measurements and Divergence. The reader
clicks it. Beside the drawing: `phenomenonTime`, `result`, `datastream`, `location`,
`depth` — and underneath, in as many words, that this is the shape of an observation and
not a value this run produced. A link says where the real traffic is.

### Story 3 — See that being told is not being sent (Priority: P2)

At the last step two channels appear between the client and what came back, running in
opposite directions: an OGC API-EDR request and a CoverageJSON response. The prose says
the announcement carried news and nothing else, and that the trajectory which comes back
is what the next round of measurements is tested against — which is where the lower lane
rejoins the upper one.

### Story 4 — Arrive at a part of it (Priority: P2)

Somebody pastes `#/view/intro/asked` into the address bar. The tab opens at the step where
the query round trip appears, with everything up to it drawn.

### Story 5 — Read it on a tablet (Priority: P1)

A reader opens the tab on an iPad. Seven parts will not sit side by side at that width, so
the lane wraps and takes two rows; nothing overflows its column and nothing is painted
over by the narration beside it. At a desktop width the same lane is a single row.

## Requirements

Carried by SRD-v2 §5.17, **FR-86 to FR-90**. In summary: the drawing grows under the
reader and never on a timer (FR-86); every message crossing a channel is inspectable and
every sample declares itself illustrative (FR-87, FR-88); nothing in the drawing is lit
from component state (FR-89); and the motion is a fixed cycle rather than received
traffic, which is a recorded exception to FR-71 and is paid for by saying so in the frame,
on every sample, and with a link to Messages (FR-90).

## Success criteria

- **SC-01** The drawing names no declared component. Checked by walking to the last step
  and asserting that no `shell.components` id **or** label appears anywhere in it —
  enumerated from the configuration, not typed into the test.
- **SC-02** The drawing is what the steps so far revealed and nothing ahead of them, and a
  channel is drawn only when both the parts it runs between are on the canvas. Checked by
  walking all six steps, not by eye.
- **SC-03** Every channel's sample carries its caveat. Enumerated over all six rather than
  asserted on the one that was remembered, and the frame's own wording is asserted too.
- **SC-04** The tab renders and traverses end to end with every component stopped, a
  client whose every method throws and a fetch that throws.
- **SC-05** No timer is set. A test spies on `setInterval`, `setTimeout` and
  `requestAnimationFrame` and requires all three to go uncalled while the panel runs — the
  wallclock gate holds this in source, this holds it in behaviour, including from a
  library.
- **SC-06** A lane is a flow that wraps, and it wraps only when it must. Both halves are
  stylesheet properties, because jsdom lays nothing out: the lane declares `flex-wrap`
  and its parts may shrink; and every wrapping part's flex basis equals its own
  `min-width`, without which a lane breaks while it still has room. Both watched failing;
  the layout itself was measured in a browser at 1600, 1440, 1194, 1024, 834, 768 and 390
  for overflow, overlap and sideways scroll.

## Deliberately not in this feature

- **Driving the motion from real traffic.** Considered at length and refused by the
  author, in favour of a fixed cycle "so it's independent of app". FR-90 records the
  decision, the exception it takes to FR-71, and what it is paid for with.
- **Liveness in the drawing.** Considered and refused: see FR-89. A second surface where a
  part lights would be a second answer to a question Operator already answers, and the
  first one a reader would meet.
- **A tour button.** The tab is a walkthrough. A help control offering to walk a reader
  through the walkthrough is the button feature 115 said should mean *this tab explains
  itself*, on the one tab that is nothing else.
- **Drawing the components at all.** The reversal above. A reader wanting the component
  list is sent to the Operator tab, which draws every one of them with every wire and is
  held to the declaration.
- **Redrawing the Operator flow chart.** Two pictures, two different questions, and this
  one says where the other is.
