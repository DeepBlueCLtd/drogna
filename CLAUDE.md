# Working on drogna

drogna is a demonstration harness: a synthetic ocean, sensors that sample it, a forecast
loop that assimilates what they report, and a query layer that serves the result through
OGC API-EDR and SensorThings. Everything in it is deliberately fake and says so.

Sixteen features, eleven services, 1777 Python tests and 446 client tests, thirteen gates
and thirteen ADRs. All four SRD acceptance criteria pass.

## Where the answers already are

Read these before asking a question they answer. They are kept current, and they are the
reason a fresh session can pick this up without archaeology.

| Question | Where |
|---|---|
| What may I never do? | `.specify/memory/constitution.md` — ten principles, currently at 1.4.0 |
| Why is it built like this? | `docs/adr/` — 13 records, each with the alternative it rejected |
| What does this feature do, and what is deliberately not done? | `specs/<nnn>-*/spec.md` and `tasks.md` |
| Where does a file live, and who owns it? | `docs/architecture/repo-layout.md` |
| What does a store look like on disk? | `stores/coverage/layout.md` |

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

`./scripts/gates.sh` runs the gates listed in `scripts/gates.registry`, one per line. **A
new gate is a line appended to that registry.** Never edit `scripts/gates.sh` — it names no
gate, which is what lets a feature add one without touching the others. A test walks
`scripts/` and fails if a `check_*` script is not registered.

## Traps that have actually cost this repository time

**This container has no Docker daemon. The CI runner has one.** So a container-backed test
skips here and *runs there*. Anything that skips locally is untested until CI says
otherwise, and three CI rounds were lost to exactly this. When you write or change one,
reason about its configuration statically as well — the last such bug was plainly visible
in the rendered nginx config and nobody read it. Container tests must skip loudly with a
reason, never fail and never silently pass, and must run containers as the invoking user
(`--user "$(id -u):$(id -g)"`); running as root produced twenty-seven CI-only errors.

**Where a daemon *is* present, the hazard inverts.** Docker Desktop on macOS enforces neither
ownership nor mode on a bind mount — every file reads as root and any uid may open it — so a
permission fault is invisible on a developer's machine and fatal on the Linux runner. The
broker lived in that blind spot for its whole life: `deploy/lib/render_credentials.py` set the
password file's mode and never its owner, mosquitto reads that file after dropping to uid
1883, and the container exited 13 with `Error: Unable to open pwfile` on every Linux run while
reporting healthy on every Mac. Prove anything about file permissions *inside a Linux
container*, never against the host filesystem, and watch it fail both ways before believing it.

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

## A specification that disagrees with the code is not automatically wrong

Four times now the code has been right and the requirement loose, and once the requirement
was right and the schema incomplete. Establish which before amending either. Quietly
rewording a spec to match an implementation is how a spec stops describing the system —
if you find a genuine open question, record it as open rather than dissolving it.
