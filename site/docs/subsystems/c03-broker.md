---
title: C-03 Broker
---

# C-03 Broker (MQTT)

!!! warning "Status: partly built"

    - **Code:** `deploy/broker/` — `mosquitto.conf`, the `acl` that is the substance of
      the separation, and the two-broker fallback under `deploy/broker/two-broker/`; the
      service is declared in `deploy/compose.yaml`
    - **Delivered by:** `specs/007-observation-path`
    - **Covered by:** `tests/integration/test_topic_isolation.py`, which attempts each
      forbidden publish and subscription against a running broker and asserts the
      refusal. It needs a container runtime and skips loudly without one
    - **Not present:** refused attempts are logged at the broker, but no count of them
      reaches the telemetry topic, so a component being denied is visible only to
      somebody reading the broker's log

    The credential half of this entry used to say the render step did not exist. It does:
    `deploy/lib/render_credentials.py` writes the broker's password file and each
    component's configuration from one set of per-role secrets, `deploy/env.template`
    declares a secret per role, and the tracked configurations name their role in the
    broker URL. Corrected 28 August 2026 — **ADR-0016**.

**Responsibility:** pub/sub transport with namespaced topics.
**Owns the failure mode of:** cross-contamination of flows.

## What it does

One MQTT broker carries two kinds of traffic on two separate topic namespaces:
observations under one prefix, internal control events under another. Sensors
are confined by access control list to the observation branch and cannot publish
control traffic at all.

The one exception the rules had to argue for is that a sensor may *read* the
clock sample, and nothing else on the control branch. A component with no
simulation time can only pace itself on the host clock, which is forbidden
outright, so the property tested is not that a sensor cannot subscribe to the
control namespace: it is that subscribing to it delivers the time and nothing
else.

## The browser's role, and why its password is public

The page in a browser is a fifth identity here, and the only one whose credential
is readable by anyone who can load the page. That is deliberate rather than
accidental, and it is safe for one reason: the role may **subscribe to the control
namespace and publish nothing at all**. No observation branch, no write of any
kind. The control namespace carries heartbeats, clock samples, telemetry
indicators and run notices — material that is public-read by design — and the
clearance protecting released data is a different credential on a different route,
which is never placed in the document the browser fetches.

The safety of that arrangement is entirely in the access control list, so the rule
that keeps it true is that this role never gains a permission. The isolation test
asserts the negative at a running broker rather than by reading the list back,
which is the form that would notice if it did. **ADR-0001** and its amendment
**ADR-0020** are the argument, in the
[decision records](../decisions/adr/index.md).

## Why one broker and not two

Two brokers would enforce the separation physically and would double the
operational surface for a system whose whole point is to be runnable from a
clean checkout with one command. The separation that actually matters here is
the one that prevents a misconfigured sensor from announcing a completed model
run, and an access control list achieves that.

Physical separation onto a second broker remains a documented fallback that
requires configuration change only — which is a claim the topic-namespace
discipline has to keep true. Once control traffic starts leaking into the
observation namespace because it was convenient, the fallback stops being a
configuration change and becomes a rewrite.

## What it is not

It is not a queue with delivery guarantees the rest of the system leans on, and
it is not the source of time. A broker-assigned timestamp used as truth is a
wall-clock dependency wearing a disguise, and is prohibited for that reason.

**Requirements:** FR-14 to FR-16. **Feature:** 007.
