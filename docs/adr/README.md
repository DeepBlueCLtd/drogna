# Architecture Decision Records

An ADR is required for any decision that is hard to reverse, was genuinely contested,
or where a plausible alternative was rejected (SRD PR-03). Routine choices do not earn
one.

Each record carries Status, Context, Decision and Consequences, is numbered
sequentially, and is dated. Superseded records are kept and marked, never deleted.

| # | Title | Status |
|---|---|---|
| [0001](0001-binary-access.md) | Binary access rather than tiered or per-field | Accepted |
| [0002](0002-decorrelation-timescale-as-a-field.md) | Decorrelation timescale is a field, authored per feature | Accepted |
| [0003](0003-bespoke-edr-trajectory-provider.md) | Trajectory queries are served by a bespoke pygeoapi provider | Accepted |
| [0004](0004-bespoke-sensorthings-provider.md) | SensorThings is served by a bespoke pygeoapi provider | Accepted |
| [0005](0005-sound-speed-is-derived-not-stored.md) | Sound speed is derived at the point of use, not stored | Accepted |
| [0006](0006-heartbeat-cadence-is-real-time.md) | Heartbeat cadence and liveness windows are real time | Accepted |
| [0007](0007-host-time-for-display-smoothing.md) | Host time may smooth the display between clock samples | Accepted |
| [0008](0008-control-messages-reach-the-client-by-websocket-upgrade.md) | Control messages reach the client by WebSocket upgrade at the proxy | Accepted |
| [0009](0009-clock-transport-and-lockstep-mode.md) | The clock publishes on the control namespace, and gains a lockstep mode | Accepted |
| [0010](0010-site-tooling.md) | Tooling for the published site | Accepted |
| [0011](0011-the-coverage-store-pointer-is-text.md) | The current-run pointer is a text file, not a symlink | Accepted |
| [0012](0012-sensors-may-read-the-clock-and-nothing-else.md) | Sensors may read the clock, and nothing else on the control branch | Accepted |
| [0013](0013-leakage-is-scored-per-released-variable.md) | A leakage statistic is scored per released variable, and the worst one is the answer | Accepted |
| [0014](0014-quality-flagging-is-the-ingestion-seam.md) | Quality flagging is the ingestion seam, not a field on an observation | Accepted |
| [0015](0015-a-sensor-may-announce-itself.md) | A sensor may announce itself, because the alternative was a display that lied | Accepted |
| [0016](0016-the-broker-credential-path-is-half-built.md) | No component could authenticate, and the credential path is now whole | Accepted, amended same day |
| [0018](0018-common-json-is-a-root-seed-not-a-set-of-defaults.md) | `common.json` is a root seed, and the defaults mechanism it describes does not exist | Accepted |
| [0019](0019-the-planner-threshold-is-absolute-and-was-never-checked.md) | The planner's threshold stays absolute, and now has something to check it against | Accepted |
| [0020](0020-clearance-delegated-for-the-control-upgrade.md) | Clearance is binary for the released prefix and delegated for the control upgrade | Proposed |
| [0021](0021-the-clock-control-answers-the-browser-from-any-origin.md) | The clock's HTTP interface answers the browser from any origin | Proposed |
| [0022](0022-the-observation-store-authenticates-by-trust.md) | The observation store authenticates by trust, and models no database threat | Accepted |

There is no ADR-0017. The number was never used — no file by that number appears anywhere
in the history — and renumbering the records that exist would break references already in
commit messages, so the gap stays. The rows from 0014 on were added to this index on
28 August 2026, when a session found it had silently stopped at 0013 — the files were
always the record; this table is a claim about them.
