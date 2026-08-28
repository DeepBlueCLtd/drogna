# Finding: App Platform earns a place where it runs drogna unchanged — the client — and nowhere else

**Date**: 28 August 2026
**Kind**: desk spike. Nothing was deployed; see [README.md](README.md) on what the evidence is.
**Follows**: [`backend-hosting/FINDING.md`](../backend-hosting/FINDING.md) (where the
backend lives), [`backend-hosting/DEPLOYMENT-WORKFLOW.md`](../backend-hosting/DEPLOYMENT-WORKFLOW.md)
(no environment per pull request; two halves, backend first),
[`container-size/FINDING.md`](../container-size/FINDING.md) (the memory arithmetic).
**Bearing on**: `deploy/`, `.github/workflows/`, the proxy's exposure boundary, and — if
option D were ever taken — the constitution's one-configuration-two-destinations constraint.

---

## The result, in one sentence

**Yes, App Platform integrates with GitHub and can deploy a preview app per pull request —
and the one piece of drogna it can host without translation is the client, so: keep the
hosted backend on the droplet as already planned, add free App Platform preview apps for
the client's pull requests, and decline to re-describe the backend in an app spec that
neither CI nor a local session could ever execute.**

Two facts changed since `backend-hosting` was written yesterday, and one constraint
arrived today; the finding below is what survives all three. Let's Encrypt made
IP-address certificates generally available in January 2026, which deletes the droplet's
"certificate needs a domain" problem. The owner stated there is no droplet inertia and
disruption is acceptable if it buys value — so option D below is weighed on its merits,
not dismissed by incumbency. And the owner stated that local bring-up and agent-session
bring-up must both survive — which means `deploy/compose.yaml` is permanent regardless,
and any platform description is an *addition* to it, forever, not a migration off it.

---

## What the tree already does at pull-request time

Worth stating before pricing anything, because it is most of what a "PR preview" is for.
Each fact carries the command that shows it.

| Fact | How to see it |
|---|---|
| **Every pull request already brings the real stack up in CI.** `ci.yml` runs a bare `uv run pytest`, and `tests/integration/test_compose_bringup.py` drives the real `scripts/up.sh` against the runner's container runtime — health, convergence, profile membership, advertised address. | `grep -A3 'on:' .github/workflows/ci.yml` |
| **Every pull request already produces visual evidence.** `capture.yml` triggers on `pull_request` and runs the `pair` mechanism: clock pinned to zero, before/after screenshots of the running client, published as a CI artefact, gated on comparability. | `grep -B1 -A2 'pull_request' .github/workflows/capture.yml`; `scripts/capture/README.md` |
| **Fifteen of the eighteen services build an image**; the droplet's active profiles start six of them (broker, client, clock, observations, proxy, query), the loop is eleven more, and `features` is a provisioning one-shot. | `grep -c 'build:' deploy/compose.yaml`; `profiles.active` in `config/droplet/deployment.json` |
| **The client is a static bundle that bootstraps from one relative document.** `vite build` emits static files; the only runtime coupling is `fetch("./config.json")`, whose schema names the broker WebSocket URL and the query endpoint absolutely. | `client/src/config/runtime.ts:106`; `client/public/config.json` |
| **One public port, 443, carrying HTTPS and one WebSocket upgrade** — everything else binds loopback. | `network.publish` in `config/droplet/deployment.json` |
| **The TLS gap is still open**: nothing in the repository obtains or generates the certificate material `config/droplet/proxy.json` names. | `grep -rn tls scripts/*.sh deploy/droplet/provision.sh` — no hits |

So the review-time question "did this change break the stack, and what does it look
like?" is already answered on every pull request, interactively excepted. What a preview
app adds — the only thing it adds — is **a URL a reviewer can click and drive**.

---

## What App Platform actually offers, read on 28 August 2026

- **Native GitHub integration** deploys one branch on push. That is production CD, not PR
  support.
- **`digitalocean/app_action` in `deploy_pr_preview` mode** is the PR support: it derives
  a per-PR app name from an app spec in the repository (default `.do/app.yaml`), strips
  domains and alerts, repoints the spec at the PR's branch, deploys, and comments the live
  URL (or the failing build log) on the pull request; a companion `delete` step removes
  the app when the PR closes. It needs one repository secret, a DigitalOcean API token.
- **Static sites are free** — up to three static-only apps per account, then $3 per month
  per additional app, prorated; 1 GiB outbound each.
- **There are still no volumes.** The filesystem is ephemeral, 4 GiB, and a full disk
  replaces the container. The documented alternatives are Spaces and managed databases.
- **Non-HTTP ingress does not exist** (one external HTTP(S) port per service), but
  **internal ports do**: a service with `internal_ports` and no `http_port` is reachable
  from sibling components through a layer-4 balancer at its component name. A broker can
  live inside an app; it cannot face the internet.
- **Workers do not scale to zero.** The autoscaling floor is one instance; what exists
  besides is whole-app archive/restore. "Loop on demand" — which is exactly what the
  Compose profiles are for — has no per-component equivalent short of editing the spec
  and redeploying.
- **Containers are billed per instance**: the smallest paid tier is $5 per month
  (1 shared vCPU, 512 MiB), which comfortably holds every drogna service whose ceiling is
  384 MiB. Development databases are $7 per month; managed Postgres starts at $15.

And the neighbouring fact from Let's Encrypt: **certificates for bare IP addresses are
generally available since 15 January 2026**, valid 160 hours, issued against the
`shortlived` ACME profile. The droplet's certificate no longer waits on a domain; it
waits on a renewal that runs unattended roughly twice a week, which is what the certbot
sidecar already proposed in `backend-hosting` is for.

---

## The options

### A. The standing plan, unchanged — the baseline

The droplet runs the Compose file; deployment is push-to-`main`; a feature is two pull
requests, backend first; combined work is local. Pull-request evidence is the CI bring-up
plus the pair captures, both already live.

**Benefits**: one deployment description, and it is the one CI executes on every pull
request and every agent session executes in-container — the served artefact is the tested
artefact, byte for byte. Everything is already written. $24 per month, all-in.

**Trade-offs**: nothing at PR time is clickable. The host is a machine somebody owns:
unattended upgrades, disk, and the certificate renewal are real, if small, and
`backend-hosting` priced them at about a day. The whole path is still unexercised —
`deploy/README.md` says so itself.

### B. A, plus client preview apps on App Platform — the recommendation

Add `.do/app.yaml` describing **one static-site component**: build the client with pnpm,
serve `client/dist`. Two workflows: on client pull requests, `app_action` with
`deploy_pr_preview`; on close, the delete step. The preview build ships a `config.json`
naming the demonstration backend — `wss://<droplet>/ctl`, `https://<droplet>/released` —
which the client's bootstrap-from-one-relative-document design makes a pure content
change; nothing in the bundle knows where it is served from, exactly as the
`base: "./"` decision in `DEPLOYMENT-WORKFLOW.md` intends.

**Benefits**: a clickable, live client per pull request, driving the real demonstration
backend, at a cost of approximately nothing — three concurrent previews are free, the
fourth is $3 per month prorated. This is the one shape in which App Platform runs a piece
of drogna *unchanged*: a static bundle is a static bundle. It also exercises nothing the
constitution protects — no second description of the backend, no service translation.

**Trade-offs**, and they are real work, all of it on the exposure boundary:

1. **Cross-origin returns.** `DEPLOYMENT-WORKFLOW.md` removed CORS and the mixed-content
   wall by putting the client on the droplet's own origin. A preview app is a second
   origin, so the EDR fetches need `Access-Control-Allow-Origin` on the `/released`
   locations — a deliberate widening of the proxy's declared policy, same class of change
   as the planned `/app` location, and it belongs in the template where the README says
   policy lives. (The MQTT WebSocket upgrade is not subject to CORS preflight; the
   fetches are.)
2. **The backend must be HTTPS first.** A preview app is served over HTTPS and may not
   fetch or open a WebSocket to `http://` — the identical wall, probed with curl, that
   killed the Pages design. So this option *depends on* the droplet's certificate, which
   the IP-address certificates above have reduced from "blocked on a domain" to "write
   the renewal sidecar". Plain-`http`-until-somebody-feels-like-it stops being available
   the day previews are wanted.
3. **A preview shows a client change against `main`'s backend.** A client PR that needs an
   unmerged backend change cannot preview — which is not a new cost, it is the two-PR
   sequencing already adopted, and the local stack remains the place combined work runs.
4. **Two armed workflow files.** Following `BRING-UP.md`'s own caution, this spike quotes
   none: a workflow in `.github/workflows/` is live the moment it merges, and this one
   spends account money and posts comments. It should arrive as a feature, reviewed, with
   the token scoped to App Platform only.

### C. A, plus a full-stack droplet per pull request — priced and shelved

Actions creates a droplet per PR (`doctl`), provisions it with the existing scripts,
runs `scripts/run_droplet.sh`, comments the IP, destroys on close, with a reaper for
leaks. `container-size` already established that a second stack cannot share the demo
host (7168 MiB of ceilings against a 4096 MiB box), so per-PR means per-droplet.

**Benefits**: the only option giving a clickable *backend* per PR — reviewers can drive
EDR queries and the control plane, not just the client. It reuses every script and both
description-and-destination idioms unchanged; a `preview` destination is a values-only
directory, which parity already knows how to keep honest.

**Trade-offs**: it automates a path that has never been run once by hand, against the
repository's clearest lesson about untested paths. It needs registry-built images first
(item 8 of the standing plan) or every push costs a fifteen-minute cold build on a small
box. It holds infrastructure credentials in CI that can create and destroy billable
machines. It costs about 3.6¢ per open-PR-hour — $24 per month if one PR is always open.
And nobody has yet named a review that the CI bring-up, the pair captures, and option B's
client preview together would have failed to serve. Shelved until someone does; the
trigger is written in the handover.

### D. The hosted destination on App Platform itself — the disruption option, weighed and declined

Because there is no droplet inertia and disruption is acceptable, this was costed
properly rather than ruled out in one line as `backend-hosting` did. The translation is
genuinely available: proxy as the sole public service ($5), query and clock internal
($5 each), mosquitto on internal ports ($5), the observation store as a development
database ($7 — or $15 managed if the development tier cannot enable PostGIS, unverified),
the client static and free, seeding as a post-deploy job. Web tier: **$27–35 per month**.
The eleven loop services are workers at $5 each — **$55 per month while deployed**, and
with no scale-to-zero the loop-on-demand mechanism becomes "edit the spec and redeploy".
Native deploy-on-push and whole-app preview apps come with it; so do free TLS, a domain,
and no operating system to patch — the ops column is genuinely all zeros.

Declined on three grounds that are about drogna rather than about App Platform:

1. **The fidelity split becomes permanent.** The owner requires local and agent-session
   bring-up, so the Compose file stays. An app spec would then be a second description of
   the same system, maintained forever, that **no test can execute** — there is no local
   App Platform, so CI would go on proving the Compose stack on every pull request while
   the thing actually serving demonstrations is a hand-kept translation the parity check
   cannot see. The repository's central lesson is that the tree is the authority and the
   record is a claim about it; this option ships a production record nothing can check
   against the tree. It is also, in constitution terms, an amendment to
   one-configuration-two-destinations, spent on hosting convenience.
2. **The statelessness is the wrong shape for a simulation harness.** Reset-on-deploy
   being acceptable softens the no-volumes rule less than it appears: a deploy re-runs
   the seeding job, but an *instance replacement* — a crash, a filled 4 GiB filesystem, a
   platform migration — is not a deploy and re-runs nothing. The demonstration then shows
   empty stores behind healthy services: dark components, correct under Constitution VII,
   indistinguishable from a working client on a dead backend. That is the same silent
   failure shape this repository has now documented five times, installed at the one
   destination whose whole purpose is to be looked at while nobody is maintaining it.
3. **The loop is the demonstration.** Profiles are how the web tier stays up while the
   loop runs on demand; App Platform's floor of one instance per worker prices the idle
   loop at $55 per month or turns "start the loop" into a spec edit and a redeploy
   measured in minutes, mid-demonstration.

What would reopen it: if the droplet's ops burden is real rather than priced — if, after
standing it up, the certificate renewal or the host babysitting actually bites — then
this is the zero-ops alternative, at roughly $30 web-tier with the loop's cost and
latency accepted, and the amendment argued honestly on its merits. `backend-hosting`
said the same of Fly.io; both stay on the record as the reasoned alternatives.

---

## The comparison, on what was asked for

| | A: droplet | B: A + client previews | C: A + stack per PR | D: App Platform backend |
|---|---|---|---|---|
| Clickable client per PR | no | **yes** | **yes** | **yes** |
| Clickable backend per PR | no | no (main's backend) | **yes** | **yes** |
| Second deployment description | **none** | app spec, client-only | **none** | app spec, everything |
| Hosted artefact is the CI-tested artefact | **yes** | **yes** (bundle is identical; origin differs) | **yes** | no |
| Loop on demand | **profiles** | **profiles** | **profiles** | spec edit + redeploy |
| Demo state survives instance loss | volume | volume | volume | **no — and silently** |
| TLS at the demo | sidecar to write | **required first**, same sidecar | sidecar to write | **platform's problem** |
| Host to babysit | yes | yes | yes + reaper | **no** |
| Monthly cost | $24 | **$24 + ~$0** | $24 + ~3.6¢/PR-hour | $27–35, +$55 looping |
| New credentials in CI | none | DO token, app-scoped | DO token, droplet-scoped + SSH | DO token |
| Unexercised surface armed | none | small (two workflows) | large (droplet path, untested) | large (whole translation) |

---

## Recommendation

1. **Stand the droplet up by hand first.** Unchanged from both prior spikes, still first,
   and still the cheapest retirement of the largest unknown in any column above.
2. **Write the certificate sidecar against an IP-address certificate** — `shortlived`
   ACME profile, 160-hour lifetime, renewal unattended. This was already the plan with a
   domain; Let's Encrypt's January GA removed the domain from the critical path. It is
   also the precondition for item 3, which is what promotes it from polish to blocking.
3. **Adopt option B as a feature**: `.do/app.yaml` with the one static component, the
   preview and delete workflows, the CORS widening on the proxy's released locations, and
   the preview `config.json` pointing at the demonstration backend. Through the usual
   route — specify, plan, tasks — because it touches the exposure boundary and arms
   workflows.
4. **Leave C shelved with a named trigger**: build it when a reviewer can point at a pull
   request that the CI bring-up, the pair captures and a client preview together failed
   to serve. Its preconditions (registry images, an exercised droplet path) are items the
   standing plan wants anyway.
5. **Leave D on the record as the zero-ops alternative**, to be argued as a constitution
   amendment if the droplet's ops burden proves real in use — not acquired as a side
   effect of wanting PR previews, which option B delivers for free.

---

## Handover

- This spike **amends nothing**: no workflow files, no app spec, no proxy change, no
  constitution edit. `CLAUDE.md`'s spike count moves from seven to eight, and that is the
  only tracked file it touches.
- Option B is a feature, not a chore: exposure-boundary policy, two armed workflows, an
  account credential, and a build-time configuration document. Specify it.
- **An ADR is owed if and only if B (or any option) is adopted** — hosting and boundary
  policy are hard to reverse, which is the repository's bar. Not written here: a spike
  recommends; an ADR records a decision taken.
- Open questions, recorded as open rather than dissolved:
  1. Whether the CORS widening names the preview origins (`*.ondigitalocean.app` is not
     wildcardable per-app; the action knows each preview's URL) or admits any origin —
     drogna is a toy that says so, but the proxy's README treats every widening as policy.
  2. Whether the development database tier can enable PostGIS, which decides $7 or $15 in
     option D's arithmetic. Matters only if D is ever reopened.
  3. Whether client preview workflows should trigger on every pull request or only those
     touching `client/` — a filter is cheaper, but a proxy-policy PR also changes what
     the client experiences.

---

## Sources

Vendor documentation read on 28 August 2026. Prices and limits decay; re-read before
spending.

- [digitalocean/app_action — README (deploy, deploy_pr_preview, delete)](https://github.com/digitalocean/app_action/blob/main/README.md)
- [DigitalOcean — How to deploy using GitHub Actions](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/)
- [DigitalOcean — Introducing new GitHub Actions for App Platform](https://www.digitalocean.com/blog/github-actions-for-app-platform)
- [DigitalOcean — App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/)
- [DigitalOcean — How to store data in App Platform (no volumes; 4 GiB ephemeral)](https://docs.digitalocean.com/products/app-platform/how-to/store-data/)
- [DigitalOcean — How to set up internal routing (internal_ports, layer-4)](https://docs.digitalocean.com/products/app-platform/how-to/manage-internal-routing/)
- [DigitalOcean — How to scale apps (autoscaling floor of one)](https://docs.digitalocean.com/products/app-platform/how-to/scale-app/)
- [DigitalOcean — App Platform limits](https://docs.digitalocean.com/products/app-platform/details/limits/)
- [Let's Encrypt — 6-day and IP address certificates are generally available (15 January 2026)](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)
