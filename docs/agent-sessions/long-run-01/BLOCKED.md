# long-run-01 — blocked

Append-only, newest last. See issue #19 for the entry shape.

## 2026-08-27T22:35 — the browser client cannot authenticate to the broker by either layer

**Where**: `client/src/transport/mqtt.ts:74-90`, `config/local/client.json`,
`config/local/proxy.json`; touches `specs/007-observation-path` T027–T028 and
`specs/013-security-proxy`

**What I found**: With the mount fault above fixed and all six containers healthy, the
client still reports "Not connected to the broker" and "0 of 18 components heard from".
The proxy is no longer the whole story — it now answers 401 uncleared and reaches upstream
when cleared — so I followed the client's own path.

There are two authentication layers between the page and the broker, and the client
satisfies neither.

*HTTP Basic, at the proxy.* `config/local/client.json` sets the broker URL to
`ws://localhost:8081/ctl`, which is the proxy, and the rendered copy under
`deploy/.runtime/` carries the same string with nothing injected — `_with_secret` rewrites
a URL that names a role, and this one names none. The proxy declares `auth_basic` at
server level, deliberately, so that a location added later cannot omit it. A browser's
`WebSocket` constructor takes a URL and a subprotocol list and nothing else: there is no
header parameter, and mqtt.js in a browser builds on that same constructor. So no page
served from `:8080` can present a Basic credential to `:8081` — not because the credential
is missing, but because the API has nowhere to put it. Credentials cached by the browser
for a prior HTTP request would not help either: `:8080` and `:8081` are different origins.

*MQTT, at the broker.* Past the proxy the broker runs `allow_anonymous false` with an ACL
per role, and there is a `HARNESS_BROKER_SECRET_VIEWER` generated for exactly this reader.
`openControlSubscription` builds its options from `clientId`, `clean`, `keepalive` and
`reconnectPeriod`. It passes no `username` and no `password`, and the URL carries no
userinfo for mqtt.js to take them from. So even with the proxy open, the CONNECT would be
refused.

Neither is a bug in the sense of a line being wrong. Both halves are internally coherent
and each is documented where it sits. What is missing is the join, and the join is a
design decision with at least three defensible answers:

- put the viewer role's credential into the rendered `client.json` as URL userinfo, so
  mqtt.js sends an MQTT-level CONNECT that the broker's ACL evaluates. That satisfies the
  broker, and leaves the proxy's Basic layer still unsatisfiable from a browser;
- exempt `/ctl` from `auth_basic` and let the broker's own ACL be the boundary for the
  control namespace, which is a real weakening of the proxy's "binary clearance" property
  in ADR-0001 and must not be done by an unattended agent on its own judgement;
- serve the client *from* the proxy, so page and socket share an origin and one Basic
  challenge covers both. That is the largest change and probably the intended shape, but
  `deployment.json` publishes the client on `:8080` and advertises it as `public_url`,
  so it is a topology change, not a configuration one.

**Options**: guess one and implement it, or stop and ask. Guessing costs a plausible
change to the exposure boundary made without a person, which is the one area where a
reversible-option-under-a-stated-assumption is not reversible enough: ADR-0001's whole
subject is that clearance here is binary, and any of the three answers above trades some
of it away. `specs/013-security-proxy` is also the feature `CLAUDE.md` names as having
finished with its task list untouched, so I do not trust `tasks.md` to tell me which of
the three was intended.

**What I did**: logged it and moved on to the rest of item 1. I fixed the mount fault,
which is unambiguous and is a precondition for any of the three, and left the join alone.
Nothing in the client, the proxy config or the ADRs has been edited.

**What I need from you**: should the control WebSocket be authenticated by the broker's
own ACL with the viewer credential rendered into `client.json` (A), or should the client
be served from behind the proxy so that one Basic challenge covers page and socket alike
(B)? A is a small change I can make in an hour; B is a topology change and I would want
your word before touching `public_url`.
