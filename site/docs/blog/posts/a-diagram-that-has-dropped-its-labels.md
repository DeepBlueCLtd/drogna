---
title: A diagram that has dropped its labels looks finished
date: 2026-08-29
feature: specs/111-background-tab
description: >-
  Explaining why a system uses the standards it uses is a slide deck that goes stale.
  Building the explanation into the running system instead turned out to be the easy
  part; the hard part was that a broken drawing and a correct one are the same picture
  until something measures them.
---

# A diagram that has dropped its labels looks finished

## The background

Someone evaluating a system asks a question that its documentation is bad at answering:
not *what does it do*, but *why is it built that way*. Why go to the trouble of serving
data through interfaces defined by a committee somewhere, when a bespoke API would fit
the data exactly and ship sooner?

The usual answer is a slide deck. A deck is written once, presented three times, and
then rots quietly in a shared drive while the system moves underneath it. Nobody
notices, because nobody re-reads a deck. The parts that go stale first are the parts
that were most specific — the very parts that made it convincing.

The obvious fix is to put the explanation inside the running system, so it travels with
the thing it describes. That turns out to raise a harder question than it answers: an
explanation that lives inside a live system is now something else that can break, and it
breaks in a way nobody sees. A page that fails to load announces itself. A diagram that
has quietly lost a caption does not.

## The requirement

A new tab in the shell, carrying a course of short illustrated explainers — one per
standard the system rests on, plus the arrangements around them that no standard covers.
Each one had to be completable in about a minute, be reachable by a link that opens it at
a particular step, be readable with colour removed and without a mouse, and — the
constraint that shaped everything — read nothing at all from the running system. It had
to render identically whether the machinery behind it was turning or stopped.

That last one is not modesty. An explainer that reads live state is a component, with a
component's failure modes, and it would fail exactly when someone was being shown around.

## The options considered

The inertness could have been a rule in a document. It is instead two checks that fail
differently, because during the build it became clear that one of them could not see
half of what it was for. A source scan catches an import of the transport layer; it
cannot catch a call that arrives by a route it does not model. So there is also a test
that mounts the tab with a client whose every method throws, and walks all sixty-nine
steps. Each is watched failing against a planted fault that only the other one misses.

Colour was the same shape of problem. The drawings are designed in colour and have to
survive greyscale, and "we will check" is the kind of promise that decays. Instead a
category — an observation, a computed field, the coarse archive — is a colour *together
with* a texture and a line weight, drawn from one table, so a distinction that exists
only in hue cannot be written down. A gate rejects a colour literal in a drawing.

Then the interesting part. Two claims were left to visual review because they seemed
like the sort of thing only eyes can judge: that every drawing is legible with colour
removed, and that every step can be reached by keyboard. A script walks the course
headless, shooting each explainer twice and pressing nothing but Tab and Enter. Since it
was already visiting every step, it also measured every text label against the frame it
was drawn in.

It found twenty-seven labels, across nine of the eleven explainers, drawn outside their
own frames and silently cut off. Text set inside a drawing does not wrap: a sentence
runs past the edge and the rest is simply not painted. Every one of those diagrams
looked finished. Several had been looked at.

The fix was structural rather than twenty-seven repairs — a drawing keeps its labels and
says its sentences in ordinary text beside itself, where they wrap — but the finding is
the measurement, not the fix.

## The demo

The course runs in the browser with nothing behind it. Open it at the step that took the
longest to get right:

[Open it at the SensorThings walk](https://deepbluecltd.github.io/drogna/instances/claude-background-tab-spec-6zalbi/#/view/background/sensorthings/6)

Every step has its own address, so that link opens that step and not the tab's front
door. The rail on the left shows each explainer's length before you start it.

![The Background tab of the drogna shell, open at the sixth step of the SensorThings
explainer. A numbered rail down the left lists eleven explainers with their lengths, with
SensorThings highlighted. The main area shows the step's prose beside a diagram: four
boxes joined top to bottom by a solid line — Observation, Datastream, Thing, Location —
with Location outlined in orange and carrying a filled dot, reading "46.1°N, 11.2°W at
09:14". Two further boxes, ObservedProperty and Sensor, hang off Datastream on dashed
lines to the right. Beneath the diagram a line of text reads "Observation — 8.4 °C at
09:14. On the walk from the reading to where the platform was", followed by a request
path. The previous and next controls sit pinned at the foot of the
panel.](../assets/111-labels-a-diagram-has-dropped.png)

The image comes from the same capture mechanism the checks use, and carries a sidecar
recording the run, the revision, the viewport and the browser. Its clock entry reads
*not read* — which is the tab's whole claim about itself, written down by the thing that
took the picture.

## What is now known

A drawing that has lost a label is indistinguishable from a correct one, and reviewing it
does not help, because what is missing is not on the screen to be noticed. The same
turned out to be true of a layout: the panel had a rule that replaced a diagram too
narrow to read with a statement of the width it needed, that rule had tests, the tests
passed, and the behaviour had never once occurred. It was measuring an element that its
own measurement removed from the page, so it flickered and settled on drawing. Every test
of it supplied the width directly and none ran the measuring path.

Both were found the same way: by planting the fault a check was written for and watching
whether the check noticed. Neither was found by looking. The reviewable claim and the
measurable one are different claims, and it is worth knowing which sort you have.
