> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Finding: drogna runs in the development cloud, and the seam that lets it was half-built

**Dated 28 August 2026.**

**The question.** `CLAUDE.md` opens its list of expensive traps with "This container has no
Docker daemon. The CI runner has one" — and draws from it the rule that anything skipping
locally is untested until CI says otherwise, at a cost already measured in three lost CI
rounds. Is that a property of the development cloud, or had nobody tried?

**The answer.** Nobody had tried. There is no daemon *running*, which is what `docker info`
reports and what everything downstream concluded from; but `dockerd`, `containerd` and
`runc` are all installed, the session is uid 0 with a near-full capability set, and the
daemon starts in about a second with no flags. The whole `local` profile then comes up:
six containers, all healthy. A headless Chromium capture of the running client takes 3.7
seconds against a ten-second budget.

Four defects stood in the way, and only two of them are about this environment. Two are in
the seam this repository already built for this exact case, never exercised because the
seam had never been run anywhere that needed it. The third is a command that reported
success for a bring-up that had failed. The fourth is not about the development cloud at
all: **every local bring-up on any Linux host leaves every container running against a
configuration directory that has been deleted out from under it**, and it is invisible on a
developer's Mac. All four are fixed here, and a gate that finds the first two together is
registered.

## Method

Nothing below was reasoned about statically. Every claim was produced by running the thing
and, where it is a claim about a check, by watching the check fail on the thing it
describes before watching it pass.

The order matters and was not the order planned, which is the honest account: the first
bring-up failed, the failure was misdiagnosed as needing new work, that work was built,
and only then was `deploy/README.md` read — where the mechanism already existed, described
better than the replacement. The replacement was deleted. **The repository answered the
question before the spike did, and the spike spent an image build finding that out.**

## What is true about the machine

Written out in `results/environment.txt`; the load-bearing parts:

- **Docker 29.3.1 client and daemon, Compose v5.1.1**, `overlayfs` storage over the
  containerd snapshotter, **cgroup v1** — the daemon warns that v1 support is deprecated.
- **No daemon at session start, and no socket.** `dockerd` is at `/usr/bin/dockerd` and
  needs nothing to start.
- **Egress from inside a container is transparently TLS-intercepted, for every host.** No
  proxy variables are set inside a container; the interception is at the network layer. The
  `no_proxy` list the host's own tools read — which names `pypi.org`, `registry.npmjs.org`
  and the rest — **does not apply to containers**. Probed host by host: without the
  authority, every one fails `certificate verify failed`; with it, every one answers 200.
- **`/root/.ccr/ca-bundle.crt` is a complete bundle** — 152 certificates, public roots plus
  three Anthropic interception authorities — so trusting it loses nothing. `SSL_CERT_FILE`
  already points at it.
- **Docker Hub rate-limits.** Two probe builds died on `429 Too Many Requests` while an
  adjacent pull succeeded. Base images here are digest-pinned, which does not help: a cold
  container pulling six base images can hit it, and the failure names the registry rather
  than the limit.

## The two defects

Each image definition mounts an optional build secret named `proxy_ca`, declared in
`deploy/compose.yaml` from `HARNESS_PROXY_CA_FILE`, and `deploy/README.md` gives the line
to set it. It was written for this environment and says so, citing SRD NFR-06.

**The seam was written at the step in each image that looks like a fetch.** Two steps that
also reach the index were outside it:

1. **`deploy/images/proxy.Dockerfile:32` — `apk add --no-cache python3 py3-pip`.** The
   proxy image is the only one that reaches the network *before* it reaches its package
   manager, and this is the first thing it does. The consequence is not a late failure in
   one layer: behind such a proxy this image could never be built at all, and since
   `up.sh` refuses to start anything when a build fails, **no part of the stack could come
   up**. The comment three lines below it reads "exactly as in the other image
   definitions", which is exactly the assumption that hid it.

2. **`deploy/images/query-layer.Dockerfile:68` — `pip install --no-cache-dir
   ./libs/harness_core`.** This one looks like a local copy and is not: pip resolves a
   build backend from the index before it can build a local directory, so the step is as
   network-bound as the `requirements.txt` install that *does* carry the secret twenty
   lines above.

They were found one at a time, each after a full image build, each looking like a fresh
problem. That is the argument for the gate rather than for two fixes.

## The third defect, which is worse than either

`scripts/run_local.sh` — "The one command. From a clean checkout to a healthy, seeded local
stack" — checked neither step's exit status:

```sh
"${here}/up.sh" local
"${here}/seed.sh" local
```

`up.sh` behaved perfectly: it printed `error: an image could not be built; nothing was
started` and exited 1. `run_local.sh` then ran the seeding against a stack in which nothing
was running, printed `== Seeded after 2s`, wrote a seeding record, **and exited 0**. That
was observed, not deduced — it is in this session's history twice before it was noticed,
and the second time it was read as success.

It belongs in the same family as the failures `CLAUDE.md` already collects: a capture test
made to pass by neutering its comparison, two gates reporting a file of deliberate
violations as clean. A run that cannot fail is not a run. `set -euo pipefail` is now at the
top, with the observed failure written above it as the reason.

## The fourth defect, which is not about this environment at all

**`deploy/lib/render_credentials.py:135` replaces the configuration directory that every
running container is bind-mounting.**

`run_local.sh` is `up.sh` and then `seed.sh`. `up.sh` renders `deploy/.runtime/config/local`
and starts the containers, which bind-mount it at `/etc/drogna`. `seed.sh:24` then calls
`render_environment` a second time, which reaches `render_destination`:

```python
if target_dir.exists():
    shutil.rmtree(target_dir)
target_dir.mkdir(parents=True)
```

A bind mount resolves to an inode, not to a path. `rmtree` followed by `mkdir` is a *new*
directory; every container already running keeps the old, unlinked one, and sees it empty.

**This was not looked for.** It was noticed because `docker ps` was run once more before
committing, and the clock had gone from healthy to unhealthy since the bring-up — 89
consecutive failed probes of `/etc/drogna/clock.json: unreadable — No such file or
directory`. The measurement that settles it is in `results/config-mount-defect.txt`: the
clock, query and proxy containers each saw **0** files in `/etc/drogna` while the host
directory held 19. The client saw all 19 — and the client is the only container that had
been restarted after the seed step, for an unrelated reason, so it had re-bound to the new
inode. Nothing else about it differs. That is the control this finding rests on.

**Only the clock ever reports it.** Its health check re-reads its configuration document on
every probe. Every other service reads its own once at start-up, before the directory is
replaced, and then goes on reporting healthy while running against a directory that no
longer exists. So the visible symptom is one unhealthy container, and the actual condition
is a whole stack whose configuration has been unlinked.

**It hides on a developer's machine**, for the same reason the broker's password-file
permission fault did: Docker Desktop shares a bind mount by path through a VM, so a Mac
follows the replacement and nothing is ever seen to break. This is the third entry in this
repository's collection of faults that are invisible on macOS and certain on Linux, and it
is the first one that was not found by CI.

The fix empties the directory rather than removing it, so the inode survives. After it,
every one of the four containers checked sees all 19 files and the clock's failing streak is
zero. Before it, the same check on the same stack gave 0, 0, 0 and 19.

**The regression test for it passed on the first attempt, and was wrong.** It compared the
directory's inode number across the two renders, and the unfixed renderer passed: the kernel
had handed the freed inode straight back to the `mkdir`. An inode number is not an identity
once it has been released. The test now holds an open directory descriptor across the second
render and reads through it afterwards, which is what a bind mount actually is — and against
the unfixed renderer it reports `sees []`, the same zero the containers reported. This
repository's advice to be suspicious of a test that passes first time earned itself again
here; the first version would have been committed as a guard and would have guarded
nothing.

## The gate

`scripts/check_proxy_ca_seam.py`, registered as
`SRD NFR-06 — every network-reaching build step takes the proxy_ca secret`.

It joins each `RUN` instruction's continuation lines before judging it — the secret mount
is on the first line and the fetch is on the last, so a line-by-line scan would report
every seam in the repository as a violation and miss every real one — and reports any that
names a package manager without mounting `proxy_ca`.

**It was watched failing on the thing it describes.** Run against the four image
definitions as they stood before this session, from `git show HEAD:`, it reports exactly
two violations, at `proxy.Dockerfile:32` and `query-layer.Dockerfile:68`, and nothing else.
Run against the tree as it now stands, it is clean. Both runs are in
`results/gate-caught-violations.txt` and `results/gate-green-again.txt`.

## Looking at it with a browser

The repository's own mechanism is the right one and needed no change. `scripts/capture/`
carries three, and the one for this is the **glance**: "what does it look like now?",
triggered by an agent mid-session, never pinning the clock, no retention, no gate.

```sh
HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs
```

- **The pinned browser is already installed.** The client pins `@playwright/test` 1.56.1,
  which asks for Chromium build **1194**; `/opt/pw-browsers` carries `chromium-1194` and
  `chromium_headless_shell-1194`. Playwright resolves it with no help — no
  `playwright install`, no `executablePath` override. This is luck rather than design, and
  is the thing in this finding most likely to stop being true.
- **It produced a real page**, not a blank one: the eighteen-box component shell, every box
  dark and labelled `NOT HEARD FROM`, the disclaimer banner, the clock and transport
  panels. Dark is correct here — the `local` profile runs six containers and none of the
  eighteen components, and the shell is built to be dark until a heartbeat says otherwise.
  The image is `results/glance-0001.png`.
- **3.7 seconds**, against SC-001's ten.
- **Its honest-failure path works too.** With the client stopped, the same command fails in
  under a second with `the client could not be reached at http://127.0.0.1:8080 ... That
  address came from the capture configuration, not from a literal in this script`
  (`results/glance-client-down.txt`). The mechanism's own `unreachable.spec.ts` passes
  alongside the glance.

## What this changes

**Container-backed tests can now be run before CI sees them.** That is the whole value
here, and it is worth more than the bring-up: the trap `CLAUDE.md` opens with — "anything
that skips locally is untested until CI says otherwise" — is now avoidable in a session
rather than a cost to be planned around. The related warnings stay true and are now
*checkable* here rather than only in CI: run containers as the invoking user, and prove
anything about file permissions inside a Linux container.

Three claims in `CLAUDE.md` and the specs should be revisited by whoever picks this up:

- "This container has no Docker daemon" — true as written, misleading as read. It is worth
  rewording, because the conclusion drawn from it shaped how a lot of work was scheduled.
- `full` still cannot come up: it names `features`, and `services/features` does not exist.
  That is the defect `spikes/container-size` already reported and it is untouched here.
  `local` is what was proven, and `local` is six of the eleven services.
- The `local` profile's seeding installs no steps yet, so the stack it produces is empty and
  says so. Nothing here changes that; the shell is genuinely dark, not broken.

## Handover

Fixed, and outside this directory:

| Where | What |
|---|---|
| `deploy/images/proxy.Dockerfile` | `apk add` brought inside the `proxy_ca` seam. |
| `deploy/images/query-layer.Dockerfile` | the second `pip install` brought inside it. |
| `scripts/run_local.sh` | `set -euo pipefail`, so a failed bring-up is not reported as a seeded stack. |
| `scripts/check_proxy_ca_seam.py` | the gate, watched failing on both real defects. |
| `scripts/gates.registry` | one appended line, which is the whole of adding a gate. |
| `scripts/tests/test_proxy_ca_seam.py` | the gate's own tests, with four fixtures. |
| `deploy/lib/render_credentials.py` | the rendered configuration directory is emptied, not replaced, so the containers bind-mounting it keep seeing it. |
| `tests/unit/test_rendered_config_directory_is_stable.py` | the guard for that, holding an open directory handle across a re-render, watched failing on the unfixed renderer. |

Not done, and deliberately:

- **The `429` from Docker Hub is not worked around.** A pull-through cache or an
  authenticated pull would fix it and both are decisions about infrastructure rather than
  about this repository.
- **Nothing was changed to make the daemon start on its own.** `run.sh` starts it; whether
  the image should is a question for whoever owns the environment, not for a spike.
- **`CLAUDE.md` is not reworded here.** The sentence is load-bearing enough that changing
  it is a decision, and this finding is the argument for making it, not the making of it.
