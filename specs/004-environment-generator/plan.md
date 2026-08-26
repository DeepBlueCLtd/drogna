# Implementation Plan: Synthetic Environment Generator

**Branch**: `004-environment-generator` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-environment-generator/spec.md`

## Summary

Build C-02: a generator that writes a four-dimensional synthetic field of temperature, salinity and
pressure with sound speed derived from them, containing four seeded features, and beside it a
manifest recording every parameter that produced it. The manifest is the deliverable that matters.
§10 calls it what turns drogna from toy into evidence, and both AT-01 and AT-03 score against it.

The design decision that makes the manifest worth having: the field is analytic, and the manifest
carries the whole analytic form. A pure evaluator takes the manifest and a point — on the grid or
between grid nodes — and returns the truth there, without loading the field and without the
generator running. That is what lets AT-01 check a trajectory query at vertices that fall nowhere
near a grid node, and what lets AT-03 report an eddy recovery error in kilometres rather than an
opinion.

The decorrelation timescale follows SRD v0.3: a field over the same four dimensions, authored per
feature over a domain-wide background and evaluated per location, advecting with the feature that
moves. Background and per-feature values are both ground truth and both go in the manifest. That
resolution earns an ADR under PR-03, written by this feature.

## Technical Context

**Language/Version**: Python 3.11, in the `uv` workspace, `ruff` for lint and format.

**Primary Dependencies**: `harness_core` (config loader, clock port, RNG port, run manifest) from
feature 001; `numpy` for the analytic field; `xarray` and `netCDF4` for CF-conventions output;
`jsonschema` for manifest and config validation; `paho-mqtt` for the heartbeat.

**Storage**: NetCDF field files and JSON manifests, written to a directory named in config. No
database. The generator is the only writer of its output directory.

**Testing**: `pytest`, with unit tests in `services/env_generator/tests/` and the evaluator's
agreement with the stored field as the central property test. The scoring helper is exercised by
AT-03's acceptance test, which lives in `tests/acceptance/` and is written by the feature that
produces recovered fields.

**Target Platform**: Linux container under Docker Compose, one configuration, two destinations. Run
at scenario start, not continuously.

**Project Type**: A batch service (C-02) plus a manifest contract and a pure evaluation library
inside the same package.

**Performance Goals**: The default configured domain generated within five minutes and under 200 MB
on the smallest destination.

**Constraints**: Byte-identical output for the same seed and configuration, which requires fixing the
stored dtype, normalising NetCDF attributes that would otherwise carry a creation timestamp or a
library version, and drawing every random value through the RNG port in a fixed order. No host clock,
no literal paths, no free generators.

**Scale/Scope**: One service, four feature kinds, five written variables, one manifest schema, one
evaluator, one scoring helper.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design.*

- **I. No Wall-Clock Time**: The generator takes time from the clock port. The simulation time
  recorded in the manifest is simulation time. NetCDF creation-timestamp attributes are suppressed,
  which removes the one place a host clock would otherwise leak into the output. Compliant.
- **II. Seeded Randomness and Deterministic Replay**: Every random value comes from
  `rng_for(stream)` with the stream named in config, drawn in a fixed order. Two runs with one seed
  produce byte-identical files. The manifest records seed, stream, derived seed and generator
  version. Compliant.
- **III. Generated Types Only**: `contracts/schemas/manifest.schema.json` and
  `contracts/schemas/config.env_generator.schema.json` are authored here as neutral masters. Python
  types for both are generated into `libs/harness_types/` by feature 006's chain; until that chain
  lands the generator validates against the schemas at runtime and hand-writes no duplicate of either
  shape. Compliant.
- **IV. No Literal Paths or Hosts**: One environment variable, `HARNESS_CONFIG`; validation before
  any other I/O; grid, domain, feature parameters, dtype and output location all from config.
  Compliant.
- **V. No Tracked Entities**: The generator produces environmental fields and their ground truth.
  Nothing else. The field carries a metadata attribute stating that the data are synthetic.
  Compliant.
- **VI. Honest Ports**: No new abstraction. The generator uses the clock and RNG ports that already
  exist and writes NetCDF directly; the coverage output port belongs to the model runner's output
  path, not to this feature, and dressing the generator's writer as a port would be interface for its
  own sake. Compliant.
- **VII. Liveness, Not Configuration**: The generator publishes heartbeats while it runs and stops
  when it finishes, so the shell shows it dark afterwards. That is truthful and is not corrected for.
  Compliant.
- **VIII. Recommendations, Not Decisions**: Not touched.
- **IX. Ground Truth Is Scored, Not Assumed**: The principle this feature exists to serve. The
  manifest records the truth; the evaluator makes it computable at arbitrary points; the scoring
  helper reports an error figure with units and returns no verdict of its own. Compliant.
- **X. Default Deny at the Boundary**: The generated field is the simulated world, not a released
  collection, and is not served through the query layer. Compliant.

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/004-environment-generator/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
services/env_generator/
├── pyproject.toml
├── src/harness_env_generator/
│   ├── __main__.py            entry point: config first, then clock, then generate
│   ├── grid.py                axis construction from config
│   ├── background.py          background stratification
│   ├── features/
│   │   ├── kernels.py         the spatial kernels features and timescales share
│   │   ├── eddy.py            mesoscale eddy
│   │   ├── front.py           front
│   │   ├── thermocline.py     thermocline
│   │   └── moving.py          moving feature and its advection
│   ├── soundspeed.py          the single sound speed implementation in drogna
│   ├── timescale.py           tau: authoring, blending rule, evaluation, advection
│   ├── compose.py             background plus features, with bounds checking
│   ├── writer.py              CF NetCDF output, attribute normalisation, digests
│   ├── manifest.py            ground-truth manifest construction and validation
│   ├── evaluator.py           pure: manifest plus point -> truth
│   ├── scoring.py             recovery error against the evaluator, with units
│   └── heartbeat.py           ctl/heartbeat publication while running
└── tests/
    ├── test_soundspeed.py
    ├── test_features.py
    ├── test_timescale.py
    ├── test_manifest.py
    ├── test_evaluator.py
    ├── test_reproducibility.py
    └── test_scoring.py

contracts/schemas/
├── manifest.schema.json
└── config.env_generator.schema.json

config/
├── local/env_generator.json
└── droplet/env_generator.json
```

**Structure Decision**: This feature owns `services/env_generator/`,
`contracts/schemas/manifest.schema.json`, `contracts/schemas/config.env_generator.schema.json`, and
the generator's config values for both destinations. It creates nothing under `stores/`, `query/` or
`client/`.

`soundspeed.py` is the single sound speed implementation in drogna and lives here because this is the
first component to need it. When the monitor needs it for the residual of SRD FR-24, promoting it to
a shared library under `libs/` is an additive change owned by that feature; a second implementation
is not permitted, because two would make the residual meaningless.

The ground-truth manifest is `manifest.schema.json`; feature 001's run manifest is
`run-manifest.schema.json`. The two are separate documents, and the ground-truth manifest carries the
run id so a field can be tied back to the run that produced it.

## Decisions requiring an ADR

- **The decorrelation timescale is a field** (SRD FR-05 as resolved in v0.3): authored per feature
  over a domain-wide background, evaluated per location, advecting with a moving feature. The SRD
  names this as earning an ADR under PR-03. The record should carry the rejected alternatives —
  per-feature alone, which leaves background water with no timescale though FR-08 requires quiet
  water to be left alone, and a static per-region map, which gives the background a timescale but
  cannot follow FR-03's drifting feature — and the consequence that the planner can score every cell
  it needs to (FR-32, FR-34).
- **The blending rule** by which feature timescales combine with the background is a contested
  detail rather than a routine one, since it determines the revisit cadence of FR-08. It is recorded
  in the same ADR rather than earning its own.
