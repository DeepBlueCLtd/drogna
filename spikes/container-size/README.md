# Container size spike

**The question**: can the deployment be made smaller — by moving to SQLite, or to
lighter builds of the other components — and can it be made *simpler*, with fewer
services and fewer containers?

**The question behind it**, which is the one the answer is written against: can the
droplet host one stack per open pull request, so several can be reviewed at once?

**The answer**: yes, but almost none of the saving is where the question points. Image
bytes are paid once and shared between stacks; memory, ports and volumes are paid per
stack. The largest measured saving available without touching the architecture is 119 MB
from the query image and ten of eleven Python image builds. The largest saving of any
kind is not a size change at all — it is that the declared memory ceilings are about
eleven times the measured footprint, and they are what makes a second stack impossible
on paper. Read [FINDING.md](FINDING.md).

Two defects were found on the way and are reported there rather than fixed here: the
`features` service asks the Python service image to build a package that is not in the
workspace, so the `full` profile has never come up; and the query image installs no
Postgres driver, so every SensorThings request that reaches the store fails at run time.

## Run it

```sh
./run.sh
```

Needs outbound access to Docker Hub, ghcr.io and PyPI, and `uv` on the path. It needs no
Docker daemon: image sizes are read from the registry and layers are streamed through
gzip and counted rather than pulled. That is deliberate — this repository's container
tests skip where there is no daemon, and a spike whose findings only appear in CI is a
spike nobody can act on.

Everything it learns lands in `results/`. About five minutes, most of it spent streaming
the postgis layers.

## This is spike code

Throwaway, and marked as such at the top of every file. It hardcodes paths and image
references, and it does not use drogna's single-environment-variable config contract
(Constitution IV); `spikes` is on the gate exclusion list in `scripts/_gate_lib.py` for
that reason. Nothing here is imported by drogna and nothing here is promoted into it.

The one thing meant to be adopted rather than deleted is `trim_probe.py`, which is
written to run under pytest and is the check that would have to sit in the query image
if that image ever drops the two packages it never imports.

## What is here

| File | What it is |
|---|---|
| `run.sh` | The one command. Measures, probes, writes `results/`. |
| `measure_images.py` | Every image the deployment names, from the registry: pull bytes and on-disk bytes, with the candidates it was compared against. |
| `measure_closures.sh` | The two Python dependency closures on disk, per service and whole, and what the query closure weighs once trimmed. |
| `measure_footprint.py` | Peak resident set size of importing each component, and of the query layer's tree. The floor a process cannot go below. |
| `stack_arithmetic.py` | What a second stack duplicates and what it does not, derived from `deploy/compose.yaml` and `config/<destination>/deployment.json` rather than typed in. |
| `trim_probe.py` | The load-bearing check: pygeoapi and both drogna providers load with rasterio and SQLAlchemy absent. Refuses to pass against an untrimmed environment. |
| `results/` | The evidence. |
| `FINDING.md` | The dated finding: question, method, evidence, result, handover. |

## Reading `results/`

| File | What it shows |
|---|---|
| `images.txt` | Pull and on-disk size of each image, and of every candidate replacement. |
| `closures.txt` | Eleven service closures against one; the query closure before and after the trim. |
| `footprint-services.txt` | What each component costs to load. |
| `footprint-query.txt` | What the query layer's dependencies cost to load, package by package. |
| `stack-arithmetic.txt` | Ceilings by profile, stacks that fit, ports that collide, volumes per stack. |
| `trim-probe.txt` | The probe passing against a trimmed environment, and refusing to pass against an untrimmed one. |

## Shelf life

The measurements are of pinned digests and a pinned `uv.lock`, and go stale when those
move. Re-run it if: a base image digest changes; `pygeoapi` moves off 0.20.0; a service
gains a dependency; or `config/<destination>/deployment.json` changes `resources`. The
conclusions that do *not* depend on the numbers — that images are shared between stacks
and memory is not, and that ceilings rather than bytes are the binding constraint —
survive all of those.
