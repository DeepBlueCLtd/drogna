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
- Watched failing: the size-ceiling seam was disabled and the suite failed on
  the refusal count before the fault was reverted.

## Deliberately not in this feature

- **The leakage mask-scoring gate** (V1's FR-015/FR-017 lineage): the geometry
  travels and is complete — radius, positions, interval — but a mask comparison
  between successive released products is not scored here, because the
  shift-advect kernel's per-cell noise moves *every* cell between runs, making
  the change mask uninformative: the comparison would score at chance for the
  wrong reason and a gate nobody can fail is worse than none. Recorded as an
  open question for a V3 backend with a quieter kernel, not dissolved.
- Real transfer, receipts, verification and eviction: V3, by the seam this
  feature keeps warm. The `run_failed`/`publication_refused` telemetry kinds
  stay unproduced for the same reason — announcement-only staging has no
  failure path that is telemetry rather than a defect.
- Features paging/filtering (`bbox`, `datetime`, `limit`): the collections are
  small by construction (the size ceiling on one side, two reference features
  on the other); every option is refused by name until a consumer needs it.
