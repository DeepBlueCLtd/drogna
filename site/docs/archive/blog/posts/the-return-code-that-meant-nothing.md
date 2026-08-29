---
date: 2026-08-28 09:30:00
categories:
  - Feature
slug: the-return-code-that-meant-nothing
feature: specs/007-observation-path
description: >-
  A component said it had announced itself and the library agreed. The message
  had been refused at the broker, and the only display whose purpose is to show
  what is alive had been telling the truth about a lie all along.
---

# The return code that meant nothing

How do you know a component in a distributed system is running? You ask it to say so.
Every few seconds each part of the system publishes a small message — I am this
component, this is the time I think it is, this is my status — and something downstream
lights a box for each message that arrives. A box that stops lighting is a component
that stopped.

The design's whole value is that the box lights only when a message genuinely arrived.
There is no manual override, no configuration flag saying "assume this one is fine". If
the box is dark, nothing was heard; if it is lit, something was.

One of those boxes could never light, for the whole life of the component, and the
component reported success every time.

<!-- more -->

## The rule that was missing

The broker's access control list is the substance of the separation between two kinds of
traffic: measurements on one branch of the topic tree, internal control events on the
other. Sensors publish measurements. They were granted the measurement branch and, by a
separate argued exception, permission to *read* the clock — because a component that
cannot receive simulation time can only pace itself on the host clock, which this project
forbids outright.

Heartbeats are control events. They go on the control branch. The sensor role had no rule
for them, and the broker denies by default, which is the correct default and is exactly
why an omission is a denial rather than a hole.

So the sensors published a heartbeat, the broker refused it, and the box stayed dark. The
component was not failing. It was being silenced by a rule that had been written on purpose
and had not been read against the messages the component actually sends.

## Why nobody noticed for so long

Here is the part worth carrying away. The refusal was **silent at the publisher**.

The broker denies the publish and writes it to its log. The client library's return code
is still zero, because the message was accepted locally and handed onward — the library
has done its job, and the acknowledgement that would have carried the refusal is not part
of the fire-and-forget path. The component therefore believed it had announced itself
while nothing had heard anything.

Watched directly, with the rule removed again to confirm the shape of the failure:

```text
grant removed -> sensor heartbeat: REFUSED
client library reported rc = 0 (0 == success) -- this is the silence
```

`rc = 0` is not a lie by the library. It answers a different question from the one anybody
reading it thinks they are asking. It says the message left; it says nothing about whether
it arrived, and there is no cheap way for it to say anything else.

This was found the first time a sensor and a real broker ran together outside a test that
supplied its own rules. Every test on the sensor passed, because those tests stood up a
broker with permissive rules — the rules are configuration, and configuration is what a
test usually replaces.

## What did not work

The obvious fix was resisted for a while, and the objection was written down in the rules
file at some length, which is why it deserves to be taken seriously rather than
dismissed:

> A sensor that could publish on the control branch could forge a heartbeat, a divergence
> event or a run request, so that is refused here rather than by convention in the
> sensor's source: a convention is not a control.

That is a good argument and its premise is true. A heartbeat names its own component in
its payload, so any identity that can publish one can claim to be any component.

It was wrong anyway, and for a reason that had nothing to do with sensors. Twenty lines
below, the control role — shared by nine components on one credential — carries read and
write on the *entire* control branch. Every one of those nine could already publish a
heartbeat claiming to be a sensor. The exclusion bought no property the file actually
held. It excluded one identity from a forgery the same file had already accepted from
nine.

Against a property that was not being held, the cost was a permanent false negative in
the one display whose entire purpose is to show what is alive.

## What is now known

The sensor role gained exactly one named topic in the write direction. Not the branch: the
topic. The test that matters is not that the sensor is refused the control branch — it is
that the sensor is granted precisely one control topic and refused every other one by
name.

Two things generalise beyond this component.

**A success code from a client library is a statement about the library, not about the
system.** Anywhere a message can be refused after your process has let go of it, "it
worked" locally and "it arrived" are different facts, and only one of them is the one you
care about.

**A restriction is only worth what the rest of the file makes it worth.** A rule that
protects a property nothing else in the same file protects is not defence in depth; it is
a cost with no matching benefit, and it will be paid by whichever part of the system the
rule happens to fall on.
