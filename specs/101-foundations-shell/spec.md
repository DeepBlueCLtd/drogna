# Feature 101 — foundations & shell

**Beat:** *the stage is lit* (plan §5, D13).
**Source of scope:** SRD-v2 §5.1 (FR-14 to FR-19), plus the seam (FR-02 to FR-04),
determinism (FR-09 to FR-11 for the components that exist at this beat), and the
component discipline (FR-16, FR-17).

## What this feature delivers, visibly

Opening the built page is opening the system. The dockable shell shows its four
first-run tabs — Intro, System, Map, Messages — each URL-addressable as
`#/view/<id>`. The clock component beats in the header; the System tab renders the
full declared component layout greyed out and lights clock, broker and release gate
from genuinely received heartbeats; the Messages tab shows the live seam traffic
validated against the masters with a running refusal count; the Intro tab narrates
this beat and states FR-01's disclaimer. Every visit is a fresh seeded run; the
manifest exports and imports from the header.

## Scope

1. **The retirement commit** (plan §7): V1's software leaves; the record stays.
2. **The seam skeleton**: transport interfaces, the in-browser broker with
   MQTT-semantics topics/wildcards/role rules, the fetch shim, the release gate with
   default deny and observable denials, one genuine allowed route (the clock's rate
   interface) so the boundary is tested from the inside on day one (E8).
3. **Determinism foundations**: the clock (modes, bounded rates, step), seeded RNG
   streams with a recorded derivation rule, the run manifest built to
   run-manifest.schema.json, export/import.
4. **The shell**: dockview layout (ADR-0028), URL-addressable views, the four
   panels at this beat's honesty level (Map says it has not landed).
5. **The gates, in TypeScript**: wall-clock, seeded-RNG, types-drift, literal-path,
   vocabulary, import-boundary; registry + runner; each watched failing on a planted
   violation held permanently in the gate tests.
6. **Generated types**: a bespoke narrow generator from the masters, committed
   output, drift-gated.
7. **Capture**: the glance, rebuilt in TypeScript — serves the built app read-only,
   pins the rate to zero through the seam, prints the rate beside the image.
8. **CI**: the checks workflow, and the additive per-branch instance deploy into the
   gh-pages estate with the ntfy notice behind a secret (NFR-04, D17).

## Deliberately not in this feature

- Anything of beats 102–109; their components render greyed in System, and the Map
  panel says truthfully that it has not landed.
- The site rebuild and blog (§9.1): follows the retirement in its own workstream;
  the V1 site remains the published archive meanwhile.
- Lockstep replay *proof* tooling (AT-04's one-command form): the clock and broker
  are lockstep-capable and unit-tested as such; the proof lands with 102's first
  real data, when there is something byte-for-byte to compare.
- Layout persistence across visits: an arrangement is a per-viewer convenience; not
  persisted at all in 101.
