# Finding: where the deployment's size actually is

**Date**: 27 August 2026
**Status**: answered; nothing changed in `deploy/` by this spike
**Question**: can the container be made smaller — by moving to SQLite, or to lightweight
builds of the other components — and can the structure be simplified into fewer services
and fewer containers?
**Question behind it**: can the droplet host one stack per open pull request, so several
can be reviewed at once?

---

## The result in one paragraph

The deployment weighs roughly 1.3 GB on disk, and 620 MB of that is one image nobody
wrote. But for the question that prompted this — several stacks at once — image bytes
are close to irrelevant, because **two stacks built from the same sources share every
layer and pay for the image once**, while each pays in full for memory, for a host port,
and for seven volumes. The binding constraint on a second stack is not size. It is that
the `full` profile declares 7168 MB of memory ceilings against a 4096 MB host, so on
paper not even one stack fits — while the measured footprint of the eleven Python
components is about 35 MB each. The ceilings are roughly eleven times the floor. Fixing
that is a configuration edit, and it is worth more than every byte this spike found.

## Method

No Docker daemon on the machine this was run on, which is the ordinary condition here and
the reason the container-backed tests skip. So nothing was built or pulled. Image sizes
were read from the registry manifests, with the layer blobs streamed through gzip and
counted rather than stored. Dependency closures were installed with `uv` and measured on
disk. Footprints were measured as peak resident set size of importing each component's
`__main__` in a fresh interpreter — a floor, not a working set. The stack arithmetic is
derived by parsing `deploy/compose.yaml` and `config/droplet/deployment.json`, so no
number in it was typed into this spike.

The one measurement that is a *claim* rather than an observation is the trim in §3, and
it carries a probe that has been watched failing.

Not measured here, and stated as unmeasured rather than estimated: the resident cost of
Postgres, Mosquitto and nginx, none of which this repository writes; and the size of the
`apk add python3 py3-pip` layer in the proxy image. **Three of those four were measured
afterwards on a machine with a daemon and are in §5b** — the fourth, the proxy's `apk`
layer, is still unmeasured.

## 1. Where the bytes are

From `results/images.txt`. "Pull" is what a cold host waits for; "on disk" is what it
occupies afterwards.

| Image | Pull | On disk | Role |
|---|---:|---:|---|
| `postgis/postgis:16-3.4` | 212.6 M | **618.6 M** | the observation store |
| `node:22-alpine` | 57.7 M | 167.3 M | client *build stage* only |
| `python:3.11-slim-bookworm` | 47.8 M | 135.3 M | base of twelve images, shared |
| `ghcr.io/astral-sh/uv:0.8.17` | 21.4 M | **49.0 M** | copied whole into every Python image |
| `nginx:1.27-alpine` | 21.0 M | 49.6 M | base of proxy and client, shared |
| `eclipse-mosquitto:2.0.22` | 4.8 M | 11.5 M | the broker |

Add the Python closures — 127 M across the eleven service images, 284 M for the query
image — and a full stack is about **1.3 GB on disk**, of which the single postgis image
is 48%.

Two things fall straight out of that table:

- **`uv` is 49 MB of build tool sitting in every runtime image.** It is copied in at the
  top of `python-service.Dockerfile` and never removed. Nothing at run time invokes it:
  the entrypoint is `python -m "${HARNESS_SERVICE_MODULE}"`. A multi-stage build that
  copies the finished `.venv` out and leaves `uv` behind removes it. It is one shared
  layer, so it is 49 MB once, not 49 MB per service — but it is 49 MB for nothing.
- **`node:22-alpine` at 167 MB is a build stage.** It is not in the client's runtime
  image, but a droplet that builds its own images holds it in the builder cache. That is
  already handled: `scripts/run_droplet.sh` runs `docker builder prune --keep-storage 2g`
  after every deploy. What is worth revisiting is the 2 GB it keeps — that ceiling was
  chosen for one stack, and per-pull-request stacks each add their own rebuilt layers to
  the same cache.

## 2. Eleven Python images, or one

`python-service.Dockerfile` takes the service as a **build** argument and runs
`uv sync --package "${HARNESS_SERVICE}"`. Every layer before that is identical across the
eleven Python components; that one layer is not. So there are eleven images, eleven
builds, and eleven closures.

From `results/closures.txt`:

```
  eleven closures             127 M   <- eleven images, summed
  one closure                  33 M   <- one image, whole workspace
```

The entire workspace, every service and every library, installs into **33 MB**. Eleven
separate closures of it come to 127 MB. Selecting the component at *run* time instead —
the entrypoint already reads `HARNESS_SERVICE_MODULE` from the environment, so the
machinery exists — gives one image instead of eleven:

- 94 MB of duplicated closure recovered;
- one `uv sync` per build instead of eleven, which is the part that matters for a
  per-pull-request stack, because a diff that touches `uv.lock` currently invalidates
  eleven dependency layers rather than one;
- eleven fewer images to name, tag and garbage-collect.

It changes no architecture and no principle. The component is still chosen by
configuration; it moves from a build argument to an environment variable, which is the
direction Constitution IV points anyway. **This is the recommended first change.**

Note that it does not reduce the number of *containers*: eleven components still run as
eleven processes. See §6.

## 3. The query image installs 119 MB it never imports

`results/footprint-query.txt` and `results/closures.txt`. The query closure is 284 MB, and
its two largest members are packages drogna does not use:

| Package | On disk | Imported by drogna? |
|---|---:|---|
| `rasterio` (with `.libs`) | 107 M | no |
| `sqlalchemy` | 14 M | no |
| `babel` | 33 M | yes — pygeoapi imports it at module load |
| `numpy` (with `.libs`) | 59 M | yes — via pygeoapi and pyproj |
| `pyproj` (with `.libs`) | 32 M | yes |

pygeoapi declares both in its metadata, but loads providers lazily by dotted module path,
and `query/pygeoapi-config.yaml.template` names only `plugins.edr_trajectory` and
`plugins.sensorthings_provider`. The providers that would import rasterio are never
reached. Removing both takes the closure from **284 MB to 165 MB**.

This is the one finding here that is a claim about behaviour rather than an observation
about bytes, so it carries a check. `trim_probe.py` asserts that rasterio and SQLAlchemy
are absent, that pygeoapi and its EDR provider machinery import anyway, and that both
drogna providers load. From `results/trim-probe.txt`:

```
ok    rasterio and SQLAlchemy are absent
ok    pygeoapi and its provider machinery import
ok    both drogna providers import
```

And, against an environment identical but for the two packages, so that a green run means
something:

```
FAIL  rasterio and SQLAlchemy are absent: AssertionError: rasterio is still installed;
      this probe only means something against a trimmed environment
```

Exit status 1. Watched failing 27 August 2026.

**The handover condition**: this trim must not be applied without that probe running in
the image, beside `query-layer-pin-check.py`, for exactly the reason the Shapely pin has
its second half. A `pip uninstall` against a declared dependency is invisible until a
pygeoapi upgrade moves one of these imports from lazy to eager, and the failure then is a
container that starts and fails at the first request.

`babel` at 33 MB is nearly all locale data and is imported at pygeoapi module load, so it
is not removable the same way. `numpy` and `pyproj` are load-bearing.

## 4. SQLite: costed, and not recommended

The saving is real and large: it removes the 618.6 MB postgis image outright, along with
a whole service and its 1024 MB ceiling. It is the biggest number in this document. It is
still the wrong trade, and the reasons are on disk rather than in preference:

1. **It breaks a tested acceptance criterion.** `stores/observations/roles.sql`
   implements FR-018 and SC-003: exactly one role may insert, *enforced by the database
   refusing anybody else*, so the single ingestion seam is a seam rather than a habit.
   SQLite has no roles and no `GRANT`. The property does not degrade — it disappears, and
   with it the test that a rogue component is refused.
2. **PostGIS is genuinely used, not decorative.** Both schemas declare
   `geography(Point, 4326)` and `geography(LineString, 4326)` with GiST spatial indexes.
   The SQLite equivalent is SpatiaLite, a loadable extension absent from the standard
   library's `sqlite3`, with planar geometry and no `geography` type. The swap does not
   remove a native geospatial dependency; it exchanges one for a less capable one.
3. **The constitution forecloses it.** Principle VI names the observation store as
   explicitly *not* a port — "Postgres is not being swapped" — and the Technology section
   names Postgres + PostGIS carrying two schemas. This is one of the decisions the
   constitution was written to stop being relitigated, so it would take an amendment and
   an ADR, not a spike.

The lighter middle option is real and worth recording: `postgis/postgis:16-3.4-alpine`
exists. Its layer stream failed to decompress cleanly here and it is the one figure in
this document that is not measured; its compressed size is 162 MB against 213 MB, so the
saving is of order 100–200 MB on disk with no schema change at all. That is worth a
measurement on a machine with a daemon. It is a base-image swap, not an architecture
change — but it is also the class of change this repository has been burned by, so it
needs a run of the store's own tests, not an eyeball.

## 5. What a second stack actually costs

From `results/stack-arithmetic.txt`, derived from the deployment's own files:

```
  profile        services   ceiling   stacks that fit
  core                  1     1024 M                 4
  full                 17     7168 M                 0
```

Against the droplet's documented 4 GB. **The `full` profile does not fit once.**

Set against the measured floor in `results/footprint-services.txt`, where every component
lands between 26 and 39 MB:

```
harness_clock.__main__                         36.1 MB
harness_planner.__main__                       39.0 MB
harness_env_generator.__main__                 25.8 MB
```

Eleven components at ~35 MB is ~385 MB of Python, against 4224 MB of ceilings for the
same eleven. The default ceiling of `384m` is about eleven times what a component needs
to load. Ceilings are limits rather than reservations, so this is not why a stack fails
to start — but it is why the arithmetic says several stacks are impossible, and it is
what a reviewer sizing the droplet would read.

**So the first thing to change for multiple stacks is `resources.default` in
`config/<destination>/deployment.json`, not an image.** A ceiling derived from the
measured floor with headroom — rather than one number applied to eleven components that
differ by 13 MB between them — is the cheapest change in this document and the only one
that moves the number the question was really about.

Three other per-stack costs, none of them size:

- **Seven host ports, every one of which collides.** `broker` 1883, `client` 8080,
  `clock` 8090, `observations` 5432, `proxy` 443, `query` 8082, `telemetry` 8091. A
  per-pull-request stack needs its own block, or — better — publishes only the proxy and
  reaches the rest over the Compose network, which is what the default-deny boundary of
  Principle X wants anyway.
- **Seven named volumes per stack.** Compose prefixes them with `HARNESS_PROJECT_NAME`,
  so distinct project names already give each stack its own set. This works today; it is
  the one part of the per-stack story that needs nothing.
- **`docker compose` project name and destination.** A stack per pull request is a
  destination per pull request under `config/`, which `check_destination_parity.sh`
  currently reads as two destinations that must differ only in values. That gate's
  behaviour under N destinations was not examined here.

## 5a. A note on the question behind the question

**Open cross-reference, added 27 August 2026 after this spike was written.** PR #15
(`spikes/backend-hosting/`, open, not merged) records an agreed model in which the backend
deploys **only on push to `main`**, a feature needing both halves is two pull requests with
the backend first, and combined work happens locally. It says so explicitly: it supersedes
a per-pull-request environment design written earlier the same day, because sequencing the
halves removes the problem that design existed to solve.

If that model holds, the premise of §5 — several stacks on one droplet — is not a
requirement any more, and this document should be read for §1 to §4, §6 and §7 rather than
for §5.

Two things are worth carrying across even so.

The first is corroboration. That design independently derived "seventeen services at this
destination's own ceilings is 7.0 GiB and 13 CPUs on a 2 vCPU / 4 GiB machine, so capacity
today is one environment, or none while the demonstration shares the box", and named the
size-reduction spike as the thing that would raise the number. Two derivations, arrived at
separately, agree: 7.0 GiB there, 7168 MB here.

The second is that they disagree about what the number *means*, and this spike is the one
holding the measurement. The capacity conflict is largely an artefact of the ceilings
rather than of the deployment: every component measures 26–39 MB to load against a `384m`
default. So "capacity today is one environment, or none" is what the configuration
declares, not what the components need. That does not resurrect the per-pull-request
design — sequencing removes its problem whatever the capacity is — but it does mean the
capacity figure should not be cited as a constraint on anything else without §5 beside it.

Whether that model is adopted is not this spike's call, and nothing here is written on the
assumption that it has been.

## 5b. The ceilings, measured rather than reasoned about

**Contributed measurement, 27 August 2026**, run by the repository owner on a local Docker
VM (7937 MiB / 8 CPUs — not the droplet). `results/docker-stats-local.txt`. This spike
could not produce it, and it settles three of the four figures §5 had to leave open.

```
drogna-client-1          7.105MiB / 512MiB     nginx
drogna-observations-1    32.59MiB / 1GiB       postgis
drogna-clock-1           25.84MiB / 512MiB     a Python component
drogna-broker-1          18.74MiB / 512MiB     mosquitto

  measured total      84.28 MiB
  declared ceiling      2560 MiB
  overprovisioned        30.4x
```

Postgres — the service given the *largest* ceiling in the deployment, and the one whose
image is 48% of the stack's bytes — holds **32.59 MiB against a 1 GiB ceiling**. Mosquitto
and nginx are 18.74 and 7.105 MiB. None of the three is expensive, and the assumption that
the third-party images are where the weight is turns out to be true of disk and false of
memory.

Note the units of the comparison. `docker stats` reports a cgroup working set; §5 reports
peak RSS of an import. They are different measures and neither substitutes for the other.
They agree in magnitude where they overlap — the clock at 25.84 MiB working set against a
36.1 MB import peak — which is the most that can be asked of them.

**Extrapolating to the seventeen-service `full` profile**, using the measured clock for
each of the eleven Python components, the measured third-party figures, and the query
layer's 85.7 MB import floor with headroom for serving:

| | Declared | Measured or extrapolated |
|---|---:|---:|
| One `full` stack | 7168 MiB | **~460 MiB** |
| Stacks in the 4096 MiB droplet | 0 | ~8 |
| Stacks in this 7937 MiB VM | 1 | ~17 |

That is an estimate and is labelled one; the four measured containers in it are not. It
does not change the recommendation in §5 — it sharpens it. The ceilings are not merely
generous, they are wrong by a factor of about thirty, and every capacity conclusion drawn
from them, including this document's own §5 and the one in PR #15, is an artefact of the
configuration rather than a fact about the software.

## 6. Fewer containers

**Decided, 27 August 2026: not pursued.** The service count stays as it is. The reason is
§5b — a running stack holds 84 MiB against 2560 MiB of ceilings, and a `full` stack is
about 460 MiB rather than the 7168 MiB it declares, so there is no resource problem for
consolidation to solve. Consolidating would have been a simplification bought with the
pinned Postgres digest, the architecture the Compose file exists to demonstrate, and — for
the one-process variant — the honesty of the liveness display. None of that was worth
paying for a saving that turned out not to be needed.

The options are left below rather than deleted, because the decision rests on a
measurement, and a measurement can move. If the seventeen-service stack ever does outgrow
its host, option 3 is where to start, and it is the one that costs least.

Three options, in increasing order of what they cost:

1. **Use the profiles that already exist.** The droplet runs `core` today — one service.
   A review stack for a pull request touching the planner needs `foundation`, `broker`,
   `control` and `shell`, not `full`. This is free, it is already built, and it is the
   answer to "fewer containers" for most pull requests.
2. **One Python image, eleven containers** — §2. Fewer images, same containers. No
   architectural cost.
3. **One container for the eleven Python components**, under a process supervisor, with
   Postgres, Mosquitto, nginx and the query layer left as they are. Five containers
   instead of seventeen. This is the honest middle: each component stays a *process*, so
   it still dies and restarts independently and still emits its own heartbeat, and the
   third-party images stay pinned by digest. What is given up is per-component memory
   ceilings, per-component health checks, and `depends_on: service_healthy` ordering,
   which becomes the supervisor's hand-rolled equivalent. Worth an ADR; not obviously
   wrong.

4. **One container for everything, Postgres included.** Asked directly, and the answer is
   that it is possible and it is not recommended — but the reason is not resources, and
   §5b is why. A `full` stack measures about 460 MiB. There is no capacity problem for
   consolidation to solve, so this buys simplicity and pays for it in three places.

   The first is mechanical: Postgres would have to be installed into a Python image or
   Python into the postgis image, and either way the pinned third-party digest goes. A
   replay resting on a hand-assembled database is not the replay Constitution II
   describes.

   The second is that the Compose file is not scaffolding here, it is a deliverable. This
   repository's value is that it demonstrates an architecture legibly; seventeen services
   with their profiles, mounts and dependencies *are* the demonstration. Collapsing them
   into one container does not simplify the harness, it deletes what the harness is
   showing, and leaves a process tree nobody can read from the outside.

   The third is Principle VII, and it is the one that would need arguing rather than
   waving through. Threads are the failure case: a supervisor running separate processes
   keeps liveness honest, but components merged into one process do not. Heartbeats would
   still be emitted per component, so a process holding four components that reports
   three heartbeats after one thread has died is a display asserting something untrue —
   the exact failure Principle VII exists to prevent. If this is pursued, that has to be
   re-argued first, not retrofitted.

## 7. Two defects found on the way

Neither is a size question; both were found by measuring and are reported rather than
fixed, because this spike changes nothing.

- **The `features` service names a package the image cannot resolve.**
  `deploy/compose.yaml` sets `HARNESS_SERVICE: harness_features` for the `features`
  service (profiles `provisioning` and `full`), and `python-service.Dockerfile` turns
  that into `uv sync --package "${HARNESS_SERVICE}"`. The component is not missing — it
  is `stores/features/provision.py`, and it works — but it is not a workspace package,
  and `[tool.uv.workspace] members` covers `libs/*` and `services/*` only. So:

  ```
  $ uv sync --frozen --no-dev --package harness_features
  error: Could not find root package `harness-features`
  ```

  That image cannot build, so **the `full` profile has never been brought up**. Either
  the provisioner becomes a workspace package or the `features` service stops being built
  from the Python service image; that is 005's call, not this spike's. It is consistent
  with `deploy/README.md` being candid about what has and has not been verified — but the
  Compose file reads as though the service were ready, and neither README records this.
- **The query image installs no Postgres driver.**
  `query/plugins/sensorthings_provider.py` imports `psycopg` lazily inside its connect
  path, and `config/<destination>/query.json` hands it a live DSN. But
  `deploy/images/query-layer.requirements.txt` lists only pygeoapi and Shapely, pygeoapi
  does not depend on psycopg, and `harness_core` depends only on `jsonschema`. Verified
  absent from the installed closure. Every SensorThings request that reaches the
  observation store therefore fails with `ModuleNotFoundError` at run time. The lazy
  import is what makes it invisible: the image builds, the container starts, the health
  check passes.

  This is exactly the failure mode the FR-51 pin comment describes — a fault that waits
  until it is being demonstrated — and it is the reason a size spike is worth running at
  all: nobody had read the query image's dependency list against the query image's code.

## Handover

In the order the evidence supports, cheapest first:

*Section 6 is decided and closed: the service count stays as it is (§6). The rows below
are about image bytes and configuration, which that decision does not touch.*

| Do this | Worth | Costs |
|---|---|---|
| Fix the two defects in §7 | correctness | small; owned by 008 and 005 |
| Size `resources.default` from the measured floor (§5b) | the multi-stack question | a config edit |
| Publish only the proxy; give each stack its own project name | ports stop colliding | a destination per stack |
| One Python image, component chosen at run time (§2) | 94 MB, 11 builds → 1 | a Dockerfile and a Compose edit |
| Drop `uv` from the runtime image via a build stage | 49 MB | a Dockerfile edit |
| Revisit `--keep-storage 2g` in `run_droplet.sh` once stacks multiply | builder cache | a number, once measured |
| Trim rasterio and SQLAlchemy from the query image (§3) | 119 MB | **only with `trim_probe.py` in the image** |
| Measure `postgis/postgis:16-3.4-alpine` on a host with a daemon | 100–200 MB, unconfirmed | a store test run |
| SQLite | 619 MB and a service | FR-018, SC-003, PostGIS, and a constitution amendment. Not recommended. |

Nothing above has been applied. Every measurement is reproducible with `./run.sh`, and
every claim about behaviour rather than bytes is in `trim_probe.py`, which has been
watched failing.
