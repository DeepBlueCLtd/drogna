---
title: The tabs that are not part of the system
date: 2026-08-30
feature: specs/116-downstream-consumers
description: >-
  A simulator that samples an ocean and forecasts it can show every part of itself
  working and still never answer "so what". Three yellow tabs answer it — and the
  thing that proves they are genuinely consuming the forecast is that they refuse
  to recalculate when a new one arrives.
---

# The tabs that are not part of the system

## The background

A system that measures an environment and predicts it can be shown off in two ways. You
can show the machinery: sensors reporting, a model assimilating, a store publishing, a
query interface answering. Or you can show what changes because of it.

The first is what most demonstrations do, because it is what the engineering effort went
into and it is genuinely interesting to the people who built it. It is also, to almost
everybody else, a set of dials. A reader watching a forecast being produced learns that a
forecast is being produced. They do not learn why anyone would want one, and the question
they are actually asking — *what would I do differently if this data were fresher?* — goes
unanswered, usually with an assurance that it obviously matters.

The obvious answer is to make the display cleverer: add a recommendation to the map,
score the forecast, put a headline number somewhere. It does not work, for a reason worth
being precise about. A system that measures the world and then also tells people what to
do has quietly become two systems, and the second one — the one making decisions — is the
one that needs the argument. Bolting it onto the first hides exactly the boundary that
someone evaluating the thing will want to interrogate.

## The requirement

Show three separate notional systems consuming the forecast to reach a decision, make it
unmistakable that they are not part of the simulator, and make it checkable that they are
genuinely consuming its output rather than illustrating what consuming it might look like.

## The options considered

**Build them elsewhere.** The cleanest boundary available: a separate application reading
the published instance over the same interfaces anyone else would use. It was rejected on
the demonstration rather than the architecture. The moment worth showing is a forecast
being published in one tab and a recommendation going stale in another, in the same page,
in front of the reader — and a separate application would have had to poll a static site
to notice, which is the polling the whole design avoids.

**Keep them inside and mark them clearly.** What was built. The three tabs are bright
yellow with black text against a dark shell, under a strip reading *"Downstream consumer —
not part of drogna"* that cannot be dismissed and does not scroll away, so a screenshot
lifted out of context still carries the caveat. Which tabs get that treatment is declared
in a configuration document rather than listed in the code, so a fourth consumer cannot be
added without it.

That raised a genuine conflict, which took an architecture decision record to settle. The
simulator has a hard rule that no display may assert the existence of something that is
not running — no fixture data, no canned traffic, no populate-for-the-screenshot mode. The
third tab reasons over tidal windows, moon phase, ferry timetables and crew watch cycles,
and the simulator models none of them. The resolution: a consumer may synthesise its own
inputs, never the simulator's. Everything synthesised is labelled on its own face as
synthesised, is drawn from the run's seed so it replays and stops when the clock stops,
never crosses back over the wire, and never appears on one of the simulator's own tabs.

**The mechanism that makes it checkable.** When a new forecast is published, a consumer
tab does not recalculate. It grows a halo offering *"New forecast available — update"*, and
waits. Until it is clicked, the answer on screen keeps saying what it said, and keeps
naming the older forecast it was computed from. On the click it recomputes, and the
previous answer stays behind as a ghost.

The ghost is the argument. If the recommendation barely moves, that forecast was not
decision-relevant and the tab has just said so. If it swings, the value of fresh
environmental data has been demonstrated rather than asserted. And a tab that was faking
its inputs would have nothing to be stale about — which is why this behaviour, rather than
the drawings, is the thing to look at first.

**What watching it run changed.** The first version waited for a published forecast and
drew nothing until one arrived, which at this simulator's own cadence is several minutes of
three blank yellow tabs. The fix is what a downstream system actually does: work from
whatever the service is already holding — the rolling now-cast — and take the forecast up
when it lands. That turned out to make the demonstration *stronger*, because with an answer
already on screen the very first forecast is a change of basis, so the halo, the refusal to
move, and the ghost are all available from the first minute rather than after the first
model run.

Two smaller corrections came from the same place. The uncertainty map was a flat
rectangle: a consumer that counts only what arrives after it opens has an empty ocean, and
every cell in it carries the same value. It now reads the served observation history when
it opens — an ordinary paged query, the same one any client would make — and, more to the
point, it distinguishes water nobody has *ever* sampled from water that was sampled and
has gone stale, by drawing the first as an outline and the second as a fill. Those two
carry the same number and mean completely different things, which is the distinction the
whole tab turns on. (Shading relative to the values present was tried first and is worse:
early in a run there is no spread to scale to, so it draws every hex identically.)

And the candidate ranking did not always reorder under the opening objective: under
*evasion*, staying clear of the traffic is both what the objective wants and what lowers
exposure, so the two scores move together and no weighting can separate them. That is a
property of the objective rather than a bug, so the tab now says so when it happens, and
opens on an objective where the trade is real.

**What the build changed about the specification.** Two things, both worth recording. The
third tab's horizon was going to be the forecast's own validity span, which was elegant
and wrong: this scenario's forecasts are valid for an hour, and a one-hour window cannot
schedule a three-hour task, so the tab answered "nothing is feasible" for the least
interesting reason available. The horizon is now longer than the forecast, and the *lane
the forecast serves* stops where the forecast stops — so the reach of what the system
actually knows is visible on the timeline instead of hidden in the axis. And a "sea state"
lane was listed as coming from the forecast field. It cannot: temperature and salinity are
not a sea state without an invented wave model in between, so the lane is marked
synthesised and says so.

## The demo

[Open the sampling planner](../../instances/main/#/view/sampling) — a hex grid over the
domain, coloured by how stale the observation coverage is at a chosen depth, with a route
planned by value per mile rather than by heading for the worst cell. The wheel zooms the
map and a drag pans it, and the grid covers what is in view rather than the whole domain —
which is what makes the finer resolutions affordable at all, and why asking for one while
zoomed out is refused with both remedies named. Change the time
budget from 3 hours to 24 and the route changes shape, not just length. The vessel reaches
only the top of the water column, so the deeper zones can only be addressed by expendable
sensors — and because a sensor cannot be dropped where the vessel does not go, servicing a
deep hotspot bends the route. The faint dashed line is the route the planner would have
flown with nothing to drop: the gap between them is what depth cost.

[Open the comparative courses](../../instances/main/#/view/courses) — three classes of
vessel that *may* be present, seeded across the whole domain from a likelihood you set. No
tracks, no positions anyone claims to know: a cloud over an entire domain infers no
position at all. Each class moves by its own model rather than carrying its own
multiplier, so the ferry's cloud is a band on a schedule, the fishing vessel's is
clustered over banks, and the submarine's reads the forecast field for water that hides it
and changes when the ocean does. Four candidate courses are scored on two axes kept apart,
and dragging the weighting reorders them — which is the tool reasoning rather than
reciting.

[Open the feasibility timeline](../../instances/main/#/view/feasibility) — no map at all,
deliberately, because environmental data settles questions that are not about *where*. Ten
source lanes, each wearing its provenance; thresholds that belong to the task rather than
the lane, so two tasks can disagree about the same sea state and both be right; a
confidence setting per source where a low-confidence source cannot veto a task on its own
and *Off* removes it from the arithmetic entirely, live, in one click. The output is the
top three maximal feasible sets with what each gives up — *you can do A and B, or B and C,
but never A and C*. Lock one task as mandatory and watch the others rearrange around it.
