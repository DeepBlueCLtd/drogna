# Implementation Plan: One Environment-Agnostic Compose Configuration

**Branch**: `005-compose-deployment` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-compose-deployment/spec.md`

## Summary

One Compose configuration defines the whole harness. Two destinations — a local machine,
including the ephemeral agent-session case, and a small DigitalOcean droplet with a
persistent URL — are distinguished only by the values in `config/local/` and
`config/droplet/`. Every service receives exactly one meaningful environment variable,
`HARNESS_CONFIG`, and reads everything else from the configuration file that variable
names. All content is produced by seeding scripts and removable by a reset script, so a
fresh instance and a long-running one carry the same seeded content for the same root seed.

The technical approach is deliberately unadventurous: a single `deploy/compose.yaml` with
Compose profiles for staged delivery, per-destination environment files generated from a
tracked template, health checks on every long-lived service, and two automated checks —
configuration validation and destination parity — that run before any container starts and
again in CI.

## Technical Context

**Language/Version**: POSIX shell for the run, seed and reset scripts; Python 3.11 for the
configuration validation and destination-parity checkers, so they can reuse the schema
loader in `libs/harness_core/`.

**Primary Dependencies**: Docker Engine 24+ with Compose v2. `jsonschema` via
`libs/harness_core` for configuration validation. No orchestration tooling beyond Compose;
no Kubernetes, no Terraform, no Ansible.

**Storage**: Named Docker volumes for the Postgres data directory, the coverage store and
the broker persistence. Every volume is reproducible by a seeding script and removable by
the reset script.

**Testing**: `pytest` for the parity and validation checkers and for the seed-idempotence
assertions; a shell-level smoke test that brings the stack up in the shell-only profile and
asserts health, run under the same CI job.

**Target Platform**: Linux x86-64 on both destinations. Local development on macOS with
Docker Desktop is expected to work and is checked opportunistically, not gated.

**Project Type**: Deployment and configuration. No application source code is produced by
this feature; it produces the Compose configuration, per-destination configuration values,
and scripts.

**Performance Goals**: Cold bring-up on a local machine with images already built completes
in under two minutes. Cold bring-up on the droplet including image build completes in under
fifteen minutes. Reset plus reseed completes in under three minutes on either destination.

**Constraints**: No outbound network dependency beyond container image pull, so the stack
works inside an ephemeral agent session behind a proxy. No interactive prompts anywhere in
the bring-up path. No literal hostname, port, absolute path or URL in any tracked source or
Compose file. Droplet resource envelope of two virtual CPUs and four gigabytes.

**Scale/Scope**: Eighteen components eventually, arriving over months; the Compose file
grows monotonically and profiles select what runs. Two destinations, with a third being an
added directory of identical shape rather than a code change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — Seeding scripts must not stamp seeded content with host time.
  Any time value written during seeding is taken from the simulation clock configuration in
  the destination configuration file (the scenario start instant), never from the host.
  Host time is permitted only in log decoration and in the deployment script's own progress
  reporting, both of which are non-operational. The wall-clock gate runs over the Python
  checkers in this feature like any other Python.
- **II. Seeded Randomness and Deterministic Replay** — The seeding scripts take their root
  seed from configuration and derive every identifier from seed plus logical position. The
  seeding record exists precisely so that determinism is measured rather than asserted.
  Base images are pinned by digest, since a replay resting on a floating base image is not
  a replay.
- **III. Generated Types Only** — This feature writes no cross-language types. It consumes
  the configuration schemas under `contracts/schemas/` and validates against them. Where a
  destination configuration key is added, the schema is the place it is added.
- **IV. No Literal Paths or Hosts** — This is the principle the feature exists to serve.
  Every service is handed exactly one meaningful environment variable, `HARNESS_CONFIG`.
  The Compose file itself carries no literal host, port or path: those come from the
  destination environment file generated from `deploy/env.template`. The literal-path gate
  is extended in this feature to cover `deploy/compose.yaml` and `config/*/`.
- **V. No Tracked Entities** — Seeded content is environmental: bathymetry, coastlines,
  synthetic fields. The seeding scripts are reviewed against the forbidden-vocabulary gate
  like everything else, and no fixture may introduce an entity vocabulary.
- **VII. Liveness, Not Configuration** — A hazard specific to this feature. Compose profiles
  decide what runs; they must never become the source of what the client displays as alive.
  The feature therefore ships a test asserting that no client source file reads the profile,
  the Compose file, or any destination configuration key naming a component list.
- **Demonstrability (Additional Constraints)** — "Runnable from a clean checkout with one
  command" is exactly User Story 1, and this feature is what makes the demonstrability gate
  meaningful for every later stage.

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/005-compose-deployment/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
deploy/
├── compose.yaml                    the single Compose configuration
├── env.template                    tracked template producing the untracked env file
├── images/                         Dockerfiles, one per service image, base pinned by digest
│   ├── python-service.Dockerfile
│   └── client.Dockerfile
├── droplet/
│   ├── provision.sh                first-run host preparation
│   └── systemd/harness.service     unattended restart after reboot
└── README.md                       the two destinations, every key, droplet rebuild notes

config/
├── local/
│   ├── common.json                 clock, seed, broker, logging shared values
│   └── <component>.json            one per component, added by that component's feature
└── droplet/
    ├── common.json
    └── <component>.json            same file set, same key set, different values

scripts/
├── run_local.sh                    one-command bring-up, local destination
├── run_droplet.sh                  one-command bring-up, droplet destination
├── seed.sh                         produce all seed content for the active profile
├── reset.sh                        remove derived volumes and reseed
├── check_config.sh                 validate a destination's files against their schemas
└── check_destination_parity.py     file-set and key-set equality across destinations

tests/
├── integration/
│   └── test_compose_bringup.py     shell-only profile bring-up and health assertions
└── unit/
    ├── test_destination_parity.py
    ├── test_config_validation.py
    └── test_profile_not_liveness.py
```

**Structure Decision**: This feature owns `deploy/` with one exception, `config/local/`,
`config/droplet/`, and the six `scripts/` entries named above. The exception is
`deploy/broker/`, which belongs to the observation path feature (007) and holds the broker
configuration and access control lists; this feature references the broker service in the
Compose file and supplies its configuration path, but does not author its contents. It also
does not own the other `scripts/` entries: the lint gates in `scripts/check_no_wallclock.py`
and its siblings belong to the deterministic-foundations feature, and the code generation
scripts belong to the generated-types feature (006).

Two ownership rules follow from the repository layout's earlier-feature-wins convention.
First, each component's own configuration file in both destination directories is authored
by that component's feature; this feature owns the directories, `common.json`, the shape
rule and the parity check. Second, each component's service entry in `deploy/compose.yaml`
is added by that component's feature under a profile; this feature owns the file's structure,
its shared fragments, its health-check convention and the profile mechanism, and seeds it
with the services that exist when it lands.
