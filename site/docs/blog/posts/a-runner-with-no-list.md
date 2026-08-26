---
date: 2026-08-26 18:00:00
categories:
  - Process
slug: a-runner-with-no-list
feature: specs/001-deterministic-foundations
description: >-
  Six gates existed and were run one at a time, with CI keeping its own copy of
  the list. The fix was not a script that runs six things; it was a script that
  knows about none of them.
---

# A runner with no list

drogna's constitution has ten principles and five of them are enforced by a script
that fails the build. Those scripts got written one at a time, as the features that
needed them arrived, and each one landed the obvious way: a new file in `scripts/`,
and a new step in the CI workflow that runs it.

By the seventh, that had stopped being obvious and started being a problem.

<!-- more -->

## The shape of the problem

Here is what the workflow looked like:

```yaml
- name: Gate — no wall-clock time (Constitution I)
  run: uv run python scripts/check_no_wallclock.py

- name: Gate — seeded randomness (Constitution II)
  run: uv run python scripts/check_seeded_rng.py

- name: Gate — no literal paths or hosts (Constitution IV)
  run: uv run python scripts/check_no_literal_paths.py
```

...and four more like it. Nothing wrong with any single line. The problem is the
whole: this is a list of the gates, and it is the *only* list of the gates, and it
lives somewhere a contributor never looks.

Two things follow from that, and both of them are worse than they look.

**A contributor cannot run what the build runs.** Not without reading a YAML file
and copying seven commands out of it by hand — which means, in practice, that they
push and find out. Every gate failure becomes a round trip through CI. The gates
were written to catch mistakes early; a gate you can only run late is a gate that
has given most of its value away.

**The list can fall behind the thing it lists.** A feature adds a gate, writes the
script, writes its tests, and forgets the workflow step. Everything is green. The
tests for the new gate pass, because they invoke the gate directly. The gate itself
runs against nothing, because nothing invokes it. This is the exact failure mode the
gates exist to prevent — a check that has quietly stopped checking — reproduced one
level up, in the machinery that runs the checks.

The requirement had actually anticipated this. FR-036 asks for two things:

> The gates MUST be runnable locally by a single documented command, and MUST be
> written so that later features can add gates to the same runner without editing
> the existing ones.

The second clause is the interesting one, and it is easy to read past. It is not
asking for a script that runs six things. A script that runs six things has the
list in it, and adding a seventh means editing the script — which is exactly what
"without editing the existing ones" rules out.

## The list goes in a file

So the list is not in the runner. It is in `scripts/gates.registry`:

```
Constitution I — no wall-clock time|uv run python scripts/check_no_wallclock.py
Constitution II — seeded randomness|uv run python scripts/check_seeded_rng.py
Constitution IV — no literal paths or hosts|uv run python scripts/check_no_literal_paths.py
Constitution V — no tracked-entity vocabulary|uv run python scripts/check_forbidden_vocabulary.py
Constitution III — schema conventions|uv run python scripts/check_schema_conventions.py
Constitution III — no hand-written boundary types|uv run python scripts/check_handwritten_types.py
Constitution III — generated types are current|./scripts/check_types_drift.sh
```

One gate per line: the principle it enforces, a bar, the command that checks it.
The label is not decoration. When a gate fails, the summary names the principle
rather than the filename, because "no wall-clock time" tells you what you broke and
`check_no_wallclock.py` tells you where to go and read about it — and the first of
those is the one you want at the moment of failure.

`scripts/gates.sh` reads that file and mentions no gate at all. Adding a gate is
appending a line. That is the whole of it, and CI does not change, and the runner
does not change, and the six gates that already exist are not touched.

## Two decisions that were not obvious

**Every gate runs, even after one fails.** The instinct is `set -e` and stop at the
first failure — it is faster, and it is what most runners do. It is also wrong here.
A gate run is a report, and a report that stops at the first item sends you round
the loop once per violation. So the runner keeps going, collects the exit codes, and
tells you at the end how many of how many failed and which ones. `--fail-fast` is
there for when you want the other behaviour, which is mostly when you are working on
one gate and do not care about the rest.

**The exemption inventory prints once.** Every gate supports an inline exemption
marker — `harness:allow-wallclock`, with a reason, on the offending line — and a
marker without a reason is itself a violation, because an exemption nobody had to
justify is an exemption nobody reviewed. FR-034 asks that every marker in the
repository be listed in one place, so a reviewer can see the full set of things the
constitution has been asked to make an exception for. Each gate can print its own
inventory with `--inventory`, which is useful when working on that gate alone. The
runner prints it once, after all the findings, from the shared machinery that owns
it. Seven copies of a list are not a list.

The result reads like this:

```
── Constitution I — no wall-clock time
no-wallclock: clean.

── Constitution II — seeded randomness
seeded-rng: clean.

...

Exemption inventory:
  client/src/time/host.ts:22: harness:allow-wallclock — ADR-0006, heartbeat
    cadence and liveness windows are real time
  libs/harness_core/src/harness_core/clock_service.py:303: harness:allow-wallclock —
    the clock service's real-time driver (Constitution I, FR-009)
  ...

gates: all 7 clean.
```

Forty-six exemptions across the tree, each with a reason someone had to write down.
That list is worth more than any single gate's output: it is the record of every
place the project has decided a principle should not apply, in one place, where a
reviewer can see it growing.

## Proving the runner can fail

There is a post on this blog about [a gate that examined
nothing](the-gate-that-examined-nothing.md) — two of the constitution gates were
reporting a file of deliberate violations as clean, and it took writing the tests to
find out. The lesson generalises upward. A runner that reports "clean" whatever its
gates say is worse than no runner, because it looks like assurance.

So the runner takes `--registry PATH`, and its tests use it:

```python
DIRTY = "python3 -c 'print(\"probe: 1 violation(s).\"); raise SystemExit(1)'"

def test_a_failing_gate_fails_the_run(tmp_path: Path) -> None:
    """The assertion the rest depend on: the runner can report a failure."""
    result = run("--registry", registry(tmp_path, f"probe|{DIRTY}"), "--no-inventory")
    assert result.returncode == 1, result.stdout
    assert "1 of 1 failed" in result.stdout
```

That is the load-bearing test. The ones that assert a clean run exits zero mean
nothing on their own — a runner that always exits zero passes all of them.

Two more are worth naming, because they cover the failure that is hardest to see:

```python
def test_an_empty_registry_is_a_failure_not_a_pass(tmp_path: Path) -> None:
    """Nothing checked and everything clean must not look the same from outside."""
    result = run("--registry", registry(tmp_path, "# only a comment"), "--no-inventory")
    assert result.returncode == 2
```

A registry that registers nothing exits 2, and so does a registry that is not there
at all. Both of those would otherwise present as a clean run, and a clean run is
precisely the thing a reviewer takes as permission to merge.

And the one that closes the loop the registry opened:

```python
def test_the_registry_covers_every_gate_in_the_scripts_directory() -> None:
    """A gate added to scripts/ but never registered is a gate nobody runs."""
```

It globs `scripts/check_*.py` and `scripts/check_*.sh` and fails if any of them is
missing from the registry. Moving the list out of CI removed one way for it to fall
behind; this test removes the other. A future feature can now forget to register its
gate, and the build will say so.

## What it cost

A shell script, a text file, eleven tests, and seven lines of CI collapsed into one.
`scripts/gates.sh` is now in the README next to `ruff` and `pytest`, which is where
a contributor was always going to look for it.

The part worth keeping is smaller than the diff. The requirement said "without
editing the existing ones", and the natural reading of that is a plea for good
manners — be careful, do not disturb your neighbours. It is not. It is a constraint
on the design, and there is exactly one structure that satisfies it: the runner does
not know what it runs. Everything else — the aggregated exit codes, the single
inventory, the registry coverage test — followed from taking that literally.
