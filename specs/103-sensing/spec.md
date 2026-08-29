# Feature 103 — sensing

**Beat:** *it is sampled* (plan §5).
**Source of scope:** SRD-v2 §5.3 (FR-22 to FR-25), FR-12's store semantics for the
observation and feature stores.

## What this feature delivers, visibly

A simulated platform loiters over the eddy; its four instruments (temperature and
salinity at 50 m, temperature and pressure at 200 m) sample the true field every 30
ticks, add their declared seeded noise, and publish observations in SensorThings
vocabulary on `obs/<thing>/<datastream>` — where the broker's role rules confine
them. The ingestion seam validates every message against the observation master,
refuses what fails with the fault named and the count in its heartbeat, absorbs
redelivery on the deterministic id, and is the observation store's only writer. The
Messages tab gains the **topic tree**: structure from the derived topology artefact,
illumination from received traffic, pulse at the leaf and ripple up the ancestors,
consumer roles as chips beside the subtrees their filters cover, wide branches
collapsing to a summary — and a received topic no declaration names renders as an
*undeclared* branch, never a silence (E13).

## The load-bearing choices

- **The topology is derived, committed and drift-gated** (E14): `scripts/derive-topology.ts`
  scans `app/config/run.json` — the declarations the components are constructed
  from — and writes `contracts/topology.json`; `check-topology-drift` is gate seven.
  The artefact travels into the app through the generated chain, typed and
  drift-checked like the masters. The topology master was amended for V2 (namespace
  enum gains cov/adv; role pattern admits hyphens; scanner paths) in the same
  commit as the scanner.
- **Sensors read the clock and nothing else** (ADR-0012 carried): position is a pure
  function of simulation time (the loiter), truth arrives through the world-sampler
  port, and noise draws are tick-major/instrument-minor from the sensors' named
  stream.
- **The shell's identity reads everything and publishes nothing** (E13's role
  discipline): a broker rule, tested, not a convention.

## Acceptance evidence

- 60 lockstep ticks yield exactly 12 observations, all master-valid, none refused.
- The broker refuses a sensors-role publish outside `obs/+/+` by name.
- A malformed observation is refused observably (count + named fault), the store
  untouched; a redelivered observation is absorbed, not duplicated.
- Determinism: two identically seeded runs store identical observation values.
- The topic tree lights only from received traffic and surfaces an undeclared topic
  as a visible finding.

## Deliberately not in this feature

- Serving observations through SensorThings (feature 104).
- The platform following planner routes (feature 106); until then the loiter is
  configuration.
- Sensor self-announcement (v1 ADR-0015's shape): one platform is configured
  statically; revisit if a second platform is ever wanted.
