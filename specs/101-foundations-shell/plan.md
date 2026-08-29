# Feature 101 — plan

## Structure

```
app/
├── config/run.json         the run configuration document (config.run master)
├── index.html
└── src/
    ├── bootstrap/          the composition root (ADR-0030): the only module importing both halves
    ├── seam/               transport interfaces, fetch shim (ADR-0029), master validation
    ├── generated/          GENERATED from contracts/ — types.ts, schema-documents.ts
    ├── backend/
    │   ├── broker/         V2-C03 + the in-browser transport adapter
    │   ├── clock/          V2-C01
    │   ├── boundary/       V2-C10 (release gate)
    │   ├── runtime/        construction, router, run manifest
    │   └── lib/            rng, sha256, sim-time, heartbeat
    ├── shell/              Shell (dockview), ClockStrip, views (URL addressing)
    └── panels/             intro/, system/, map/, messages/
scripts/
├── gates/                  the six gates + lib + tests/fixtures (planted violations)
├── gates.registry          one gate per line; the runner names no gate
├── run-gates.ts
├── generate-types.ts
└── capture/glance.ts
```

## Constitution check

- **I** — the clock driver, heartbeat cadence and liveness evaluation carry inline
  `harness:allow-wallclock` markers under ADR-0006/0007's bounds; the gate scans
  everything else. Two exemption classes, as 2.0.0 requires.
- **II** — one entropy site (`bootstrap`, `harness:allow-entropy`), recorded in the
  manifest it seeds; the derivation rule is pinned by test.
- **III** — all shapes generated from contracts/ masters; drift gate.
- **IV** — every topic, path and endpoint arrives via config.run; the literal-path
  gate scans component source; the composition root is the one scoped exception
  (ADR-0030) and the config document itself is data.
- **V** — vocabulary gate carried from V1 at the same grain; FR-01's on-screen
  statement of the prohibition carries the inline marker.
- **VII** — System lights only from received heartbeats; the panel test proves a
  stopped runtime goes dark.
- **X/XI** — default deny with observable denials plus one genuine cleared route;
  import-boundary gate polices shell|panels ↔ backend with only seam/ and
  generated/ shared.

## Decisions recorded

ADR-0028 (dockview), ADR-0029 (fetch shim), ADR-0030 (scheduled modules, composition
root); spikes `layout-manager` and `seam-interception`.
