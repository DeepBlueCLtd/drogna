# Plan: one origin on the droplet, and deployment on main

**Date**: 27 August 2026
**Follows**: [FINDING.md](FINDING.md), which settled where the backend lives.
**Supersedes**: a per-pull-request environment design, and a published-to-Pages client
design. Both are recorded at the end with what survives them.
**Status**: a proposal to be argued with. If the shape is agreed it becomes `specs/017-*`,
and that is the durable artefact, not this.

---

## The model

1. **The backend deploys only on push to `main`.** No environment per pull request.
2. **A feature needing both halves is two pull requests, backend first.** The front end is
   developed against a backend that is already live.
3. **Combined development happens locally**, where a session can update a container in place.
4. **The client is served from the droplet**, behind the same proxy as the API, on one origin.
5. **Security is not a real concern.** drogna is a toy.
6. **Later**: open OGC API-EDR querying to the page, and probably model triggers from it.

## What point 4 removes

Everything the last two versions of this plan were blocked on:

| Gone | Because |
|---|---|
| The mixed-content wall | One origin. No `https` page fetching `http` anything. |
| CORS | Same origin. No preflight, no allowlist, no header on the boundary. |
| **A certificate as a precondition** | Plain `http` works end to end. TLS becomes polish. |
| **A domain name as the blocking item** | An IP address serves a toy perfectly well. |
| Publishing the client to `gh-pages` | And with it the `ghp-import --force` collision, and the amendment the no-external-resources gate would have needed. |

The domain and the certificate move from *critical path* to *when somebody feels like it*.
Nothing in this plan waits on either. Worth checking once that nothing the client uses needs
a secure context — WebGL and WebSockets do not — but `http` should be fine, at the price of
a browser calling it Not Secure, which for a demonstration harness that says it is fake on
its own landing page is not much of a price.

---

## "The Compose file already provides for it" is not the same as "it works"

Three things are missing, and the middle one is the only real design decision.

### 1. The proxy does not serve the client, and its schema says it will not

`config/droplet/proxy.json` names two upstreams, `query` and `control_websocket`. The
schema is `additionalProperties: false`, `required: [query, control_websocket]`, and
describes itself as *"the **two** upstreams this proxy is willing to reach"*. There is no
`client` upstream and no location that would reach one; the client container publishes to
loopback and nothing forwards to it.

So this is a deliberate widening of the exposure boundary's declared shape, touching
`proxy/schemas/config.proxy.schema.json`, `proxy/templates/harness.conf.template`,
`proxy/policy.py`, `proxy/render_config.py`, both destinations' `proxy.json`, and the
request matrix in `tests/integration/test_request_matrix.py`. That is the work in this plan.
It is not large, but it is the exposure boundary, and the proxy's README is emphatic that
policy lives in the template and nowhere else.

### 2. Where the SPA lives in the URL space

`location /` is, in the template's own words, *"the whole of the default deny (FR-001)"*.
Two ways to serve a page:

- **At `/`.** The client's nginx does `try_files $uri $uri/ /index.html`, so every
  unmatched path returns the application with 200. That is uniform — released, unreleased
  and nonexistent paths all answer identically, which is what FR-006 actually asks for —
  but it redefines the default deny from *refuse* to *serve the app*, and that is a change
  to a security property rather than a configuration choice.
- **Under a prefix**, alongside `/released` and `/ctl`. One admitted location, named in
  `proxy.json`, with `location /` untouched.

**Recommend the prefix.** It leaves alone the single line the whole default deny rests on,
and it puts serving the UI in the same idiom as everything else the boundary admits: the
proxy README's *"Releasing is an act"* becomes true of the page as well. If `/` is wanted
later, that is an argument to have on its own, with FR-001 and FR-006 in front of you.

> **Do not add a redirect from `/` to the prefix.** `return 301` executes in nginx's
> **rewrite** phase, which runs before the **access** phase where `auth_basic` lives — the
> exact trap the template documents at length in choosing `try_files` over `return 404`. A
> redirect at `/` answers before any credential is examined, and tells an uncleared caller
> that something is there. Harmless while the credential is gone; a silent reintroduction of
> the leak the moment anyone adds one back.

### 3. The bundle must not assume it is at the root

`client/vite.config.ts` sets no `base`, so assets emit as `/assets/…` — absolute, at the
root, straight into the deny. The obvious fix is to pass the prefix into the image as a
build argument from destination configuration. **There is a better one:**

```ts
base: "./"
```

Relative asset URLs. No build argument, no prefix baked into an image, no path written down
anywhere — the bundle works under any prefix, or none, and Constitution IV is satisfied
rather than negotiated with. It also makes the assets consistent with the one relative URL
the client already has, `./config.json`.

That is safe **only because the client has no path-based routing**, which I checked rather
than assumed: no `history`, `pushState`, `useNavigate` or router anywhere in `client/src`,
and no router in `package.json` — the dependencies are deck.gl, ajv, mqtt, react and
react-dom. `src/route/` is the *geographic* route (`RouteLayer`, `trajectoryQuery`), not URL
routing.

**Record the condition with the decision.** If path routing is ever added, a relative `base`
and a relative `./config.json` both break at depth — from `/app/some/route`, `./config.json`
resolves to `/app/some/config.json` — unless the document emits a `<base href>`. And
`deploy/images/client-nginx.conf.template` already carries `try_files … /index.html` with a
comment about "the client's own routes", anticipating routing that does not yet exist. So
this is a live trap with a note already written beside it, not a hypothetical.

---

## The client configuration document

Still needed, and still per destination. `broker.url` is `format: uri` and must be absolute —
the schema's own description says it is *"the WebSocket URL of the proxy's upgrade location.
Not the broker's own port: everything stays behind one reverse proxy under one policy"*,
which is exactly the topology this plan adopts.

1. Add `config/<destination>/client.json` at both destinations, against the schema that
   already exists in `contracts/schemas/`. Parity then stops a third destination forgetting it.
2. The client container mounts the destination configuration read-only already; its nginx
   serves that file at the bootstrap URL in preference to the bundled one.
3. `client/public/config.json` becomes openly a development fixture and says so — today it
   names `localhost:8081` and `localhost:8090`, which are `config/local/deployment.json`'s
   published proxy and clock.
4. **Add a gate**: a service whose Compose entry names `HARNESS_CONFIG_PATH_<X>` has a
   configuration file at every destination, or is listed as deliberately having none. One
   appended line in `scripts/gates.registry`. Watch it fail on `client.json` first.

Checked before calling this a gap rather than a decision: `specs/003` ticks T007 for the
client *fetching* the document; nothing in 003 or 005 covers anything *serving* one.

The failure it prevents is silent. The document is *valid*, so it is adopted and transports
open against whatever it names; point it at `localhost` from a served page and nothing
arrives, so nothing is heard from, so every component stays dark — correct under
Constitution VII and indistinguishable from a healthy client in front of a dead backend.

### The clock is not reachable from a browser, and that is survivable

The clock publishes on loopback and is not a proxy upstream, so `clock.snapshot` and
`clock.control` have no route in. Both are optional in the schema, deliberately: without
them the page waits for the first `ctl/clock` subscription sample instead of asking at
startup, and the rate control renders as unavailable **with a reason** rather than hiding
(FR-012, ADR-0009). So the served page works, with a blank moment at load and no speed
control.

That is the first thing to fix when point 6 arrives. **Model triggers make the clock a third
upstream**, and the schema's "two upstreams" sentence becomes three. Worth knowing now that
the trigger work and the clock work are the same change.

---

## Authentication is now a free choice, and I would keep it

Same-origin removes the credentialed-CORS complication that made the credential awkward.
So: `auth_basic` costs one browser prompt and preserves the site's *unadvertised* property
(PR-01); dropping it is two lines in the template.

Security is explicitly not a concern, so this is a discretion decision rather than a security
one — and **unadvertised** and **secured** are different properties. Keeping the credential
costs nothing under this topology and is the only thing that keeps a public address from
being a public demonstration. Recommend keeping it; drop it if handing the URL to somebody
becomes a nuisance.

Either way, the release policy stays. The default-deny location, the released prefix, the
collections and variables in `proxy.released`, the `try_files`-not-`return` reasoning: that
is Constitution X, ADR-0001 and ADR-0013, and it is the behaviour the harness exists to
demonstrate. Removing it would delete features 013 and 014 rather than relax a setting.

---

## Deployment on push to `main`

- A workflow on `push` to `main`, in a concurrency group that does **not** cancel in
  progress, so two merges deploy in order rather than race.
- It runs `scripts/run_droplet.sh` over SSH — already the one command, already converging.
- It waits for health and fails loudly with `report_unhealthy`'s output rather than
  reporting a green deploy of a broken droplet.
- **Images come from a registry.** Under deploy-on-main this decides whether a merge takes
  one minute or fifteen on a two-CPU box that is also serving the demonstration.

`profiles.active` at the droplet is `["core"]` today — the observation store alone. Serving
a page needs at least `core`, `query`, `edge` and `shell`, and lighting the components needs
`broker`, `foundation`, `observation` and `control` as well. That is values in
`config/droplet/deployment.json`, not code.

**What this costs**: a backend change is no longer seen running before it merges. Three
things make that tolerable and should be built rather than assumed — `scripts/run_local.sh`
is the exercised path and is what a reviewer or a session uses to see a change running; the
deploy reports its own failure; and rollback is checking out the previous commit and running
the same command, which deterministic seeding makes safe. Rehearse that once on purpose.

---

## Combined development locally

Mostly present. `run_local.sh` is the one exercised path and `up.sh` converges over a
running stack. The missing case is rebuilding **one** service: `common.sh` already exposes a
`compose()` bound to the rendered environment and `up.sh` already preflights only services
that are not running, so a thin `scripts/reload.sh <service> [destination]` running
`compose up --detach --build <service>` is the whole of it, leaving the seeding record alone.

---

## The order to build it in

1. **Bring the droplet up by hand**, and correct the paragraph in `deploy/README.md` that
   says nobody ever has. Unchanged, and still first.
2. **`config/<destination>/client.json`, and the gate that would have caught its absence.**
3. **`base: "./"` in `client/vite.config.ts`**, with a test asserting the built bundle
   contains no root-absolute asset path.
4. **The proxy's client upstream and its location** — schema, template, policy, both
   destinations, and request-matrix cases including "the deny still denies".
5. **`profiles.active` at the droplet.**
6. **Images built in CI and pushed to a registry.**
7. **The deploy-on-`main` workflow**, its credential, and its health report.
8. **`scripts/reload.sh`**, and rehearse a rollback once.
9. **Whenever wanted, not before**: a domain and a certificate; and the clock upstream, which
   arrives with model triggers rather than separately.

---

## What was dropped, and why

**One environment per pull request** — a generated destination per number, a front door, a
capacity cap, a reaper. Not rejected, made unnecessary: sequencing the two halves removes the
problem it solved.

**The client published to GitHub Pages.** Dropped on evidence rather than preference:
`http://deepbluecltd.github.io/drogna/` answers `301` to `https` — checked with curl — and a
page served over HTTPS may not `fetch` or open a WebSocket to `http://`. Active mixed content
is blocked outright by every current browser, with no override, and it is not enforced at
this project's end, so "toy, no security needed" cannot dismiss it. Serving from the droplet
was the alternative in that document and is now the plan.

Findings from both that are facts about the repository rather than about those designs:

- **One environment file per checkout, not per destination.** `env_path()` in
  `deploy/lib/render_env.py` takes only the repository root and `common.sh` pins
  `deploy/.env`, so two destinations cannot be up on one host at once — the second
  overwrites the first's values, database password included.
- **Publishing cannot be switched off.** Probed with `docker compose config`: an empty
  `ports` value fails with `invalid proto:`, and parity forces all seven `network.publish`
  keys at every destination.
- **`pages.yml` publishes with `ghp-import --force`**, replacing the whole branch. Any second
  publisher to `gh-pages` would silently delete the site and look fine doing it.
- **`site/tools/check_no_external_resources.py` is syntactic** — `src`, `<link href>`,
  `url()`, `@import`. It does not see a runtime `fetch`, so it would have reported clean on
  exactly the thing its own docstring forbids.

---

## Open questions

1. **What is the prefix called?** `/app`, `/ui`, `/shell` — it goes in `proxy.json` beside
   `released.prefix` and `control.upgrade_prefix`, and it is the only new name here.
2. **Keep the credential, or drop it?** Recommended above, but it is a discretion call and
   it is the owner's.
3. **Is `scripts/run_local.sh` the whole of pre-merge backend verification?** It is what
   replaces watching a change run before merging it, so it deserves deciding rather than
   arriving at.
