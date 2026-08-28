# Research: The Topic Tree (022)

Phase 0 record. Every unknown the Technical Context raised, with the decision, the
rationale, and the alternatives weighed. The spec's own interview settled the large
choices (audiences, trigger meaning, the explicit role, unit-test proof); this file
settles the ones the plan had to resolve under them.

## R1 — How the browser hears the observation namespace

**Decision**: a new broker role, `drogna_observer` — `read obs/#`, `read ctl/#`, no
write rule — used by the client's broker URL at both destinations. The panel opens its
own connection through the existing `/ctl` WebSocket upgrade with the same credential and
a derived client id; the shell's control subscription changes identity only, subscribing
exactly what it subscribes today.

**Rationale**: FR-002 requires the new role and requires it declared in the tracked
sources the topology derivation reads. The broker URL's username in
`config/<destination>/client.json` *is* where a component's role is declared — it is what
`scripts/scan_topology.py` reads and what the broker authenticates — and
`deploy/lib/render_credentials.py` already turns any role in its `ROLE_SECRETS` table
into a generated secret, a password-file entry and a rendered URL. One ACL append, one
table entry, one username change, and every existing mechanism (secret generation,
password file, render, scanner, drift gate) follows without further code.

**Alternatives considered**:
- *Reuse `drogna_viewer` with an added `obs/#` read*: forbidden twice over — ADR-0020
  states the viewer role may never gain a permission (its non-secret argument depends on
  it), and the spec's interview rejected widening an existing grant.
- *A second broker section in `client.json` so the shell keeps the viewer identity*: the
  render substitutes secrets only into `broker.url`, and the scanner maps one component
  to one role and stops on disagreement. A second URL means extending both for no gain in
  the boundary — the two identities would ride the same upgrade to the same broker from
  the same page, and the served document would publish both credentials anyway.
- *A server-side digest relay*: rejected in the interview — a nineteenth component to
  keep the browser's grant narrow, with its own liveness, failure mode and box.
- *Restricting the tree to the control namespace*: rejected in the interview — the tree
  would misrepresent the system it exists to demonstrate.

## R2 — Where the skeleton's concrete observation topics come from

**Decision**: the topology scanner expands declared wildcard filters into the concrete
topics the deployed configuration names — platform id and datastream ids read from the
sensors configuration under `config/<destination>/` (located by shape, not filename),
destinations required to agree — and emits them as ordinary rows of
`contracts/topology.json`. The panel builds its whole skeleton from the artefact, at
build time, typed by the generated `DrognaBrokerTopology`.

**Rationale**: FR-001 forbids a hand-maintained skeleton anywhere and names the
derivation chain as the authority with drift "the existing gate's to catch". Performing
the join inside the derivation is the only shape in which the existing gate covers the
joined result. The artefact's schema is untouched (the rows are ordinary `TopicEntry`
instances), so FR-009's expectation — the topology document as sole boundary shape —
holds without a master edit.

**Alternatives considered**:
- *A things-and-datastreams section in the served client document*: hand-maintained
  duplication of `sensors.json`, exactly what FR-001 forbids; keeping it honest would
  need a new gate where the existing one already exists.
- *Fetching the SensorThings catalogue from the panel at runtime*: unreachable — the
  page is served off the proxy's origin and `/released` answers 401 with no CORS
  (`spikes/map-to-ocean/FINDING.md`, DeepBlueCLtd/drogna#34). It would also make the
  *declared* skeleton depend on a *serving* system, blurring the two sources
  Constitution VII keeps separate.
- *Bundling `sensors.json` into the client at build time*: the bundle is
  destination-agnostic; a destination-specific import bakes one destination's deployment
  into every destination's page.

**Consequence accepted**: the artefact becomes coupled to the deployed sensor
configuration. The scanner's existing agreement rule (a disagreement stops the scan
rather than being resolved silently) extends to it; today the destinations agree.

## R3 — What governs a concrete observation topic's payloads

**Decision**: `resolve_schema` gains the rule that any topic under the observation branch
resolves to the observation master (the existing `obs -> observation` alias, applied to
the branch rather than only to the `obs/#` spelling).

**Rationale**: the repository layout states in prose that `obs/<thing>/<datastream>`
carries observations governed by `contracts/schemas/observation.schema.json`; the
resolver should say what the layout says. Without it every expanded row carries a null
master, which the schema's own description calls a finding rather than a permitted state.

**Alternative considered**: leaving the nulls and inheriting client-side only — but then
the artefact would state a falsehood ("no master claims this topic") about topics whose
master exists.

## R4 — How a trigger animates without touching Constitution I

**Decision**: two clocks, strictly separated in the model. Stated figures (rate,
last-seen) are simulation time: each arrival is stamped with the payload's own `sim_time`
where its JSON carries one, else the latest received clock sample's `sim_time`, else
recorded as before-the-clock and stated as such. Display dynamics (pulse decay, ripple,
crossover, edge flow) are wall time: each arrival also records the host instant it was
received, taken from `time/host.ts`, and the decay phase is computed at view time from
the frame instant. Nothing derived from a host instant is ever stated as a figure or
leaves the render path.

**Rationale**: Constitution I's two existing exemptions are exactly these two uses —
liveness-style windows over receipt instants (ADR-0006: "did a real message arrive
recently" is a fact about the host) and frame-time smoothing in the render path
(ADR-0007). The spec pins the same split: animation in wall time, every stated figure in
simulation time with the factor shown. No third exemption is requested and the lint
gate's markers are unchanged.

## R5 — Where the pulse-to-intensity crossover comes from

**Decision**: derived, not typed. A node's arrivals read as discrete pulses while the
measured mean inter-arrival interval (over the model's recent window, in wall time — the
terms in which pulses are perceived) exceeds the pulse decay duration the display itself
uses; at and beyond that bound the node holds a sustained intensity tracking recent rate.
The unit test asserts the relationship between the two quantities read from the module,
never a rate constant of its own.

**Rationale**: the spec's assumption states the repository's standing preference —
bounds read from something real. "Pulses would blur" has a literal reading: a new pulse
arrives before the previous decay completes. Using the decay duration as the bound makes
the crossover self-consistent with whatever the display tuning becomes.

## R6 — How the panel integrates without colliding with lane J

**Decision**: the panel is self-contained: `TopicTreePanel` receives the validated
runtime configuration and owns its subscription, state and frame loop internally.
`App.tsx` gains one import block and one element, appended.

**Rationale**: the shell integration point is shared with a parallel lane and is
append-only by instruction. The existing surfaces thread their state through `App.tsx`
because they share the control subscription; the panel deliberately does not share it
(different identity, different topics, different failure modes), so self-containment is
both the smaller append and the truer structure.

## R7 — Session-only state and the refresh story

**Decision**: all activity state lives in module state within the panel's React
lifecycle; nothing is persisted, nothing replayed. The panel records its first host
instant and states that it is young and holds no history.

**Rationale**: FR-008 and the refresh edge case say exactly this; the retained-message
edge case is handled by R4's stamping rule (a retained observation's `sim_time` is its
own, so last-seen never claims connection time as arrival time).
