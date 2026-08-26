# Implementation Plan: Neutral Masters and the Generator Chain

**Branch**: `006-generated-types` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-generated-types/spec.md`

## Summary

Two neutral masters and one generator chain. Broker payloads and configuration files are
described in JSON Schema under `contracts/schemas/`; HTTP surfaces are described in OpenAPI
under `contracts/openapi/`, with the query layer's own emitted specification vendored as the
source for its part of the interface. Where a shape appears in both, the OpenAPI document
references the schema file rather than restating it. From those masters,
`scripts/generate_types.sh` produces committed Python models in `libs/harness_types/` and
committed TypeScript types in `client/src/generated/`, and `scripts/check_types_drift.sh`
proves in CI that the committed output still matches its source.

Two lints ride alongside, because the generator chain alone does not enforce Constitution III.
One checks that the masters obey the naming and identifier conventions. The other checks the
direction that actually breaks: that nobody has hand-written a boundary-crossing type outside
the generated directories.

## Technical Context

**Language/Version**: Python 3.11 for the chain's own tooling and the lints; POSIX shell for
the two entry-point scripts; TypeScript 5 as a generation target only.

**Primary Dependencies**: `datamodel-code-generator` (JSON Schema and OpenAPI to Pydantic v2),
`json-schema-to-typescript`, `openapi-typescript`, and a reference bundler for resolving
external references before generation. Each pinned by exact version in the generator manifest.
`jsonschema` for the convention lint and example validation.

**Storage**: Files only. `contracts/` holds the masters, the two generated directories hold
the output, and the bundled intermediates are build artefacts written to a scratch directory
and never committed.

**Testing**: `pytest` for the convention lint, the hand-written-type lint, the idempotence
assertion and the drift check's own behaviour; `vitest` and `tsc --noEmit` to prove the
generated TypeScript compiles and that examples type-check against it.

**Target Platform**: The chain runs on a developer machine, in CI, and inside an ephemeral
agent session. It must produce identical output in all three.

**Project Type**: Build tooling and contracts. It produces no runtime service.

**Performance Goals**: A full regeneration completes in under thirty seconds; the drift check
completes in under sixty seconds on the project's CI runner, so nobody proposes moving it out
of the default job.

**Constraints**: No network access during generation or checking. No credentials. No running
service required by the drift check. Byte-identical output across operating systems, which
means pinned versions and stable ordering, and normalisation where a generator will not
provide it.

**Scale/Scope**: Order of twenty message schemas, eighteen configuration schemas, one
hand-written OpenAPI document and one vendored one, across two target languages.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **III. Generated Types Only** — The load-bearing principle. This feature is its
  implementation: single definition per shape, references where shapes coincide, both
  languages generated into the two named directories, output committed with "DO NOT EDIT"
  banners, and the drift check as the enforcement. The feature adds one thing the principle
  implies but does not spell out: a lint for hand-written boundary types, without which the
  principle is enforced only in the direction that was already easy.
- **I. No Wall-Clock Time** — Message schemas express time as a simulation-clock instant and
  document it as such, so no generated model invites a consumer to fill a timestamp from the
  host clock. The generation script itself must emit no timestamp into generated output, since
  that would make the drift check fail spuriously; this is a case where the constitution and
  the mechanics agree.
- **II. Seeded Randomness and Deterministic Replay** — Generation is deterministic in the same
  sense a replay is: pinned versions, stable ordering, byte-identical output. The generator
  manifest is the analogue of the run manifest.
- **IV. No Literal Paths or Hosts** — Configuration schemas are part of this chain, so the
  configuration contract that Principle IV rests on is itself generated rather than hand-kept.
  The scripts take their locations from arguments and repository-relative defaults; schema
  identifiers use the reserved `.invalid` domain and are never fetched.
- **V. No Tracked Entities** — Schemas are prime territory for a stray entity vocabulary. The
  forbidden-vocabulary gate covers `contracts/`, and the convention lint requires a title and
  description on every schema so that what a shape is stays legible.
- **VI. Honest Ports** — Generated models are data, not abstractions. No interface layer is
  introduced over them; a hand-written wrapper around a generated model would be
  interface-for-its-own-sake and would recreate the second definition this feature exists to
  remove.

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/006-generated-types/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/
├── schemas/                        JSON Schema masters, hand-written and authoritative
│   ├── config.common.schema.json   shared clock/seed/broker/logging sections
│   ├── config.<component>.schema.json
│   └── <topic-noun>.schema.json    one per broker message
└── openapi/
    ├── harness.openapi.yaml        hand-written, OpenAPI 3.1, references the schemas
    ├── query-layer.openapi.json    vendored snapshot, canonicalised, never hand-edited
    └── generators.toml             the generator manifest: tool, version, source, target

libs/harness_types/                 GENERATED Python, committed, banner-marked
├── __init__.py
├── messages/
└── config/

client/src/generated/               GENERATED TypeScript, committed, banner-marked
├── messages/
└── http/

scripts/
├── generate_types.sh               one command, regenerates everything
├── check_types_drift.sh            regenerate to scratch, diff, fail on difference
├── refresh_query_layer_spec.sh     capture and canonicalise the emitted specification
├── check_schema_conventions.py     identifier form, naming, examples, titles
└── check_handwritten_types.py      boundary types declared outside the generated dirs

tests/
├── unit/
│   ├── test_schema_conventions.py
│   ├── test_handwritten_type_lint.py
│   └── test_generation_idempotence.py
└── integration/
    └── test_types_drift_gate.py
```

**Structure Decision**: This feature owns `contracts/openapi/`, `libs/harness_types/`,
`client/src/generated/`, and the five `scripts/` entries named above. It owns the conventions
governing `contracts/schemas/` — naming, identifier form, dialect, the requirement to forbid
unknown properties, the example rule — and the lint that enforces them, but not every schema
file in it: per the repository layout's ownership rule, each schema is contributed by the
feature that first needs the shape. `contracts/schemas/config.common.schema.json` is claimed
by the deterministic-foundations feature, which needs it first;
`contracts/schemas/observation.schema.json` by the observation path feature. This feature
ships whichever schemas exist when it lands as fixtures for its own tests, and adds none of
its own beyond those.

The two generated directories exist inside other features' territory —
`libs/harness_types/` beside `libs/harness_core/`, and `client/src/generated/` inside the
client. Both are named as generated in the repository layout, both carry banners, and neither
is edited by any feature including this one. That is the arrangement the layout intends, and
it is recorded here so that a later feature does not read a file under `client/src/` as
belonging to the client.
