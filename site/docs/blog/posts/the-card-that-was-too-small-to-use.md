---
title: A card you can read and a card you can use are different sizes
date: 2026-08-30
feature: specs/116-open-node-in-place
description: >-
  A diagram of twenty running components has to fit on one screen, so each component gets
  a small box. Then someone asks to turn a dial inside one of those boxes, and the two
  requirements stop being compatible.
---

# A card you can read and a card you can use are different sizes

![The Operator diagram. Clicking the monitor's card makes it grow to about four times its
size, showing its full account and two sliders; the cards to its right slide out of the
way, the row of cards below moves down, and the wires connecting them stay attached to the
card the whole time it is
moving.](../assets/116-a-node-opening.gif)

## The background

One screen in this application draws the whole running system as a diagram: twenty
components, wired by their actual connections, each showing an instrument built for what
it does. All twenty have to be visible at once, because the shape of the system is what
the diagram is for. That sets the size of each box — about 200 by 116 pixels.

At that size you can see the drift line climbing. You cannot read what it climbed to. And
those boxes had recently gained controls: sliders that change what the running system
does. A slider in a box that size is not a control, it is a picture of one.

## The requirement

Selecting a component should open it — big enough to read a figure off and move a slider
in — with the rest of the diagram getting out of the way rather than being covered.

## The options considered

A card floating **over** the diagram is the cheap build, and it is a modal with extra
steps: it hides exactly the neighbours you opened this component to compare against, and
every wire then runs to a box underneath something.

So the diagram makes room instead, and — after the first version shipped — *animates*
doing it. That was asked for, and the reason is in the animation above: opening a box
moves most of the diagram at once, so between two frames a dozen boxes are somewhere new
and the one that grew is not distinguished by having moved.

The animation could not be a CSS transition. The wires are computed from where the boxes
are, so a transition would glide the boxes and leave fifty wires pointing at where those
boxes used to be. What moves is the *layout*: the diagram interpolates towards the new
arrangement and re-routes every wire on every frame. Watch the wires under the card above
— they stay on it the whole way.

Two more rounds followed, both from using it: arrows to walk all twenty components without
returning to the diagram, and the arrow keys to do the same — handed back to any slider,
because a slider's own keys *are* the arrow keys.

## The demo

[Open it at the Operator view](../../instances/main/#/view/operator) and click any box with
a **▸** on it. Press **→** to walk on to the next component. It works the same on a phone,
where the card is a different shape because the space a phone has is vertical:

![The same monitor card open on a 390-pixel-wide phone screen: taller and narrower, with
its heading, walk arrows, both sliders and their limits all
readable.](../assets/116-on-a-phone.png)
