# ADR-0029: the HTTP seam is a fetch-level shim, not a Service Worker

**Status:** Accepted
**Date:** 29 August 2026
**Feature:** 101 (foundations & shell)

## Context

The seam's HTTP carriageway (SRD-v2 FR-02, Constitution XI): the front-end issues real
`fetch` requests against relative URLs from configuration; in V2 something in the
browser answers them with genuine EDR and SensorThings JSON; in V3 the same URLs reach
a server. The plan names this the first spike of the rewrite and offers two shapes:
a Service Worker (real requests, visible in the devtools network tab) or a fetch-level
shim.

## Decision

A **fetch-level shim**: `globalThis.fetch` is patched exactly once, at the composition
root, before any component or panel runs. Requests whose path falls under the
configured API prefix are serialised to wire shape, passed through the release-gate
component and answered by the in-browser query components; everything else goes to the
real `fetch`. Removing the installation call is the V3 swap — no caller changes,
because no caller knows anything but `fetch` and a relative URL.

Grounds (`spikes/seam-interception/FINDING.md`): V1's archived service-worker spike
proved the worker path *works* and measured its cost — a first-visit window with no
query layer, a registration/claim race that changes startup sequencing. V2 provisions
a fresh seeded run through the components' own paths on every visit; a nondeterministic
window at exactly that moment is the wrong trade. The shim also runs identically under
vitest, so the seam-traffic conformance suite (AT-05) exercises the same code path CI
runs, and the wire-shape rule is enforced by serialising bodies to bytes at the
boundary rather than trusted.

## Consequences

- Intercepted requests do not appear in the devtools network tab; the Messages panel
  and the seam's traffic log are the first-class observability instead.
- A Service Worker remains adoptable later without touching any caller, should the
  devtools visibility ever be worth the lifecycle.
- The shim is seam code (`app/src/seam/`), visible to both sides; the route table and
  release gate it dispatches into are backend components handed to it at the
  composition root.
