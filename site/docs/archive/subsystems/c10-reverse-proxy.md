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

## The one route that is deliberately open, and the credential that is not a secret

There is exactly one exception, it is named, and it is a decision rather than a
gap: the WebSocket upgrade the browser uses to reach the control namespace.

A browser cannot present a user name and password on a WebSocket handshake. The
constructor takes a URL and a list of subprotocols and has nowhere to put a
header, which is a property of the platform rather than of this configuration —
so no arrangement of credentials makes the authenticated shape reachable. The
observable form of that was the shell showing every component dark for the whole
life of the page while the boundary refused each reconnect.

So authentication is declared once for the whole server and exactly one location
opts out of it: that upgrade. Clearance there is delegated rather than dropped.
The broker refuses anonymous clients, the page connects as a named subscribe-only
role, and the broker's access control list decides what that role may receive.
The released prefix is untouched and stays binary. The guard against this
becoming a habit is narrow by construction — one declaration and one *named*
opt-out, which must be the upgrade — and a test fails if a second appears
anywhere.

**The credential the page carries is not a secret, and that is the intended
design.** The browser has to fetch its own configuration, so the document
carrying that role's password is served world-readable, outside the boundary.
What the role can do is the reason this costs nothing: it may subscribe to the
control namespace and it may publish nothing at all — no observations, no
released collection, no write of any kind. The control namespace carries
heartbeats, clock samples, telemetry indicators and run notices, and it is
public-read by design; the clearance this component exists to enforce is a
different credential on a different route, and it is never placed in the served
configuration. The reasoning in full is **ADR-0001** and its amendment
**ADR-0020**, in the [decision records](../../decisions/index.md).

## The two leaks that are tested, not reviewed

- **Provenance metadata in exported files.** A NetCDF export carries attributes.
  Attributes carry paths, usernames, software versions and run identifiers, and
  reviewing them by eye works until the day it does not.
- **The shape of the freshly updated region.** The area a model has just
  refreshed traces where sampling has been happening. That shape is inferable
  from a response even when every value in it is permitted, which makes it the
  kind of leak that cannot be found by looking at field names.

**Requirements:** FR-39 to FR-42. **Feature:** 013.
