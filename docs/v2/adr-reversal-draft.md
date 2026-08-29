# ADR draft — Version 2 is a client-side rewrite behind a wire-protocol seam

**Status:** Proposed — accepted, and numbered, when constitution 2.0.0 is adopted. The
number is assigned at adoption because two open V1 pull requests (#44, #46) each
currently claim ADR-0027; `site/gates/check_adr_numbers.py` polices the collision, and
this file moves to `docs/adr/<next-free>-version-2-client-side-rewrite.md` when it
lands.
**Date:** 29 August 2026

## Context

Version 1 delivered what it set out to prove: seventeen features, all four acceptance
criteria passing, the control loop wired live and watched turning. It also accumulated
the costs that motivate this record, both named by the author in the planning
interviews of 29 August 2026:

1. **Pace, caused by reviewability.** The backend is twelve services across Python,
   SQL, nginx configuration and Compose. Reviewing a change means reasoning across
   containers, and the traps section of `CLAUDE.md` is a catalogue of what that
   surface cost: bind-mount semantics that differ by host OS, health checks naming
   programs images do not carry, per-image ignore files, TLS interception in build
   contexts, a broker dying on file ownership only on Linux, a proxy credential fault
   invisible until the first cleared request in the repository's history. Each lesson
   was real and each was paid for in time the demonstration did not need to spend.
2. **Divergence.** Requirements were identified as understanding grew — the SRD went
   from four sections to thirteen, 23 specs and 25 ADRs — and the artefact set no
   longer reads as one coherent system.

A rewrite was therefore considered, with the question being its shape. The plan this
record accompanies (`docs/v2/plan.md`) was developed by structured interview, swept the
six open pull requests for emergent requirements, and was endorsed by the author on
29 August 2026.

## Decision

Version 2 is a **pure client-side TypeScript single-page application**. The backend
components — clock, generator, broker, sensors, stores, loop, planner, query — are
genuine programs running in the browser, separated from the front-end by a
**wire-protocol seam**: HTTP answered by an interception layer with genuine
(subsetted) OGC API-EDR and SensorThings JSON, and pub/sub through a broker component
with MQTT topic semantics whose wire shape is MQTT-over-WebSocket. **Version 3**
replaces the in-browser components with a real backend by configuration — a base URL
and a broker URL — with the recorded seam-traffic corpus as its conformance suite
(AT-05).

The consequential decisions taken with it, each an explicit interview answer recorded
in the plan (D1–D17, §9):

- All V1 software is retired and rewritten clean, in the same repository; the written
  record (specs, ADRs, spikes, SRD) is archived in place, never edited. The droplet is
  decommissioned at V1 retirement; delivery is a static site.
- The artefacts are refocused first, in order: the plan, then SRD-v2, then
  constitution 2.0.0 (this record is its amendment ADR), then a fresh, coarser spec
  series numbered from 101 — one feature per beat of a narrative arc that is
  simultaneously the build order and the demo script, data generation first, map
  display last.
- All ten constitutional principles survive. Determinism (I, II) carries in full — a
  simulation clock component, seeded streams, byte-identical lockstep replay from an
  exportable manifest. III, VI, VII and X are re-scoped to the seam; a new Principle
  XI makes the seam itself non-negotiable. The in-browser components are real
  components under Principle VII: illumination still comes only from received
  heartbeats, and fixture data remains forbidden.
- One toolchain: TypeScript 5, pnpm, vitest, Playwright, React, Deck.gl, and a
  dockable multi-panel shell (tabs Intro, System, Map, Messages; user-rearrangeable;
  layout library chosen by feature 101's spike). The constitution gates are rewritten
  as TypeScript scripts behind the registry pattern. Python leaves the repository.
- Implementation proceeds with developer autonomy in one long-lived PR: decisions and
  spike outcomes need no author endorsement; PR comments link gh-pages-hosted
  instances opened at the relevant view by anchor URL; ntfy notices and blog posts
  mark significant arrivals.

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
- **Pinning the layout library now.** Rejected in the second interview round: dockable
  drag/drop tabs are the requirement, not a named library; feature 101's spike
  chooses between golden-layout 2.x and maintained alternatives and records the
  choice.

## Consequences

- The demo becomes a URL; the operational traps of the container estate retire, and
  their lessons remain in the archived record.
- Everything server-shaped becomes a role: proxy → release-gate component, pygeoapi →
  query components, Postgres → in-memory stores behind store interfaces, mosquitto →
  broker component. The semantics carry; the engines return in V3.
- The wall-clock exemption count returns to two: ADR-0026's container resource
  sampling retires with the containers.
- The seam is a standing obligation, not a feature: an import across it, a seam shape
  without a committed master, or a client configuration carrying an absolute URL is a
  constitution violation from feature 101 onward.
- The shell must support URL-addressable views from feature 101, and CI must publish
  per-PR instances into an additively grown gh-pages estate, retained on completion —
  the single-PR review model and the blog's embedded demos depend on both.
- Offload's real transfer and verified-receipt eviction, and the second-broker
  fallback, are deferred to V3 with reasons recorded in SRD-v2 §11.
- Until this record is Accepted, constitution 1.6.0 governs and nothing in `docs/v2/`
  is binding.
