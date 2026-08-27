# Plan: deployment on main, and the development workflow around it

**Date**: 27 August 2026
**Follows**: [FINDING.md](FINDING.md), which settled where the backend lives.
**Supersedes**: a per-pull-request environment design, dropped on the same day it was
written. The reason is recorded at the end rather than deleted, along with the three
findings from it that still matter.
**Status**: a proposal to be argued with. If the shape is agreed it becomes `specs/017-*`,
and that is the durable artefact, not this.

---

## The model

Stated by the repository's owner, and this document is an attempt to build exactly it:

1. **The backend deploys only on push to `main`.** No environment per pull request.
2. **A feature needing both halves is two pull requests, backend first.** The backend
   change merges and deploys; the front-end change is then developed against a backend
   that is already live.
3. **Combined development happens locally**, where an agent session can bring the stack up
   and update a container in place.

Everything below follows from those three, and one of them turns out to be blocked today.

## What this model gives back

The 4 GiB capacity problem disappears. One stack on the droplet, deployed from `main`, and
nothing competing with it. Gone with it: the destination generator, the front door, the
wildcard certificate, the capacity ceiling, the reaper, and the port arithmetic — every
piece of machinery the per-pull-request design needed. The certificate story returns to
what FINDING.md described: one host, one certificate.

This is a much smaller plan than the one it replaces, and the smallest part of it is the
deployment.

---

## The blocker: the deployed client is configured for somebody else's machine

**The deployed browser client serves a configuration document naming `localhost`.** This
sits directly on requirement 2 — "new front-end features will connect to updated backend" —
and it has to be fixed before that sentence can be true.

### What the mechanism is

A browser reads no environment variable, so the client resolves Constitution IV with a
single served document reached by one relative URL. `client/src/config/runtime.ts` fetches
`./config.json`, validates it against `contracts/schemas/config.client.schema.json`, and
takes everything from it — the broker endpoint, the clock endpoint and its routes, the
query endpoint and collections path. That one relative URL carries an inline
`harness:allow-literal-path` marker naming FR-018. The design is right and it is built.

### What is missing

The destination half. `client/public/config.json` names `http://localhost:8081` for the
broker and query endpoints and `http://localhost:8090` for the clock — which are exactly
`config/local/deployment.json`'s published proxy and clock ports. It is the **local**
destination's addresses, written as a build-time fixture. `deploy/images/client.Dockerfile`
copies `dist/` into the nginx document root, that document included, and nothing replaces
it at run time.

Meanwhile the deployment expects otherwise: `deploy/compose.yaml` passes
`HARNESS_CONFIG: ${HARNESS_CONFIG_PATH_CLIENT}` to the client container, and
`config.client.schema.json` exists as a declared boundary shape — but **neither destination
has a `client.json`**, so that variable renders empty and the schema describes a file that
is nowhere written.

I checked whether this was a decision rather than a gap, because this repository's own
guidance says an unticked task with a reason is a decision. `specs/003-component-shell-client`
carries T007 — the client *fetching* the document — ticked. Nothing in 003 or in
005-compose-deployment covers a destination *serving* one. It is unbuilt, not decided.

### Why nothing caught it

Two gates could have and neither is at fault:

- `destination_parity.py` compares the set of files and keys across destinations. Both
  destinations lack `client.json` equally, so they are in perfect parity about a file that
  should exist at both.
- `check_no_literal_paths.py` scans Python, TypeScript and SQL. `public/config.json` is
  JSON, so the literal hostnames in it are outside what that gate reads.

### The failure mode, which is the worrying part

The document is *valid*. It fetches successfully and passes schema validation, so the
client adopts it and opens transports against `localhost` — meaning, in a reviewer's
browser, that reviewer's own machine. Nothing arrives, so no heartbeat arrives, so every
component stays dark. Which is correct behaviour under Constitution VII, and **is
indistinguishable from a healthy client in front of a backend that is down.**

There is no error to read. That is the same shape as the traps already recorded in
`CLAUDE.md` — a check that cannot fail, a mount nobody declared — and it deserves the same
treatment.

### The fix, in the repository's own idiom

1. Add `config/<destination>/client.json` at **both** destinations, against the schema that
   already exists. Parity then enforces that a third destination cannot forget it.
2. Serve it: the client container mounts the destination configuration read-only already,
   so its nginx serves that file at the bootstrap URL in preference to the bundled one.
3. Demote `client/public/config.json` to what it actually is — a development fixture — and
   say so in it.
4. **Add a gate**: a service whose Compose entry names `HARNESS_CONFIG_PATH_<X>` has a
   configuration file at every destination, or is listed as deliberately having none. One
   appended line in `scripts/gates.registry`, per the rule that a new gate never edits the
   runner. Watch it fail on `client.json` before fixing `client.json` — that ordering is
   the point.

---

## Deployment on push to `main`

Small, once the above is done.

- A workflow on `push` to `main`, in a concurrency group that does not cancel in progress:
  two merges in quick succession should deploy in order, not race.
- It connects over SSH and runs `scripts/run_droplet.sh`, which is already the one command
  and already converges over a running stack.
- It waits for health — `up.sh` already does, with `runtime.wait_timeout_seconds` — and
  fails the workflow loudly if the stack does not come up, rather than reporting a green
  deploy of a broken droplet.

**Images must come from a registry rather than being built on the droplet.** In FINDING.md
this was merely wise; under deploy-on-main it decides whether a merge takes one minute or
fifteen on a two-CPU box that is also serving the demonstration.

### What this model costs, said plainly

**A backend change is no longer seen running before it is merged.** Under the per-pull-request
design a reviewer watched it; now `main` is the first place it runs, and a bad merge breaks
the demonstration for everyone until the next one. Three things make that tolerable, and
they should be built rather than assumed:

- **The local destination is the exercised path.** `scripts/run_local.sh` reaches the same
  state every time from nothing, and is what a reviewer or an agent session uses to see a
  backend change running. It is the answer to "how was this reviewed", and it is already
  written and already run.
- **The deploy reports.** A failed bring-up must be a failed workflow with the unhealthy
  services named, which `report_unhealthy` already produces.
- **Rollback is redeploy-previous.** Seeding is deterministic from the root seed and
  `scripts/reset.sh` returns an instance to the state of a fresh one, so rolling back is
  checking out the previous commit and running the same command. Worth exercising once, on
  purpose, rather than discovering under pressure.

---

## Developing the front end against the deployed backend

This is requirement 2 in practice, and it should **not** be done by adding CORS to the
proxy.

The deployed proxy is the exposure boundary: default-deny, one credential, binary access by
ADR-0001. A browser at `http://localhost:5173` calling `https://<droplet>` is cross-origin,
so it would need `Access-Control-Allow-Origin` — and, because the boundary authenticates,
credentialed CORS with an explicit origin allowlist. That is a second axis of policy on a
security boundary, added for a developer's convenience, and ADR-0001's argument is that
access has exactly one axis. Do not do it.

Instead, keep the browser same-origin and let the **dev server** cross the boundary:

- `client/vite.config.ts` gains a `server.proxy` entry mapping the released prefix, the
  clock routes and the control upgrade (`ws: true`) to the droplet, with the credential
  supplied from the developer's environment rather than written down.
- `client/public/config.json` — now openly a fixture — names **relative** endpoints, so the
  same document works against a local stack and against the proxied remote one.
- The deployed boundary is untouched. Nothing about the exposure surface changes so that a
  front-end branch can be developed.

The dev proxy is also what makes the WebSocket upgrade work, which a CORS header would not
have helped with anyway.

---

## Combined development locally

Mostly already present. `scripts/run_local.sh` is the one exercised path in the repository,
and `up.sh` converges rather than failing when run over a running stack.

What is missing is the narrow case: rebuild and replace **one** service without a full
bring-up. `deploy/lib/common.sh` already exposes a `compose()` helper bound to the rendered
environment file, and `up.sh` already runs preflight only for services that are not
already running — so the converging single-service case is anticipated. A thin
`scripts/reload.sh <service> [destination]` that renders the environment and runs
`compose up --detach --build <service>` is the whole of it, and it leaves the seeding record
alone so nothing reseeds.

That is the live-update path an agent session on a local machine would use.

---

## The order to build it in

1. **The destination client configuration document, and the gate that would have caught its
   absence.** Everything the model asks for is blocked behind this.
2. **Images built in CI and pushed to a registry.**
3. **The deploy-on-`main` workflow**, its credential, and its health report.
4. **The Vite dev proxy** for front-end work against the deployed backend.
5. **`scripts/reload.sh`** for local single-service updates.
6. **The certificate**, per FINDING.md — one host, so the certbot sidecar is the simple case.
7. **Rehearse a rollback** once, deliberately.

**The prerequisite has not moved**: `deploy/droplet/` has still never been run. Everything
above assumes that happened first and that the paragraph in `deploy/README.md` saying it
never has was corrected by whoever did it.

---

## What was dropped, and why

A design for **one environment per pull request** — a generated destination per number, a
front door with a wildcard certificate, a capacity cap and a reaper — was written and then
superseded by the model at the top of this document. It is not recorded here as a rejected
idea but as an unnecessary one: sequencing the two halves into two pull requests removes
the problem that design existed to solve.

Three things it established are worth keeping, because they are facts about this repository
rather than about that design:

- **There is one environment file per checkout, not per destination.** `env_path()` in
  `deploy/lib/render_env.py` takes only the repository root and `common.sh` pins
  `deploy/.env`. Two destinations cannot be up on one host at once; the second overwrites
  the first's rendered values, database password included. Under this model that is
  tolerable — nobody runs two — but it is worth knowing before somebody tries, and
  `deploy/env.template` already documents the fix as the intended behaviour.
- **Publishing cannot be switched off.** Probed with `docker compose config`: an empty
  `ports` value fails outright with `invalid proto:`, and parity forces all seven
  `network.publish` keys at every destination.
- **A generated destination would be visible to `compare_all()`**, which walks every
  directory under `config/`. Relevant to anyone tempted to write configuration there at
  deploy time.

---

## Open questions

1. **Which domain?** Unchanged from FINDING.md, and still unheld. Nothing that terminates
   TLS works without one.
2. **The credential.** It is now developers rather than reviewers who need it, for the dev
   proxy. Same question: where does it live, and how does a developer get it without it
   being written into the repository?
3. **Is `scripts/run_local.sh` the whole of pre-merge backend verification?** I think it
   should be — it is the exercised path and it reaches the same state every time — but that
   is a decision to take deliberately rather than to arrive at by not deciding, because it
   is what replaces watching a change run before merging it.
