# Implementation Plan: Offload Packaging and Verified Eviction

**Branch**: `014-offload-export` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-offload-export/spec.md`

## Summary

Package a run's profiles as a CF-conforming NetCDF file using the `trajectoryProfile`
discrete sampling geometry, with a sidecar manifest of digests; transfer each bundle to
a destination that independently computes a digest and returns a receipt; and gate
eviction on that receipt matching a digest recomputed locally from the file on disk, in
a write-ahead ledger that survives interruption at every transition. The export carries
only allow-listed attributes and an opaque run reference, so it cannot become the
provenance leakage path SRD FR-42 names.

The interesting engineering is not the file format but the ordering of side effects.
The ledger is written before the thing it describes happens, states only move forward,
and eviction re-reads the bytes it is about to destroy.

## Technical Context

**Language/Version**: Python 3.11 under the `uv` workspace, `ruff` for lint and format.

**Primary Dependencies**: `netCDF4` (or `xarray` writing the netCDF4 engine) for the
export; a CF compliance checker pinned to a convention version; `numpy`; `harness_core`
for the clock port, the RNG port, the configuration loader and the run manifest;
`libs/harness_types` for generated message and configuration types; an MQTT client for
heartbeat and telemetry; `httpx` for transfer; `pytest` for tests.

**Storage**: The offload staging area and the ledger, both located from configuration.
The ledger is a durable append-only file with fsync on each record, not a database: the
volume is a handful of records per run, and a separate service to hold them would be
operational surface for nothing.

**Testing**: `pytest`. Unit tests beside the code in `services/offload/tests/`;
cross-component tests in `tests/integration/`. The CF compliance check runs in CI
against every produced fixture bundle. Crash injection uses a stubbed side-effect layer
that can be told to abort at a named point.

**Target Platform**: Linux under Docker Compose, one configuration, two destinations.

**Project Type**: A service (C-17) plus one documentation page.

**Performance Goals**: None stated. The packager is not on any latency path; a bundle
covering one simulation time window is produced in a single pass and the ledger costs
one fsync per transition.

**Constraints**: No wall-clock time in any exported value or ledger record; byte-identical
output under replay for a fixed code and library version; no eviction without a verified,
durably recorded receipt; no literal paths, hosts or ports in source; attributes limited
to the allow-list.

**Scale/Scope**: One run at a time, bundles per simulation time window, a staging area
sized in configuration, one destination.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — Every time in an export, a ledger record, a receipt
  comparison and a telemetry message comes from `harness_core.clock.Clock`. The CF time
  coordinate is referenced to the simulation epoch from the run manifest, so a file
  cannot silently acquire host time through its units string. Retention age is measured
  in simulation time. Log line decoration is the only permitted exception and is not used
  for any decision. Compliant.
- **II. Seeded Randomness and Deterministic Replay** — Bundle identifiers are derived
  from the run identity and the bundle's logical position, never from entropy. Nothing in
  the packager calls a global RNG. Byte-identity under replay is a test, and the test
  pins the library version because the library writes its own version into the file.
  Compliant.
- **III. Generated Types Only** — The receipt, the bundle manifest and the telemetry
  message are JSON Schema shapes under `contracts/schemas/`, and the Python types are
  generated. `config.offload.schema.json` is an additive contribution. Nothing is
  hand-written on both sides of the destination boundary. Compliant.
- **IV. No Literal Paths or Hosts** — One environment variable, `HARNESS_CONFIG`,
  validated first. The staging area, the ledger location, the destination address, the
  retention bounds, the attribute allow-list and the compliance-checker version all come
  from configuration. Compliant.
- **V. No Tracked Entities** — The export contains environmental measurements at
  positions and depths, which is what a profile is. It contains no entity, no
  identification, no contact and no track. The trajectory instance in the file is the
  ordering of the profiles, and the primer says so in those words. Compliant.
- **VI. Honest Ports** — The coverage output is a genuine port (NetCDF today, Zarr
  plausibly later) and this feature is one of its consumers. The destination transport is
  not dressed as a port: one implementation exists, and introducing an interface over it
  would need an ADR. Compliant.
- **IX. Ground Truth Is Scored, Not Assumed** — The bundle carries the run manifest
  digest so anything computed from the bundle can still be scored against the ground
  truth that produced it. Compliant.
- **X. Default Deny at the Boundary** — Bundles are written to the staging area, which is
  not reachable through the released path prefix, and the attribute allow-list is the
  producer-side half of the provenance gate feature 013 owns. Compliant.

No violation requires justification. Complexity Tracking is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/014-offload-export/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
services/offload/                       C-17, owned by this feature
├── harness_offload/
│   ├── __init__.py
│   ├── config.py                       HARNESS_CONFIG load and validate, first I/O
│   ├── profiles.py                     read a run's profiles into the export model
│   ├── writer.py                       trajectoryProfile NetCDF writer
│   ├── attributes.py                   the attribute allow-list, applied on write
│   ├── bundle.py                       bundle identity, sidecar manifest, digests
│   ├── ledger.py                       write-ahead durable state, recovery on restart
│   ├── transfer.py                     temporary name, atomic reveal, receipt fetch
│   ├── verify.py                       recompute local digest, compare receipt
│   ├── evict.py                        retention trigger, pre-delete digest re-check
│   ├── telemetry.py                    ctl/heartbeat and ctl/telemetry
│   └── main.py                         the cycle
└── tests/
    ├── test_writer.py
    ├── test_attributes.py
    ├── test_bundle.py
    ├── test_ledger.py
    ├── test_verify.py
    ├── test_evict.py
    └── test_determinism.py

tests/integration/
├── test_offload_receipt_paths.py       every failure the destination can present
└── test_offload_crash_recovery.py      kill at each transition, restart, assert

docs/standards/
└── cf-conventions.md                   owned by this feature, published by 015

contracts/schemas/
├── config.offload.schema.json          additive contribution
├── offload-receipt.schema.json         additive contribution
└── bundle-manifest.schema.json         additive contribution
```

**Structure Decision**: This feature owns `services/offload/` and
`docs/standards/cf-conventions.md`, the two directories the layout already reserves for
C-17 and for standards primers. It adds three schema files to `contracts/` as additive
contributions by the feature that first needs the shape, and two files to the existing
`tests/integration/` for the cross-component behaviour that cannot be exercised inside
one package.

The package is split so that each side effect lives in its own module and can be
stubbed independently: `transfer`, `verify` and `evict` never call each other, and
`main` orders them. The crash-injection tests replace one module at a time, which is
only possible because the ordering is in `main` rather than distributed through the
call graph.

`docs/standards/cf-conventions.md` sits inside the documentation area that feature 015
owns and publishes. Under the repository ownership rule the earlier-numbered feature
owns the file, so this feature authors it and feature 015 places it in the site
navigation and applies the publication gates to it.
