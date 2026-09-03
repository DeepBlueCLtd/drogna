# Feature 107 — tasks

- [x] T601 Masters: config.telemetry, config.operator, telemetry-report,
      operator-components; monitor/scheduler configs gain their telemetry topics
- [x] T602 Monitor publishes residual samples (and the model-run identity fix the
      ledger exposed); scheduler reports every decision by kind
- [x] T603 Telemetry: running statistics with honest freshness, skill vs
      persistence with the sentence in the message, throughput per sim second,
      report endpoint
- [x] T604 Control registry in the runtime: factory-built components, disconnect on
      stop, rebuild on start; operator surface with components report, step, and
      named refusals; protected list
- [x] T605 Operator panel: telemetry, commands with surfaced refusals, components
      table; Intro grown by 107 with the commands-outside-replay statement
- [x] T606 Tests: aggregation to reporting state, genuine stop/start silence and
      resumption, three refusal shapes, step through the seam, master-valid reports
- [x] T607 The one-command AT-04 replay proof (deferred at 105 to here) — *packaged at
      the arc's close-out as `scripts/replay-proof.ts`, with the command-exclusion
      statement it prints before it runs. The packaging was incomplete until now: the
      script named the generator's byte-identity test in its header and excluded it by
      its selector. Selection is now by marker rather than by test name, with the marked
      set read off disk, every marked test required to have run and passed, and a sweep
      that refuses a determinism-shaped test carrying no marker either way. See
      `specs/101-foundations-shell/tasks.md` T037 for the five watched failures.*
- [x] T608 Per-region residual statistics and end-to-end latency (issue #61). The
      region grid comes from the telemetry component's own configuration (rows,
      columns, minimum samples) and is laid over the scored holding's extent, so the
      domain is not copied into configuration a second time. Latency is measured in
      simulation seconds from the observation instant to the fold instant; it reads
      zero here because the monitor scores within the tick, and the display says
      that rather than presenting a bare zero. Watched failing: the thin-region state
      forced to `reporting` (red), unsampled regions published with zeroes (red), the
      latency subtraction reversed (red), and the fold instant taken from something
      other than the clock (red). `run_failed`/`publication_refused` stay unproduced,
      with the reason written where the next reader will look.
