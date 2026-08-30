---
title: A light per message stops meaning anything once there are enough messages
date: 2026-08-30
feature: specs/113-operator-flowchart
description: >-
  Lighting a connection as data crosses it is easy at one message a second and useless
  at fifty. The fix was not a faster animation: it was letting the light mean a
  different thing when the clock is running fast, and saying on screen which it means.
---

# A light per message stops meaning anything once there are enough messages

## The background

A diagram of a running system usually draws the parts and not the traffic, so it looks
identical whether the thing is working or has been dead for an hour. Lighting each
connection as data goes down it is the obvious repair, and it holds until the system is
asked to run faster than real time — at which point every line is flashing constantly,
and the picture is back to saying nothing at all.

## The requirement

A line has to show that something crossed it and go dark when nothing does. Two things
it may not do: claim traffic that did not happen, and cost more to draw than the traffic
costs to carry. Redrawing twenty component faces for every message would have the
display competing for the machine with the system it is watching.

## The options considered

Shortening the flash as the clock speeds up keeps the flicker and adds arithmetic.
Sampling the traffic means throwing away messages that did happen. What won was changing
what the light *means*: at real time, one fade per message; above it, a steady light,
held while traffic keeps arriving and dropped a second after it stops. The panel says
which of the two it is doing, because they are different claims.

## The demo

[Open it at the Operator view](../../instances/main/#/view/operator), press **step 60
ticks**, and watch the sensing path light and fade. Then set the clock to **×60** in the
header: the same wires hold steady instead. The line under the chart names the topics
whose lights are an approximation — the broker hands a subscriber a topic, never a
sender.
