# Deployment

One Compose configuration, two destinations. `deploy/compose.yaml` defines every service
drogna will ever have. What distinguishes a destination is the values in its directory
under `config/` — hostnames, ports, paths, resource ceilings, whether TLS is terminated —
and nothing else. No service definition, no image and no source file knows where it is
running (SRD NFR-05, NFR-06; Constitution IV).

---

## Prerequisites

A destination needs a container runtime and a Python interpreter, and nothing else from
this project.

- Docker Engine 24 or later, with Compose v2 available as `docker compose`.
- Python 3.11 or later on the path, for the configuration checks and the environment
  renderer. They use the standard library only, so no virtual environment is required to
  bring the stack up.
- Bash. The scripts use process substitution and arrays.

Podman is not pursued.

---

## The local destination

From a clean checkout:

```sh
scripts/run_local.sh
```

That is the whole of it. There is no prompt, no manual step, and no file to edit that the
repository did not ship. The script validates the destination, renders the untracked
environment file, brings the active profile up, waits for every service to report healthy,
seeds, and prints the address this destination advertises. Run it again over a running
stack and it converges rather than failing.

Taking it down:

```sh
scripts/down.sh local             # stop; keep the volumes
scripts/down.sh local --volumes   # stop; remove everything, including the seeding record
```

The pieces underneath, should you want one on its own:

| Command | What it does |
|---|---|
| `scripts/up.sh [destination]` | Check, render, start, wait for health. Safe to repeat. |
| `scripts/down.sh [destination] [--volumes]` | Stop, optionally removing derived data. |
| `scripts/seed.sh [destination]` | Run every seeding step and write the seeding record. |
| `scripts/reset.sh [destination]` | Down with volumes, up, seed. Returns an instance to the state of a fresh one. |
| `scripts/check_config.sh [destination] [--strict]` | Validate a destination against its schemas. |
| `scripts/check_destination_parity.sh` | Confirm the destinations differ only in values. |

### An ephemeral session

The case of an agent session that clones the repository, brings the stack up, exercises it
and is then discarded is the case the local destination is built around.

What such a session **may** rely on: that `scripts/run_local.sh` reaches the same state
every time, from nothing; that the seeded content is a function of the root seed in
`config/local/common.json` and of nothing else; that no outbound network access is needed
once the images are present.

What it **may not** rely on: anything left behind by a previous session. There is no state
outside the volumes and the untracked runtime directory, and both are reproduced by script.
If something a session needs is not produced by a seeding step, that is a missing step, not
a thing to leave lying around.

---

## The droplet destination

The droplet exists so that a demonstration has an address that persists. It runs the same
Compose file, the same images and the same scripts as the local destination.

### From nothing

1. Create a small DigitalOcean droplet running a current Ubuntu LTS. Two virtual CPUs and
   four gigabytes of memory is the working assumption; see the resource envelope below.
2. Clone this repository onto it.
3. Set the destination's own values. `config/droplet/deployment.json` ships with a
   deliberately unusable placeholder in `public_url.host` and `tls.hostname`: put the
   droplet's real DNS name there, and adjust `network.publish` if the ports it publishes
   are not the ones you want exposed.
4. `sudo deploy/droplet/provision.sh` — installs the container runtime if it is absent,
   installs and enables the systemd unit that brings the stack up at boot, and reports what
   it changed and what it left alone. It is idempotent.
5. `scripts/run_droplet.sh` — the one deployment command. Safe to run again over an
   already-deployed droplet.

Deployment is a checkout plus that one command, driven over SSH. There is no continuous
deployment pipeline and none is assumed.

### After a reboot

Two mechanisms, deliberately overlapping. The containers carry a restart policy of
`unless-stopped` at this destination, so the daemon restores them itself. Beyond that,
`harness.service` runs `scripts/up.sh droplet` at boot, which converges the host on what
the checkout currently says rather than merely restarting what was last running — the case
where the checkout has moved on, or a volume was removed, is the case the policy alone
cannot cover.

### Resource envelope

Two virtual CPUs and four gigabytes is the assumption. The observation store is given a
larger ceiling than the default because it is the one service that outgrows it; every other
service takes `resources.default`. A cold deployment builds images on that host and can take
up to fifteen minutes; subsequent deployments reuse the cached layers and take a small
fraction of it. `scripts/run_droplet.sh` prints progress as each stage completes, because a
silent build on a small host reads as a hang.

If the sizing proves inadequate the remedy is a larger droplet, not a different
configuration.

### What has and has not been verified

The local destination has been run end to end from this checkout: bring-up, repeat
bring-up, seed, seed again, down, up, reset. The droplet has not. No droplet was available
while this was written, so `deploy/droplet/provision.sh`, the systemd unit and the pruning
step in `scripts/run_droplet.sh` are unexercised. They follow the documented Ubuntu
installation and conventional systemd practice, and they should be treated as untested
until someone runs them and corrects this paragraph.

---

## Configuration

Each destination is a directory under `config/`. The two directories carry the same files
and, within each file, the same keys. Only values differ, and
`scripts/check_destination_parity.sh` fails the build if that ever stops being true.

`common.json` carries what every component shares — its identity, how it reaches the clock,
the root seed, the broker connection and the log level — and is defined by
`contracts/schemas/config.common.schema.json`, which belongs to the deterministic
foundations feature.

`deployment.json` carries what the deployment itself needs, and is defined by
`contracts/schemas/config.deployment.schema.json`. Its keys:

| Key | Meaning |
|---|---|
| `component` | Identity, in the shared shape. This file is read by the deployment scripts, not by a running process, which is why it carries no clock, seed, broker or logging section. |
| `destination` | The destination's name, matching the directory. |
| `project_name` | The Compose project name, and so the prefix of every container, network and volume the deployment creates. |
| `profiles.active` | The Compose profiles started here. See *Profiles* below, and read what it does **not** mean. |
| `runtime.restart_policy` | What the daemon does with a container that stops. Locally `no`, so a teardown is a teardown; on the droplet `unless-stopped`, so a reboot restores the stack. |
| `runtime.log_driver`, `runtime.log_max_size`, `runtime.log_max_files` | Log rotation, so a long-running droplet does not fill its disk with logs. |
| `runtime.healthcheck.*` | Interval, timeout, retries and start period, applied to every service. A slower host takes a longer start period, not a different health check. |
| `runtime.wait_timeout_seconds` | How long a bring-up waits for health before reporting failure. |
| `container_paths.*` | Where things live **inside** containers: the application root, the mounted configuration directory, the coverage store, the static document root, the nginx template directory, the broker's configuration and data directories, and the database data directory. Each reaches an image as a build argument or an environment variable; none is written into a Dockerfile. |
| `host_paths.runtime_dir` | Where the generated environment file, the seeding record and the seeding artefacts live, relative to the repository root. Untracked; removed by reset. |
| `host_paths.broker_config_dir` | Where the broker's configuration is mounted from, relative to the repository root. The contents belong to the observation path feature. |
| `network.publish.<service>` | One entry per service that publishes a port: the address to bind, the port on the host, the port in the container. A service absent from this map publishes nothing and is reachable only on the internal network. This is where a port collision is resolved. |
| `public_url.*` | Scheme, host, port and base path of the address this destination advertises. The run scripts print it; nothing in the stack resolves it. |
| `tls.terminate`, `tls.hostname` | Whether this destination terminates TLS and at what name. Consumed by the reverse proxy feature; carried, not implemented, here. |
| `database.name`, `database.user` | The database and its role. The password is deliberately absent — see *Secrets*. |
| `resources.default`, `resources.<service>` | Memory and CPU ceilings. `default` applies everywhere; a key named for a service overrides it there. |
| `seeding.record_filename`, `seeding.artefact_dirname` | Where seeding writes its evidence, within the runtime directory. |

Adding a third destination means adding a directory of the same shape. It is not a code
change.

### The one meaningful environment variable, and its exceptions

Every drogna component reads exactly one environment variable, `HARNESS_CONFIG`, giving the
path of its own configuration file inside the container. Everything else it needs is in
that file.

The exceptions are the third-party images, and they are exceptions in the same way for the
same reason: Postgres and nginx read no drogna configuration file, so they are configured
through the interfaces their own publishers define — `POSTGRES_DB` and its siblings, the
nginx template directory and the values substituted into it. Every one of those values
still comes from the destination configuration by way of the generated environment file.
Nothing is written literally anywhere.

The Compose file itself uses environment variables only to compose those configuration
paths, to name image build arguments, and to publish ports. That is the whole of it.

### Secrets

`deploy/env.template` is tracked and carries names with no values.
`scripts/up.sh` renders it into `deploy/.env`, which is untracked and ignored by a rule this
feature ships. Deployment secrets — today, the database password — are generated there at
deploy time, reused on every subsequent run so that a re-run does not present a new password
to a store initialised with the old one, and regenerated by `scripts/reset.sh`, which removes
the store as well. No secret value appears in a tracked file.

---

## Profiles

A profile is a named subset of services. `profiles.active` in a destination's
`deployment.json` says which profiles start there. Today both destinations start `core`.

| Profile | Services |
|---|---|
| `core` | The observation store. |
| `broker` | The broker. |
| `foundation` | The simulation clock. |
| `generator` | The environment generator. |
| `observation` | Simulated sensors and the ingest client. |
| `provisioning` | The feature store's one-shot provisioning job. |
| `query` | The query layer. |
| `edge` | The reverse proxy. |
| `control` | Monitor, scheduler, model runner, publisher. |
| `planning` | The planner. |
| `telemetry` | Telemetry. |
| `offload` | The offload packager. |
| `shell` | The browser client. |
| `full` | Every service, for the day they all exist. |

**A profile describes what runs at a destination today. It does not describe what ought to
exist, and it says nothing whatever about which components the client shows as alive.**
Illumination is driven by heartbeats and by nothing else: a component is lit because a
message from it arrived within its declared liveness window (Constitution VII, SRD FR-45,
FR-52). Nothing under `client/` reads this file, the Compose file, the environment file or
the active profile, and a test asserts it. If that ever changes, the display has begun
claiming that something exists because a configuration file said so, which is the exact
failure the principle exists to prevent.

### Adding a component

A later feature adds its component without touching another feature's work:

1. Add its service entry to `deploy/compose.yaml`, merging `*runtime`, giving it a profile
   and a health check, and taking its configuration path from
   `${HARNESS_CONFIG_PATH_<SERVICE>}`. The name of that variable follows from the service
   name mechanically: upper case, hyphens become underscores.
2. Add its configuration file to **both** destination directories, named for the service
   with hyphens becoming underscores. The renderer finds it and fills in the path; the
   parity check makes sure the second directory was not forgotten.
3. Add its schema at `contracts/schemas/config.<component>.schema.json`.
4. Add a seeding step to `deploy/seed.d/` if it has a store to fill.
5. Add the profile to `profiles.active` at a destination when it is ready to run there.

If a component needs more than that, this feature's structure is wrong and should be
amended rather than worked around.

---

## Which services are live today

The Compose file names every service drogna will have. Most of the components do not exist
yet: their entries are real, complete and profiled out, so that arriving at one of them is a
matter of writing the component and adding its profile, not of designing the deployment
again.

**This table is a deployment manifest for people reading it. It is not consulted by
anything, and in particular it is not what decides whether the client draws a component as
alive.** That is heartbeats, always.

| Component | Compose service | Profile | State |
|---|---|---|---|
| C-01 simulation clock | `clock` | `foundation` | Declared. Image builds from the workspace; the service does not exist yet. |
| C-02 environment generator | `env-generator` | `generator` | Declared, not built. |
| C-03 broker | `broker` | `broker` | Declared. Runs a stock image, but waits on its configuration and access control lists, which belong to the observation path feature. |
| C-04 simulated sensors | `sensors` | `observation` | Declared, not built. |
| C-05 ingest client | `ingest` | `observation` | Declared, not built. |
| C-06 observation store | `observations` | `core` | **Live.** Verified from this checkout: starts, reports healthy, survives down and up. |
| C-07 feature store | `features` | `provisioning` | Declared as a one-shot provisioning job against the same database instance. Not built. |
| C-08 coverage store | — | — | Not a service. It is the `coverage-data` volume, read by the query layer and written by the generator, model runner and publisher. |
| C-09 query layer | `query` | `query` | Declared, not built. Its image does build, and asserts the Shapely and GEOS bound described below as it does so; but the pygeoapi configuration and the trajectory provider it would serve belong to 008-query-layer and do not exist. |
| C-10 reverse proxy | `proxy` | `edge` | Declared, not built. |
| C-11 monitor | `monitor` | `control` | Declared, not built. |
| C-12 scheduler | `scheduler` | `control` | Declared, not built. |
| C-13 model runner | `model-runner` | `control` | Declared, not built. |
| C-14 publisher | `publisher` | `control` | Declared, not built. |
| C-15 planner | `planner` | `planning` | Declared, not built. |
| C-16 telemetry | `telemetry` | `telemetry` | Declared, not built. |
| C-17 offload packager | `offload` | `offload` | Declared, not built. |
| C-18 browser client | `client` | `shell` | Declared, not built. The image definition is complete and has never been built, because `client/` does not exist yet. |

"Declared, not built" means precisely this: the service entry is complete and correct as far
as it can be, and starting its profile today would fail — at the image build for most of
them, because the package the build argument names is not in the repository yet; at start-up
for the query layer, whose image builds but has nothing to serve. What has been built, and
what that proves, is set out under *Images* below.

---

## Volumes

Every volume holds derived data, every one has a script that fills it, and removing any of
them loses nothing that cannot be made again. That is what makes an instance disposable
(SRD NFR-07).

| Volume | Filled by | What removing it loses |
|---|---|---|
| `observations-data` | The database's own initialisation, then the seeding steps for the observation and feature schemas, run by `scripts/seed.sh`. | Every stored observation and the static spatial reference. Both are reproduced by seeding from the same root seed. |
| `broker-data` | The broker's own persistence, filled at run time by the messages that pass through it. | Retained messages and subscription state. Nothing that a running stack does not produce again within its own liveness windows. |
| `coverage-data` | The environment generator and the model runner, and made visible by the publisher; all run by `scripts/seed.sh` once those components exist. | Every stored field. Reproduced by seeding from the same root seed. |

There is no fourth volume, and no volume holds anything a script cannot produce. If one
ever does, the volume is wrong, not the rule.

---

## Seeding, reset, and how equivalence is checked

All content comes from `scripts/seed.sh`. It takes the root seed from
`config/<destination>/common.json` — it never invents one — and runs every step in
`deploy/seed.d/` in lexical order. The contract a step obeys is in `deploy/seed.d/README.md`.

Seeding writes a **seeding record**: the root seed, the version of the seeding driver, the
active profiles, a digest of every configuration file the destination carries, and a digest
of every artefact each step produced. It is written whole or not at all, so an interrupted
run leaves no record claiming success.

The record carries no timestamp. There is no host time to take (Constitution I), and a
timestamp would make two equivalent instances compare unequal, which is the opposite of what
the record is for.

Equivalence is therefore checkable rather than asserted:

```sh
scripts/seed.sh local              # seed
cp deploy/.runtime/seeding-record.json /somewhere
scripts/reset.sh local             # remove every volume, bring back up, reseed
diff /somewhere deploy/.runtime/seeding-record.json
```

Identical output means the reset instance holds what a freshly created one holds. The same
comparison across two machines answers the same question about two instances. This has been
run from this checkout and the records match.

Today there are no seeding steps, because no component with a store has been built. The
record is still written and still meaningful — it fixes the root seed, the profiles and the
configuration digests — and it grows a step per store as components arrive.

---

## Images

Every base image is pinned by digest rather than by tag. A replay that rests on a floating
base image is not a replay (Constitution II), and two destinations pulling different content
for the same tag are two destinations, not one.

| Image definition | Base images |
|---|---|
| `images/python-service.Dockerfile` | The uv distribution image, and the Python base. One definition serves every drogna Python service; the service is chosen by a build argument naming its workspace package. |
| `images/query-layer.Dockerfile` | The Python base. Installs pygeoapi and the pinned geometry stack. |
| `images/client.Dockerfile` | The Node base for building, the nginx base for serving. |

To refresh a digest deliberately: resolve the new one with
`docker buildx imagetools inspect <image>:<tag>`, replace the digest in the Dockerfile,
rebuild, and run the tests. Do it as its own change, so that a base image moving is visible
in the history rather than buried in an unrelated one.

### What has actually been built

Three image definitions exist and no more, because there are only three kinds of image in
this deployment: a Python service, the query layer, and the browser client. Everything else
in the Compose file runs a third-party image unchanged.

**This table records what has been built and run, on the date given. Like the service
table above, it is read by people and by nothing else** — no script consults it, and it has
no bearing whatever on what the client draws as alive, which is heartbeats and only
heartbeats (Constitution VII). It is here so that "it builds" is a claim someone checked
rather than one the file's existence implies.

| Image definition | Built? | What that means |
|---|---|---|
| `images/query-layer.Dockerfile` | **Yes**, 26 August 2026. | Builds clean and installs pygeoapi 0.20.0 with Shapely 2.1.2 on GEOS 3.13.1. The FR-51 pin check runs during the build and passes. Never started: it has no pygeoapi configuration to serve until `query/` arrives with 008-query-layer. |
| `images/python-service.Dockerfile` | **Partly**, 26 August 2026. | Builds clean against `harness-core` from the workspace lock, which is the only package that exists. No drogna service exists yet, so nothing has been built or run as a service. The image does not yet carry the `drogna-healthcheck` console script the Compose health checks invoke; that convention belongs to 001-deterministic-foundations. |
| `images/client.Dockerfile` | **No**, but it now gets as far as installing dependencies. | The build stage runs: the Node base, corepack and the package manager all work, and the dependency install is reached and begins. It then stops on a supply-chain policy applied to `client/pnpm-lock.yaml` by the environment this was built in — one lockfile entry was published more recently than that environment's minimum-release-age cutoff allows. That is a property of the lockfile and of the machine, not of this image definition, and it says nothing about whether `pnpm build` and the nginx stage work; neither has been reached. |

Each image definition has its own build context, stated in a `<name>.Dockerfile.dockerignore`
beside it. BuildKit reads one of those in preference to any ignore file at the context root,
which keeps each image's context a property of that image rather than a shared list nobody
owns. The context root is the repository root for all three, because the workspace lock and
the client sources both sit above `deploy/`; what each excludes is what that build does not
read. This is not only about build time: copying the host's own installed dependencies into
a container is how a build acquires artefacts compiled for the wrong interpreter, and in the
client's case it made the package manager fail outright.

Two image definitions carry a commented-out `COPY` of a directory that does not exist yet:
`services/` in the Python service image and `query/` in the query layer image. Each is one
line, with the condition for uncommenting it written above it. They are commented rather
than absent so that arriving at those components is an uncommenting, not a decision about
how the image should have been laid out; and commented rather than present because `COPY`
of a missing directory fails the build, which would leave nothing buildable at all today.

### Building behind a TLS-terminating proxy

Each image definition mounts an optional build secret named `proxy_ca`, and the Compose
file declares it from `HARNESS_PROXY_CA_FILE`, defaulting to an empty source. On a machine
with direct egress there is nothing to set and nothing to configure: the builds behave as
ordinary builds, nothing about any proxy is written into an image, and no host or address
appears in any Dockerfile.

It exists because this deployment is meant to build inside an ephemeral agent session (SRD
NFR-06), where the package index is reached through a proxy that terminates TLS with a
certificate authority the base images do not know. Without it, `pip` and `pnpm` fail there
with `CERTIFICATE_VERIFY_FAILED` and the bring-up never reaches a container. In such a
session, name the bundle:

```sh
export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"   # or wherever the session keeps its bundle
scripts/run_local.sh
```

It is the one value in this deployment that does not come from `config/<destination>/`, and
deliberately so: it describes the machine the build runs on, not the destination being
deployed. It names no host, is read only during a build, and reaches no running container.
The same applies to a direct `docker build`, which takes it as
`--secret id=proxy_ca,src="$SSL_CERT_FILE"`.

### The Shapely and GEOS pin

`images/query-layer.requirements.txt` pins Shapely to 2.1 or later, built against GEOS 3.12
or later. The reason is written at the pin rather than here, at length, because that is
where someone tidying dependencies will be standing. This section records the same thing
for someone reading the deployment rather than the file (FR-022).

It is a silent-failure guard. An EDR trajectory carries its per-vertex arrival times in the
M ordinate of a WKT `LINESTRING M` or `LINESTRING ZM`; pygeoapi parses that string with
`shapely.wkt.loads` before any drogna code runs. If M does not survive the parse, the
arrival times are gone, FR-20 fails, and the response is still structurally correct — the
first symptom is wrong values that look reasonable.

Feature 002 measured the failure rather than citing it, and found **three** modes, not the
one FR-51 names. Shapely and GEOS fail independently, so pinning Shapely alone would not be
enough: the GEOS a wheel was built against decides two of the three. None of them raises.

| Shapely | GEOS | What happens to the M ordinate |
|---|---|---|
| >= 2.1 | < 3.12 | Returned as **NaN**. This is the case FR-51 describes. `shapely.has_m` raises rather than returning False, so a guard written in terms of it errors instead of failing informatively. |
| 2.0.x | >= 3.12 | Not NaN — **absent**. No `include_m` parameter and no `has_m` attribute exist at all. `LINESTRING ZM` yields `(x, y, z)` and round-trips out as `LINESTRING Z`. **This is the published pygeoapi image as it ships**, and so the mode this image exists to correct. |
| 2.0.x | < 3.12 | Worse than either: `LINESTRING M` returns a `LINESTRING Z` whose Z values are the timestamps, with `has_z` True — a Unix timestamp silently promoted into the depth axis. |

Evidence: `spikes/edr-trajectory/FINDING.md` and
`docs/adr/0003-bespoke-edr-trajectory-provider.md`.

The pin has two halves and both are required. The version constraint in the requirements
file is one. The other is `images/query-layer-pin-check.py`, which runs during the build:
GEOS is bundled inside the Shapely wheel, so which GEOS an image ends up with is a property
of the built artefact and not of anything a requirements file can constrain. The check
parses a `LINESTRING ZM` and asserts that the M ordinates come back exactly and that Z is
still the elevations — behaviour, not version numbers — and fails the build otherwise. It
has been confirmed to fail on Shapely 2.0.3 and 2.0.7, so it is a guard that is known to
fire and not merely one that has never complained. The check stays inside the image so the
same assertion can be made against a running container after a base image moves.

Do not relax either half without running the FR-51 tests owned by features 002 and 008.

---

## When it goes wrong

| What you see | What it means, and what to do |
|---|---|
| `port N on A is already in use, and service 'S' needs it` | Something else on the host holds the port. The message names the port, the service and the configuration key. Free the port, or change `network.publish.<service>.host_port` in the destination's `deployment.json`. The check runs before any container starts, so nothing was left half-up. |
| `configuration check failed ... required key is missing` / `expected string, found integer` | A destination file does not match its schema. The message names the file and the key path. Nothing was started. |
| `the destinations have drifted apart` | A key was added to one destination and forgotten in the other. Every difference is listed, not just the first. This fails in CI as well, which is where it is meant to be caught. |
| `not every service became healthy within Ns` | The bring-up reports the state of each service and the command to read one's logs. A slow host may simply need a longer `runtime.healthcheck.start_period` or `runtime.wait_timeout_seconds`. A service that is unhealthy rather than slow is a real failure; read its logs. |
| A service reports unhealthy and says it has no seeded content | Deliberate. A service that requires seeded content reports unhealthy rather than serving empty results as though they were real. Run `scripts/seed.sh`. |
| The droplet's disk is filling | Repeated deployments leave replaced images behind. `scripts/run_droplet.sh` prunes this project's own dangling images and the build cache on each run. If it has already filled, `scripts/reset.sh droplet` is the documented remedy: it removes the volumes as well. |
| An image build looks like a hang | On a two-core droplet a cold build takes minutes with little output. `scripts/run_droplet.sh` prints its expected duration before starting and reports each stage as it completes. |
| Deployment fails at the configuration check, complaining about a secret | The environment file has not been rendered, or a required secret has no value. Run the stack through `scripts/up.sh` rather than calling the renderer directly; it generates what is missing. No secret is ever written to a tracked file, so there is nothing to fill in by hand. |
| A seeding run was interrupted | No record was written, so nothing claims success. Run `scripts/seed.sh` again: steps are required to converge rather than to seed twice. |
