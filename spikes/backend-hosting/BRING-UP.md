# Bring-up: the procedure, the mechanism, and two drafts

**Date**: 27 August 2026
**Companion to**: [DEPLOYMENT-WORKFLOW.md](DEPLOYMENT-WORKFLOW.md), which argues the model.
This is the operational half of it.

**Research only. Nothing here is installed.** In particular, the workflow in Part 4 is
deliberately **not** at `.github/workflows/deploy.yml`: a file there is armed the moment it
merges, and this is a draft of an automation for a path nobody has ever run. It lives here
until somebody has done Part 1 by hand.

Everything below was read out of the scripts rather than inferred from how deployments
usually work. Nothing in it has been executed.

---

## Part 1 — From nothing to a running droplet, by hand

| Step | Command | What it does |
|---|---|---|
| 1 | — | Create a droplet on a current Ubuntu LTS. Two vCPUs and 4 GiB is the assumption `deploy/README.md` sizes against. |
| 2 | `git clone …` | Clone the repository onto it. Public, so no credential is needed on the host — which also means the deploy in Part 4 needs none for `git fetch`. |
| 3 | edit `config/droplet/deployment.json` | Replace the `drogna.invalid` placeholders in `public_url.host` and `tls.hostname`, and adjust `network.publish` if those are not the ports you want. |
| 4 | `sudo deploy/droplet/provision.sh` | Installs `docker.io` and `docker-compose-v2` from the distribution repositories if absent, writes `harness.service` into `/etc/systemd/system` with the checkout path substituted for `@@DEPLOYMENT_ROOT@@`, enables it at boot, then reports what it changed and what it left alone. Idempotent; it deliberately does **not** deploy. |
| 5 | `scripts/run_droplet.sh` | The deployment: `up.sh`, `seed.sh`, prune. Safe to repeat. |

Re-run step 4 if the checkout ever moves — the unit carries the path it was provisioned
with, which is why the unit file itself holds no path.

### Five things that will surprise you, all of them checked

1. **The first bring-up starts one container.** `profiles.active` at the droplet is
   `["core"]`, which is the observation store and nothing else. So the first run tests
   provisioning, Compose plumbing and the health-wait — not the harness. That is a good
   first run to have, and it is not a demonstration. Adding profiles is a values edit.
2. **Seeding currently does nothing, and says so.** `deploy/seed.d/` contains only its
   `README.md`, so `seed.sh` runs zero steps and logs that the record it writes "is of a
   stack with nothing in it, which is the truth about the components built so far".
3. **`drogna.invalid` is deliberately unusable.** Nothing in the stack resolves
   `public_url` — the run scripts only print it — so `core` comes up whatever it says. It
   has to be real before the proxy is ever enabled.
4. **The certificate is a trap laid for later.** `tls.terminate` is `true` and
   `proxy.tls.certificate` names a file nothing in the repository creates. While `edge` is
   out of the active profiles this costs nothing. The moment `edge` joins them, the proxy's
   entrypoint runs `nginx -t` and fails loudly rather than serving. Loud is the right
   behaviour; plan the certificate before the profile.
5. **A cold build can take fifteen minutes on two cores**, and `run_droplet.sh` prints a
   warning about it because a silent build stage reads as a hang.

---

## Part 2 — What a deploy actually does

`scripts/run_droplet.sh` is `up.sh` + `seed.sh` + prune. The part you asked about — rebuild
and restart — is inside `up.sh`:

1. **Validate.** `validate_config.py` for this destination, then `destination_parity.py`
   across all of them. A bad configuration stops the deployment before anything starts.
2. **Render `deploy/.env`** from `deploy/env.template` and the destination's
   `deployment.json`. The database password is generated once and **reused** on every
   subsequent run, so a redeploy does not present a new password to a store initialised
   with the old one.
3. **Preflight ports**, but only for services that are not already running — so converging
   over a live stack is the normal case rather than a failure.
4. **`compose up --detach --build --wait --wait-timeout 900`.** This is the whole of it:
   - `--build` rebuilds any image whose build context changed;
   - Compose recreates a container only when its image ID or its service configuration
     changed — everything else keeps running untouched;
   - **named volumes are not touched.** A deploy is not a reset. `down.sh --volumes` is the
     reset, and `run_droplet.sh` never calls it;
   - `--wait` blocks until every started service is healthy and exits non-zero otherwise,
     printing `report_unhealthy`'s per-service detail.
5. **Seed.** Idempotent by contract (`deploy/seed.d/README.md`), and today a no-op.
6. **Prune** dangling images carrying this project's Compose label, and builder cache above
   2 GiB. Only this project's artefacts; nothing else on the host is touched.

So "a commit rebuilds and restarts what changed" is genuinely covered — once the code is
there.

### The missing link

**Nothing brings new code to the droplet.** There is no `git` anywhere in
`run_droplet.sh`; it deploys whatever is on disk. `harness.service` is explicit about the
same thing — it converges the host on "what **the checkout** says", the checkout, not the
remote. So a merge to `main` today changes nothing on the droplet at all.

The two drafts below are exactly that link, and nothing more.

---

## Part 3 — Draft A: `--revision` on `run_droplet.sh`

Putting the checkout update *inside* the deployment script, rather than having the workflow
do it over the script's head, keeps the property the script currently claims: one command
deploys the droplet.

```sh
revision=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --revision)
      revision="${2:-}"
      [ -n "${revision}" ] || fail "--revision needs a commit"
      shift 2
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

if [ -n "${revision}" ]; then
  step "Bringing the checkout to ${revision}"
  # Refuse rather than clobber. A deployment that quietly discarded somebody's debugging
  # edit would be the last thing they expected of it.
  git -C "${DROGNA_ROOT}" diff --quiet HEAD ||
    fail "the checkout has uncommitted changes; deploy refuses to discard them"
  git -C "${DROGNA_ROOT}" fetch --quiet origin
  git -C "${DROGNA_ROOT}" checkout --quiet --detach "${revision}"
fi
```

Four notes, each of which is a decision rather than a detail:

- **Detached on purpose.** The droplet tracks a commit, not a branch, so nothing on the host
  can later fast-forward it to code nobody deployed.
- **The untracked files are load-bearing.** `deploy/.env` and `deploy/.runtime/` are
  ignored — `.gitignore` lines 66 and 71 — so a checkout leaves them alone, and with them
  the generated database password and the seeding record. Were either ever tracked, a
  deploy would replace the password and orphan the store it initialised. Worth an assertion
  somewhere, because it is the kind of thing that breaks silently a year later.
- **No credential needed.** The repository is public, so `git fetch` on the host needs
  nothing configured.
- **A reboot returns to the deployed commit**, because `harness.service` runs `up.sh` from
  that same checkout.

---

## Part 4 — Draft B: the deploy workflow

**This is a draft. It is not at `.github/workflows/` and must not be moved there until Part
1 has been done by hand.**

```yaml
name: Deploy

on:
  push:
    branches:
      - main

# Two merges in quick succession deploy in order. Cancelling the first would leave the
# droplet halfway through a build with nobody watching.
concurrency:
  group: deploy-droplet
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy the pushed commit
        env:
          DROPLET_HOST: ${{ secrets.DROPLET_HOST }}
          DROPLET_USER: ${{ secrets.DROPLET_USER }}
          DROPLET_SSH_KEY: ${{ secrets.DROPLET_SSH_KEY }}
          DROPLET_KNOWN_HOSTS: ${{ secrets.DROPLET_KNOWN_HOSTS }}
          DEPLOYMENT_ROOT: ${{ secrets.DROPLET_CHECKOUT_PATH }}
          REVISION: ${{ github.sha }}
        run: |
          set -euo pipefail
          install -d -m 700 ~/.ssh
          printf '%s\n' "$DROPLET_SSH_KEY" > ~/.ssh/id_deploy
          chmod 600 ~/.ssh/id_deploy
          printf '%s\n' "$DROPLET_KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh -i ~/.ssh/id_deploy "$DROPLET_USER@$DROPLET_HOST" \
            "cd '$DEPLOYMENT_ROOT' && scripts/run_droplet.sh --revision '$REVISION'"
```

- **No checkout step.** The workflow never reads the repository; the droplet fetches it.
- **`github.sha`, not "whatever `main` is now".** A second merge landing mid-deploy cannot
  make the first deploy install the second's code.
- **Plain `ssh`, not a third-party action.** Fewer moving parts, and `known_hosts` comes
  from a secret rather than from `StrictHostKeyChecking=no` — which is worth doing even in a
  toy, because turning host verification off is a habit that travels.
- **It fails when the stack does**, because `up.sh` exits non-zero on an unhealthy wait and
  prints which services are unhealthy.
- **Five secrets**: host, user, private key, known-hosts line, and the checkout path.

### The hardening option, and why it is not in the draft

`on: push` deploys a red `main`. Triggering on `workflow_run` after CI concludes
successfully would not — at the cost that `workflow_run` runs the *default branch's* copy of
the workflow and the commit has to be threaded through explicitly rather than being
`github.sha`. For a demonstration harness `on: push` is defensible, and the PR that
introduces this should say which was chosen and why rather than leaving it to be inferred.

**Images still build on the droplet.** Neither draft changes that, so the first deploy after
any change to a Dockerfile or to the Python workspace costs minutes on two cores while the
demonstration is also being served. Building in CI and pulling from a registry is a separate
piece of work and is item 6 in the other document's order.

---

## What was checked, and what was not

The two drafts are not just written out. Both were parsed, and the shell one was exercised:

- `draft.yml` parses, with `on.push.branches == ["main"]`, `concurrency.cancel-in-progress
  == false`, and one step. (Note for anyone linting it with a YAML 1.1 parser: bare `on:`
  loads as the boolean `true`. GitHub's own parser is fine with it, and `ci.yml`,
  `pages.yml` and `capture.yml` all write it bare, so the draft matches the repository.)
- `draft.sh` passes `bash -n`, and its argument parsing was run against a stubbed `git` that
  records calls instead of touching a repository. Four cases: **no arguments** skips the
  block entirely and exits 0; **`--revision abc123`** issues exactly
  `diff --quiet HEAD`, `fetch --quiet origin`, `checkout --quiet --detach abc123`, in that
  order; **`--revision` with nothing after it** exits 1 saying so; **an unknown argument**
  exits 1 saying so. The two failures were watched failing rather than assumed.

What was **not** checked is everything that needs a droplet or a Docker daemon: the
provisioning script, the systemd unit, the health wait, the prune, and the question in
step 3 below. Those are unverifiable from here, and the container-trap in `CLAUDE.md`
applies — anything that cannot run here is untested until something else says otherwise.

---

## Part 5 — What to prove before arming any of this

The repository's own rule is that a check nobody has watched fail is worth nothing, and a
deploy workflow is a check on every merge. So:

1. **Do Part 1 by hand**, and correct the paragraph in `deploy/README.md` that says nobody
   ever has.
2. **Run the workflow against a droplet you can afford to break**, before it is the one
   anybody is looking at.
3. **Prove it fails.** Push a commit that cannot build and watch the workflow go red. The
   behaviour to confirm — rather than assume — is what happens to the stack that is already
   running: Compose should leave the live containers alone when a build fails, so the
   previous deployment keeps serving. I have not verified that, and it is the single most
   valuable thing to find out before trusting this.
4. **Prove the rollback.** Deploy the previous commit by hand with `--revision` and confirm
   the stack returns. Deterministic seeding is what makes that safe; a rehearsal is what
   makes it known.
5. **Only then** point it at the droplet that matters.
