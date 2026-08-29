# Feature 107 — the operator's view

**Beat:** *the machinery is interrogated* (plan §5).
**Source of scope:** SRD-v2 §5.7 (FR-35, FR-36); the telemetry shapes are the
carried `telemetry.schema.json` master (oneOf kinds), used as designed: the monitor
produces residual samples, the scheduler reports every decision, telemetry
aggregates.

## What this feature delivers, visibly

The **Operator** tab: components as they report themselves — never heard is
*unheard*, not absent — with stop/start/restart controls where the rules allow and
`protected` where they do not; a step button; refusals surfaced verbatim; and
telemetry — residual statistics, forecast skill against persistence in the
telemetry component's own sentence ("the model is not earning its compute…"), and
throughput per simulation second. Every request is a genuine seam GET/POST.

## The load-bearing choices

- **One producer of residuals.** The monitor publishes each scored sample as a
  `residual-sample` on `ctl/telemetry` (it also now names the *model run* it
  scored against — fixing a real identity bug the telemetry ledger found: the
  holding's id, not the scenario's). The scheduler reports every decision
  (`accepted`, `minimum-interval`, `duplicate-outstanding`), not only acceptances.
- **Skill's persistence baseline** holds the run's initial step constant across
  its validity; the formula and the sentence travel in the message, so every
  consumer says the same thing about a model that is not earning its compute.
  Figures go *stale*, stated, when input dries up — never presented as current.
- **Commands are genuine.** The control registry stops a component by
  disconnecting its client — subscriptions die, publishes are refused, heartbeats
  cease — and starts one by rebuilding it from configuration through the same
  factory that built it at boot. Protection outranks controllability, and the
  refusal names the rule. Commands are ephemeral and outside AT-04's replay claim
  (a restarted component re-subscribes at the end of the delivery order), stated
  in the Intro beside the replay claim.
- Route-registering components (query, telemetry) join the protected list: a
  rebuild would re-register their routes, and a stop that cannot restart is a
  trap, not a control.

## Acceptance evidence

- Telemetry statistics reach `reporting` with master-valid emissions and a skill
  sentence; the report endpoint validates against its own master.
- A stopped sensors component genuinely goes silent (heartbeats and observations
  both stop while the world runs on) and a start genuinely resumes it.
- Refusals: protected (403, rule named), unknown (404, controllables listed),
  wrong state (409); the step command advances exactly one tick through the seam.

## Deliberately not in this feature

- ~~Per-region residual statistics~~ — built (issue #61). The grid is laid over the
  extent of the very holding the residuals were scored against, so no second copy
  of the domain enters configuration; a region below the configured minimum says
  `insufficient-samples` and keeps its own figures rather than being folded into
  the scenario figure where nobody could tell it was thin; and a region nobody
  sampled is **absent** rather than published with zeroes, because an unsampled
  region and a region scoring zero are different facts. The Operator surface is the
  consumer: it draws one row per sampled region.
- `run_failed` / `publication_refused` telemetry kinds: still unproduced, and
  deliberately (issue #61 leaves this half open). No failure path produces them —
  the runner throws on a store refusal, which is a defect signal rather than
  telemetry, and 108's offload declines are announcement-only. Publishing either
  kind now would mean inventing the failure that justifies it. V3's real transfer
  is the producer that will earn them.
- ~~Keeping-up latency displays~~ — end-to-end latency built (issue #61), measured
  from the simulation instant an observation was taken to the simulation instant its
  residual was folded in, and displayed on the Operator surface. In this harness it
  reads **zero**, and that is a measurement rather than a placeholder: the monitor
  scores within the tick the observation was taken, so the loop carries no transport
  delay, and the display says so in those words. A test folds the monitor's own
  report again with its samples dated an hour earlier in simulation time and holds
  that the figure moves by exactly that hour — which is what tells a real zero from
  an arithmetic that always returns one.
