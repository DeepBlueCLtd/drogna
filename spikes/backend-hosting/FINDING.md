# Finding: the hosting question is settled by the deployment description, not by the host

**Date**: 27 August 2026
**Kind**: desk spike. Nothing was deployed; see [README.md](README.md) on what the evidence is.
**Bearing on**: `deploy/`, `config/droplet/`, Constitution *Additional Constraints → Technology*.

---

## The result, in one sentence

**Stay on DigitalOcean** — not because DigitalOcean is better than Fly.io, but because
drogna's deployment *is* a Compose file with seven named volumes, thirteen profiles and
fifteen services that build their own image, the constitution says there shall be one such
file and two destinations, and a droplet is the only candidate examined that runs it
unchanged; every platform candidate asks for a second deployment description, which is a
constitution amendment rather than a configuration change.

The corollary matters as much: **the ops burden that argues against a virtual machine is
about a day of work, and most of it has to be done wherever this is hosted.** Two of the
requirements — reset on every deploy is acceptable, and the loop runs on demand — cancel
most of the reasons a long-lived box is tiring.

---

## What the tree already commits us to

Each of these is checkable, and the command is beside it. They are the reason the answer is
what it is, and they were established before any vendor page was opened.

| Fact | How to see it |
|---|---|
| **Fifteen of the seventeen services build an image** — twelve of them from `deploy/images/python-service.Dockerfile` with a differing `HARNESS_SERVICE` build argument, the other three from the proxy, query-layer and client Dockerfiles. Only the broker and the observation store run a stock image. | `grep -c '^    build:' deploy/compose.yaml` |
| **Seven named volumes**: observations, broker, coverage, environment, run, offload, released. | `sed -n '/^volumes:/,$p' deploy/compose.yaml` |
| **Thirteen profiles**, and "web tier always, loop on demand" is precisely what they are for. | `grep -o 'profiles: \[.*\]' deploy/compose.yaml \| sort -u` |
| **Every service carries `deploy.resources.limits`**, and the observation store overrides the default. | `x-runtime` in `deploy/compose.yaml`; `resources` in `config/*/deployment.json` |
| **One configuration, two destinations, differing in values only** — a constitutional technology constraint, enforced by a script. | `.specify/memory/constitution.md`; `scripts/check_destination_parity.sh` |
| **Two registered gates read `deployment.json` per destination** and fail if a directory a component names is not mounted there. | `deploy/lib/mount_lint.py local` / `droplet` in `scripts/gates.registry` |

### The exposure question answers itself

The interview left public exposure undecided. The tree decides it: in
`config/droplet/deployment.json` the proxy binds `0.0.0.0:443` and **every other published
port binds `127.0.0.1`** — clock, broker, observation store, query layer, client, telemetry.
Control messages reach the browser as an MQTT WebSocket upgrade proxied at `/ctl` to
`broker:9001` (`config/droplet/proxy.json`, ADR-0008), so the broker needs no public TCP
port of its own, and neither does Postgres.

**One public port, 443, carrying HTTPS and one WebSocket upgrade.** That is a lenient
requirement, and it is the requirement that would have ruled candidates out had it been
harsher. Nothing in this comparison turns on raw TCP ingress.

---

## The candidates

### 1. DigitalOcean droplet, running the Compose file — the status quo

$24 a month for the Basic 2 vCPU / 4 GiB droplet the deploy README already sizes against,
with 4,000 GiB of outbound transfer included.

Already written, and not yet run: `deploy/droplet/provision.sh`, a systemd unit,
`scripts/run_droplet.sh`, and a full `config/droplet/` directory the parity check keeps
honest. The deployment story is a checkout plus one command.

What it does **not** yet have, and this is the part worth being blunt about:

- **No certificate.** `config/droplet/proxy.json` names `/etc/drogna/tls/…crt` and `…key`,
  and *nothing in the repository obtains or generates them* — the string `tls` does not
  appear anywhere in `scripts/*.sh`, `deploy/droplet/provision.sh` or `deploy/env.template`.
  Verified by grep. This gap exists on every self-terminating path, Fly excepted.
- **No push-to-deploy**, and no registry. `.github/workflows/` is CI only: lint, tests,
  gates, client, capture, pages.
- **No domain name**, per the interview, and `public_url.host` ships as `drogna.invalid`.
- **Never exercised.** `deploy/README.md` says so in its own words, and asks whoever runs it
  first to correct the paragraph.

### 2. Fly.io — closer than expected, and still a second deployment description

Fly shipped Docker Compose compatibility: point `fly.toml` at a Compose file and it runs the
services as containers **inside a single Machine**. That is architecturally close to what a
droplet does, and it was the reason this spike took Fly seriously rather than dismissing it.

Four documented limits collide with the six facts above:

| Fly limit | What it hits |
|---|---|
| "Fly ignores `volumes:` declarations in your Compose file" — data goes to an ephemeral overlay wiped on restart. | All seven named volumes. |
| "A Machine can only mount one volume at a time." | Seven roots would have to become subdirectories of one mount. |
| "`fly deploy` requires exactly one service in the Compose file to specify `build`"; the rest must use pre-built images. | All fifteen builders. |
| No profiles, and no `deploy.resources.limits`. | The thirteen profiles, which *are* the loop-on-demand mechanism, and every resource ceiling. |

Costs about the same: shared-cpu-2x with 4 GB is $22.22 a month, plus $2 for a dedicated
IPv4 and $0.15/GB for volumes — call it $26 with a small volume, inside budget. And it is
genuinely better on the two things the interview asked for: TLS certificates are the
platform's problem, there is no operating system to patch, `fly deploy` from a CI job is a
token and a line, and stopped Machines are not billed for CPU or RAM.

The reason it still loses is not any one limit but their sum. Making drogna fit means
collapsing seven volumes into one mounted root, pre-building fifteen images to a registry,
replacing profiles with something, dropping the resource ceilings, and writing a `fly.toml`
that describes the deployment a second time. That last item is the fatal one: `fly.toml`
would sit beside `deploy/compose.yaml` saying overlapping things about the same system, and
the destination parity check — which exists to guarantee destinations differ in values only
— would have nothing to say about it. That is a constitution amendment, and it should be
argued on its merits rather than acquired as a side effect of wanting free certificates.

Two of those five, note, are worth doing anyway. Building those images in CI and pushing
them to a registry is the fix for a fifteen-minute cold build on a 4 GB box, and the
collapse of seven volume roots into one is expressible entirely in `container_paths`, which
is values.

### 3. DigitalOcean App Platform — ruled out in one line

"App Platform does not currently support volumes." The coverage store is NetCDF on a
filesystem. That is the end of it, before reaching Postgres or the broker.

### 4. Hetzner, and the other cheap VPS providers

A CX23 — 2 vCPU, 4 GB — is a few euros a month against DigitalOcean's $24, so roughly a
fifth of the price for the same shape of machine and the same Compose file. It is the
cheapest way to satisfy every requirement here.

It is not recommended, and the reason is thin but real: budget is not the binding
constraint (the stated ceiling is $20–30 and the droplet fits), a DigitalOcean account
already exists, and `config/droplet/` is named for a DigitalOcean concept. Saving $19 a
month is not worth being the first person to run an untested deployment path on an
unfamiliar provider at the same time. If the bill ever becomes the point, this is a
values-only move: a new destination directory, no code change.

### 5. Railway, Render, and their neighbours

Same objection as Fly — a second deployment description — without Fly's Compose head start.
Not investigated further.

---

## The comparison, on the requirements as given

| | DO droplet | Fly.io | DO App Platform | Hetzner |
|---|---|---|---|---|
| Runs `deploy/compose.yaml` unchanged | **yes** | no | no | **yes** |
| Second deployment description needed | **no** | yes | yes | **no** |
| Seven volumes | **yes** | one mount | none | **yes** |
| Profiles, so loop-on-demand | **yes** | no | no | **yes** |
| Monthly cost | $24 | ~$26 | $12 app + $15 db | ~$5 |
| TLS certificate | **unsolved** | **free** | free | **unsolved** |
| Operating system to patch | yes | **no** | **no** | yes |
| Push-to-deploy from CI | to build | **easy** | easy | to build |
| Agent session can deploy | SSH key | **token** | token | SSH key |
| Already written in this repo | **entirely** | nothing | nothing | values only |

Fly wins four rows. It loses the four that are constitutional.

---

## The ops burden, priced honestly

The requirement was "as little host babysitting as possible", and it is the one requirement
the recommendation does not fully satisfy. What is actually owed on a droplet:

| | Cost | Note |
|---|---|---|
| Unattended security upgrades | a few lines in `provision.sh` | Idempotent, like the rest of that script. |
| Log rotation | **already done** | `runtime.log_*` in `deployment.json`, applied to every service. |
| Restart after reboot | **already done** | `unless-stopped`, plus `harness.service` converging on the checkout. |
| Backups | **not needed** | Reset on deploy is acceptable; seeding is a function of the root seed. |
| Disk filling | low | Reset on deploy bounds it; image pruning is already in `run_droplet.sh`. |
| **TLS certificates** | **the real work** | See below. |

Certificates are the whole of the residual burden, and there are two shapes for it:

- **A certbot sidecar** renewing into the paths `proxy.json` already names. Fits the
  existing design — the paths are configuration, so the destination file does not change —
  and costs nothing per month. Needs a DNS name and a renewal that nobody watches.
- **A DigitalOcean load balancer** with a managed certificate in front, and
  `tls.terminate: false` at the destination. `tls.terminate` **is already a key in
  `deployment.json`**, carried deliberately as a destination value, so this is close to
  free in code. It costs about $12 a month, which takes the total to $36 and out of the
  stated budget. Worth reconsidering only if the certbot renewal becomes a nuisance.

Neither is a day's work. Both are more than nothing, and honesty about that is the point:
Fly's zero-ops promise is real, and what it costs is the Compose file.

---

## What push-to-deploy costs, at any host

Requested, not yet present, and largely host-independent:

1. **Build the fifteen images in CI and push them to a registry**, so a deploy is a pull
   rather than a fifteen-minute cold build on a small box. This is the single highest-value
   piece of work in this document, it is needed on every candidate including Fly, and it is
   what makes an agent-driven deploy quick enough to be worth doing.
2. **A deploy credential** in repository secrets — an SSH key for a droplet, a token for a
   platform — and the corresponding workflow calling `scripts/run_droplet.sh`, which is
   already the one command and already converges rather than failing over a running stack.
3. **A reset path an agent can call**, which `scripts/reset.sh droplet` already is.

The remote-session and agent-deploy requirement adds nothing beyond (2). An agent with the
secret runs the same one command a person does.

---

## The unknown that outranks all of this

**Nobody has ever run `deploy/droplet/`.** `deploy/README.md` states it plainly: no droplet
was available when it was written, so the provisioning script, the systemd unit and the
pruning step are unexercised, and the README asks the first person who runs them to correct
that paragraph.

That is a larger unknown than the difference between any two options here, and it is the
cheapest to retire: a $24-a-month droplet costs about four pence an hour, and the exercise
is create, clone, provision, run, reboot, run again, destroy. It also happens to be the only
way to find out whether the fifteen-minute cold build is fifteen minutes, which is the
number that decides whether item (1) above is urgent or merely wise.

Do that before spending anything on a migration. It is the same advice this repository has
had to learn twice already: a check that has never been seen to fail is worth nothing, and
neither is a deployment path that has never been seen to run.

---

## Recommendation

1. **Stand up the droplet as written**, on a $24 Basic 2 vCPU / 4 GiB instance, and correct
   the paragraph in `deploy/README.md` that says it has never been done.
2. **Point a DNS name at it** and replace the `drogna.invalid` placeholders in
   `config/droplet/deployment.json` and `proxy.json`. A name is needed before a certificate
   is, and none is held today.
3. **Solve certificates with a certbot sidecar** writing to the paths `proxy.json` already
   names. Reconsider the managed load balancer only if renewals prove annoying and $36 a
   month is acceptable.
4. **Build the fifteen images in CI, push them to a registry, and make the droplet pull.**
   Do this whatever else is decided; it is the piece that makes deployment fast enough for
   CI and for an unattended agent session.
5. **Then** add the push-to-deploy workflow: a deploy key, and a job that runs
   `scripts/run_droplet.sh droplet` over SSH.
6. **Leave Fly.io on the record as the reasoned alternative**, not as a rejected one. If the
   day comes that the constitution's "one configuration, two destinations" is worth
   amending, Fly is where to spend the amendment, and the two preparatory items — images in
   a registry, and seven volume roots collapsed under one — will already be done.

---

## Handover

- This spike **does not** amend anything. `deploy/README.md`, `config/droplet/` and the
  constitution are untouched by it.
- Items 1 to 5 above are a feature, not a chore, and it should go through the usual
  route — specify, plan, tasks. It touches `deploy/`, `.github/workflows/` and shared
  append-only files.
- **An ADR is owed if and only if this is adopted.** Hosting is hard to reverse, which is
  the repository's own bar for a record in `docs/adr/`. Not written here, because a spike
  recommends and an ADR records a decision that has been taken.
- The open question this spike deliberately did not close: whether `tls.terminate: false`
  behind a managed load balancer is the destination this project actually wants for
  production one day. It is recorded as open rather than dissolved.

---

## Sources

Vendor documentation read on 27 August 2026. Prices decay; re-read before spending.

- [Fly.io — Multi-container Machines (Compose support and its limits)](https://fly.io/docs/machines/guides-examples/multi-container-machines/)
- [Fly.io — Resource pricing](https://fly.io/docs/about/pricing/)
- [Fly.io — Billing (volumes billed on stopped Machines)](https://fly.io/docs/about/billing/)
- [Fly.io — Add volume storage to a Fly Launch app](https://fly.io/docs/launch/volume-storage/)
- [Fly.io — App configuration (fly.toml)](https://fly.io/docs/reference/configuration/)
- [DigitalOcean — Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean — Droplet pricing details](https://docs.digitalocean.com/products/droplets/details/pricing/)
- [DigitalOcean — App Platform limits](https://docs.digitalocean.com/products/app-platform/details/limits/)
- [DigitalOcean — How to store data in App Platform](https://docs.digitalocean.com/products/app-platform/how-to/store-data/)
- [Hetzner — new CX plans](https://www.hetzner.com/pressroom/new-cx-plans/)
- [Hetzner — price adjustment, June 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
