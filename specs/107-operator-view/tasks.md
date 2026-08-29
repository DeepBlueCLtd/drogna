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
- [ ] T607 The one-command AT-04 replay proof (deferred at 105 to here) — *moved
      once more, deliberately, to ride 108/109's close-out: the byte-identity tests
      now span generator, loop and planner, and the proof script's one remaining
      job is packaging them behind `pnpm replay-proof` with the command-exclusion
      statement; it belongs beside the wrap-up rather than mid-beat.*
