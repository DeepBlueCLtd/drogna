---
title: The fastest way to see a system stop is to stop watching the numbers
date: 2026-08-30
feature: specs/115-engaging-tabs
description: >-
  A page listing every message a system passes is complete, honest and almost unreadable.
  The hard part of drawing the same traffic as marks on lanes was making sure the picture
  stands still when nothing is happening.
---

# The fastest way to see a system stop is to stop watching the numbers

## The background

Watching a message bus is the oldest debugging tool there is, and it is usually a list. It is complete, honest, and useless for the question people have:
is anything still happening? A list scrolling at forty lines a second and one at
four look identical from a metre away; a stopped list looks like one you are not
watching.

## The requirement

Answer *is this moving, and which part stopped* from across a room without reading a
number — and do not move when nothing is arriving: a display that animates on its own
asserts activity, and a pulse at a dead system is worse than a blank screen.

## The options considered

A scrolling waterfall fails at once: its drift runs on a clock, so the picture moves
on after the last message. Placing marks by how long ago they arrived fails more
subtly: every position is a function of the current time, so it redraws on a
timer. What worked was placing each mark by where it sits in the receive order,
making the display a pure function of the messages received: it advances when one
arrives and never otherwise.

That paid twice. Marks measure against the newest message anywhere, so stopping a
producer drains its lane rightward rather than freezing it — nobody designed that. And
the constraint became checkable: stop the simulation, assert the page is byte-identical
thirty seconds later. Broken with a timer it failed; broken with a CSS animation it
passed — motion the markup cannot see — so a second check reads the stylesheet and
refuses it.

## The demo

[Open it at the messages tab](../../instances/main/#/view/messages) and stop the sensors
from the operator view: the observation lane drains, the control lane beats on.
