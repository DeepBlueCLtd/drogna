# Feature 102 — the synthetic ocean

**Beat:** *a world exists* (plan §5).
**Source of scope:** SRD-v2 §3 (FR-05 to FR-08, FR-11) and §5.2 (FR-20, FR-21,
FR-46); FR-13 for publication integrity. FR-46 was written after the fact (issue
#58): the tab shipped here, §5.2 did not follow it, and the requirement is written
from the tab as built rather than the tab rebuilt to a requirement — the code was
the one that was right.

## What this feature delivers, visibly

Opening the page authors a world: the environment generator (V2-C02) draws its
jittered feature parameters from the run's seed, evaluates 4D temperature and
salinity fields — background profiles plus eddy, front, thermocline and drifting
feature, with the tau field authored beside them — and publishes a twenty-year
monthly historic archive and a rolling now-cast through the coverage store's
(V2-C08) digest-checked publication seam. The **Holdings** tab (a new configured
view, URL-addressable like the rest) lists the store's holdings through a genuine
seam GET and opens each holding's ground-truth manifest whole. Both components light
in System from their heartbeats; every publication is announced on `cov/holdings`
and visible in Messages.

## The load-bearing choices

- **The manifest is sufficient** (Constitution IX): the analytic form (v1) is pure
  in (lon, lat, depth, seconds, parameters), and the test proves stored bytes are
  reproducible from the manifest alone within the tolerance the manifest derives
  from float32 width — never a chosen number.
- **The archive is one holding**: a single field with a 240-step monthly time axis
  (fixed 30-day synthetic months, stated in the axis), authored at provisioning
  through the same publication seam as everything after it (FR-11).
- **The now-cast is replaced, not accumulated**, on a cadence counted in clock
  ticks; forecast instances (the third era) arrive with feature 105.
- **Byte format `drogna-f32-v1`** is declared in the coverage-holding master:
  variables in manifest order, C order [time][depth][lat][lon], little-endian.

## Acceptance evidence

- **AT-03 descendant** passes: the eddy centre is recovered from the stored
  now-cast bytes with the error reported (~13 km) against a bound read from the
  manifest's recorded resolution (two grid cells), never typed into the test.
- **AT-04 seed-level**: two runs from one root seed are byte-identical across every
  holding digest and every seam message over 30 lockstep ticks, and a different
  seed produces different bytes — the comparison can fail.
- **FR-13 watched**: a tampered staged holding is refused with both digests named
  and the holdings untouched.

## Deliberately not in this feature

- Serving holdings through EDR (feature 104); the Holdings tab is the control-plane
  inventory, not the query seam.
- Sound-speed anywhere in storage (ADR-0005 carried): derived at point of use only;
  the manifest names the one implementation and counts out-of-validity points.
- The AT-04 one-command proof script: the byte-identity claim is a test now; the
  packaged proof lands with the loop's accumulated instances (105), where lockstep
  spans more components.
