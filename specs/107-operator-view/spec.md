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

- Per-region residual statistics (`scope.level: 'region'`): the scenario-level
  scope serves the demo; the master carries the region shape for when a consumer
  wants it.
- `run_failed` / `publication_refused` telemetry kinds: no failure path produces
  them yet — the runner throws on a store refusal, which is a defect signal, not
  telemetry. Wired when 108's offload gives refusals a consumer.
- Keeping-up latency displays: throughput per sim-second lands; end-to-end latency
  in simulation time waits for a consumer that reads it (109's map is the
  candidate).
