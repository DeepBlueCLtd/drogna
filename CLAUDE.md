# Working on drogna

drogna is a demonstration harness: a synthetic ocean, sensors that sample it, a forecast
loop that assimilates what they report, and a query layer that serves the result through
OGC API-EDR and SensorThings. Everything in it is deliberately fake and says so.

Sixteen features, eleven services, 1799 Python tests and 446 client tests, fourteen gates
and twenty-two ADRs. All four SRD acceptance criteria pass.

## Where the answers already are

Read these before asking a question they answer. They are kept current, and they are the
reason a fresh session can pick this up without archaeology.

| Question | Where |
|---|---|
| What may I never do? | `.specify/memory/constitution.md` — ten principles, currently at 1.5.0 |
| Why is it built like this? | `docs/adr/` — 23 records (numbered to 0024; there is no 0017), each with the alternative it rejected |
| What does this feature do, and what is deliberately not done? | `specs/<nnn>-*/spec.md` and `tasks.md` |
| Where does a file live, and who owns it? | `docs/architecture/repo-layout.md` |
| What does a store look like on disk? | `stores/coverage/layout.md` |
| Was this question already investigated, and what did it cost? | `spikes/*/FINDING.md` — eight, each dated; the ones that measured keep their evidence in `results/` |
| How do I run the stack, or see the client, from this container? | `spikes/dev-cloud/README.md`, and the commands below |

`tasks.md` files record unticked work with the reason it is unticked. An unticked task
**with an explanation** is a decision, not an oversight — read it before redoing the work.

An unticked task with *no* explanation means nobody maintained the file, and it says
nothing about whether the work exists. Six features finished with their task lists
essentially untouched — 002, 003, 004, 005, 013 and 015 — leaving 248 of 252 tasks
unticked, including the whole of the security proxy. Reconciled against the tree on
27 August 2026: **196 were done, 33 partly done, and 23 genuinely outstanding.** So the
file was wrong about roughly nine tasks in ten, and right about twenty-three — which is
why it had to be checked rather than either trusted or discarded.

The lesson is the one to carry: **the tree is the authority and the record is a claim
about it.** Where the two disagree, check the tree, then fix the record. A task list that
has stopped being maintained is worse than no task list, because it is read as evidence.

The cheapest guard is to tick as you go, and to write the reason at the moment you decide
not to do something — the reason is the part that cannot be reconstructed later.

## Commands

```sh
uv sync                          # the Python workspace
uv run ruff check . && uv run ruff format --check .
uv run pytest
./scripts/gates.sh               # every constitution gate, plus the exemption inventory
cd client && pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test
```

Running the stack, and looking at it. Both work in this container — see the daemon trap
below before assuming otherwise:

```sh
dockerd >/tmp/dockerd.log 2>&1 &                 # not running at session start; start it
export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"    # nothing builds here without this
./scripts/run_local.sh                           # up + seed; converges if already up
./scripts/down.sh local                          # and `pytest` takes it down too, see below

HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs
```

The last is a headless-Chromium screenshot of the running client, in about three seconds.
It starts no server and changes nothing, and it prints the simulated rate in force beside the
image so that a picture of a stopped system is never handed over as a live one. There are two
other capture mechanisms and they are deliberately not the same command;
`scripts/capture/README.md` says why before you try to merge them. Do not run
`playwright install` — this container already carries the Chromium build the pinned
Playwright asks for.

`./scripts/gates.sh` runs the gates listed in `scripts/gates.registry`, one per line. **A
new gate is a line appended to that registry.** Never edit `scripts/gates.sh` — it names no
gate, which is what lets a feature add one without touching the others. A test walks
`scripts/` and fails if a `check_*` script is not registered.

## Traps that have actually cost this repository time

**A Docker daemon is not *running* here, which is not the same as not being available.**
This paragraph used to say the container had no daemon, and everything downstream was
planned around it: container-backed tests skip locally, so they are untested until CI says
otherwise, and three CI rounds were lost to exactly that. It was true of the daemon and
false about the container. `dockerd`, `containerd` and `runc` are all installed; `dockerd &`
brings one up in about a second with no extra privileges, and the whole `local` profile then
comes up healthy. **Start it and run the container tests here, before CI sees them.**
`spikes/dev-cloud/` is the bring-up, the headless-Chromium capture, and the four defects that
stood in the way — the last of which had been breaking every Linux bring-up in silence.

Carry the lesson further than the daemon: the sentence sat at the top of this list, was read
as settled, and shaped how work was scheduled, for as long as nobody typed the command it
implied was pointless. **The tree is the authority and the record is a claim about it** —
which this file already says about `tasks.md`, and had not applied to itself.

What remains true regardless: reason about a container test's configuration statically as
well — the last such bug was plainly visible in the rendered nginx config and nobody read it.
Container tests must skip loudly with a reason, never fail and never silently pass, and must
run containers as the invoking user (`--user "$(id -u):$(id -g)"`); running as root produced
twenty-seven CI-only errors.

**Every byte a build container fetches here is TLS-intercepted, and no base image trusts the
authority.** There are no proxy variables inside a container — the interception is at the
network layer, so the host's `no_proxy` list does not apply and `pypi.org` is as intercepted
as anything else. The deployment already ships the seam for this: name the bundle with
`export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"` and everything else follows
(`deploy/README.md`, "Building behind a TLS-terminating proxy"). Every network-reaching build
step must mount the `proxy_ca` secret, and two did not — `apk add` in the proxy image, which
is the *first* thing that image does, and `pip install ./libs/harness_core` in the query
image, which looks like a local copy but resolves a build backend from the index first.
`scripts/check_proxy_ca_seam.py` is now the gate; read it before adding a `RUN` that fetches.

**Where a daemon *is* present, the hazard inverts.** Docker Desktop on macOS enforces neither
ownership nor mode on a bind mount — every file reads as root and any uid may open it — so a
permission fault is invisible on a developer's machine and fatal on the Linux runner. The
broker lived in that blind spot for its whole life: `deploy/lib/render_credentials.py` set the
password file's mode and never its owner, mosquitto reads that file after dropping to uid
1883, and the container exited 13 with `Error: Unable to open pwfile` on every Linux run while
reporting healthy on every Mac. Prove anything about file permissions *inside a Linux
container*, never against the host filesystem, and watch it fail both ways before believing it.

**The same blind spot has now cost a third fault, and this one broke every bring-up.** A bind
mount follows the *inode*, not the path — but Docker Desktop shares one by path through a VM,
so on a Mac a container follows a directory that has been replaced underneath it and nothing
is ever seen to break. `render_destination` in `deploy/lib/render_credentials.py` did
`shutil.rmtree` then `mkdir` on the configuration directory every container mounts at
`/etc/drogna`, and `scripts/run_local.sh` renders it twice — `up.sh` before the containers
start, `seed.sh` after. So on Linux every container kept the old, unlinked directory and saw
it **empty**: clock, query and proxy each saw 0 files where the host had 19. Only the clock
ever reported it, because only its health check re-reads its document; everything else read
its own at start-up and went on reporting healthy against a directory that was gone. It is
fixed by emptying the directory rather than replacing it. **Never replace a directory a
running container is mounting** — and note the shape it shares with the trap directly below:
each is an artefact given away or swapped out between the first run and the second, and
neither can be seen by a trial run that starts by clearing everything.

**Giving a file away breaks the run after this one.** The chown that finally let the broker
read its password file took the file from the deploying user, and `write_password_file`
truncated it in place — so the first bring-up worked and every one after it died with
`PermissionError: [Errno 13]`. `scripts/up.sh` is required to converge, so the *second* run is
part of the behaviour and not a nicety. Unlink and recreate rather than truncate: unlinking is
a permission on the directory, which the deployer keeps, not on the file, which it has just
given away. This was missed locally because every trial run began by deleting the file —
**never clear the artefact before re-running, or you only ever test the case that works.**

**A health check can name a program the image does not carry.** `wget --spider` against
`python:3.11-slim-bookworm`, which ships neither wget nor curl. Such a check cannot pass and
cannot say why: the query layer answered 200 to everything that asked while Compose waited out
the whole timeout, and what the bring-up reported was a failure three services downstream.
Check the probe against the image — `python3` here — and prefer a probe that would notice the
service being down. `drogna-healthcheck` answers "am I configured", not "am I serving", so it
is the wrong check wherever something else waits on `service_healthy`.

**Each image has its own ignore file, and a `COPY` added later does not update it.** BuildKit
reads `deploy/images/<name>.Dockerfile.dockerignore` in preference to any at the context root.
`libs` was excluded from the query layer's context long before that Dockerfile grew its
`COPY libs/harness_core`, and the client's excluded `contracts` while the client's own
`schemas.ts` imported the masters out of it. Both failed on paths that plainly exist in the
tree. The exception must *follow* the exclusion — `libs`, then `!libs/harness_core` — because
Docker takes the last matching pattern. Copy the repository's layout rather than flattening
it, too: relative imports that reach out of a directory need what they reach for to still be
beside it.

**nginx resolves its upstreams once, at start-up.** A proxied service that is not up yet is
`host not found in upstream`, and nginx then refuses the whole configuration rather than that
one location — so the boundary does not come up at all. That is a `depends_on` with
`condition: service_healthy`, not a preference.

**Running `pytest` takes the local stack down.** `tests/integration/test_compose_bringup.py`
drives the real `scripts/up.sh` and `scripts/down.sh` against the real project name, so a full
test run stops whatever you had running and leaves the active profile in its place. Bring the
stack back up afterwards rather than wondering why the browser stopped answering.

**An image nobody has built is not a working image, and the file usually says so.** Every trap
above was found in one sitting, the first time the promoted profiles were actually started,
and two of those files carried "this image has never been built" or "it has never been
started" at the top. That is a warning, not a note. `full` still cannot come up: it names
`features`, and `services/features` does not exist.

**`ruff format` formats Python inside Markdown fences.** A code snippet in a blog post or a
spec is held to the same standard as the file it was copied from. This has turned the build
red once.

**Stage first, verify the staged tree, then commit.** `git add -A` swept in-flight work into
three separate red CI runs. Where agents are writing concurrently, verify the *snapshot*
rather than the working tree:

```sh
git add -A
tree=$(git write-tree) && snap=$(git commit-tree "$tree" -p HEAD -m verify)
git worktree add --detach /tmp/verify "$snap"   # test exactly what you would commit
```

**Some files are shared and append-only**: root `pyproject.toml`, `uv.lock`,
`contracts/openapi/generators.toml`, `tests/unit/test_generated_models.py`,
`scripts/gates.registry`, `deploy/compose.yaml`. Append, never rewrite — a concurrent
rewrite silently dropped another agent's `pythonpath` entry. A duplicate key in
`compose.yaml` is refused outright by Docker Compose; `deploy/lib/compose_lint.py` catches
it now, but only because it reads the keys as a sequence rather than a mapping.

**Boundary shapes are generated, never hand-written.** Add the master under
`contracts/schemas/`, run `./scripts/generate_types.sh`, register it in
`tests/unit/test_generated_models.py`. A shape nobody declared is invisible to the gate that
forbids undeclared shapes, which is how two hand-written `Measurement` dataclasses survived
until the schema that described them was finally written.

## The one habit that matters

**A check that has never been seen to fail is worth nothing.** Every gate, test and
validator here is expected to have been watched failing on the thing it describes — plant
the violation, see it caught, revert it, and say so in the commit message.

This is not ceremony. Two of the original four gates were reporting a file of deliberate
violations as clean. The tests proving the gates could fail were themselves not being
collected by `pytest`. A capture-comparison test was made to pass by neutering the
comparison, and then by a readiness check that never let it look. Each of those looked
exactly like a clean run.

The corollary: when a test passes on the first attempt, be suspicious of it rather than
pleased with it. And prefer a bound derived from something on disk over a number typed into
a test — AT-03's error bound is read from the authoring jitter, so no edit to the test can
tune it.

The corollary earned itself again, in the obvious way. The regression test for the bind-mount
fault above compared the configuration directory's inode number across the two renders, and
**passed against the unfixed renderer**: the kernel had handed the freed inode straight back
to the `mkdir`. An inode number is not an identity once it has been released. The test now
holds an open directory descriptor across the second render and reads through it, which is
what a bind mount actually *is*, and reports `sees []` against the unfixed renderer — the same
zero the containers reported. Had it been committed as first written, it would have been a
guard that guarded nothing.

**A wrapper that does not check what it wrapped is the same fault at a larger scale.**
`scripts/run_local.sh` — "from a clean checkout to a healthy, seeded local stack" — checked
neither step's exit status. `up.sh` behaved perfectly, printing `an image could not be built;
nothing was started` and exiting 1; `run_local.sh` then seeded the empty stack, wrote a
seeding record, and **exited 0**. It was read as success twice before anybody noticed. When
you compose two commands, propagate the failure of the first, and be wary of a `| tee` or a
pipeline that quietly returns the wrong exit status — that is how this one was missed the
first time.

## A specification that disagrees with the code is not automatically wrong

Four times now the code has been right and the requirement loose, and once the requirement
was right and the schema incomplete. Establish which before amending either. Quietly
rewording a spec to match an implementation is how a spec stops describing the system —
if you find a genuine open question, record it as open rather than dissolving it.
