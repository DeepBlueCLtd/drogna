---
title: The check worked, and the drawing still had to go
date: 2026-08-30
feature: specs/119-intro-architecture
description: >-
  An architecture diagram rots because the system moves and the picture does not. Four
  passes fixed that with a build check that derived the drawing from the code. The check
  did its job, caught a real drift, and was the wrong repair anyway.
---

# The check worked, and the drawing still had to go

## The background

Every architecture diagram starts accurate. Then something lands, the picture does not
change, and nothing says so. Code that drifts from its callers fails a test; a drawing
that drifts just lies quietly, to exactly the readers who trusted it most. So — can a
diagram be made to fail?

## The requirement

The first tab a visitor opens was a numbered list of what had been built: a changelog,
written for someone who already knew what the thing was. It had to become a picture of
the shape, grown one part at a time under the arrow keys, and stay true with nobody
maintaining it.

## The options considered

It can. Four passes drew the declared parts, labelled from configuration and wired from
the real topology, and a build check failed on any part the picture had not decided
about. It fired the week it was written — a merge added a component, the build named it,
and a caption about that component's neighbour turned out to have gone false earlier
still.

Then the picture was made abstract: six roles, not one component named. All of that
retired with it. The check was never wrong; it was propping up a claim the page should
not have been making — *these are all the parts* — which another tab already answers
properly. A drawing that names nothing cannot go stale, because it never said it was the
list. The repair was a smaller claim, not a stronger check.

## The demo

![A recording of the Intro tab. Across the top the shell header shows the simulated time
2026-01-01T00:00:00Z and the words 'rate 0', with the Intro tab selected below it. Under
the heading a paragraph ends 'The movement below is an illustration on a fixed cycle'.
The drawing beneath is a row of four labelled boxes with wide gaps between them:
Measurements ('what was found, and where'), Divergence ('measured against believed'),
Model run ('assimilate, re-forecast') and The forecast ('what is believed'). Each gap is a
rounded track with an arrowhead at its right end and a caption above and below it — the
first is labelled SensorThings and carries five small teal squares strung out along it,
the next MQTT divergence, the next 'a new field'. A wider track labelled MQTT run
published runs the full width below the row, and under that a second lane holds one box,
A client ('this page, or anything'). Throughout the recording the teal squares slide
steadily left to right along the SensorThings track and wrap round to the start, and
single marks appear on the other tracks and cross them; the header still reads rate 0.
Partway through, two more tracks — OGC API-EDR request and CoverageJSON response, the
second travelling right to left — and a final box, What came back ('a slice, and a
trajectory'), fade into the lower lane beside A client.](../assets/119-intro-architecture.gif)

The clock is pinned at zero throughout and the messages move regardless: an illustration
on a fixed cycle, not a readout. [Open it](../../instances/main/#/view/intro), press the
right arrow six times, and click something crossing a gap to read it.
