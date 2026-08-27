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

## 2026-08-27T23:45 — update: main settled the MQTT half; the HTTP Basic half stands

**Where**: as above, plus `config/*/client.json` on `origin/main`

**What I found**: I branched from `2b72634` and worked from that. While I was working, PR
#20 landed `1a7d66a`, "Name the viewer role in the client's broker URL, which main is
failing without" — so the second of the two layers in the entry above was being fixed by
somebody else at roughly the same time I was writing it up. I rebased onto it.

That also explains a failure I had to check before trusting: `uv run pytest` on my branch
reported `test_every_broker_url_names_a_role_or_is_a_listed_exception` red for
`droplet/client, local/client`. It was not mine, and it was not `main` being broken
either — it was `main` at the commit I branched from, whose CI run *did* fail, fixed an
hour later by the commit above. Worth stating plainly because a red test on a branch that
did not cause it is exactly the kind of thing an unattended run rationalises.

So the MQTT half is settled. The rendered `client.json` now carries
`ws://drogna_viewer:<secret>@localhost:8081/ctl`, with the secret injected by the render
and absent from every tracked file, and mqtt.js takes its username and password from
there.

**The HTTP Basic half is unchanged, and I have direct evidence for it now rather than an
argument.** With the stack up, the client rendered with its viewer credential, and the
mount fault fixed, the client still reports "0 of 18 components heard from" — and the
proxy's own access log says why:

    172.18.0.1 GET /ctl status=401 rule=allow-upgrade

The request reaches the right location, under the right rule, and is refused at the
access phase before the upgrade happens. The MQTT credential in the URL is not the
credential being asked for; nginx wants HTTP Basic, and the browser's `WebSocket`
constructor has nowhere to put one.

**What I did**: appended this rather than editing the entry above, since these files are
append-only and the first entry was true when written. Option A in that entry — render
the viewer credential into the URL — has now happened on its own and was *not* sufficient,
which is worth knowing: it removes A from the list rather than resolving the question.
What remains is B, serving the client from behind the proxy so page and socket share an
origin, or exempting `/ctl` from `auth_basic` and letting the broker's ACL be the boundary
for the control namespace. Both change the exposure boundary; neither is mine.

**What I need from you**: the question narrows to one. Should `/ctl` keep `auth_basic`
— in which case the client has to be served from behind the proxy, and `public_url` moves
off `:8080` — or should the control namespace be authenticated by the broker's ACL alone,
with ADR-0001 amended to say that clearance is binary for the released prefix and
delegated for the control upgrade?

## 2026-08-28T01:30 — building `services/features` needs `stores/` inside the image, which is not a local change

**Where**: `deploy/images/python-service.Dockerfile`, root `pyproject.toml`,
`deploy/compose.yaml`; follows the DECISIONS entry of 01:10

**What I found**: Having established *why* `services/features` has to exist — the feature
store's provisioning needs `harness_core` and a destination is promised a bare interpreter
— I went to build it, and found the reason it was never built.

The one-shot would apply what `stores/features/provision.py` emits. It cannot reach it.
`deploy/images/python-service.Dockerfile` copies `pyproject.toml`, `uv.lock`, `libs/` and
`services/`, and nothing else. `stores/` is not copied — it is not excluded either, it is
simply never named — so nothing under it exists in any Python service image. And
`stores/features/` is not a workspace package: `[tool.uv.workspace] members` is
`["libs/*", "services/*"]`, so `uv sync --package harness-features` would not install it
even if it were on the context.

Every way out is wider than the task:

- **`COPY stores ./stores` in the shared Dockerfile.** One line, and it changes the image
  every Python service is built from — eleven of them carrying store provisioning code they
  have no business holding. It is also the file `CLAUDE.md` warns about twice: a `COPY`
  added later does not update the per-image ignore file, and that has cost this repository
  two rounds already.
- **Add `stores/*` to the workspace members.** Changes the shape of the workspace for
  everything that resolves it, and root `pyproject.toml` is one of the append-only shared
  files.
- **Move the seeded content generation into `libs/`,** which is where `CLAUDE.md` says a
  shape belongs once it has consumers across a boundary — and it names two previous cases.
  Probably the right answer, and it is a refactor of a component with passing integration
  tests, done unattended, at one in the morning, with nobody to check the judgement.

**Options**: pick one and do it, or stop. The issue authorises "building it", and I do not
think that authorisation was written with these three in view — the note it rests on says
the missing piece is "a few lines of `psql`", which is true of the observation store and
not of this one.

**What I did**: stopped, and moved to item 3. The half that was unambiguous is committed
and working: the observation store is provisioned by `deploy/seed.d/010-observations.sh`,
watched converging and watched refusing. `deploy/compose.yaml` is untouched, so the `full`
profile is exactly as broken as it was — no worse, and now with a reason on record rather
than a missing directory.

**What I need from you**: which of the three? My recommendation is the third — move the
content generation into `libs/harness_features` and leave `stores/features/provision.py` as
a thin CLI over it, because it is the only one that does not put store code into ten
unrelated images or reshape the workspace, and because it is the move `CLAUDE.md` already
prescribes for exactly this situation. But it is a refactor across a boundary and I would
rather you said so than assume it.
