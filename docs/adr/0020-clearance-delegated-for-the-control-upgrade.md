# ADR-0020: Clearance is binary for the released prefix and delegated for the control upgrade

**Status:** Proposed — drafted by an agent session, not accepted, not to be treated as decided
**Date:** 28 August 2026
**Amends:** ADR-0001 (Accepted, 26 August 2026), which remains in force for everything else
**Requirements:** SRD FR-39, FR-40, FR-41; ADR-0008; Constitution X
**Raised by:** long-run-01, `docs/agent-sessions/long-run-01/BLOCKED.md`, 2026-08-27T22:35 and 23:45

> This record is **proposed**. It exists because the change it describes has been made and
> ought not to sit in the tree undocumented. It has not been through the review ADR-0001's
> own closing section requires, and the fact that the implementation already exists is not
> an argument that this is settled.

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
   adding to it, and it is the part most worth arguing about.

3. **Two boundaries now exist where ADR-0001 described one.** A reader of the proxy
   configuration alone no longer sees the whole policy for `/ctl`; they must also read
   `deploy/broker/acl`. ADR-0001's value was partly that one file was the answer.

## Alternatives, and why not now

**Serve the client from behind the proxy.** One origin, one Basic challenge, page and
socket alike, and ADR-0001 intact. Rejected *for tonight* rather than on merit: it moves
`public_url` off `:8080` and changes what the destination advertises, which is a topology
change and was explicitly withheld. If this ADR is ever taken from proposed to accepted,
this alternative should be re-argued first, because it is the one that costs nothing
architecturally.

**Leave `/ctl` unreachable.** Honest, and it is what the previous state amounted to. It
also means the component shell can never light, which makes C-18 undemonstrable and several
acceptance criteria unobservable.

## If this is rejected

The revert is small: remove `auth_basic off;` from
`proxy/templates/upgrade-location.conf.template`, restore
`test_the_clearance_is_declared_once_at_server_level` to its count of one, and the boundary
is exactly as ADR-0001 describes. The client-configuration fix in
`deploy/images/client-config.sh` is independent of this decision and should stay either
way: the browser being served a configuration naming no role was a plain fault.
