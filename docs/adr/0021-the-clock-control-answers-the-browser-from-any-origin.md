# ADR-0021: The clock's HTTP interface answers the browser from any origin

**Status:** Accepted (by the owner, 28 August 2026, by structured interview) — to be superseded by ADR-0025 when the clock's control surface is routed through the boundary (wave 7, lane I); it records the running system's shape until then
**Date:** 28 August 2026
**Requirements:** SRD FR-10, FR-49, FR-53; ADR-0009; client FR-012
**Raised by:** long-run-01, commit `e46bbf1`, which found the fault and deliberately left the
decision: "adding CORS to a control endpoint is a decision about what may reach it from
where, and this branch has already spent one such decision provisionally"

> This record is **proposed**, for the same reason ADR-0020 is: the change exists and ought
> not to sit in the tree undocumented, and the fact that it exists is not an argument that
> it is settled.

## Context

The clock's HTTP interface exists for exactly two things a subscription cannot do
(ADR-0009): setting the rate, and answering "what is the time now" for a component catching
up. FR-10 and FR-49 say the rate control belongs in the browser, and FR-53 depends on it:
a capture pins the clock to zero through the control the client offers a viewer.

The browser always arrives cross-origin. The page is served from the client's port (8080
locally) and the clock listens on its own (8090); a `fetch` carrying
`Content-Type: application/json` between two origins is preflighted, and the clock's
handler — built on the standard library's `BaseHTTPRequestHandler` — answered `OPTIONS`
with `501 Unsupported method` and no grant. The browser then never sends the POST and
reports only "Failed to fetch". **The rate control has therefore never worked from a
browser**, the one place it is for.

Nobody had seen it fail because nothing had ever exercised it. The capture workflow used to
serve the built client with `vite preview` and no clock behind it, so `pinIfAClockAnswers`
returned early on every run. The first time CI brought the real harness up
(PR #21), the pin was reached for the first time and found the door shut.

## Decision

The clock answers the preflight and states the grant on every response:
`Access-Control-Allow-Origin: *`, with `OPTIONS` answered `204` naming the methods and the
`Content-Type` header. No route, host or origin appears in the configuration for this,
because the grant does not vary: the interface either serves browsers or it does not.

## What this costs, stated plainly

CORS is a browser's rule about which *pages* may read which *servers*; it was never the
clock's authentication, because the clock has none. Before this change, any local process
could already command the clock with one `curl`; the bind address
(`127.0.0.1` in the local destination) was and remains the actual boundary.

What the wildcard adds is this: a page from **any** origin loaded in a viewer's browser —
including a hostile site the viewer happens to visit — may now send commands to any clock
its browser can reach, typically `localhost:8090` on the viewer's own machine. Before, the
failed preflight kept the command from being sent at all. The exposure is the ability to
pause or accelerate a local demonstration clock, on a harness whose data is synthetic and
says so; there is no credential to steal on this surface and no data to read that the
query layer does not already publish. If that judgement is wrong, the revert is two lines
in `services/clock/src/harness_clock/http.py` (the `do_OPTIONS` handler and the header in
`_write`), and the pair capture returns to refusing on an unpinnable clock — loudly, as
it did.

## Alternatives rejected

- **Reflecting a configured allowed origin.** The clock's configuration does not know the
  client's public URL, and teaching it one adds a cross-component coupling for a grant
  that would still, on a developer's machine, have to name `localhost` — indistinguishable
  in practice from the wildcard, at the price of a new way for two documents to disagree.
- **Serving the clock's control through the proxy, same-origin with the client.** Probably
  the right long-run shape, and the same topology change ADR-0020 declined to make
  provisionally: it moves the exposure boundary, which is a person's decision, not a
  CI fix.

## Consequence for the acknowledgement, recorded with it

With the preflight answered, a second fault surfaced behind the first, and the two ship
together because only together do they make the pin land. The client's rule (FR-012) is
that the rate in force arrives only as a `ctl/clock` sample, and a request is resolved by a
sample carrying a later tick. A rate of zero stops emission, so no later tick can ever
acknowledge the one rate a capture needs. The clock now answers a command that stops
emission by re-publishing the tick in force with the new rate and mode — one sample,
under the same lock as emission — and the client accepts a same-tick sample carrying
exactly the requested rate as the acknowledgement. The message schema's prose records the
repeat; tick values remain quantised and no tick is invented, so ADR-0009's replay
arithmetic is untouched.
