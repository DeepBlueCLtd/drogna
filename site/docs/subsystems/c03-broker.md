---
title: C-03 Broker
---

# C-03 Broker (MQTT)

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** pub/sub transport with namespaced topics.
**Owns the failure mode of:** cross-contamination of flows.

## What it does

One MQTT broker carries two kinds of traffic on two separate topic namespaces:
observations under one prefix, internal control events under another. Sensors
are confined by access control list to the observation branch and cannot publish
control traffic at all.

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
