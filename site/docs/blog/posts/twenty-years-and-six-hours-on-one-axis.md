---
title: Twenty years and forty-five minutes, on one axis
date: 2026-08-30
feature: specs/114-engaging-tabs
description: >-
  A catalogue of stored datasets was showing a four-dimensional ocean as five columns and
  twelve characters of a checksum. Turning it into a picture of the archive filling up
  meant solving one awkward problem: an axis that has to carry two decades and one
  afternoon at the same time.
---

# Twenty years and forty-five minutes, on one axis

## The background

Systems that forecast something usually keep three quite different kinds of stored data
and file them in the same drawer. There is a historic archive — what the world did, going
back years. There is a picture of what it is doing now, replaced every few minutes. And
there are the forecasts themselves, one per run, each reaching a little way into a future
that has not happened yet.

The obvious way to show that drawer is a table: one row per dataset, with its kind, its
identifier, when it was written, how big its grid is and a checksum of its contents. It is
accurate and it is easy to build, and every catalogue page in the world looks like it.

It also hides the two things anyone actually wants to know. A table is a list in the order
things arrived, so it cannot show **accumulation** — you cannot see the archive as a long
band and the forecasts as a handful of short bars crowding the present, which is the
literal shape of the thing. And it cannot show **whether the forecasts were any good**,
because that is a comparison and a table has no room for one. What our table did show,
for a four-dimensional ocean of temperature and salinity, was twelve characters of a
SHA-256.

## The requirement

Two things had to become visible: the store filling up over time, and whether a forecast
that had run its course turned out to be right.

There was also a condition attached to removing the table, and it is worth stating because
it is the sort of thing that usually gets waived. A table is, for free, a keyboard surface
and a screen-reader surface: you can tab through it and hear every cell. A picture is
neither, and nothing would be standing behind this picture to be one. So the rule was
that a check had to be **written first**, proving the new display announced everything the
stored descriptor declares and that every dataset was reachable in order by keyboard — and
if that check could not be made to pass, the table stayed and the reason got written down.

That check is bounded by the descriptor's own schema rather than by the table's five
columns. The columns were one person's choice; the schema is the shared definition, and
reading the bound off it means that when someone adds a field to the schema, the check
fails naming that field rather than everyone quietly forgetting. We added a field on
purpose to watch it happen, and then took it out again.

## The options considered

The awkward part is the axis. The archive spans twenty years. A forecast reaches
forty-five minutes past the moment it was made. On a straight timeline the archive is the
entire width and every forecast the system has ever produced is a hairline at the right-
hand edge — accurate, and completely unreadable.

The tempting fix is to give each row its own scale, so the forecasts get a whole lane to
spread out in. That is worse than unreadable, because two bars at the same horizontal
position would then be at different moments, and the one thing a timeline promises is
that horizontal position means time.

So: one axis, non-linear, compressing elapsed time logarithmically backwards from the
newest edge. Twenty years and forty-five minutes are both on it, in the right order, at
distances you can see. The forecasts are still narrow — they genuinely are narrow — but
they are visible, ordered, and clickable, and the archive is still a band.

The cost of a non-linear axis is that a reader cannot judge a duration by eye, so the
display has to say what it is doing rather than let anyone infer it from the tick spacing,
and it labels the actual moments the axis falls on so you convert by reading rather than
by trusting the shape.

Three faults came out of simply looking at the running page rather than reasoning about
it. Two lanes were landing on every line because of a stray box in the layout. Four
timestamps were printing on top of each other at the crowded end. And a forecast run
publishes *two* datasets over exactly the same interval — its prediction and its own
measure of uncertainty — so one bar sat precisely on top of the other and eight stored
datasets drew as five. Overlapping bars now stack.

## The demo

The second half is the comparison, and it is the part with a principle attached. Pick a
forecast whose window has passed. The panel finds the measurement published for the moment
that forecast was about, asks for three grids — the forecast, the truth, and the
forecast's own starting field held constant — and draws where the forecast was wrong.

That third grid is not optional. A picture of forecast error alone reads as a verdict:
small differences, model working. It is not a verdict, because you cannot tell from it
whether simply assuming nothing changed would have done as well. So the comparison always
draws both, on one shared scale, and says plainly which is closer — including when the
answer is that the model is not earning its compute.

The panel computes those differences itself, which is a thing it is normally not allowed
to do, so it labels them as computed, distinctly from the numbers it was told and the
numbers it counted. And it puts the three requests it made on screen, copyable: a figure a
page worked out and you cannot get back to is an assertion.

[Open it at the holdings tab](../../instances/main/#/view/holdings)

Everything here is synthetic. The ocean is generated from a seed and the numerics are
deliberately fake — see [the landing page](../../index.md) for what that means and why it
matters.
