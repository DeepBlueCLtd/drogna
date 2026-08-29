---
title: The map you can point at
date: 2026-08-29
feature: specs/109-map
description: >-
  Asking a data service about a place meant typing two numbers for a spot already
  on the screen. Fixing that turned out to be less about the click than about
  making sure the thing drawn and the thing fetched cannot be different things.
---

# The map you can point at

## The background

A gridded environmental service — an ocean model, a weather model, a re-analysis —
answers questions of the form "what is the temperature here, at this depth, at this
time". The standard for asking is settled: a query with a coordinate in it, a depth,
an instant, and the name of the thing you want. What is never settled is how a person
arrives at the coordinate.

In practice they read it off a map, transcribe it into a form, and get one of the
digits wrong. The map is right there, the place is right there, and the interface
asks for the place to be spelled out in decimal degrees anyway. That is a small
indignity by itself, and it has a larger consequence: because the coordinate has been
retyped, nothing on the screen is any longer bound to the request that was sent. The
picture and the query are two separate claims about the same place, and they can
drift apart without anyone noticing.

There is a third dimension to this that maps tend to lose. Ocean data is a volume:
every point has a depth, and a plan view can only show one slice of it at a time. A
depth selector is the usual answer and it makes the reader hold the volume in their
head, one slice at a time, while asking questions about a place that has a depth.

## The requirement

Three things had to become true. A person should be able to place a query by
clicking the place on the map, in any of the views it offers. The volume should be
visible as a volume, not one slice at a time. And what the canvas draws for a
composed query must be the same thing the request asks for, by construction rather
than by care.

## The options considered

The click itself is the easy part; a map library will happily hand back the
coordinate under the cursor. The interesting decisions were behind it.

The first was where the query lives. The composer had been holding its own state,
which is the obvious arrangement and the wrong one: a click on the canvas and a
number typed into the form would have been two paths writing two copies of the same
position, with a synchroniser between them to go wrong. The state moved up to the
map itself, so the canvas and the number boxes write one place and the composer only
displays it.

The second was the volume. The service's own standard has a query type for a cube of
data, which this harness does not implement — so the honest options were to implement
it or to stack what the service *does* answer. Stacking won for this round: the view
asks one area query per depth level and lays the answers out in a rotatable box. The
levels are not a list of depths typed into the front end; they come from the data's
own description of its vertical axis, so a holding with a different axis draws a
different cube without anything being edited. The depth axis is exaggerated against
the horizontal one to make the box readable, and the display says so rather than
letting the picture imply a scale it does not have.

The third was the binding between the drawing and the request, and it is the one
worth copying. An area query covers a box around the chosen position. That box is
drawn on the map and written into the request, and the temptation is to compute it
twice — once for the drawing, once for the URL — which works until somebody adjusts
one of them. Instead one function produces the ring, the canvas draws exactly that
ring, and the request text is built from exactly that ring. A test holds them equal
coordinate for coordinate, and shifting the request's box by a hundredth of a degree
turns it red.

Then a bug worth reporting, because the tests did not catch it and running the thing
did. The map can shade its uncertainty from a published forecast's spread, and the
spread is a different product from the field: it starts when its run started and
covers that run's horizon, not the field's. The first version asked the spread about
the instant the *field* was showing. The server refused it — correctly, naming the
extent it does cover — and the map printed the refusal, which is how it was noticed
within a minute of watching the page rather than never. The test that should have
caught it passed, because at the moment it ran the two products' time steps happened
to agree. It now runs the loop on until they disagree, and then asserts; against the
original fault it goes red.

## The demo

[Open it at the map](../../instances/main/#/view/map). Switch the view to the depth
cube and drag to rotate it; open the composer and click a slice — the position and
the depth appear in the form, the marker is drawn where the URL says, and the note
says whether the place is inside the domain the server will answer for.

![The Map tab of the drogna shell in its depth-cube view, with the query composer
open on the right. Six stacked slices are drawn in a rotated box, warm orange at the
surface grading to deep blue at the bottom, each one the answer to its own area
query. The composer shows collection "nowcast", query type "position", longitude
-11.184, latitude 46.147 and depth 280 m — the position filled in by a click on one
of the slices — a note reading "position -11.184, 46.147 — inside the domain", and
beneath it the request line the query composes:
/api/edr/collections/nowcast/position?coords=POINT(-11.184
46.147)&z=280.](../assets/109-the-map-you-can-point-at.png)

## What is now known

Binding a picture to a request is a structural problem, not a diligence problem: as
long as the drawing and the query are computed separately, they will eventually
disagree, and no amount of care prevents it. Deriving both from one function makes
the disagreement impossible to write. And the refusal a server gives when it is asked
about something outside its extent is worth showing to the reader verbatim — it was
the display of that refusal, not the test suite, that found the fault here.
