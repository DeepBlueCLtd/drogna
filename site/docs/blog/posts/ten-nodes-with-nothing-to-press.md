---
title: Ten nodes with nothing to press
date: 2026-08-31
feature: specs/121-operator-actions
description: >-
  The Operator tab's controls were correct, and they were at the bottom of a card several
  screens long. Ten of its twenty-two components had no control at all — and for half of
  those, the honest fix was not a button.
---

# Ten nodes with nothing to press

![The sensors component open on a 390-pixel-wide screen. Under the title and the status
line — ok, heard at 01:41:25Z, 908 observations published from 4 instruments — two
full-width buttons headed ASK IT TO ACT NOW read "publish a faulty sample" and "sample
now", then a collapsed "what these do", then two more headed STOP AND START IT reading
"stop" and "restart". The component's sparkline instrument begins below all of
them.](../assets/121-nothing-to-press.png)

## The background

A control plane drawn as a diagram has to put the controls somewhere. The obvious answer
is inside the part they act on, under what that part says about itself. It reads well on a
laptop.

On a phone it makes the button the last thing in a card several screens long, at a
browser's default height: a cursor's target, a thumb's coin toss.

## The requirement

What a reader can do to a component should be the first thing they meet on opening it, at
a size a thumb can hit. And every part should offer something: opening one and finding
nothing teaches a reader the diagram is a picture rather than a plane.

Ten of the twenty-two offered nothing — protected from being stopped, and no control
declared.

## The options considered

A button on each of the ten survives as far as the first one you try to write. The stores
are written through one interface and read by somebody else; the broker and the gate act
on no schedule anyone could bring forward. A button making one produce a message would be
the display inventing traffic — the failure the tab exists against.

So three answers. Five got a real prompt. Six requests went to the components that
*serve*, two existing to be refused. Three stores got a sentence saying they answer
nothing, and a button opening the node that does.

## The demo

Try the refusals. Open `boundary` and ask for a path the gate will not serve; open
`broker` and publish on the clock topic, which the shell reads and may never write. Both
refuse and name the rule; the first turns up on Messages as a denial.

Then open `sensors` and press *sample now*.

[Open it at the Operator tab](../../instances/main/#/view/operator)
