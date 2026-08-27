# Plan: a review environment per pull request, on the droplet

**Date**: 27 August 2026
**Follows**: [FINDING.md](FINDING.md), which settled *where* the backend lives. This settles
*what is in it* and how a reviewer sees it.
**Status**: a proposal to be argued with. It is not a specification; if the shape is agreed
it becomes `specs/017-*` by the usual route, and the durable artefact is that, not this.

---

## What was asked for

> Manage what's in the DO instance, and have it reviewed within PRs. Frequently it's the DO
> contents that is the stuff being reviewed. Could we do it with multiple containers, one
> per PR?

Yes — and more cheaply than it sounds, because drogna's destination model already does most
of the work. Four answers shape it, gathered before any design was drawn:

| | |
|---|---|
| What a reviewer does | All three: click through the live client, query the API by hand, and inspect the stores and outputs. |
| When an environment exists | Automatically, on every pull request. |
| How much runs | The full loop, heartbeats lit. |
| Budget | Stay on the 4 GiB box; a separate spike will reduce the size of the stack. |

## The conflict, stated once and then worked around rather than argued about

Those four cannot all hold today. The full profile is seventeen services, and at this
destination's own ceilings that is **7.0 GiB of memory and 13 CPUs of permitted envelope on
a 2 vCPU / 4 GiB box** — one stack is already 75% over the machine before a second PR is
opened. (`resources` in `config/droplet/deployment.json`, summed over the services in
`deploy/compose.yaml`. Ceilings are limits rather than reservations, so a single stack will
very likely run; what they rule out is *two*.)

So this plan does not pick a number. **Capacity is one configured value**, the shape above it
is correct at any capacity, and the size-reduction spike raises the number without
redesigning anything. Today that number is 1, and 0 while the always-on demonstration
occupies the same box — which is the third open question at the end.

What this plan will not do is start environments until the box dies. Beyond capacity the
workflow declines, says so on the pull request, and names what is holding the slots.

---

## Why this is mostly values rather than code

Five things drogna already does, each of which would otherwise be a design problem:

| Already true | Where | What it gives us |
|---|---|---|
| The Compose project name is a destination value | `deployment.project_name` → `HARNESS_PROJECT_NAME` | Containers, networks **and volumes** are namespaced per environment for free. Two stacks cannot see each other's data. |
| The active profile is a destination value | `deployment.profiles.active` → `COMPOSE_PROFILES` | "Heartbeats lit" is a value, not a branch in a script. |
| The runtime directory is a destination value | `deployment.host_paths.runtime_dir` | Per-environment seeding record and artefacts, already. |
| Whether TLS is terminated here is a destination value | `deployment.tls.terminate` | A front door can hold one wildcard certificate for every preview. |
| A third destination is explicitly not a code change | `deploy/README.md`: *"Adding a third destination means adding a directory of the same shape. It is not a code change."* | The sanctioned extension point. |

And `deploy/lib/preflight.py` already refuses to start when a port it needs is taken, so a
collision between environments is reported rather than discovered.

---

## Three things that block it today, each verified rather than assumed

**1. There is one environment file per checkout, not per destination.**
`env_path()` in `deploy/lib/render_env.py` takes only the repository root, and
`deploy/lib/common.sh` pins `DROGNA_ENV_FILE="${DROGNA_DEPLOY_DIR}/.env"`. Two environments
brought up on one host overwrite each other's rendered values — including the database
password. **This is the whole of the single-instance assumption**, and it is one path.

The fix is already documented as the intended behaviour: `deploy/env.template` says of
`HARNESS_RUNTIME_HOST_DIR` that it "holds the generated environment file and the seeding
record". It does not, today. Moving the file under `host_paths.runtime_dir` makes a tracked
comment true and unblocks everything below.

**2. Publishing cannot be switched off, so every environment must be given its own ports.**
Probed rather than assumed: a Compose file with `ports: [${VAR}]` and `VAR` empty fails
`docker compose config` outright with `invalid proto:`. And `destination_parity.py` compares
key paths across destinations, so all seven `network.publish.*` entries must exist at every
destination anyway. There is no "publish nothing and route over an internal network" mode
without editing the shared Compose file.

That is fine, and arguably better: seven loopback ports per environment, derived
arithmetically, keeps this a values-only change.

**3. A generated destination is visible to the parity check.**
`compare_all()` walks every directory under `config/` and compares each against the
alphabetically first. A generated `config/review-pr-15/` **will** be compared on every
bring-up. That is mostly good — a malformed generator is caught immediately — but it means a
half-written directory blocks every other bring-up on the box, including the demonstration.
So the generator writes to a temporary directory and renames into place, and never leaves a
partial destination where the check can see it.

---

## The design

### One tracked template, N generated destinations

Add `config/review/` — tracked, the same files and the same keys as the other two, carrying
placeholder values. It passes the parity check by construction and is what the check
compares the generated ones against.

Add a generator that, given **one input — the pull request number** — writes
`config/review-pr-<N>/`, untracked and ignored:

| Value | Derived as |
|---|---|
| `project_name` | `drogna-pr-<N>` |
| `host_paths.runtime_dir` | `deploy/.runtime/pr-<N>` |
| `network.publish.<service>.host_port` | `base + N × stride + offset`, every one bound to `127.0.0.1` |
| `public_url.host`, `tls.hostname`, `proxy.listen.server_name` | `pr-<N>.<review domain>` |
| `tls.terminate` | `false` — the front door holds the certificate |
| `profiles.active` | `full` |

Seven ports per environment. With a base of 20000 and a stride of 8 that accommodates pull
request numbers into the low thousands without ever colliding for distinct `N`, and
`preflight.py` catches anything the arithmetic did not anticipate.

Nothing here is a change to `deploy/compose.yaml`.

### One front door, doing as little as possible

A single long-lived container outside every environment:

- holds a **wildcard certificate for `*.<review domain>`**, obtained by DNS-01, so one
  certificate serves every preview that will ever exist;
- routes `pr-<N>.<review domain>` to `127.0.0.1:<that environment's proxy port>`;
- and does nothing else.

That last clause is load-bearing. ADR-0001 says access is binary and the drogna proxy is the
exposure boundary; a front door that made an access decision, or that could alter a response
body, would be a second policy point and a different architecture. It terminates TLS and
forwards. Reviewers still meet the proxy's own credential.

This also closes, for previews, the certificate gap that FINDING.md identified as the whole
residual ops burden — one wildcard, renewed once, rather than a certificate per environment.

### Lifecycle

| Event | What happens |
|---|---|
| Pull request opened, reopened, or pushed to | Generate the destination, bring it up, seed it, and comment the address on the pull request. |
| Pull request closed or merged | `down --volumes`, remove the generated destination and its runtime directory, and strike through the comment. |
| Nightly, on the droplet | Reap any `config/review-pr-*` whose pull request is not open. This is the one that matters: a missed webhook otherwise fills the disk quietly, and quietly is how disks fill. |
| At capacity | Decline, comment saying so, and name the environments holding the slots. Never evict somebody else's review in progress. |

### What the reviewer actually gets, including the part a URL cannot give them

All three uses were asked for, and two of them are served by the address:

- **The live client**, at `https://pr-<N>.<review domain>/` — with heartbeats lit, because
  the full profile is what runs.
- **The API by hand**, at the released prefix through that same address, subject to the same
  release policy the proxy enforces everywhere else.
- **The stores and outputs** — and this one is *not* a URL, and should not pretend to be.
  The honest options are `docker compose exec` over SSH into that environment's project, or
  an offload bundle produced by the environment and attached to the pull request as an
  artefact. The second is reviewable inline and leaves a record; the first is what you want
  when the question was not anticipated. Both, probably; the bundle is the one worth
  building first, and it composes with the capture pairs `capture.yml` already publishes.

### What it costs

Nothing per month beyond the droplet already planned. A wildcard DNS record, a free
certificate, and a capacity ceiling that is uncomfortably low until the stack shrinks.

---

## The order to build it in

1. **Environment file per destination.** Small, independently useful, and everything else is
   blocked behind it.
2. **The `config/review/` template, the generator, and its tests** — including one that
   generates two environments and asserts their ports, project names and volumes are
   disjoint.
3. **`.gitignore` for `config/review-pr-*`** and the per-environment runtime directories.
4. **The front door**: wildcard DNS record, DNS-01 certificate, routing.
5. **Two workflows** — deploy on pull request activity, tear down on close — and a deploy
   credential.
6. **The reaper and the capacity cap.**
7. **Measure one stack.** Nobody knows what a full drogna stack actually uses, because it has
   never been run. That number is the input to the size-reduction spike, and it should be
   captured the first time an environment comes up rather than estimated afterwards.

### Two prerequisites that are not optional

- **The droplet has still never been run.** FINDING.md says so and `deploy/README.md` says so.
  This plan builds a review pipeline on a deployment path nobody has exercised. Bring the
  droplet up by hand first; everything here assumes that step happened and corrected the
  paragraph.
- **Images must be built in CI and pulled, not built on the droplet.** At full depth a cold
  build is quoted at fifteen minutes, and this design triggers one on every push to every
  open pull request, on a two-CPU box that is also serving reviews. In FINDING.md this was
  item four and merely wise. Here it is a precondition.

### One thing that does not fit the gate model, noted rather than solved

`mount_lint.py` is registered in `scripts/gates.registry` once per destination, by name. A
generated destination cannot be named in a tracked registry. So the two registered lines stay
as they are, and the generator calls the same check against the directory it has just written,
failing the deployment rather than the build. That is the right split — a generated
destination is a deployment-time artefact, not a repository-time one — but it means the gate
count no longer equals the destination count, and somebody will eventually notice and
"fix" it.

---

## Alternatives, and why not

- **One shared review slot** that redeploys to whichever branch you point it at. Far cheaper,
  fits 4 GiB comfortably, and was explicitly not what was asked for. It is the fallback if
  the capacity ceiling proves intolerable before the stack shrinks.
- **An ephemeral droplet per pull request**, created and destroyed through the DO API. No
  capacity ceiling at all and near-perfect isolation, at a few pence per review-hour. Ruled
  out only by the decision to stay on one 4 GiB box; if the ceiling bites, this is the option
  that removes it rather than raising it.
- **Fly.io**, which is genuinely good at per-branch environments. The objection is the one in
  FINDING.md and it has not changed: a second deployment description.

## Open questions, recorded rather than assumed

1. **Which domain**, and can a wildcard record be created under it? Nothing here works
   without one, and no domain is held today.
2. **How does a reviewer authenticate?** The proxy is default-deny with a basic-auth realm.
   A shared credential is simple and leaks; a per-environment credential posted into the pull
   request comment is visible to everyone who can read the pull request, which for a public
   repository is everyone. This needs a decision before the first environment is public.
3. **Does the always-on demonstration share this box?** At 4 GiB it cannot share it with even
   one full-depth preview. Either the demonstration moves, or previews wait, or the stack
   shrinks first. This is the capacity conflict in its concrete form, and it is a decision
   rather than a calculation.
