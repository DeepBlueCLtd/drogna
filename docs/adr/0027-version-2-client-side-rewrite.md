# ADR-0027 — Version 2 is a client-side rewrite behind a wire-protocol seam

**Status:** Proposed — accepted only when the review of `docs/v2/` says so
**Date:** 29 August 2026

## Context

Version 1 delivered what it set out to prove: seventeen features, all four acceptance
criteria passing, the control loop wired live. It also accumulated the costs that
motivate this record, both named by the author in the planning interview of 29 August
2026:

1. **Pace, caused by reviewability.** The backend is twelve services across Python,
   SQL, nginx configuration and Compose. Reviewing a change means reasoning across
   containers, and the traps section of `CLAUDE.md` is a catalogue of what that
   surface cost: bind-mount semantics that differ by host OS, health checks naming
   programs images do not carry, per-image ignore files, TLS interception in build
   contexts, a broker dying on file ownership only on Linux. Each lesson was real and
   each was paid for in time the demonstration did not need to spend.
2. **Divergence.** Requirements were identified as understanding grew — the SRD went
   from four sections to thirteen, 23 specs and 25 ADRs — and the artefact set no
   longer reads as one coherent system.

A rewrite was therefore considered, with the question being its shape.

## Decision

Version 2 is a **pure client-side TypeScript system**. The backend components —
clock, generator, broker, sensors, stores, loop, planner, query — are genuine programs
running in the browser, separated from the front-end by a **wire-protocol seam**: HTTP
answered by an interception layer with genuine (subsetted) OGC API-EDR and
SensorThings JSON, and pub/sub through a broker component with MQTT topic semantics
whose wire shape is MQTT-over-WebSocket. **Version 3** replaces the in-browser
components with a real backend by configuration — a base URL and a broker URL — with
the recorded seam-traffic corpus as its conformance suite (AT-05).

The consequential decisions taken with it, each an explicit interview answer:

- All V1 software is retired and rewritten clean, in the same repository; the written
  record (specs, ADRs, spikes, SRD) is archived in place, never edited.
- The artefacts are refocused first, in order: SRD-v2, then constitution 2.0.0 (this
  ADR is its amendment record), then a fresh, coarser spec series numbered from 101 —
  one feature per beat of a narrative arc that is simultaneously the build order and
  the demo script, running data generation first to map display last.
- All ten constitutional principles survive. Determinism (I, II) carries in full — a
  simulation clock component, seeded streams, byte-identical replay from an
  exportable manifest. III, VI, VII and X are re-scoped to the seam; a new Principle
  XI makes the seam itself non-negotiable. The in-browser components are real
  components under Principle VII: illumination still comes only from received
  heartbeats, and fixture data remains forbidden.
- One toolchain: TypeScript 5, pnpm, vitest, Playwright, React, Deck.gl, and a
  GoldenLayout 2.x shell (tabs Intro, System, Map, Messages; user-rearrangeable).
  The constitution gates are rewritten as TypeScript scripts behind the registry
  pattern. Python leaves the repository.
- Delivery is a static site; every visit is a fresh seeded run; nothing persists
  between visits.

## Alternatives rejected

- **Continue V1 incrementally, refocusing only the documents.** Rejected: the pace
  problem is structural — the review surface is the container estate itself — and no
  document refocus shrinks it.
- **A new repository.** Rejected: the record (25 ADRs, 8 spikes, the reconciliation
  history) is the most valuable output of V1 and the thing a fresh session navigates
  by; carrying it by hand loses provenance, and git history preserves the retired
  code at zero cost.
- **A TypeScript port seam** (front-end calls interfaces; HTTP arrives only in V3).
  Rejected: cheaper now, but the wire shapes would stay unexercised until V3, which
  is exactly when discovering they are wrong is most expensive. The wire-protocol
  seam makes the standards claim inspectable in V2 and makes V3 a swap rather than an
  integration.
- **Relaxing determinism for a UI demonstration.** Rejected on V1's own finding:
  deterministic replay is the one property that cannot be retrofitted at acceptable
  cost, and in a single language it gets cheaper to enforce, not dearer.
- **Retiring the standards (bespoke JSON API).** Rejected: the demonstration's claim
  is that standard interfaces sit over the synthetic ocean; a bespoke API would
  retire the claim, not the cost.

## Consequences

- The demo becomes a URL; the operational traps of the container estate retire, and
  their lessons remain in the archived record.
- Everything server-shaped becomes a role: proxy → release-gate component, pygeoapi →
  query components, Postgres → in-memory stores behind store interfaces, mosquitto →
  broker component. The semantics carry; the engines return in V3.
- The wall-clock exemption count returns to two: ADR-0026's container resource
  sampling retires with the containers.
- The seam is a standing obligation, not a feature: an import across it, or a seam
  shape without a committed master, is a constitution violation from feature 101
  onward.
- Offload's verified-receipt eviction and the second-broker fallback are deferred to
  V3 with reasons recorded in SRD-v2 §11; open questions (site/blog, droplet, worker
  architecture) are recorded in SRD-v2 §10 rather than dissolved.
- Until this ADR is Accepted, constitution 1.6.0 governs and nothing in `docs/v2/` is
  binding.
