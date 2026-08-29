> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0001: Binary access rather than tiered or per-field

**Status:** Accepted, amended by ADR-0020
**Date:** 26 August 2026
**Amended by:** [ADR-0020](0020-clearance-delegated-for-the-control-upgrade.md) (Accepted,
28 August 2026), for the control upgrade at `/ctl` and for nothing else
**Requirements:** SRD FR-39, FR-40, FR-41, FR-42; Constitution X; PR-03
**Raised by:** feature 013's specification

## Context

SRD FR-39 says access is all-or-nothing: a caller is cleared for the released data or for
none of it. FR-40 then says path policy decides what is reachable, and FR-41 says
everything not explicitly released is refused. The three are usually read as one
requirement about exposure. They are not. FR-39 is a statement about *callers*, and it is
the assumption the other two are built on.

Here is why. If clearance were tiered — a caller cleared for the temperature field but not
the uncertainty field, or for a coarse grid but not a fine one — then a request for a
released path would no longer have one correct answer. The proxy would have to decide what
*this* caller may see of *this* response, and a coverage response is a single body carrying
many variables at many cells. Deciding per caller means opening the body, understanding
the format, removing what this tier may not have, and writing it back out.

That is a different component. It would have to parse NetCDF and CoverageJSON and whatever
the query layer emits next; it would have to be correct about every field in every
response, forever, because a field it failed to remove is the disclosure; and it would
become the one place in the harness where a released artefact is *edited* rather than
forwarded, which means the artefact a downstream consumer holds is no longer the artefact
the leakage tests were run against. FR-42's two leakage gates run over what the offload
packager produced. A body-editing proxy makes them gates over something else.

There is a second cost that is easy to miss. Tiered access needs a user model — who is in
which tier, how a tier is granted, how it is revoked — and that model is state. The proxy
holds no state today. It is nginx, a rendered configuration and a credential file.

drogna is a demonstration harness with one deployment, one viewer and a released set of a
handful of collections. Nothing in the SRD asks for tiers. The question is therefore not
which is better in general, but whether the assumption should be written down or left to
be discovered later by somebody who assumed the other thing.

Two options were weighed.

**Tiered access with response filtering.** A caller's tier decides which variables and
which regions of a released artefact reach them, applied at the boundary. Rejected: it
requires the proxy to inspect and rewrite response bodies, which makes the boundary
format-aware and makes it the author of what leaves rather than the gate over it; it
requires a user model the harness has no other use for; and it separates the artefact
released from the artefact tested, which is the property FR-42's gates depend on.

**Binary clearance.** One credential set per deployment. Holding it means cleared for
every released collection in full; not holding it means cleared for nothing. Accepted.

## Decision

Access is **binary**. A deployment issues one clearance. A caller either holds it, in
which case every released collection answers in full and byte-identically to what upstream
produced, or holds nothing, in which case the boundary says the same thing about every
path.

Three things follow directly and are part of this decision rather than consequences of it.

- **The proxy never alters a response body.** No `sub_filter`, no per-field redaction, no
  `proxy_intercept_errors`. What upstream wrote is what the caller receives, or the caller
  receives nothing.
- **Withholding is done by not releasing, not by filtering.** A collection that must not
  leave the boundary is absent from `proxy.released.collections`, so the served
  configuration has no location for it at all. A variable that must not leave is absent
  from `proxy.released.variables`, and `tests/leakage/` is what holds that in place.
- **The uncleared caller learns nothing.** Because clearance is checked before any path is
  answered, the response to a released path, an unreleased path and a path that exists
  nowhere is one response. The released set is not enumerable by somebody holding nothing.

The mechanism is HTTP Basic over TLS against a credential file rendered at deploy time.
The mechanism is not the decision — a deployment could swap it for client certificates
without reopening this — but it is recorded here because binary clearance is what makes so
plain a mechanism sufficient.

### The amendment, and exactly what it does not touch

ADR-0020 amends this record for one location. The browser cannot satisfy HTTP Basic on a
WebSocket upgrade — the constructor has nowhere to put a header — so the control upgrade at
`/ctl` opts out of `auth_basic` and its clearance is delegated to the broker's access
control list instead. That amendment was accepted on 28 August 2026, and the decision behind
it is that **the control namespace is public-read by design**.

Everything above is unchanged for the released prefix, which is what this record was written
about. `/released` is still binary, still declared once at server level, still answers one
response to an uncleared caller whatever they asked for, and still forwards what upstream
wrote without editing it. The guard is narrowed rather than relaxed: one server-level
declaration and exactly one *named* opt-out, which must be the upgrade location, asserted by
`test_the_clearance_is_declared_once_at_server_level`.

One consequence is worth carrying here because it is read against this record and
misunderstood: the viewer credential in the served `client.json` is world-readable, and it
is **not a secret**. It grants subscription to `ctl/` and nothing else — no publish rule at
all, no `obs/`, no released collection — and the control namespace it opens is public by
design. The clearance this record is about is a different credential on a different route.
ADR-0020's "The viewer credential is not a secret" section is the argument in full.

## Consequences

- **Path-prefix policy becomes sufficient.** The proxy can decide from the normalised
  request path alone, which is what FR-40 assumes and what makes the whole of the boundary
  reviewable as a list of locations in one rendered file.
- **The proxy stays stateless and format-blind.** It holds no user model, parses no
  response body, and has no opinion about NetCDF or CoverageJSON. Swapping the query
  layer's output format is not a change here.
- **The released artefact is the tested artefact.** FR-42's provenance scan and
  updated-region test run over what the offload packager produced, and nothing edits it on
  the way out. If the boundary rewrote bodies, both gates would be measuring a file that
  is not the file anybody receives.
- **A colleague who should see less cannot be given less.** They are given nothing, or
  they are given everything released. That is a real limitation and it is the price of the
  three points above. In a harness with one deployment and one viewer it costs nothing; in
  a system with several audiences it would cost a great deal.
- **The credential is a single point of compromise.** There is one clearance, so losing it
  loses the released set. Rotating it is rewriting one file and re-rendering, and nothing
  downstream holds a per-caller identity that would have to be reissued.

### What would have to change if the assumption softened

If a later requirement asked for tiers, this is not a configuration change. It is a
different architecture, and specifically:

1. **A new component.** Response filtering cannot live in the proxy: nginx does not parse
   coverage formats, and a boundary that did would no longer be plumbing. A filtering
   service would sit between the proxy and the query layer, and the component count would
   change.
2. **A user model, and the state to hold it.** Tiers, membership, grant and revocation.
   The proxy holds no state today; something would have to.
3. **FR-42's gates would have to move.** They run over the artefact the offload packager
   produced. With a filter in the path, the artefact a consumer receives is produced by
   the filter, so the gates would have to run over the filter's output — per tier — which
   multiplies the leakage surface by the number of tiers rather than adding to it.
4. **The uniform-refusal property would have to be re-argued.** Today an uncleared caller
   cannot enumerate the released set because there is one negative answer. With tiers there
   are as many answers as tiers, and a caller in a low tier could enumerate the boundary of
   their own tier by inspection — which is a disclosure that does not exist today.
5. **This record would be superseded, not amended.** Constitution X names binary access as
   a principle and points here. Softening it is a constitution amendment with its own ADR,
   as the governance section requires.

The purpose of writing this down is that (1) to (4) are invisible from the outside. From
the outside, "add a tier" looks like a line in a configuration file.
