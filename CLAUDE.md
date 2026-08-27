# Working on drogna

drogna is a demonstration harness: a synthetic ocean, sensors that sample it, a forecast
loop that assimilates what they report, and a query layer that serves the result through
OGC API-EDR and SensorThings. Everything in it is deliberately fake and says so.

Sixteen features, eleven services, 1535 Python tests and 446 client tests, thirteen gates
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
with an explanation is a decision, not an oversight — read it before redoing the work.

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
