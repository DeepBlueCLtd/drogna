---
title: C-10 Reverse proxy
---

# C-10 Reverse proxy

!!! success "Status: built"

    - **Code:** `proxy/` — `policy.py` for path normalisation, `render_config.py`, and
      the nginx templates it renders; the two leakage checks are `tests/leakage/`, run
      as a gate by `scripts/check_leakage.py`
    - **Delivered by:** `specs/013-security-proxy`
    - **Covered by:** `proxy/tests/`, `tests/integration/test_request_matrix.py`,
      `tests/unit/test_client_reaches_the_proxy.py`, and the leakage corpus under
      `tests/leakage/fixtures/`, which carries controls so a run reporting nothing has
      been shown to be capable of reporting something
    - **Not present:** the second of the two leaks below is scored against a measurement
      geometry that no component in the harness yet writes. The contract for it exists
      in `contracts/schemas/run-manifest.schema.json` and the gate refuses loudly rather
      than defaulting when it is missing, but today only the committed fixtures supply
      one

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
