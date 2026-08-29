# Spike: how the HTTP carriageway is intercepted, and where the components run

**Date:** 29 August 2026
**Question:** the first spike of the rewrite (plan §3): is the seam's HTTP carriageway
a Service Worker or a fetch-level shim? And, delegated by SRD-v2 §10: do the
in-browser components run as Web Workers or as scheduled modules?

## Prior evidence

V1 already ran this experiment once. `spikes/service-worker/` (archived) proved a
Service Worker *can* serve the query layer from a static deployment — every mechanism
worked — and found the cost in the same breath: **a first visit has a window with no
query layer**, because a worker controls a page only after registration and (without
`clients.claim()` games) after a reload. The spike's fix changed startup sequencing.
That race is real nondeterminism at the exact moment V2 cares most about — a fresh
seeded run on every visit, provisioned through the components' own paths before the
first paint claims anything.

Weighed here rather than re-run: the V1 finding is dated, measured, and about the same
browser machinery; what changed between V1 and V2 (no server at all) makes the race
strictly worse, since there is no origin server to answer during the window.

## Finding: fetch-level shim

A fetch-level shim — `globalThis.fetch` patched once at bootstrap, before any
component or panel runs — has none of the lifecycle: no registration race, no update
cycle, no second copy of the code running in a scope vitest cannot reach. The
properties that matter are preserved exactly:

- **The front-end still issues real `fetch` calls against relative URLs.** No caller
  can tell the shim from a network (Constitution XI); removing the shim *is* the V3
  swap.
- **Wire shape is enforced, not simulated**: the shim's boundary serialises request
  and response bodies to bytes, so nothing object-shaped crosses.
- **It is testable where the tests are**: the same shim installs under vitest, so
  AT-05's recorded-corpus suite exercises the identical code path CI runs.

What is given up: the devtools network tab does not show the intercepted requests
(the reviewability argument for the worker). Judged acceptable because the Messages
panel and the seam's own traffic log are the harness's first-class observability, and
a Service Worker can still be adopted later without touching a single caller — the
callers only know `fetch`.

## Finding: scheduled modules on the main thread, not Workers

AT-04's strong form is byte-identical **lockstep** replay. Web Workers communicate by
asynchronous message passing whose interleaving the browser schedules; determinism
would have to be rebuilt on top with a lockstep protocol per worker, which is exactly
the complexity V2 exists to shed. As scheduled modules behind the seam's transport
interface, delivery order is the broker's subscription order, synchronous and
reproducible. The components remain genuine programs — own configuration, own seed
stream, own heartbeat, stoppable — and the transport interface is the honest port: a
V3 backend (or a worker pool, if profiling ever demands one) replaces the transport,
not the components.

Decisions recorded as ADR-0029 (interception) and ADR-0030 (scheduling and the
composition root).
