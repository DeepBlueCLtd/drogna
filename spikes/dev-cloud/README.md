# Development cloud spike

**The question**: can drogna be brought up, and looked at, inside a Claude Code
development cloud container — the ephemeral session an agent actually works in?

**The question behind it**, which is the one the answer is written against: `CLAUDE.md`
records that this container has no Docker daemon, so every container-backed test skips
here and runs in CI, and that three CI rounds were lost to exactly that. Is that gap a
property of the environment, or had nobody tried?

**The answer**: nobody had tried. The daemon is not running, but `dockerd` is installed
and starts in about a second with no extra privileges, and the whole local profile — six
containers — comes up healthy. One headless Chromium capture of the running client takes
under four seconds. Four defects stood between here and that, and only two of them are
about this environment. The fourth is not: every local bring-up on any Linux host leaves
its containers running against a configuration directory that has been unlinked underneath
them, and it is invisible on a developer's Mac. All four are fixed. Read
[FINDING.md](FINDING.md).

The lesson is the one `CLAUDE.md` already teaches about task lists, arriving from a
different direction: **the tree is the authority and the record is a claim about it.**
"This container has no Docker daemon" was true of the daemon and false about the
container, and it had been read as settled for long enough that the trap it produced —
container tests that are untested until CI says otherwise — was written down as a cost of
doing business rather than as a thing to check.

## Run it

```sh
./run.sh
```

Needs nothing set and nothing edited. It starts the daemon if it is not running, finds
the egress proxy's certificate authority where this environment keeps it, runs the
repository's own `scripts/run_local.sh`, and takes one glance. About eight minutes on a
cold container, almost all of it building four images that have no layer cache.

Everything it learns lands in `results/`. The stack stays up afterwards.

## Doing it by hand

Three commands, and the middle one is the only one that is about this environment:

```sh
dockerd >/tmp/dockerd.log 2>&1 &                 # not running at session start
export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"    # deploy/README.md says this verbatim
./scripts/run_local.sh
```

Then, against the running client:

```sh
cd client && pnpm install --frozen-lockfile      # once per container
cd .. && HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs
```

No `playwright install`. The container carries Chromium build 1194 and the client pins
`@playwright/test` 1.56.1, which asks for exactly that build. Running it would download a
second copy of a browser that is already there.

## This is spike code

Throwaway, and marked as such at the top of `run.sh`. It hardcodes nothing about a
destination — every location it uses comes from the repository's own configuration — but
it does name this environment's certificate bundle and its Docker socket, which are facts
about the machine. `spikes` is on the gate exclusion list in `scripts/_gate_lib.py`.

Nothing here is imported by drogna. The things meant to survive this spike are not in this
directory at all, because they are fixes rather than findings: the two seam repairs in
`deploy/images/`, the exit-status check in `scripts/run_local.sh`, the gate in
`scripts/check_proxy_ca_seam.py` that would have found the first two together, and — the
one with the longest reach, because it is not about this environment — the directory that
`deploy/lib/render_credentials.py` now empties rather than replaces.

## What is here

| File | What it is |
|---|---|
| `run.sh` | The one command. Daemon, bring-up, capture, `results/`. |
| `results/` | The evidence. |
| `FINDING.md` | The dated finding: question, method, evidence, result, handover. |

## Reading `results/`

| File | What it shows |
|---|---|
| `environment.txt` | What this machine is: Docker, egress, browser, and the stack once up. |
| `without-ca.txt` | The bring-up refusing to build without the certificate authority. |
| `with-ca.txt` | The same bring-up reaching six healthy containers with it. |
| `containers.txt` | The six, and their health. |
| `glance.txt` | The capture: one image, in under four seconds. |
| `glance-0001.png` | The image. The eighteen-box shell, dark, which is correct here. |
| `glance-0001.json` | Its report, including the rate in force when it was taken. |
| `glance-client-down.txt` | The same command against a stopped client, naming the address. |
| `gate-caught-violations.txt` | The new gate reporting the two real defects. |
| `gate-green-again.txt` | The same gate, clean, once they were fixed. |

## Shelf life

The bring-up and the capture depend on nothing that moves. What does move is the
environment: the certificate bundle's location, the preinstalled Chromium build, and
whether the image ever starts a daemon of its own. Re-run it if a build fails with
`certificate verify failed`, if Playwright asks for a Chromium revision that is not in
`/opt/pw-browsers`, or if `docker info` answers at session start — the first step of
`run.sh` already handles that last one, and would simply say so.
