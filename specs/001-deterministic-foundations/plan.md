# Implementation Plan: Deterministic Replay Foundations

**Branch**: `001-deterministic-foundations` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-deterministic-foundations/spec.md`

## Summary

Deliver the three properties the SRD says cannot be retrofitted: a single simulation clock, seeded
randomness recorded in a run manifest, and configuration that arrives by name and is validated
before anything else happens. The clock is both a network service (C-01, so the browser can control
the rate and every process shares one sense of time) and an in-process port (`harness_core.clock`,
so components depend on an interface rather than on a transport). Randomness comes from
`harness_core.rng.rng_for(stream)`, derived from the run's root seed by a versioned rule. All of it
is held in place by three lint gates that fail the build on a host-clock call, an unseeded
generator or a literal path.

The design decision that makes replay achievable rather than merely intended: simulation time is
quantised, so the value of tick `n` is fixed by the epoch and the tick interval and is unaffected
by the rate; and a `lockstep` mode advances the clock only when every registered participant has
acknowledged the current tick, which removes scheduling nondeterminism from the tick-to-work
mapping. Real-time and accelerated modes remain free-running, and the harness claims less for them.

## Technical Context

**Language/Version**: Python 3.11 for the clock service, `harness_core` and the gate scripts. The
gates additionally parse TypeScript and SQL sources by pattern.

**Primary Dependencies**: `uv` workspace; `jsonschema` for config and manifest validation; `numpy`
(PCG64 and `SeedSequence`) for the RNG port; a small ASGI stack for the clock service's HTTP and
server-sent-events endpoints; `paho-mqtt` for the heartbeat publication; `ruff` for lint and format.

**Storage**: The run manifest is a JSON document written to a directory named in config. No
database. The clock service holds its state in memory and recovers run identity from the manifest.

**Testing**: `pytest`, with unit tests inside `libs/harness_core/tests/` and `services/clock/tests/`,
and a replay proof under `tests/acceptance/`.

**Target Platform**: Linux containers under Docker Compose, one configuration, two destinations.

**Project Type**: A shared library plus one service plus three repository-level lint gates.

**Performance Goals**: Sustain a 100 ms tick interval at rates up to 100× (that is, up to 1,000
emitted ticks per host second) to at least ten subscribers without a dropped or reordered tick.
Each gate completes over the whole repository in under 15 seconds.

**Constraints**: No host-clock read anywhere except the clock service's real-time driver. No
locally interpolated time in the clock port. Exact integer arithmetic for simulation instants,
microsecond resolution. Manifest writes are atomic.

**Scale/Scope**: One service, one library with five modules (clock, rng, config, manifest, ports),
one shared config schema, three gate scripts and their fixtures.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design.*

- **I. No Wall-Clock Time**: This feature creates the mechanism. The clock service's real-time
  driver is the single permitted host-clock reader, carries an inline marker, and is the only
  entry the exemption inventory contains for operational code. The clock port never interpolates,
  which is what would otherwise smuggle host time back in. `scripts/check_no_wallclock.py` is
  delivered here. Compliant.
- **II. Seeded Randomness and Deterministic Replay**: The RNG port, the derivation rule, the run
  manifest and the lockstep replay proof are all delivered here.
  `scripts/check_seeded_rng.py` is delivered here. Compliant.
- **III. Generated Types Only**: This feature authors neutral masters only —
  `contracts/schemas/config.common.schema.json`, `contracts/schemas/run-manifest.schema.json` and
  `contracts/openapi/clock.openapi.yaml`. It hand-writes no cross-language type. Generation into
  `libs/harness_types/` and `client/src/generated/` is feature 006's chain, which consumes these
  masters. Until that chain exists, the clock service validates against the schemas at runtime
  rather than importing generated types. Compliant.
- **IV. No Literal Paths or Hosts**: The config loader is delivered here and used by the clock
  service itself, so the first component in the harness obeys the rule from the first commit.
  `scripts/check_no_literal_paths.py` is delivered here. Compliant.
- **V. No Tracked Entities**: Nothing in this feature holds data of any kind beyond ticks, seeds
  and digests. Compliant.
- **VI. Honest Ports**: The clock and the RNG are two of the four ports the constitution names as
  genuine. Each has more than one real implementation (network client, manual clock for tests,
  internal driver). No other abstraction is introduced. Compliant.
- **VII. Liveness, Not Configuration**: The clock service publishes a heartbeat on `ctl/heartbeat`
  like every other long-lived component, and claims nothing about any other component. Compliant.
- **VIII. Recommendations, Not Decisions**: Not touched.
- **IX. Ground Truth Is Scored, Not Assumed**: Not touched directly. The run manifest is the
  document the ground-truth manifest of feature 004 refers to by run id.
- **X. Default Deny at the Boundary**: The clock's control endpoints sit under a path prefix
  distinct from the read endpoints, so feature 013 can apply policy by prefix without enumerating
  routes. Compliant.

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/001-deterministic-foundations/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
libs/harness_core/
├── pyproject.toml
├── src/harness_core/
│   ├── clock.py              Clock port, SimInstant, Tick, RemoteClock, ManualClock
│   ├── rng.py                rng_for(stream), derivation rule, identifier derivation
│   ├── config.py             HARNESS_CONFIG loader, schema validation, digest
│   ├── manifest.py           run manifest reader/writer, atomic finalisation
│   └── ports.py              protocol definitions for the clock and RNG ports
└── tests/
    ├── test_clock.py
    ├── test_rng.py
    ├── test_config.py
    └── test_manifest.py

services/clock/
├── pyproject.toml
├── src/harness_clock/
│   ├── __main__.py           entry point: load config, validate, then serve
│   ├── driver.py             the only permitted host-clock reader
│   ├── state.py              tick arithmetic, modes, participant registry
│   ├── http.py               snapshot, tick stream, control endpoints
│   └── heartbeat.py          ctl/heartbeat publication
└── tests/
    ├── test_state.py
    ├── test_lockstep.py
    └── test_http.py

contracts/
├── schemas/config.common.schema.json
├── schemas/run-manifest.schema.json
└── openapi/clock.openapi.yaml

config/
├── local/clock.json
└── droplet/clock.json

scripts/
├── _gate_lib.py              shared: file walk, exclusions, marker parsing, reporting
├── check_no_wallclock.py
├── check_seeded_rng.py
├── check_no_literal_paths.py
├── gates.sh                  the single command; later features append their gates
└── tests/fixtures/gates/     violating and clean fixtures for each gate

tests/acceptance/
└── test_at04_replay_mechanism.py
```

**Structure Decision**: This feature owns `libs/harness_core/`, `services/clock/`,
`contracts/schemas/config.common.schema.json`, `contracts/schemas/run-manifest.schema.json`,
`contracts/openapi/clock.openapi.yaml`, `config/local/clock.json`, `config/droplet/clock.json`,
the three gate scripts with their shared helper, fixtures and runner in `scripts/`, and the replay
proof in `tests/acceptance/`. It touches nothing else.

`services/clock/` is an addition to the service list in `docs/architecture/repo-layout.md`, which
names C-02 to C-17 but not C-01. It is a subdirectory of an existing top-level directory, so it
does not need the argument that a new top-level directory would; the layout document gains a line
when this feature lands.

`scripts/gates.sh` is created here because this is the first feature to need it. Under the
repository ownership rule, later features add their gates to it additively rather than restructuring
it. Continuous integration wiring belongs to feature 005 and calls this one command.
