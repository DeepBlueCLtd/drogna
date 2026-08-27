# site/gates/

The publication gates, and the runner that runs all of them.

Nothing here reaches the reader. These are the checks that decide whether the built site
is allowed to be published at all (FR-004), and a failing one stops the push rather than
publishing a partial site.

## Running them

```sh
python site/gates/run_gates.py --site site/build
```

That is the whole of it. Every gate runs, every gate's findings are printed, and the
exit code aggregates. `--fail-fast` stops at the first failure and is for working on one
gate, never for continuous integration. `--timeout` is the deadline a single gate is
given before it is stopped and reported as one that could not run; it defaults to five
minutes, generous because a gate that reads every published image is legitimately slow,
and `--timeout 0` removes it. It exists because a gate that never returns hangs the
publication pipeline until somebody notices, which is the same outcome as a swallowed
exit 2 reached more slowly.

A single gate can be run on its own the same way:

```sh
python site/gates/check_manifest.py --site site/build
```

## The gate contract

A gate is a file `site/gates/check_<name>.py`. There is no registry: the directory is
the registry, and adding a gate is adding a file.

| | |
|---|---|
| Invocation | `python site/gates/check_<name>.py --site <path-to-built-site>` |
| Optional | `--manifest <path>`, defaulting to `docs/manifest.yaml` |
| Findings | one per line on stdout, `<path>:<line-or-->: <rule>: <message>` |
| Summary | a final line, `<name>: N findings` |
| Exit 0 | it ran and found nothing |
| Exit 1 | it ran and found something |
| Exit 2 | it could not run, and it has printed a reason naming what is missing |

`<line-or-->` is a line number where the finding has one and a bare `-` where it does
not — a page that is missing entirely has no line to point at.

**Exit 2 is not a pass.** It exists because one gate needs an optical character
recognition engine that continuous integration has and a development container does not.
A gate that could not run has told you that this run proves less than a clean run does,
so the runner reports it under its own heading and lets it set the exit code, above a
run that merely found things. A check that skips quietly is the failure mode this
repository has been bitten by most often; exit 2 is how a gate refuses to do that.

**The runner passes `--site` and nothing else.** Each gate that needs the manifest reads
it from its own default. Forwarding an option that only some gates accept would break
the ones that do not, and the runner cannot tell which is which without naming them —
which it must not do.

**The runner names no gate.** `site/gates/tests/test_run_gates.py` reads every
`check_*.py` off disk and asserts none of their names appears in `run_gates.py`. It is
the same property `scripts/gates.sh` has, reached through discovery rather than through
a registry, because a site gate has no ordering constraints and no command line of its
own to record.

## What is here

| File | What it checks |
|---|---|
| `run_gates.py` | Nothing. It discovers and runs the rest. |
| `check_manifest.py` | Every page `docs/manifest.yaml` requires exists, does not declare itself a stub, and clears its floor (FR-011, SC-002). |
| `check_subsystem_coverage.py` | Every component identifier in the SRD's component table has a page or an explicit not-yet-built entry (FR-012, SC-006). |

`fixtures/failing_gate/` holds three control gates — one that finds nothing, one that
always finds two things, one that cannot run. They are what the runner's tests drive it
at, so the runner has been watched telling all three outcomes apart rather than assumed
to.

`fixtures/stub_control/` holds one page per page-kind whose floor is derived from stubs:
the longest page the project ever produced while calling it unwritten, preserved at its
length and carrying its marker. It is committed because the stubs it was measured
against were all written within a day, and a bound derived from a corpus that no longer
contains the thing it was derived from is a bound derived from nothing. Neither fixture
directory is published, and the runner does not discover gates inside them.

## The manifest

`docs/manifest.yaml` declares what the site must carry. Its own comments carry the
reasoning; this is the shape.

```yaml
docs_root: site/docs             # every path below is relative to this
stub_marker: '...'               # the pattern that recognises a self-declared stub

kinds:
  page: {min_words: 210, bounded_by: shortest-accepted}

pages:
  subsystems/c01-simulation-clock.md: {kind: page, component: C-01}

components: {}                   # C-numbers with no page, each with a reason

adrs:
  published: true                # FR-021: a decision, recorded, not inferred
  source: docs/adr
  destination: decisions

acknowledged_hostnames: []
```

Adding a page is adding a line under `pages:`.

### `acknowledged_hostnames`

Read by `check_deployment_hostnames.py`. A deployment hostname that reaches the built
output is a finding; some are legitimate, and the rule is that a legitimate one is
acknowledged here explicitly rather than passing silently. A hostname the gate finds
that is not listed fails the run.

One entry per acknowledgement, each a mapping with all three keys:

```yaml
acknowledged_hostnames:
  - {host: example.invalid, where: standards/ogc-api-edr.md, reason: why it is fine}
```

- `host` — matched exactly against the hostname the gate extracted.
- `where` — the published path it is expected on, relative to `docs_root`.
- `reason` — what a reviewer reads.

All three are required. An acknowledgement nobody had to justify is an acknowledgement
nobody reviewed, which is the rule the exemption markers in `scripts/_gate_lib.py`
already follow.

## Tests

```sh
uv run pytest site/gates/tests/
```

Every gate here has been watched failing on the thing it describes. Each test file says
what was planted and what came back.
