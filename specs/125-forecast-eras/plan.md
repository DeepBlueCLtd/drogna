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

## Verification

`pnpm check` is not what CI runs. Beyond it: `pnpm replay-proof`, and the six capture proofs
— `capture:glance operator`, `capture:background`, `capture:messages`, `capture:map`,
`capture:mobile`, `capture:consumers`.

Every check here is planted and watched failing before it is trusted, and the measurements
that decide a design are taken before the design, not after it.
