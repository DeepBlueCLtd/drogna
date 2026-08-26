# Architecture Decision Records

An ADR is required for any decision that is hard to reverse, was genuinely contested,
or where a plausible alternative was rejected (SRD PR-03). Routine choices do not earn
one.

Each record carries Status, Context, Decision and Consequences, is numbered
sequentially, and is dated. Superseded records are kept and marked, never deleted.

| # | Title | Status |
|---|---|---|
| [0001](0001-binary-access.md) | Binary access rather than tiered or per-field | Proposed |
| [0002](0002-decorrelation-timescale-as-a-field.md) | Decorrelation timescale is a field, authored per feature | Accepted |
| [0003](0003-bespoke-edr-trajectory-provider.md) | Trajectory queries are served by a bespoke pygeoapi provider | Accepted |
