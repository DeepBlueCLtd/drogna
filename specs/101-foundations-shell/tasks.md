# Feature 101 — tasks

Ticked as built, per the V1 reconciliation lesson: the reason is written at the
moment a task is declined, never reconstructed later.

## Adoption and retirement

- [x] T001 Adoption commit: srd.md to the root, constitution 2.0.0, ADR-0027
      accepted, archival banners on the V1 record
- [x] T002 Retirement commit: V1 software deleted, contracts pruned, CLAUDE.md and
      README rewritten, V1 workflows removed
- [ ] T003 Decommission the droplet (plan §9.2) — *declined here: an infrastructure
      action on the author's account, not a repository change; flagged in the PR for
      the author to action.*

## Seam and backend

- [x] T010 Transport interfaces (seam), broker with wildcards + role rules, wire-shape
      JSON round-trip, deterministic breadth-first delivery
- [x] T011 Fetch shim (ADR-0029) with wire-shape body rule
- [x] T012 Release gate: default deny, denial published on its topic
      (boundary-denial master), one genuine allowed route tested from inside (E8)
- [x] T013 Clock: modes, bounded rates with named refusals, step, lockstep hook,
      rate ack, HTTP rate interface
- [x] T014 Heartbeats with declared windows; runtime construction order; stopped
      runtime goes silent (proved by test)
- [x] T015 Seeded RNG with pinned derivation rule; run manifest to
      run-manifest.schema.json; deterministic run id
- [x] T016 Config masters (config.common/clock/broker/boundary/shell/run,
      boundary-denial) and validation of every document before construction

## Shell

- [x] T020 dockview shell (ADR-0028), four tabs from configuration, tabs never
      closable
- [x] T021 URL-addressable views: hash → panel, activation → hash
- [x] T022 System panel: full declared layout greyed; lit only by received
      heartbeats within declared windows; dark on silence
- [x] T023 Messages panel: live traffic, per-topic master validation, refusal
      counter (E4)
- [x] T024 Intro panel: FR-01 disclaimer, beat-101 narration, deep links
- [x] T025 Map panel: honest not-landed statement
- [x] T026 Manifest export/import through the header; import refusals named
- [ ] T027 Persist panel arrangement per viewer — *declined: presentation-only
      convenience (FR-14); revisit only if reviewers ask for it.*

## Gates, types, capture, CI

- [x] T030 Six gates in TypeScript + registry + runner that names no gate
- [x] T031 Every gate watched failing: planted-violation fixtures held permanently
      in scripts/tests; runner proven to report a failing gate and a gate that
      cannot run
- [x] T032 Bespoke narrow type generator; committed output; drift gate
- [x] T033 Glance capture: serves the build read-only, pins rate 0 through the
      seam, prints the rate beside the image; deep-linkable
- [x] T034 CI: checks + build + browser-verified glance artifact
- [x] T035 Instances workflow: additive gh-pages estate deploy per branch; ntfy
      notice behind a CI secret (D17, D18)
- [ ] T036 Site rebuild with V1 archive section (§9.1) — *deferred to its own
      workstream after the arc lands: the estate serves review instances meanwhile,
      and the V1 site remains the published archive. Blog obligations (PR-04a)
      attach to that workstream.*
- [ ] T037 AT-04 one-command replay proof — *deferred to 102 with the reason in
      spec.md: nothing byte-heavy exists to compare until the generator lands. The
      manifest determinism half is already tested (same seed, same manifest).*
