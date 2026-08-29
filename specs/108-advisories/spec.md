# Feature 108 — shore advisories and the boundary

**Beat:** *the world outside speaks, and the boundary holds* (plan §5).
**Source of scope:** SRD-v2 §5.8 (FR-37 to FR-39, FR-42), with the E8/E9/E11
lessons carried from V1's features 018 and 014; the reference-geometry serving
deferred at 104 lands here.

## What this feature delivers, visibly

Three new components light in **System**: the shore advisory source, the advisory
store, and the offload packager. `adv/advisories` and `ctl/offload` appear in
**Messages** with their schemas declared. The query component grows a third face:
OGC API-Features (Part 1, Core, read-only) at `/api/features`, serving the
`advisories` collection and the `reference` collection through the same release
gate as everything else — and the subset statement grows a `features` block, held
equal to `docs/architecture/query-subsets.md` by the existing parity test.

## The load-bearing choices

- **No advisory field can carry free text.** Every string in
  `advisory.schema.json` is an enum, a const, or a bounded pattern, and a test
  walks the master itself to hold that property — so an advisory is structurally
  incapable of naming an entity the harness did not place (Constitution V), and
  loosening the master fails the build before any content does.
- **Advice travels light, measured.** The store's ingestion seam refuses any
  advisory over the configured size ceiling with the limit named; a test measures
  the largest authored advisory against the smallest gridded holding rather than
  asserting the ratio.
- **The store is a store.** Append-only, written only through its own
  subscription, redelivery absorbed on the deterministic id, protected from the
  operator plane like every other store.
- **The sibling travels beside the bundle, never inside it (E11).** The offload
  packager stages, per published run, a bundle manifest whose members are the
  released field bytes only, and a run-manifest sibling carrying the measurement
  geometry — the identification radius the release is scored under, and every
  sampled position and simulation time in the interval since the previous
  release. `bundle-manifest.schema.json` refuses a geometry planted inside it,
  and the test plants one to watch it refused. Identifiers are derived (run
  reference from the run-manifest digest, bundle id from reference + window
  index + format version), never drawn.
- **Announcement-only until V3.** No real transfer exists, so the ledger states
  beyond `staged` report zero honestly; the staging bound stops production
  rather than making room, because eviction stays gated on a receipt no
  transfer sends. Refusal counts wait for a verifier to produce them.
- **Present-and-stating-empty.** The advisories collection answers with an empty
  FeatureCollection before the first advisory exists: an empty collection is an
  answer, not an error.

## Acceptance evidence

- Advisories author on the configured cadence, master-valid on the wire, and
  replay byte-identically for a fixed seed (staged bundles too).
- The size-ceiling refusal names the limit; the no-free-text walk finds every
  string constrained and catches a loosened copy.
- The Features face serves both collections through the gate (E8), refuses
  filter options and single-feature access by name (E9), and the sibling's
  radius matches the packager's configuration (E11 producer parity).
- Leakage scoring: a release that only updates where it measured is detected; a
  whole-domain rewrite scores at chance and is called clear; a domain-wide rewrite
  cannot hide one leaking variable, because every variable is scored on its own as
  well as in the union and the worst is acted on; every inconclusive case is
  returned by name, an absent geometry included. The harness's own releases are
  scored too, and the three reasons that comparison is inconclusive are held as
  measurements, so the day one stops being true the test says so.
- Watched failing: the size-ceiling seam was disabled and the suite failed on
  the refusal count before the fault was reverted. For the leakage score: the
  worst-of reading was replaced by a union-only one (the hidden leaking variable
  went undetected, red); an empty mask was let through as a clean release (red in
  both the scorer's tests and the harness's own comparison); and the released
  identification radius was narrowed below the sampling span (red on the measured
  span, which is what tells that assertion from a hard-coded one).

## Deliberately not in this feature

- **The leakage mask-scoring gate** (V1's FR-015/FR-017 lineage): the *scoring*
  is built (issue #57), with a standing test that a known leak is caught; the **gate** is
  not, and the reason is now measured rather than assumed. Against this harness's
  own releases: the loiter scenario's measurements in a release interval span
  3.9 km against the 60 km identification radius the run is released under, so
  the buffer is one blob and FR-017 calls that inconclusive whatever the kernel
  does; with the per-cell noise suppressed — the quieter kernel the open question
  asked for, which needs no second kernel, only `noise_std` at zero — two
  successive releases initialised from the same now-cast are identical value for
  value, so there is no mask; and with the noise on, the mask is the whole domain
  and scores at chance, which is the pass earned by noise the question recorded.
  A gate wants a scoring configuration whose sampling spans more than the radius
  it is released under and whose successive releases differ. Both are scenario and
  release-terms properties, not kernel properties, which is the part the open
  question had wrong.
- Real transfer, receipts, verification and eviction: V3, by the seam this
  feature keeps warm. The `run_failed`/`publication_refused` telemetry kinds
  stay unproduced for the same reason — announcement-only staging has no
  failure path that is telemetry rather than a defect.
- Features paging/filtering (`bbox`, `datetime`, `limit`): the collections are
  small by construction (the size ceiling on one side, two reference features
  on the other); every option is refused by name until a consumer needs it.
