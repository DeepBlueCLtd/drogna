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
    - **Not present:** the credential file the broker authenticates against is produced
      by a command written out in `deploy/broker/README.md` and by the test harness, not
      by the deployment's own render step — no per-role secret exists in
      `deploy/env.template`, and the tracked component configurations carry a broker URL
      with no role in it. Refused attempts are logged at the broker but no count of them
      reaches the telemetry topic

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
