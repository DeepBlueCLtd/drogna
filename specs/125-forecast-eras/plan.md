# Feature 125 — plan

One dependency chain, and the order is load-bearing: the era declaration is unsafe until the
scheduler survives a pipeline that cannot answer it.

1. **The watchdog** (FR-125-03). The outstanding-run guard cleared on a publication, or on
   the model runner reporting `run-failed` for itself. Neither covers a request that reached
   nobody — the analyst takes one synchronously and holds no pending state. Prove it from the
   Operator tab first, then fix it.
2. **Tick-derived run identifiers** (FR-125-04). Prove the collision by restarting the
   scheduler mid-run and watching the store replace a holding, then derive from the tick.
3. **Declare the eras** (FR-125-01) and regenerate. Read the `pnpm snapshots` diff.
4. **Hold the pair no drift check can see** (FR-125-02) in `preroll.test.ts`: a
   snapshot-backed run opens with what a live run produced, and still turns afterwards.
5. **Correct the record.** ADR-0041's blocker named the wrong mechanism, and
   `specs/120-start-conditions/{spec,tasks}.md` are the documents that carry authority —
   `docs/v2/backlog.md` says so itself.

## Constitution check

Governance requires this section, and it was missing from the first draft of this plan — an
adversarial pass found it. The entries below are the ones this change actually moves; the
first two are where its risk is.

- **III — generated from masters.** Four masters amended and regenerated: `run-request`
  (the identifier derivation, and the withdrawal of the claim that a run's name can be read
  back as its sequence), `run-published` (a restatement equals the release it restates,
  field for field), `telemetry` (the `abandoned` decision), `snapshot` (`config_digest` now
  covers one of three authors), and `config.scheduler` (`release_margin_ticks` gained the
  watchdog's slack as a second meaning). No shape is hand-written; `check-types-drift`
  holds it.
- **Data constraint (2.1.0) / ADR-0041.** The committed artefacts grow from 1.73 MB to
  27.7 MB and now carry the analyst's and the model runner's own bytes. They stay a cache
  and not a fixture only because `check-snapshot-drift` rebuilds them by driving the real
  components and fails on any difference — which is the amendment the constraint was made
  for. A side effect worth naming: the forecast kernel had **no** snapshot regression cover
  before this, because no model-runner output reached the artefacts.
- **VII — honest displays.** Three surfaces move. The snapshot source's node gains a
  `superseded` figure, absent until non-zero and not degrading the status, because counting
  a superseded publication as either a replay or a refusal was a false statement about the
  store — twice. Telemetry reports `warming` rather than `no-forecast` over a store holding
  forecasts. The scheduler publishes an `abandoned` decision rather than releasing a run in
  silence. Knowingly left open: a store refusal raised inside a subscription reaches
  `deliveryFaults`, which no surface reads — recorded in the spec's declined list rather
  than fixed here, because fixing it changes how every author reports.
- **I — no wall clock.** Nothing added takes an exemption. The watchdog's bound is in
  ticks; the run identifier derives from the simulation tick; three hand-written
  `(iso, seconds)` helpers that went through `Date.parse` are replaced by the module's
  BigInt-microsecond arithmetic, which is a strengthening.
- **II — seeded randomness.** The identifier moves from instance-local mutable state to
  seed plus logical position. `pnpm replay-proof` holds; the new cases declare
  `AT-04: not byte-identity`.
- **XI — the seam.** `standing-run.ts` sits in `backend/lib`; the only front-end files
  touched are prose. The import-boundary gate holds.

## Verification

`pnpm check` is not what CI runs. Beyond it: `pnpm replay-proof`, and the six capture proofs
— `capture:glance operator`, `capture:background`, `capture:messages`, `capture:map`,
`capture:mobile`, `capture:consumers`.

Every check here is planted and watched failing before it is trusted, and the measurements
that decide a design are taken before the design, not after it.
