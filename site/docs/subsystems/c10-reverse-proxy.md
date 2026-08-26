---
title: C-10 Reverse proxy
---

# C-10 Reverse proxy

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** TLS, authentication, path policy.
**Owns the failure mode of:** accidental exposure.

## What it does

nginx in front of everything, terminating TLS, authenticating, and applying a
path policy that is default-deny. Released collections sit under a dedicated
path prefix. Everything not under that prefix is refused.

## Why default-deny is the whole design

Because the failure this component owns is not "someone broke in". It is
"someone added a collection and it was public before anyone noticed". An
allow-list of forbidden paths fails open every time something new is added; a
default-deny prefix fails closed, and exposure becomes an act rather than an
oversight.

Access is binary: cleared for all the data or none of it. There is no per-field
redaction, and that is recorded as a decision rather than left as an assumption,
because softening it to tiered access would change the architecture materially
rather than adding a feature to it.

## The two leaks that are tested, not reviewed

- **Provenance metadata in exported files.** A NetCDF export carries attributes.
  Attributes carry paths, usernames, software versions and run identifiers, and
  reviewing them by eye works until the day it does not.
- **The shape of the freshly updated region.** The area a model has just
  refreshed traces where sampling has been happening. That shape is inferable
  from a response even when every value in it is permitted, which makes it the
  kind of leak that cannot be found by looking at field names.

**Requirements:** FR-39 to FR-42. **Feature:** 013.
