# Architecture Decision Records

An ADR is required for any decision that is hard to reverse, was genuinely contested,
or where a plausible alternative was rejected (SRD PR-03). Routine choices do not earn
one.

Each record carries Status, Context, Decision and Consequences, is numbered
sequentially, and is dated. Superseded records are kept and marked, never deleted.

| # | Title | Status |
|---|---|---|
| [0001](0001-binary-access.md) | Binary access rather than tiered or per-field | Accepted, amended by ADR-0020 |
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
| [0020](0020-clearance-delegated-for-the-control-upgrade.md) | Clearance is binary for the released prefix and delegated for the control upgrade | Accepted |
| [0021](0021-the-clock-control-answers-the-browser-from-any-origin.md) | The clock's HTTP interface answers the browser from any origin | Accepted, to be superseded by ADR-0025 when the clock is routed |
| [0022](0022-generator-selection-for-the-type-chain.md) | The type chain's generators, and why the TypeScript half is ours | Accepted |
| [0023](0023-the-observation-store-authenticates-by-trust.md) | The observation store authenticates by trust, and models no database threat | Accepted |
| [0024](0024-the-advisory-store-is-a-third-schema.md) | The advisory store is a third schema, not a second engine | Accepted |
| [0025](0025-the-operator-plane-sits-behind-the-clearance.md) | The operator plane sits behind the clearance, and the clock joins it there | Accepted |
| [0026](0026-resource-sampling-and-the-runtime-socket.md) | The third wall-clock exemption is resource sampling, and the socket stops at the door | Accepted |
| [0027](0027-version-2-client-side-rewrite.md) | Version 2 is a client-side rewrite behind a wire-protocol seam | Accepted |
| [0028](0028-dockview-hosts-the-shell.md) | dockview hosts the shell | Accepted, amended by ADR-0031 |
| [0029](0029-the-http-seam-is-a-fetch-shim.md) | The HTTP seam is a fetch-level shim, not a Service Worker | Accepted |
| [0030](0030-scheduled-modules-and-the-composition-root.md) | Components are scheduled modules on the main thread, wired by one composition root | Accepted |
| [0031](0031-addressability-goes-below-the-panel.md) | Addressability goes below the panel | Accepted |

The rows 0027 to 0030 were added on 29 August 2026, by feature 111, which came to add
its own row and found the table had stopped at 0026 while four V2 records existed on
disk. This is the second time this index has been found short, and for the same reason:
the files are the record and this table is a claim about them, so the claim is the part
that rots. Both catches are noted here rather than tidied away, because a table that has
silently fallen behind twice is a fact about how it is maintained.

There is no ADR-0017. The number was never used — no file by that number appears anywhere
in the history — and renumbering the records that exist would break references already in
commit messages, so the gap stays. The rows from 0014 on were added to this index on
28 August 2026, when a session found it had silently stopped at 0013 — the files were
always the record; this table is a claim about them.
