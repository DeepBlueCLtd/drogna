# ADR-0025: The operator plane sits behind the clearance, and the clock joins it there

**Status:** Accepted
**Date:** 28 August 2026
**Requirements:** SRD FR-74, FR-10; ADR-0020, ADR-0021; the one-door topology decision of 28 August (`spikes/map-to-ocean/FINDING.md`)
**Raised by:** SRD §5.12, which owes this record before the operator plane is built. The decision was taken by the owner on 28 August 2026, by structured interview; this record is the argument and the bound.

## Context

The operator plane (FR-67 to FR-76) is a REST surface that reports each component's
state and dispatches commands — clock control, trigger actions, and container
lifecycle. FR-74 as first written said the plane's path prefix is exposed "with
clearance delegated, as the control-namespace WebSocket path already is".

That analogy imports ADR-0020's conclusion without its premise. `/ctl` was exempted
from the proxy's Basic clearance for one narrow reason: a browser's `WebSocket`
constructor has nowhere to put a credential, so a cleared upgrade path is
unsatisfiable from a page no matter who holds the secret. A REST surface has no such
problem — and the topology decision of 28 August removes the last trace of it. With
the page served *through* the proxy, every `fetch` from the page to the plane is
same-origin, and the browser attaches the Basic credential it already presented to
load the page. The delegation would purchase nothing for the client.

What it would cost is concrete. On the droplet the proxy is the one thing bound to
`0.0.0.0`. A plane path exempt from clearance there is an unauthenticated surface on
the public internet whose commands include stopping containers. The viewer credential
was accepted as public (ADR-0020's amendment) because it grants subscribe-only reads
on a synthetic control namespace; a restart command is not a read, and "no real
security" (ADR-0023) has meant *no secrets where nothing needs protecting*, never
*no door where commands are dispatched*.

The clock's control surface has the same shape and a worse history: it is exposed
directly beside the boundary today, answering any origin (ADR-0021), because when it
was built there was no path to it through the proxy. FR-74 already intends to end
that.

## Decision

**The operator plane's path prefix sits behind the proxy's server-level Basic
clearance, exactly like the released prefix.** No `auth_basic` opt-out is added for
it. The proxy configuration keeps the property `harness.conf.template` defends —
clearance declared once at server level, with exactly one opt-out, which is and
remains the control upgrade location.

**The clock's control surface is routed through the proxy under the same clearance**,
ending its direct exposure. ADR-0021's any-origin answer becomes an internal detail
rather than a public surface once nothing but the proxy reaches the clock; it is not
revoked, because the capture mechanisms and the local profile may still address the
clock directly inside the deployment.

**SRD FR-74 is corrected in step** (v0.6): "with clearance delegated" becomes
"behind the boundary's own clearance", and the sentence carries the reason the /ctl
analogy does not transfer.

## Alternatives rejected

- **Open, as FR-74 first said.** Anyone who can reach the droplet's address could
  stop the demonstration's containers with one request, recoverable only from the
  host. The delegation was written by analogy to /ctl, and the constitution's own
  warning about exemption-by-analogy applies to boundaries as well as clocks.
- **Reads open, commands cleared.** Finer-grained, but it introduces the
  per-location clearance exception the proxy template exists to refuse, and once the
  page is behind the door there is no consumer left who needs the open reads.

## Consequences

- The plane needs no authentication of its own, which is what FR-74 always intended:
  the boundary's one credential covers the page, the data, and now the plane.
- A capture or script driving the plane presents the same credential the page does —
  the same `httpCredentials` seam the one-door change already threads through
  feature 016's mechanisms.
- Where only the boundary is published (the droplet), the speed control works for
  the first time, because the clock is finally reachable at the address the page is
  served from — FR-10's promise held by FR-74's routing.
- The exemption count on the proxy stays at one, and the test that asserts it
  (`test_the_clearance_is_declared_once_at_server_level`) needs no widening.
