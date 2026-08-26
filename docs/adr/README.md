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
| [0004](0004-bespoke-sensorthings-provider.md) | SensorThings is served by a bespoke pygeoapi provider | Accepted |
| [0005](0005-sound-speed-is-derived-not-stored.md) | Sound speed is derived at the point of use, not stored | Accepted |
| [0006](0006-heartbeat-cadence-is-real-time.md) | Heartbeat cadence and liveness windows are real time | Accepted |
| [0007](0007-host-time-for-display-smoothing.md) | Host time may smooth the display between clock samples | Accepted |
| [0008](0008-control-messages-reach-the-client-by-websocket-upgrade.md) | Control messages reach the client by WebSocket upgrade at the proxy | Accepted |
| [0009](0009-clock-transport-and-lockstep-mode.md) | The clock publishes on the control namespace, and gains a lockstep mode | Accepted |
| [0010](0010-site-tooling.md) | Tooling for the published site | Accepted |
