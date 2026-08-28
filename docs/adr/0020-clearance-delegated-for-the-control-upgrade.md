# ADR-0020: Clearance is binary for the released prefix and delegated for the control upgrade

**Status:** Accepted
**Date:** 28 August 2026 — drafted; accepted the same day
**Amends:** ADR-0001 (Accepted, 26 August 2026), which remains in force for everything else
**Requirements:** SRD FR-39, FR-40, FR-41; ADR-0008; Constitution X
**Raised by:** long-run-01, `docs/agent-sessions/long-run-01/BLOCKED.md`, 2026-08-27T22:35 and 23:45

> This record was **proposed** on the day it was drafted, because the change it describes
> had been made and ought not to sit in the tree undocumented. It is now **accepted**. The
> owner answered the question directly on 28 August 2026 — the record of the answer is in
> `docs/architecture/delivery-plan.md`, "Decisions taken, 28 August 2026", and the session
> entry it settles is `docs/agent-sessions/long-run-01/DECISIONS.md`, 2026-08-28T08:30. The
> answer was that **the control namespace is public-read by design**: binary clearance for
> the released prefix, delegation to the broker's access control list for the control
> upgrade, and the viewer credential a non-secret rather than a leak. What follows from that
> for the credential is written out below, under "The viewer credential is not a secret",
> because the consequence is the part most easily misread as an accident.
>
> The alternative this record's closing section said should be re-argued first — serving the
> client from behind the proxy — was re-argued and declined, on the same terms it was
> declined on the night: it moves `public_url` and changes what the destination advertises,
> which is a topology change, and the boundary it would buy is one the decision has now
> found it does not want. It remains available and remains free of architectural cost, so
> it stays recorded below rather than being struck out.

## Context

ADR-0001 says clearance at the proxy is binary: a caller is cleared for the released data
or for none of it, declared once at server level so that a location added later cannot
quietly omit it. That property is what makes path-prefix policy sufficient, and it is
sound for every location it was written about — all of which are ordinary HTTP requests
for released data.

The control upgrade is not one of those. ADR-0008 puts the browser's MQTT-over-WebSocket
connection behind this same proxy, at `/ctl`, and that is the only route into the control
namespace because the broker's WebSocket listener is not published to the host.

A browser cannot satisfy HTTP Basic on that route. The `WebSocket` constructor takes a URL
and a subprotocol list and has nowhere to put a header; mqtt.js in a browser builds on that
same constructor. This is a property of the platform, not of the configuration, so no
arrangement of credentials makes the previous shape reachable. The observable form was
`GET /ctl status=101 rule=allow-upgrade` never being reached at all — `status=401`, refused
at the access phase, once per reconnect period, for the whole life of the component. The
client had a correct viewer credential and no way to present it.

Three answers were available. Rendering the viewer credential into the URL was tried on
`main` and was **not** sufficient — it satisfies the broker and leaves the proxy's layer
still unsatisfiable, which removed it from the list rather than resolving anything. Serving
the client from behind the proxy would give page and socket one origin and one challenge,
and is probably the intended long-run shape, but it moves `public_url` and is a topology
change. The third is this one.

## Decision

`auth_basic` is declared once at server level, as before, and exactly one location is
permitted to opt out of it: the control upgrade. The released prefix is untouched and
remains binary at this proxy.

Clearance for the control namespace is delegated to the broker. That is not an absence of
clearance: the broker runs `allow_anonymous false`, the client connects as `drogna_viewer`
with a secret the render injects, and the ACL makes that identity subscribe-only on `ctl/`
with no rule granting `obs/` — asserted at a running broker in
`tests/integration/test_topic_isolation.py`.

## What this costs, stated plainly

1. **The single-declaration property is weakened in kind, not only in degree.** ADR-0001's
   argument is that one declaration cannot be forgotten. Once one location may opt out, the
   guard becomes "one declaration and one *named* opt-out", which is what
   `test_the_clearance_is_declared_once_at_server_level` now enforces. A second opt-out, or
   an opt-out anywhere but the upgrade, fails that test. This is weaker than a rule nobody
   may bend, and stronger than a count.

2. **The viewer credential is now readable by anyone who can load the page.** The browser
   has to fetch its own configuration, so the rendered document is served world-readable
   from `:8080`, which sits outside the proxy. What that identity can reach is unchanged —
   the broker's ACL decides it — but the credential is no longer behind the clearance, and
   under the previous shape it would have been. This follows from the decision rather than
   adding to it, and it is the part most worth arguing about. It was argued, and the answer
   is the next section: the credential is not a secret, and the control namespace it opens
   is public-read on purpose.

3. **Two boundaries now exist where ADR-0001 described one.** A reader of the proxy
   configuration alone no longer sees the whole policy for `/ctl`; they must also read
   `deploy/broker/acl`. ADR-0001's value was partly that one file was the answer.

## The viewer credential is not a secret

This is the part of the decision most easily misread as an accident, so it is written out
rather than left to be inferred from the paragraph above.

`config/<destination>/client.json` names the role `drogna_viewer`. The deploy-time render in
`deploy/lib/render_credentials.py` writes a copy carrying that role's secret, and
`deploy/images/client-config.sh` serves that copy to the browser from `:8080`, which is
outside the proxy. So the secret is world-readable, by design and not by oversight, and
**this is the intended boundary rather than a defect to be closed**. Anyone reporting it as
a leak should be pointed here first.

What makes it a non-secret is not the value's obscurity. It is what the value can do:

- **It can subscribe to `ctl/` and to nothing else.** `deploy/broker/acl` grants
  `drogna_viewer` subscription on `ctl/#`, no rule granting `obs/`, and — the row is worth
  reading twice — *publish on nothing at all*. Holding it, a caller may watch the control
  namespace and may not write a single message into it. There is no observation, no
  released collection and no forecast field behind it.
- **The control namespace is public-read by design.** Heartbeats, telemetry indicators,
  clock samples, divergence and run notices: that is what `ctl/` carries, and it is the
  material the component shell draws. The SRD's clearance requirement (FR-39 to FR-41) is a
  statement about *released data*, and the control namespace is not released data. Nothing
  in the SRD asks for the heartbeat of a synthetic clock to be confidential.
- **Compromising it costs nothing that clearance was protecting.** ADR-0001's "the
  credential is a single point of compromise" is about the released set's clearance, which
  is a different credential, on a different route, unchanged by this record. Rotating the
  viewer secret is a re-render; nothing downstream holds a per-caller identity.

Two things follow, and both are obligations rather than observations.

**The viewer role may never gain a permission.** Its safety is entirely the access control
list, so a rule granting it `obs/`, or any publish rule at all, would turn a documented
non-secret into a real one. `tests/integration/test_topic_isolation.py` asserts the negative
at a running broker rather than by reading the list back, which is the form that would
notice.

**A credential that *is* a secret must never be rendered into this document.** The served
`client.json` is a public artefact. The rule is not "keep the file tidy"; it is that the
world-readable render is the client's configuration channel, and anything placed in it is
published. The proxy's own clearance — the one ADR-0001 is about — is not in it and must
not be put there.

## Alternatives, and why not now

**Serve the client from behind the proxy.** One origin, one Basic challenge, page and
socket alike, and ADR-0001 intact. Rejected *for tonight* rather than on merit: it moves
`public_url` off `:8080` and changes what the destination advertises, which is a topology
change and was explicitly withheld. This record said that the alternative should be
re-argued before it was taken from proposed to accepted, because it is the one that costs
nothing architecturally. It was, on acceptance, and it was declined again: the owner's
answer was to leave `public_url` alone and to treat the control namespace as public-read,
which is a decision about what the boundary should be and not a deferral. It stays here,
unstruck, because it is still the shape to reach for if the control namespace ever stops
being public.

**Leave `/ctl` unreachable.** Honest, and it is what the previous state amounted to. It
also means the component shell can never light, which makes C-18 undemonstrable and several
acceptance criteria unobservable.

## If this were reversed

This is no longer a live option — the decision is accepted — but the cost of undoing it is
part of the record, and it is small: remove `auth_basic off;` from
`proxy/templates/upgrade-location.conf.template`, restore
`test_the_clearance_is_declared_once_at_server_level` to its count of one, and the boundary
is exactly as ADR-0001 describes. The client-configuration fix in
`deploy/images/client-config.sh` is independent of this decision and should stay either
way: the browser being served a configuration naming no role was a plain fault.
