# ADR-0015: A sensor may announce itself, because the alternative was a display that lied

**Status:** Accepted
**Date:** 27 August 2026
**Requirements:** SRD FR-14, FR-004, FR-45 to FR-49; Constitution VII
**Supersedes in part:** the sensor block of `deploy/broker/acl` as written by 007
**Related:** ADR-0012 (sensors may read the clock and nothing else), ADR-0006

## Context

`deploy/broker/acl` gave the sensor role two rules: `topic write obs/#` and
`topic read ctl/clock`. Heartbeats are published on `ctl/heartbeat`, which was in neither.

So the sensors published a heartbeat and the broker refused it. C-04 could not light its box
in the browser client however it was wired — not because it was failing, but because the one
message by which a component announces it is alive was denied at the broker.

The refusal was also **silent**. Mosquitto denies the publish and logs it; the client
library's local return code is still zero, because the message was accepted locally and
handed on. The component therefore believed it had announced itself while nothing had heard
anything. Watched directly, with the rule removed:

    grant removed -> sensor heartbeat: REFUSED
    client library reported rc = 0 (0 == success) -- this is the silence

This was found while wiring every component to a real broker, which is the first time
anything in this repository had a sensor and a broker running together outside a test that
supplied its own rules.

## The objection the file used to make

The sensor block argued the exclusion at length, and the argument was not a bad one:

> A sensor that could publish on ctl/ could forge a heartbeat, a divergence event or a run
> request, so that is refused here rather than by convention in the sensor's source: a
> convention is not a control.

A heartbeat names its own component in its payload, so any role that can publish one can
claim to be any component. That is true, and `libs/harness_core/heartbeat.py` confirms it:
the component identifier is a field the publisher fills in.

**But the property it protects is not held anywhere else in the same file.** Twenty lines
below, the control role carries `topic readwrite ctl/#` — nine components, sharing one
credential, every one of them already able to publish a heartbeat claiming to be a sensor.
The sensor exclusion bought no property the access control list actually holds. It excluded
one role from a forgery the file had already accepted from nine.

Against that, the cost was concrete: a permanent false negative in the one display whose
entire purpose is that a box lights only when a message from that component genuinely
arrived. The client has no manual override and no enabled flag by design (Constitution VII),
so there was no way to show C-04 as running short of changing this rule.

## Decision

The sensor role gains `topic write ctl/heartbeat`. One named topic, in the write direction,
for the same reason ADR-0012 gave it one named topic in the read direction: the component
cannot do its job without it, and the alternative is a component that is structurally
incapable of being seen.

The branch stays closed otherwise. `ctl/divergence`, `ctl/run-request`, `ctl/run-started`,
`ctl/run-published`, `ctl/plan` and `ctl/telemetry` remain refused to this role, each named
individually in `tests/integration/test_topic_isolation.py` rather than covered by a
wildcard, so a rule that widened later would be reported by the topic it let through.

This is now the second exception to FR-14's wording for this role, and the pattern is worth
naming: FR-14 was written as "sensors do not touch the control namespace", and twice the
system has needed exactly one topic of it — the clock to have simulation time at all, and
the heartbeat to be visible at all. Neither exception weakens the flow separation FR-14
exists for, which is that observation traffic and control traffic do not contaminate each
other. A third would be worth stopping over.

## The alternatives rejected

**Per-component heartbeat topics** — `ctl/heartbeat/<role>`, with each role scoped to its
own — is the principled fix, and it would make "a component can only announce itself" a
control rather than a convention. It was rejected here on scope, not on merit. Credentials
are per role rather than per instance, so ten sensors share one identity and the scoping is
coarser than it looks; and the change reaches `libs/harness_core/heartbeat.py`, every
component that publishes, and the browser client's fixed subscription list. That is a
redesign of the control plane's topic namespace, which is not a thing to do inside a broker
rule. If the forgery risk is ever to be closed properly, this is how, and it should be
closed for all ten roles at once rather than for the one that happened to be excluded.

**Accepting that C-04 stays dark** was rejected because the display would carry a permanent
untruth about a component that is running correctly, and the display's honesty is the whole
of what feature 003 was for.

**Fixing only the silence** — leaving the refusal and making the component learn it had been
denied — was rejected as insufficient on its own, though the silence remains a real problem
and is not solved by this record. A component still cannot tell a refused publish from an
accepted one. What has changed is that the refusal no longer happens on the path that
matters, so nothing is currently misreporting itself.

## What holds the decision

- `tests/integration/test_topic_isolation.py::test_a_sensor_may_announce_itself_and_nothing_more`
  asserts the grant and each remaining refusal by name, against a running broker.
- `services/sensors/tests/test_broker_wiring.py::test_the_sensor_announces_itself_and_the_broker_lets_it`
  runs the component's own entry point against a broker started from this repository's
  tracked `mosquitto.conf` and `acl`, and asserts the heartbeat arrives.

Both were watched in both directions before this record was written: with the rule in place
the heartbeat is delivered and `ctl/divergence` and `ctl/run-request` are refused; with the
rule removed the heartbeat is refused and the publishing client still reports success.
