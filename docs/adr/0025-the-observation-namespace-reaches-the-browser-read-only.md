# ADR-0025: The observation namespace reaches the browser read-only, under an explicit role

**Status:** Accepted
**Date:** 28 August 2026
**Extends:** ADR-0008 (the upgrade location), ADR-0020 (clearance delegated for the
control upgrade, and the non-secret argument this record re-makes)
**Requirements:** feature 022 FR-002; Constitution VII, X
**Raised by:** feature 022's specification, which recorded the ADR as owed at the plan phase

## Context

ADR-0008 routed only the control namespace to the browser and said in as many words that
observation traffic is not proxied to it: the client reads observations through the query
layer, and a viewer that could subscribe to `obs/#` "would be reading the write path over
a connection the proxy does not inspect per message". The existing transport documents
the same boundary, and ADR-0020's non-secret argument for the viewer credential leans on
it — what makes that credential publishable is that it can subscribe to `ctl/` and to
nothing else.

Feature 022 draws the declared topic tree lit by live traffic. A tree that can hear only
the control namespace shows the observation branch — the branch the whole
sensor-to-decision story starts on — permanently cold beside a live `ctl/`, which is the
one thing Constitution VII forbids a display to do: claim silence where there is traffic.
The panel needs to *hear* `obs/`, and needs no other new capability: it never publishes,
and observations still reach every consumer that wants the data (rather than the fact of
its arrival) through the query layer as before.

Three shapes were weighed in the interview that produced the specification.

**Restrict the tree to the client's current grant.** No new role, no new exposure; the
tree draws `obs/` from the artefact and lights only `ctl/`. Rejected: the panel's stated
purpose is that every measured output is visibly an addressable trigger point. A tree
whose observation branch never lights misrepresents the running system, and a caption
explaining the blindness would be the display documenting its own untruth.

**A server-side digest relay.** A service subscribes to both namespaces and pushes a
digest to the browser, keeping the browser's broker grant narrow. Rejected on the same
cost ADR-0008 rejected the relay: a nineteenth component with its own liveness, failure
mode and box, standing between the display and the traffic it exists to show genuinely
arriving — and the digest is a second place the meaning of "arrival" could quietly drift.

**An explicit new role.** The browser gains a second identity: read on both namespaces,
write on nothing. Chosen, and FR-002 records it in the specification.

## Decision

The access control list gains `drogna_observer`: `read obs/#`, `read ctl/#`, and no
write rule of any kind. The client's broker URL at both destinations names it, which is
the declaration the topology derivation reads (`scripts/scan_topology.py`), so the
artefact, the ACL and the deployed configuration agree by construction and the drift
gate holds them together. The render's `ROLE_SECRETS` table gains the matching entry, so
the secret is generated, hashed into the broker's password file and substituted into the
served URL by the existing machinery.

`drogna_viewer` is unchanged and keeps ADR-0020's obligations. It remains the narrow
identity for anything that needs only the control namespace — the two-broker fallback
tests use it, and any future page with no business hearing observations should — and it
may never gain a permission.

The panel's connection goes through the same upgrade location as the shell's. The
location is still spelled `/ctl`: it is a path at the proxy, not a statement of what the
ACL grants over it, and renaming it is a proxy-configuration change this decision does
not need. Recorded here so nobody reads the name as a boundary.

## The observer credential is not a secret

The served client document is world-readable (ADR-0020), so the observer's secret is
published the day it is rendered. ADR-0020's argument is therefore re-made over the wider
grant, not inherited by analogy:

- **What the credential can do is watch.** Read `obs/#`, read `ctl/#`, publish nothing
  at all — asserted at a running broker in
  `tests/integration/test_topic_isolation.py`, refusals and grants both, not read back
  from the file.
- **What it can watch is the synthetic feeds of a demonstration harness.** The
  observation branch carries the deliberately fake measurements the landing page
  disclaims. The clearance the SRD requires (FR-39 to FR-41) is about the *released*
  products, which sit behind the proxy's credential on a different route, untouched by
  this record.
- **ADR-0008's objection is answered, not waved off.** The hazard it named was the write
  path being *read* over a connection the proxy does not inspect per message. The
  connection still cannot write — the broker's ACL, the enforced layer, refuses it — and
  what reading it exposes is the previous item. The per-message boundary remains the
  broker's, exactly as ADR-0008 said it must be tested.

Two obligations transfer with the argument. **The observer role may never gain a
permission** — a single write rule would turn a documented non-secret into a real one,
and the integration test asserts the negative where it is enforced. **Nothing that is a
secret may be rendered into the served client document** — unchanged from ADR-0020, and
the more load-bearing now that the document carries a credential with a wider read.

## Consequences

- The topic tree lights from genuinely received traffic on both namespaces
  (Constitution VII), with no relay and no widened existing role.
- The topology artefact now records the role, the client's identity against it, and —
  from the same feature's derivation-chain change — the concrete observation topics the
  deployed sensor configuration names, held to agreement across destinations by the
  scanner's existing rule. The artefact is thereby coupled to the deployed sensor
  configuration; a destination that diverges stops the scan rather than being resolved
  silently.
- The raw observation feed is as public as the control feed, at every destination that
  serves the page. If the observation namespace ever stops being publishable-by-design,
  the shape to reach for is the one ADR-0020 keeps unstruck: serve the page behind the
  proxy's clearance, one door, one challenge — and this role's credential moves behind it
  with the rest of the document.
- A future consumer wanting observation *data* still belongs on the query layer; this
  role serves surfaces that show *arrival*. A second surface reusing `drogna_observer`
  inherits this record's obligations with it.
