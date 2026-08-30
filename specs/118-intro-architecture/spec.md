# Feature Specification: The architecture, drawn

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
missed is that the tab has a subject of its own: the architecture, which no other tab
draws for a reader who has not met the system. The Operator flow chart draws all twenty
components with all fifty-eight wires, which is the right picture for somebody
interrogating a running system and the wrong one for somebody meeting it. That bullet is
amended in place rather than left disagreeing with the tree.

**SRD change.** New §5.16 carries **FR-76 to FR-79**. FR-42 (the Intro tab) is amended in
place.

### What the review settled

The first wireframe drew all twenty components on a five-column grid: forty-one collapsed
wires, and a loop a reader had to be told was a loop. It was rejected in review, in these
words: *trim it down to the significant components / flows: measurements in, stored,
forecasts updated on drift (or elapsed time), downstream consumers interrogate via EDR.*
Both wireframes are recorded; `mockup.html` is the second.

| Decision | Consequence |
|---|---|
| **A subset, not the whole system** | Thirteen of twenty components. Completeness is the Operator tab's job and it already does it better; a second complete flow chart here would be the same picture told worse |
| **Every omission carries its reason, on screen** | A curated picture is only honest if the curation is recorded. A gate fails on a component in neither list, which is how the next component to land gets named rather than going quietly missing |
| **The loop is drawn as a loop** | Four components at the four corners of a banded rectangle. A picture of a control loop that is not a ring has thrown away the one thing worth saying about it |
| **Ten steps, not twenty** | A step may reveal more than one node. One component per step was the most literal reading of "one element at a time" and made the walkthrough a roll-call |
| **Nothing is lit** | The drawing is the wiring, not the run. The cheapest way to break Constitution VII is a diagram that looks like a readout |
| **The one box that is not a component is drawn as one** | Dashed, unclickable, labelled *anything outside*, carrying the three served interfaces. It is the honest form of "downstream systems interrogate via EDR": inside the harness the planner, telemetry and the packager read the stores through ports, and EDR is how this page and anything outside asks |
| **The step's address is its name** | `#/view/intro/the-loop`, not `#/view/intro/8`, which quietly starts naming a different part of the system the moment a step is inserted |

### The store, and the database

The requirement said "stored in postgres". The drawing says it the only way that is true
in this build: the observation store is in memory behind a store interface; in V1 that
same interface stood in front of PostgreSQL with PostGIS; SRD §11 records that the engines
return in V3. A box labelled `PostgreSQL / PostGIS` would name an engine this build does
not run, which is exactly the class of claim FR-01 and Constitution VI exist to prevent.
The prose carries all three facts instead, in the step where the store arrives.

## User scenarios

### Story 1 — Meet the system (Priority: P1)

A reader opens drogna for the first time. The Intro tab shows one box — a synthetic ocean
— and a paragraph saying what it is and why it is synthetic. They press the right arrow.
Instruments appear, wired to the field by a dashed line the prose has just told them means
a port rather than a message. Ten presses later they have the whole architecture, and they
have read a sentence about every part of it as it arrived.

### Story 2 — See that the loop is a loop (Priority: P1)

At the step where the model runner appears, the write back into the coverage store closes
a rectangle whose other three sides are already drawn, and a band appears around the four
boxes saying the forecast loop turns here. The band was not there a step earlier, because
the loop was not yet closed.

### Story 3 — Ask what is missing (Priority: P2)

A reader who knows the system notices there is no planner. Under the drawing is a
disclosure: *not drawn — 7 of the 20 components*, each with a sentence saying why, and a
link to the Operator tab where all twenty are drawn with every wire.

### Story 4 — Arrive at a part of it (Priority: P2)

Somebody pastes `#/view/intro/the-loop` into the address bar. The tab opens at the step
where the forecast loop closes, with everything up to it drawn. They click the coverage
store; the walkthrough goes back to the step that introduced it.

## Requirements

Carried by SRD-v2 §5.16, FR-76 to FR-79. In summary: the drawing grows under the reader
and never on a timer; it is derived from the declaration rather than authored beside it;
it is a subset whose omissions are recorded with reasons and held by a gate; and nothing
in it is lit.

## Success criteria

- **SC-01** Every declared component is either drawn or recorded as deliberately left out
  with a reason. Planted and watched: `offload` was removed from the omissions, the gate
  named it, and the plant was reverted — recorded in the commit message.
- **SC-02** The drawing is what the steps so far revealed and nothing ahead of them, and a
  wire is drawn only when both its ends are on the canvas. Checked by walking all ten
  steps and comparing against the storyboard, not by eye.
- **SC-03** The loop band appears only once every component inside it has been revealed.
- **SC-04** The tab renders and traverses end to end with every component stopped, a
  client whose every method throws and a fetch that throws.
- **SC-05** Nothing in the drawing carries a component state or the operator surface's
  liveness vocabulary.
- **SC-06** The interfaces on the arrow leaving the harness are the shell's declared
  endpoints, compared against the configuration by test rather than typed into one.

## Deliberately not in this feature

- **Liveness in the drawing.** Considered and refused: see FR-79. A second surface where a
  node lights would be a second answer to a question Operator already answers, and the
  first one a reader would meet.
- **A tour button.** The tab is a walkthrough. A help control offering to walk a reader
  through the walkthrough is the button feature 115 said should mean *this tab explains
  itself*, on the one tab that is nothing else.
- **Drawing the advisory path, the planner, telemetry, the packager or the operator
  surface.** Each is a second argument, and each is recorded as omitted with the reason.
- **Redrawing the Operator flow chart.** It derives the same wiring from the same module.
  Two pictures, one derivation, and this one says where the other is.
