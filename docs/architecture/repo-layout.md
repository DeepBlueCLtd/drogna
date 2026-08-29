# Repository layout (V2)

Binding, per the constitution's layout rule: a plan proposing a new top-level
directory must say why. Rewritten at feature 101; the V1 layout it replaces is in git
history and described by the archived record.

| Path | What | Owner |
|---|---|---|
| `srd.md` | SRD-v2, source of scope | author + planning rounds |
| `.specify/memory/constitution.md` | Constitution 2.0.0 | governance |
| `docs/v2/plan.md` | The endorsed V2 plan (interview record) | historical, load-bearing |
| `docs/adr/` | ADRs, one numbering V1→V2 (0027 is the reversal) | every feature |
| `docs/v1/` | Archived V1 constitution | frozen |
| `specs/1NN-*/` | V2 spec series, one feature per beat | each feature |
| `specs/0NN-*/`, `spikes/` (V1 dirs), `harness-srd.md` | V1 record, archival banners | frozen |
| `spikes/layout-manager/`, `spikes/seam-interception/` … | V2 spikes, dated FINDING.md each | as conducted |
| `contracts/schemas/` | JSON Schema masters for every seam shape | append/amend via features |
| `app/` | The one deliverable | features 101–109 |
| `app/config/run.json` | The run configuration document | features, additively |
| `app/src/bootstrap/` | Composition root (ADR-0030); nothing imports it | 101 |
| `app/src/seam/` | Transport interfaces, fetch shim, validation — visible to both halves | 101 |
| `app/src/generated/` | GENERATED from contracts; never edited | `pnpm generate` |
| `app/src/backend/` | In-browser components, one directory each | per beat |
| `app/src/shell/`, `app/src/panels/` | Front-end | per beat |
| `scripts/gates/`, `scripts/gates.registry`, `scripts/run-gates.ts` | Constitution gates; registry append-only | every feature |
| `scripts/generate-types.ts` | The type chain | 101 |
| `scripts/capture/` | Glance and successors | 101, 109 |
| `scripts/site/`, `scripts/build-site.ts` | The site generator, TypeScript (ADR-0031) | site changes |
| `scripts/publish-site.ts`, `scripts/estate-index.ts` | The gh-pages estate: the site's tenancy, and the instance index | site changes |
| `site/docs/` | Site source, rebuilt for V2; V1 pages archived within it under `archive/` | per beat, as things arrive |

The import rules between `app/src` areas are ADR-0030's table, enforced by
`scripts/gates/check-import-boundary.ts`.
