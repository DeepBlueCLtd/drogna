# Feature 105 — the forecast loop

**Beat:** *it is assimilated* (plan §5).
**Source of scope:** SRD-v2 §5.5 (FR-30 to FR-32), FR-13's publication chain, AT-02.

## What this feature delivers, visibly

The loop turns, watchably. The monitor pairs co-located temperature and salinity
samples, derives sound speed by the one implementation (ADR-0005), scores residuals
against the current forecast instance, and raises a divergence only on sustained
persistence. The scheduler decides — and its every quiet is legible (FR-32): a
breach inside the minimum interval is *declined by policy* with the decline named
in its heartbeat; a loop with nothing breaching says so; and the **cadence floor**
(FR-31, E1's resolution) means the loop can never be permanently becalmed — a run
warranted on schedule alone is labelled *scheduled*, distinct from
*divergence-triggered*, in the request message itself and everywhere runs appear.
The model runner initialises from the current now-cast through the store interface,
runs a five-member ensemble behind the kernel port (`shift-advect-v1`: rigid
advection at a deliberately wrong velocity plus lead-time-scaled noise), and
publishes the ensemble mean with its spread through the same digest-checked seam as
everything else, announced on the control namespace. Instances accumulate in
Holdings and are served through EDR by convention.

## Masters amended, and one retired

- `run-request` gains the required `cause` label ('divergence' | 'scheduled') with
  `divergence` and `region` nullable — the E1/FR-31 amendment, made in the same
  commit as the scheduler that needs it.
- `run-started.divergence_id` becomes nullable for floor-scheduled runs.
- `coverage-run-manifest` is **retired**: in V2 its facts live in the holding
  descriptor (grid, digests, era) and the run-published announcement (validity,
  collections, cause chain); a second descriptor would be a second authority.

## Acceptance evidence

- **AT-02 descendant**: over 6000 lockstep ticks the loop turns end to end — the
  first run fires on the cadence floor at exactly the configured interval; genuine
  divergences follow (the kernel's wrong advection against the drifting world);
  a divergence-triggered run carries its divergence whole; every control message
  validates against its master in flight; every published digest matches what the
  store holds. The visible half is the System tab's detail column, captured.
- Declines inside the minimum interval occur and are counted, named.
- The loop replays byte-identically from one seed: holdings digests and the full
  message record equal across two runs (AT-04's claim now spans the loop).

## Deliberately not in this feature

- Uncertainty *display* and age-decay (106); the spread field is published and
  servable now.
- Skill-vs-persistence telemetry (107).
- The one-command AT-04 replay proof script: the byte-identity claim is a test
  spanning the whole loop now; packaging it as `pnpm replay-proof` rides 107's
  operator surface, where step/rate commands give it something to prove about
  command-exclusion (FR-36). Reason recorded, again, so the deferral stays a
  decision.
