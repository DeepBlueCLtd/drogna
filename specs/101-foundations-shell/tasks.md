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
- [x] T037 AT-04 one-command replay proof — *deferred to 102, then carried to 107 and
      built at the arc's close-out as `scripts/replay-proof.ts` (`pnpm replay-proof`).
      Ticked only now, and not when the script first landed: it selected with
      `vitest run -t replay`, which matched neither the name of the generator's own
      byte-identity test nor its `describe`, so the one test this line was originally
      deferred *for* was the one the proof skipped — seven ran, 623 were skipped, and it
      printed "held". The proof now derives its expected set from `AT-04: byte-identity`
      markers in the tree, requires every marked test to have run and passed — matched by
      file as well as by name, so a pass in one file cannot stand in for a skip in another
      — and sweeps for tests that read as a determinism claim and carry neither that marker
      nor `AT-04: not byte-identity` with a reason. The sweep is the half a marker alone
      does not give: it found this line's own other half, `runtime.test.ts`'s "the same
      seed provisions the same manifest", and the planner's "one seed, one plan, twice",
      both outside the proof under the old selector and under the first marking. Nine
      tests are marked and two excluded by name. Watched failing five ways before the fix
      was trusted, each reverted: no marker anywhere (the floor a name filter never had —
      `vitest run -t <unmatched>` skips everything and exits 0); a marker not above an
      `it(`; a marked test skipped; a byte-identity test whose marker was forgotten, which
      the sweep names; and a planted per-run drift in the generator's draw path, which took
      six down with the generator's named among them.*
