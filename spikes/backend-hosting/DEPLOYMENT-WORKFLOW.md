# Plan: a published client, an API backend, and deployment on main

**Date**: 27 August 2026
**Follows**: [FINDING.md](FINDING.md), which settled where the backend lives.
**Supersedes**: a per-pull-request environment design, dropped the same day. The reason and
the findings from it that outlive it are at the end.
**Status**: a proposal to be argued with. If the shape is agreed it becomes `specs/017-*`,
and that is the durable artefact, not this.

---

## The model

Stated by the repository's owner:

1. **The backend deploys only on push to `main`.** No environment per pull request.
2. **A feature needing both halves is two pull requests, backend first.** The front end is
   then developed against a backend that is already live.
3. **Combined development happens locally**, where a session can update a container in place.
4. **The client is a static single-page application published to GitHub Pages**, connecting
   to the droplet. The droplet becomes an API backend rather than the thing that serves the
   page.
5. **Security is not a real concern.** drogna is a toy; the deployment does not need to
   defend anything.
6. **Later**: open OGC API-EDR querying to that page, and probably model triggers from it.

Points 4 and 5 change more than they look like they do — one of them for the better, one of
them into a wall.

---

## The wall: a page on GitHub Pages cannot speak `http`

**This is the one thing that has to be settled before anything else is built.**

`http://deepbluecltd.github.io/drogna/` answers `301` to `https://deepbluecltd.github.io/drogna/`
— checked, not assumed. GitHub Pages enforces HTTPS on `github.io`, and there is no setting
that turns it off. So the published page is served over HTTPS, always.

A page served over HTTPS may not issue `fetch`, `XMLHttpRequest` or WebSocket requests to
`http://` or `ws://`. That is **active mixed content**, and every current browser blocks it
outright: no warning to click through, no user override. It is not a security policy this
project can decline to care about, because it is not enforced at this project's end.

So requirement 4, as written — *static pages in gh-pages connecting via http to the
backend* — cannot be built. The fork is:

| | What it needs | What it costs |
|---|---|---|
| **A. Backend over HTTPS** (recommended) | A domain name and a certificate on the droplet | The certificate work FINDING.md already identified, now on the critical path rather than at the end of it |
| **B. Serve the client from the droplet too**, as `deploy/compose.yaml` already provides for | Nothing new at all | The page is same-origin with the API, so no certificate, no CORS and no mixed content — and no GitHub Pages |

**A is the recommendation**, because it is what was asked for and because publishing the
client independently of the backend fits requirement 2 exactly: a front-end pull request
merges, Pages redeploys, and the droplet is not involved. But it means **the domain name is
now the blocking item**, and none is held. B is the zero-work fallback and is worth keeping
in mind as the thing to do if the domain takes weeks.

There may be a third option worth ten minutes of somebody's time: browsers treat
`http://localhost` as a trustworthy origin, and some permit an HTTPS page to reach it. If
that holds in the browsers that matter here, a published client could drive a **local** stack
over plain `http` with no certificate anywhere — which would serve requirement 3 rather
neatly. Chrome and Firefox differ from Safari on this and the behaviour has moved more than
once, so it is a thing to test in the browsers in use, not a thing to design around yet.

---

## What requirement 5 buys, and the one thing it must not take with it

Security not being a real concern removes the awkward part of the previous plan. In
`proxy/templates/harness.conf.template` the credential is two lines — `auth_basic` and
`auth_basic_user_file` — and dropping them means the published page needs no credential, and
CORS can be answered with a plain `Access-Control-Allow-Origin` rather than the credentialed
form with an origin allowlist. My earlier advice to route front-end development through a
Vite dev proxy *rather than* add CORS is withdrawn: with the client on another origin
permanently, CORS is the architecture, not a developer's shortcut. The dev proxy remains
useful for local work and is no longer load-bearing.

**But the proxy is doing two jobs, and only one of them is security.**

- **Job one: who may ask.** The credential, the realm, the 401. This is the part requirement
  5 makes unnecessary, and it can go.
- **Job two: what may be answered.** The default-deny `location /`, the released prefix, the
  collections and variables named in `proxy.released`, the `try_files`-not-`return`
  reasoning that keeps the released set from being enumerable. That is not security
  scaffolding — it is **the behaviour drogna exists to demonstrate**: Constitution X,
  ADR-0001, ADR-0013, and the whole of 013-security-proxy and 014-offload-export. A harness
  that stopped enforcing its release policy would have deleted a feature, not relaxed a
  setting.

So: drop the credential, keep the release policy, and expect an ADR amendment for it —
ADR-0001 describes a boundary that is about to change deliberately, and this repository's
bar is that a deliberate change to a hard-to-reverse decision is recorded rather than
absorbed.

---

## The client's configuration document, which now resolves neatly

The previous version of this plan reported this as a blocker. Under the published-client
model it becomes the mechanism, so it is worth restating with its fix.

`client/src/config/runtime.ts` fetches one relative `./config.json`, validates it against
`contracts/schemas/config.client.schema.json`, and takes every endpoint from it — broker,
clock, query. Right, and built. What is missing is a document that names anything other than
a developer's own machine: `client/public/config.json` names `localhost:8081` and
`localhost:8090`, which are `config/local/deployment.json`'s published proxy and clock ports.
Compose passes `HARNESS_CONFIG_PATH_CLIENT` and the schema exists, but **neither destination
has a `client.json`**, so the variable renders empty and the schema describes a file nobody
writes. Checked before calling it a gap: `specs/003` ticks T007 for the client *fetching* the
document; nothing in 003 or 005 covers anything *serving* one.

Under this model the fix is cleaner than it was, because the document describes **the backend
the client talks to**, which is exactly what a destination knows:

1. Add `config/<destination>/client.json` at both destinations. `config/droplet/client.json`
   names the droplet's public endpoints; `config/local/client.json` names the local ones.
   Parity then makes it impossible for a third destination to forget it.
2. **The Pages build ships `config/droplet/client.json` as its `config.json`.** One document,
   one source of truth, no duplication between the bundle and the deployment.
3. `client/public/config.json` becomes openly a development fixture and says so.
4. Add a gate: a service whose Compose entry names `HARNESS_CONFIG_PATH_<X>` has a
   configuration file at every destination, or is listed as deliberately having none. One
   appended line in `scripts/gates.registry`. **Watch it fail on `client.json` before
   writing `client.json`.**

The failure mode this avoids is worth naming, because it is silent. The document is *valid*
— it fetches and it validates — so the client adopts it and opens transports against
whatever it names. Point it at `localhost` from a published page and nothing arrives, no
heartbeat arrives, and every component stays dark: correct under Constitution VII, and
indistinguishable from a healthy client in front of a dead backend. There is no error to
read.

---

## Publishing the client to `gh-pages`

Three mechanical things, none hard, all easy to get wrong.

**One branch, one publisher.** `pages.yml` publishes with `ghp-import --force`, which
replaces the whole branch. A second workflow force-pushing the client would silently delete
the site and vice versa, and whichever ran last would look fine. So the client is built
*inside* `pages.yml` and placed under the site build directory — one artefact, one push.

**The no-external-resources gate needs a decision, not a bypass.**
`site/tools/check_no_external_resources.py` is deliberately syntactic: it reads `src`,
`<link href>`, `url()` and `@import` in the built output. A runtime `fetch` to the droplet is
invisible to it, so a published SPA calling the backend **passes the gate while contradicting
the sentence at the top of the file** — "the published site must issue no request to a host
outside its own origin". That is this repository's own recurring failure: a check that reports
clean on the thing it was written to describe. Either the rule genuinely now admits one
origin — drogna's own backend, named in configuration — and the docstring and the check are
amended to say so and to enforce it, or the client does not go on Pages. Amending it is
fine; leaving it silently untrue is not.

**PR-01 is a discretion question here, not a security one.** The repository is public but
unadvertised, and the site declines indexing. Shipping `config/droplet/client.json` inside a
published bundle puts the backend's hostname on a public page. Requirement 5 says security is
not a concern, and that is accepted — but "unadvertised" is a separate property from
"secured", and this is the moment it stops holding. Worth deciding on purpose.

---

## Deployment on push to `main`

Small, and unchanged by the above.

- A workflow on `push` to `main`, in a concurrency group that does **not** cancel in
  progress: two merges in quick succession should deploy in order rather than race.
- It runs `scripts/run_droplet.sh` over SSH — already the one command, already converging.
- It waits for health and fails loudly with `report_unhealthy`'s output rather than
  reporting a green deploy of a broken droplet.
- **Images come from a registry**, not from a build on the droplet. Under deploy-on-main this
  decides whether a merge takes one minute or fifteen on a two-CPU box.

Note that a front-end merge now deploys to Pages and a backend merge deploys to the droplet,
and they are independent. That is the point of the split, and it means the two halves can
skew: a published client can be newer than the backend it talks to. Requirement 2's ordering
is what prevents that mattering — the backend lands first — and it is worth writing down
because nothing enforces it.

### What deploy-on-main costs

A backend change is no longer seen running before it merges; `main` is the first place it
runs. Three things make that tolerable and should be built rather than assumed: the local
destination is the exercised path and `scripts/run_local.sh` is what a reviewer or a session
uses to see a change running; the deploy reports its own failure; and rollback is checking
out the previous commit and running the same command, which deterministic seeding makes
safe. Rehearse that once on purpose.

---

## Combined development locally

Mostly present. `scripts/run_local.sh` is the one exercised path, and `up.sh` converges over
a running stack. The missing narrow case is rebuilding **one** service: `common.sh` already
exposes a `compose()` bound to the rendered environment, and `up.sh` already preflights only
services that are not running, so a thin `scripts/reload.sh <service> [destination]` running
`compose up --detach --build <service>` is the whole of it, leaving the seeding record alone.

---

## Opening EDR, and model triggers

Both are release-policy decisions expressed in one file, which is the design working.

**EDR querying** is the released prefix that already exists. Opening it is dropping the
credential and answering CORS; the collections and variables that may be asked for stay
exactly as `proxy.released` names them.

**Model triggers** are a third location alongside `/released` and the `/ctl` upgrade, and
they are a genuine addition rather than a relaxation: a trigger is a write, and nothing in
the released surface writes today. Two things to take deliberately when it arrives — which
control surfaces are reachable from a public page, and that the clock's control route is
currently loopback-only at the droplet, so a trigger has to be proxied rather than exposed.
The client already has the shape for it in `controls/rateRequest.ts`.

---

## The order to build it in

1. **Get a domain name.** Everything downstream of the mixed-content wall waits on it, and
   it is the only item here that cannot be done by writing code.
2. **A certificate on the droplet**, per FINDING.md — one host, so certbot is the simple case.
3. **`config/<destination>/client.json`, and the gate that would have caught its absence.**
4. **Drop the credential; add CORS; keep the release policy.** With an ADR amendment.
5. **Images built in CI and pushed to a registry.**
6. **The deploy-on-`main` workflow**, its credential, and its health report.
7. **Publish the client from `pages.yml`**, with the external-origin gate amended to say what
   it now means.
8. **`scripts/reload.sh`**, and rehearse a rollback once.

**The prerequisite has not moved**: `deploy/droplet/` has still never been run, and
`deploy/README.md` says so. Everything above assumes somebody did that first and corrected
the paragraph.

---

## What was dropped, and why

A design for **one environment per pull request** — a generated destination per number, a
front door with a wildcard certificate, a capacity cap and a reaper — was written and
superseded by the model at the top. Not a rejected idea but an unnecessary one: sequencing
the two halves removes the problem it solved. Three findings from it are facts about the
repository rather than about that design, and are kept:

- **One environment file per checkout, not per destination.** `env_path()` in
  `deploy/lib/render_env.py` takes only the repository root and `common.sh` pins
  `deploy/.env`, so two destinations cannot be up on one host at once — the second
  overwrites the first's values, database password included. `deploy/env.template` already
  documents the fix as the intended behaviour.
- **Publishing cannot be switched off.** Probed with `docker compose config`: an empty
  `ports` value fails with `invalid proto:`, and parity forces all seven `network.publish`
  keys at every destination.
- **A generated destination is visible to `compare_all()`**, which walks every directory
  under `config/`.

---

## Open questions

1. **Which domain?** Now blocking rather than open, and none is held.
2. **Does the `client` service stay in the Compose file** once the client is published
   elsewhere? It is still the right thing for the local destination and for anyone without
   the published page, so probably yes — but the `shell` profile then means "serve a copy
   locally" rather than "this is how the client is served", and the deployment manifest in
   `deploy/README.md` should say which.
3. **Is `scripts/run_local.sh` the whole of pre-merge backend verification?** I think it
   should be. It is what replaces watching a change run before merging it, so it is worth
   deciding rather than arriving at.
