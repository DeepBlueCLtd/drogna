---
title: The most useful button on the screen is the one that can refuse
date: 2026-08-30
feature: specs/114-operator-controls
description: >-
  A screen full of controls for a simulated system has an easy failure mode: the
  controls make the screen change, and nobody finds out whether the system agreed.
  Building the honest version meant every button gaining the right to say no.
---

# The most useful button on the screen is the one that can refuse

## The background

There is a screen in this application that draws the whole running system as a diagram:
twenty or so pieces, the connections between them taken from the actual wiring, and each
piece showing something specific about what it is doing right now. It went in a few days
ago and it reads well.

You could not do very much on it. You could stop a piece and restart it, and you could
advance the simulated clock by one second. That is a fine set of controls for asking
"what breaks if this stops", which is what the screen was built for, and a thin one for
the more ordinary question: what happens if I *drive* this thing?

The awkward part is that one of the missing controls was not missing. The vessel in the
simulation has a demanded course, speed and depth, and a panel for setting them had
existed since the vessel did. It lived behind a click on the vessel's box, below a list
of its connections, with nothing anywhere on the screen indicating it was there. When
the person who commissioned the screen asked for the ability to steer the vessel, that
was the answer: **a control nobody can find is a control that does not exist.** No
amount of it being genuinely implemented changes that.

## The requirement

Three things to do to the running system — steer the vessel, prompt events, and adjust
the two numbers the forecast loop turns on — and each of them findable, honest about
what it did, and impossible to confuse with a screen that merely looks like it did
something.

The last of those is the whole difficulty, and it is not a display problem. It is a
question about where authority lives.

## The options considered

Take the interesting one: a button that asks for a new forecast run.

The obvious build is three lines. The control surface can already publish messages; the
message that starts a forecast run is a known shape; publish one and the run happens.
Press, forecast, done. Every version of this feature I have seen elsewhere works that
way, and it demos beautifully.

It is also wrong, and the reason is worth stating plainly. There is a piece in this
system — the scheduler — whose entire job is deciding whether a forecast run is
warranted. It declines runs that come too close together. It declines a second run while
one is still outstanding. It asks for a run on schedule alone when too long has passed.
A button that published the run request itself would be a second, simpler copy of that
policy, living in the control panel, able to start runs the scheduler would have refused
— and the screen would then be showing you a system whose rules it had quietly stopped
obeying.

So the button does not request a run. It publishes a *prompt*, addressed to the
scheduler, and the scheduler weighs it under exactly the policy it applies to a genuine
divergence in the water. Press it twice in quick succession and the second press is
declined, in the scheduler's own words, in the panel directly beneath the button:
*declined by policy: an operator prompt at tick 60 inside the minimum interval*.

That reads like a bug and is the feature. The button's job is to ask the real question of
the real decision-maker; a control that could never be refused would be a control that
had bypassed something.

The same shape settled the other two.

**Thresholds.** The drift threshold and the persistence count are the two numbers that
decide when the loop turns: how far the measured sound speed may sit from the forecast
before a sample counts, and how many such samples in a row before that counts as drift
rather than noise. Both are now adjustable while the simulation runs. What made this
honest was keeping three numbers visibly apart. The slider holds what you are *asking
for*. The control surface holds the *bound* it will refuse outside — declared once, in
configuration, enforced there, and served to the screen so the screen offers exactly what
would be accepted and holds no copy of the rule. And the piece itself reports the value
*in force*, in the same channel it uses for everything else it says about itself. That
third number is the only one drawn as true. It is why there is a send button rather than
a slider that takes effect as it moves: dragging asks for nothing, and the number marked
in force moves when the monitor says it has.

There is a small consequence of that discipline worth keeping. Everything the monitor
publishes against that threshold — the streak rule, the threshold stamped on every
individual residual it reports, the threshold recorded in the drift event it eventually
raises — now reads it from one place. Had the adjustment reached the rule but not the
report, the screen would have drawn a streak filling against a threshold nobody was
using, and every number on it would still have been technically published by the piece
that owned it.

**Steering.** The sliders for course, speed and depth run between zero and the limits the
vessel *reported*, not limits typed into the screen; before the vessel has said anything
there are no bounds to draw, so the fields fall back to plain entry and say why. Beside
them are four presets — reverse course, all stop, full ahead, surface — and each one
demands only the quantity it names. That is not tidiness. The vessel leaves a standing
demand alone for anything a new demand does not mention, so "all stop" stops it without
turning it, and "reverse course" turns it without changing speed. The presets are where
that behaviour becomes visible, worked out from what the vessel last reported rather than
from a table of poses.

And all of it sits in each piece's own drawer, directly under that piece's instrument,
rather than in a console along the top. The screen's rule from the day it was drawn is
that a consequence should be visible where the cause was applied. Lower the drift
threshold and the streak two centimetres above your hand starts filling against the new
one. A console would have broken that for every control at once.

The finding-it problem got the dullest possible fix, which is the right one: a small mark
on the face of every piece that takes a control, drawn from what the control surface says
it offers rather than from a list in the screen. Add a tunable setting to the
configuration and the mark, the slider and the bound all appear on the right piece
without a line changing in the panel.

Eleven deliberate defects were planted to check the tests would notice: a surface
ignoring its own bound, a monitor scoring against the old threshold, a scheduler acting
on a prompt without weighing it, a preset demanding all three quantities, a screen
showing your ask as the value in force. Eleven caught. The tests assert what the *pieces*
did — what they published, what they stored, where the clock got to — and never what the
control surface said it had dispatched, because a test that read the surface's own answer
as evidence would pass just as happily against a surface wired to nothing.

## The demo

Open the operator view, find a box with a **▸** on it, and click the box. The vessel is
bottom left; the monitor and the scheduler are in the loop across the top.

[Open it at the operator view](../../instances/main/#/view/operator)

Three things worth doing in order: press **request a forecast run** in the scheduler's
drawer twice, and read the second answer. Drop the monitor's drift threshold and watch
the streak beneath it start filling. Then open the vessel, press **all stop**, and watch
the demanded mark drop to zero while the course mark stays exactly where it was.
