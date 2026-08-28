# Implementation Plan: The Topic Tree

**Branch**: `022-topic-tree` | **Date**: 2026-08-28 | **Spec**: `specs/022-topic-tree/spec.md`

**Input**: Feature specification from `specs/022-topic-tree/spec.md`

## Summary

A new client panel draws the declared broker topology as a horizontal tree — every
declared topic, cold until spoken on — with the consumer roles as a first-class column
beside it, each connected to the subtrees its declared filters cover. Message arrival
lights the tree: a pulse at the leaf, a ripple up the ancestors, the matching roles'
connections lit, crossing over to sustained intensity as rates rise. Structure comes from
feature 018's derived topology artefact and from nothing else; illumination comes from
genuinely received messages and from nothing else; the two sources never mix
(Constitution VII). The browser gains a new read-only broker role to hear the observation
namespace, declared in the tracked sources the topology scanner already reads, so the
tree, the access control list and the artefact agree by construction.

## Technical Context

**Language/Version**: TypeScript 5 / React (client); Python 3.11 (topology scanner
extension, integration tests)

**Primary Dependencies**: mqtt.js over the proxy's WebSocket upgrade (existing,
dynamically imported); Ajv for payload-stamp validation (existing); no new dependencies

**Storage**: none — activity state is session-only, in memory, per FR-008

**Testing**: vitest for the client state layer (the feature's chosen proof, FR-011);
pytest for the scanner extension; `tests/integration/test_topic_isolation.py` gains the
new role's refusals at a running broker

**Target Platform**: the component-shell client (C-18), served as today; the panel is a
sibling of the existing surfaces

**Project Type**: web client feature plus a small derivation-chain extension

**Performance Goals**: arrivals fold into state as they come; drawing rides the shell's
existing frame discipline (state under refs, redraw at the frame interval), so a burst
costs frames and never truth

**Constraints**: no publish path in the panel's code (SC-005); wall-clock only in the
render path under the existing exemptions; every stated figure in simulation time with
the acceleration factor shown (Constitution I, FR-003)

**Scale/Scope**: tens of topics, a handful of roles; wide branches degrade to a
collapsed summary node, not to noise

## What had to be established first

Five facts about the tree as it stands shaped every decision below.

1. **The topology artefact is delivered and gated.** `contracts/topology.json` is derived
   by `scripts/scan_topology.py` from the ACL, the destination configurations, component
   source and the schema directory; `scripts/check_topology_drift.py` fails the build
   when the committed artefact and a fresh scan disagree. Its schema has generated types
   on both sides already (`client/src/generated/messages/topology.ts`), so FR-009's
   expected answer holds: the topology document is the sole boundary shape and it is
   already declared.

2. **The scanner maps components to roles through the broker URL.** Each
   `config/<destination>/*.json` names its role as the username in `broker.url`; the
   render (`deploy/lib/render_credentials.py`) substitutes the secret at deploy time and
   refuses a role absent from its `ROLE_SECRETS` table; the broker password file is
   produced from the same table. Declaring a new role therefore means: an ACL block, a
   `ROLE_SECRETS` entry, and a broker URL naming the role — all tracked, all read by the
   existing derivation, nothing hand-kept.

3. **The browser cannot currently read the query layer.** The page is served off `:8080`
   and `/released` answers 401 with no CORS (`spikes/map-to-ocean/FINDING.md`, tracked in
   DeepBlueCLtd/drogna#34). Any design that fetches the SensorThings catalogue from the
   panel to learn the deployed things and datastreams would not work at either
   destination today. This closed one otherwise-attractive route to the skeleton's
   concrete segments.

4. **The served client configuration is a public artefact** (ADR-0020). Whatever
   credential the panel's connection uses will be world-readable. The new role's ADR must
   therefore make the same non-secret argument ADR-0020 made for the viewer, over the
   wider grant — or the design is wrong.

5. **The clock sample carries everything the honesty states need**: `sim_time`, `rate`
   (the acceleration factor in force) and `mode`, already validated and folded by
   `transport/clock.ts`. Observation payloads carry their own `sim_time`, which is what
   makes the retained-message edge case satisfiable without interpreting content.

## Constitution Check

*GATE: evaluated before Phase 0; re-evaluated after design. No violations; no
Complexity Tracking entries needed.*

| Principle | How this feature complies |
|---|---|
| I — No wall-clock | Every stated figure (rate, last-seen) is simulation time from received clock samples and payload `sim_time` stamps, with the factor in force shown beside it. The render path's pulse decay and the crossover decision run on host instants via the two existing exemptions: liveness-style windows over `receivedAt` instants (ADR-0006's boundary — "how recently did a real message arrive" is a fact about the host) and frame-time display smoothing (ADR-0007). No third exemption is requested: the panel takes host time only through `time/host.ts` and the frame loop, both already marked, and no value derived from either leaves the render path. |
| II — Seeded randomness | No randomness anywhere in the feature. Client ids are derived from the configured id by suffix, not from entropy. |
| III — Generated types | The one boundary shape is the topology document, whose master and generated types exist (FR-009). The scanner extension adds rows, not shape, so no master changes and no regeneration of type trees — only of the artefact instance, which the existing drift gate covers. |
| IV — No literal paths/hosts | The panel names topics (harness conventions, per the standing rule) and no location. Where the broker is comes from the served configuration document, as today. |
| V — No tracked entities | Nothing new; the panel displays topics and opaque payloads of the existing synthetic streams. |
| VI — Honest ports | No new abstraction. The panel narrows the existing `BrokerClient` interface (which has no publish member) rather than inventing a transport port. |
| VII — Liveness, not configuration | The load-bearing principle. The skeleton is drawn from the declared artefact and is *visibly cold* until traffic arrives; cells, pulses, ripples, role connections and intensities light only from genuinely received messages. The two sources are separate modules with no route from skeleton to activity. Declared-but-silent is presented as information, never as liveness. |
| VIII — Recommendations | Not touched. |
| IX — Ground truth scored | Not touched. |
| X — Default deny | The new role is an ACL append under mosquitto's default deny; the proxy's policy is untouched (the upgrade location already exists and its clearance posture is ADR-0020's). The role's refusals are asserted at a running broker, not read back from the file. The widened read is argued in ADR-0025 (below), not slipped in. |

## Project Structure

### Documentation (this feature)

```text
specs/022-topic-tree/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0: the decisions and their alternatives
├── data-model.md        # Phase 1: the state-layer entities
├── quickstart.md        # Phase 1: how to see it working and prove it honest
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
client/src/topictree/            # the panel, self-contained; the feature's owned area
├── skeleton.ts                  #   declared tree from the topology artefact (pure)
├── match.ts                     #   MQTT wildcard filter matching (pure, FR-004)
├── activity.ts                  #   arrival folding, windows, decay, crossover (pure)
├── state.ts                     #   panel state: connection, clock, selection, honesty
├── detail.ts                    #   selection detail (pure, FR-005)
├── transport.ts                 #   the read-only subscription, obs/# + ctl/#
├── TopicTreePanel.tsx           #   the panel: owns its subscription and its frame loop
├── TreeView.tsx                 #   the tree, pulses, ripples, collapse
├── RoleColumn.tsx               #   the consumer roles and their lit connections
└── DetailView.tsx               #   the integrator's account of one node

client/tests/topictree/          # the state-layer proof (FR-011)
├── skeleton.test.ts             #   incl. SC-003 against contracts/topology.json itself
├── match.test.ts
├── activity.test.ts
├── detail.test.ts
├── honesty.test.ts              #   FR-007's states
└── readonly.test.ts             #   SC-005: no publish call in the panel's source

client/src/App.tsx               # append-only: one import block, one element (FR-010)

deploy/broker/acl                # append: the drogna_observer block
deploy/lib/render_credentials.py # append: one ROLE_SECRETS entry
config/local/client.json         # broker.url names the new role
config/droplet/client.json       # broker.url names the new role (destinations agree)

scripts/scan_topology.py         # extension: configured expansion of declared wildcards
tests/unit/test_topology_scan.py # (or the existing scanner test module) extended
contracts/topology.json          # regenerated; the drift gate watched failing first

tests/integration/test_topic_isolation.py  # append: the new role's grants and refusals

docs/adr/0025-*.md               # the ADR the spec's assumptions owe
```

**Structure Decision**: the panel owns `client/src/topictree/` and its tests, new
directories beside the existing per-surface areas (`map/`, `loop/`, `route/`), following
the layout 017 set. The shell integration point (`App.tsx`) is append-only because lane J
is adding a different panel in parallel: this feature contributes one import block and
one JSX element, self-contained, taking only the validated configuration and opening its
own subscription internally. Everything else this feature touches is either an append to
a shared file (ACL, `ROLE_SECRETS`, integration test) or a regeneration (the artefact).

## Design

### The role: `drogna_observer`, and how it is declared

FR-002 requires a new role with read on both namespaces and write on nothing, declared in
the tracked sources the topology derivation reads. The interview already rejected
restricting the tree to the client's current grant (the tree would misrepresent the
system) and a server-side digest relay (a nineteenth component to keep the browser's
grant narrow); ADR-0025 records all three with the argument.

The declaration is three appends and one substitution, all in sources the scanner or the
render already reads:

1. `deploy/broker/acl` gains a `drogna_observer` block: `topic read obs/#`,
   `topic read ctl/#`, and no write rule at all. Mosquitto's default deny does the rest.
2. `deploy/lib/render_credentials.py`'s `ROLE_SECRETS` gains
   `"drogna_observer": "HARNESS_BROKER_SECRET_OBSERVER"`. The password file and the
   secret generation both iterate that table, so nothing else needs telling.
3. `config/local/client.json` and `config/droplet/client.json` change the broker URL's
   username from `drogna_viewer` to `drogna_observer`. That line is where a component's
   role is written down (it is what the scanner reads and what the broker authenticates),
   so this *is* the declaration, not a consequence of it.
4. `contracts/topology.json` is regenerated. The drift gate is watched failing between
   steps 1–3 and the regeneration, and passing after — which is the property that makes
   the whole arrangement safe to lean on.

The client's existing control subscription changes identity and nothing else: it still
subscribes exactly `CONTROL_TOPICS`, so no existing surface displays anything different
(FR-010). `drogna_viewer` stays declared in the ACL with ADR-0020's obligations intact —
it remains the narrow identity for anything that needs only the control namespace, and
its refusals stay tested. The panel opens its own connection with the same credential and
a derived client id, subscribing `obs/#` and `ctl/#`.

The served configuration document will carry the observer secret world-readable, as it
carries the viewer's today. ADR-0025 therefore re-makes ADR-0020's non-secret argument
over the wider grant: holding the credential, a caller may *watch* the synthetic
observation and control feeds of a demonstration harness and may not write one message
anywhere; the released products behind the proxy's clearance are a different credential
on a different route, untouched. The obligations transfer: the observer role may never
gain a permission, and nothing that is a real secret may be rendered into the served
document. The `/ctl` upgrade path now carries observation traffic too; the name stays (a
location name, not a policy), recorded as a consequence in the ADR.

### The skeleton: the join happens in the derivation chain

FR-001 says the skeleton is the derived topology joined with deployed configuration for
the concrete segments wildcards cover, and that it must not be hand-maintained anywhere —
"the derivation chain is the authority, and drift remains the existing gate's to catch."

The join is performed by the derivation chain, not by the browser.
`scripts/scan_topology.py` gains one source it already had permission to read: the
sensors configuration under `config/<destination>/` (found by its shape — a `sensors`
section naming a platform and datastreams — not by filename). From platform id and
datastream ids it derives the concrete observation topics `obs/<thing>/<datastream>`,
requires the destinations to agree exactly as it already requires them to agree on roles,
and emits each as an ordinary topic row: namespace `obs`, publishers and subscribers
computed from the ACL by the existing wildcard matching, `named_by` empty (no source
names them; the configuration does). `resolve_schema` gains the rule that any topic under
the observation branch is governed by the observation master, which the repository layout
already states in prose.

The topology master's shape is unchanged — the rows are ordinary `TopicEntry` instances —
so no schema edit, no type regeneration, and the existing drift gate covers the new rows
exactly as it covers the old (FR-009 confirmed: the topology document remains the sole
boundary shape).

Why not the alternatives: a hand-written things-and-datastreams section in `client.json`
is precisely the hand-maintained skeleton FR-001 forbids, and would need a new gate to
keep honest; fetching the SensorThings catalogue from the panel is unreachable from the
browser today (fact 3 above) and would make the *declared* skeleton depend on a *serving*
system, which muddies Constitution VII's two sources. The derivation-chain join keeps one
authority, one gate, and hands the panel a single build-time import.

The panel imports `contracts/topology.json` at build time exactly as
`contracts/schemas.ts` imports the masters, typed by the generated
`DrognaBrokerTopology`. `skeleton.ts` is a pure function from that document to the tree:
one node per segment path, `ctl` children from the concrete control rows, `obs` children
from the configured rows, the wildcard filters retained as the covering declarations.
SC-003's test runs the role-matching against the real artefact, not a fixture.

### Declared, observed-under-declaration, undeclared

Three tiers, computed from two facts about a topic — is it a row in the artefact, and
does any declared filter cover it (by `match.ts`, the same semantics as the scanner's
`topic_matches`):

- **declared** (and configured, for the expanded observation topics): a row in the
  artefact. Drawn cold from first paint; a declared-but-silent topic is information.
- **observed under declaration**: not a row, but covered by a declared wildcard filter.
  Grafted into the tree where its segments place it, marked as such (FR-006).
- **undeclared**: covered by nothing. Grafted, and visibly marked as a finding about the
  topology, never absorbed.

### Activity: one model, four readings

`activity.ts` is a pure reducer over arrival events, holding per-topic: a bounded ring of
recent arrival instants (`receivedAt` host instant for the display; `sim` stamp for the
stated figures), the last arrival, and the last payload (opaque bytes plus topic, for the
detail view). An arrival's sim stamp is the payload's own `sim_time` where the payload is
JSON carrying one (which is what makes retained messages honest — their time, not
connection time), else the latest clock sample's `sim_time`, else absent and stated as
"before the clock was heard" rather than invented.

Everything drawn reads from this one model at view time, as a pure function of state and
the frame instant:

- **Pulse and decay**: a node pulses on arrival and decays over a display constant; the
  decay phase is computed from `now - lastReceivedAt`, never stored, so a paused clock
  lets in-flight decays complete in wall time (scenario P2-3).
- **Ripple**: an ancestor's activity is the aggregate of its descendants' — computed at
  view time, which is also what a collapsed subtree's summary node shows. "As a wildcard
  subscription would see it" is literally the implementation: the ancestor aggregates
  what `#` under it would have received.
- **Crossover**: discrete pulses read individually while the measured mean inter-arrival
  interval exceeds the pulse's own decay duration; at and past that bound the node holds
  a sustained intensity tracking recent rate, and edge flow follows the same value. The
  bound is derived from the decay duration the display itself uses and the rate the model
  itself measured — nothing typed into a test can tune it (the spec's standing
  preference), and the test asserts the relationship, not a number.
- **Stated figures**: rate per simulation second over the recent window (from sim
  stamps), last-seen in simulation time, always rendered with the acceleration factor in
  force from the latest clock sample beside them (FR-003, SC-004). While the clock is
  paused the panel states the pause and holds the figures rather than dividing by a
  stopped clock.

### Honesty states (FR-007)

Four conditions, each a distinct state in `state.ts`, each stated in words on the panel,
each unit-tested:

- **Disconnected**: the panel's own connection state (`not-connected` /
  `connected-silent` / `receiving`, the shell's existing vocabulary). A severed feed is
  never a quiet system.
- **Paused**: the latest clock sample says `rate === 0` or `mode === "paused"`; stillness
  is attributed to the clock, not to the streams.
- **Cold / young**: the panel records the session's first instant and says it is young
  and holds no history (FR-008); a refreshed page reads as a fresh listener, not a
  stopped system.
- **Absent route**: no validated configuration (the document failed to load or validate)
  disables the panel with a statement, the shape the shell's other surfaces already use.

### The detail view (FR-005)

Selecting a node shows: the last payload verbatim and pretty-printed where it parses as
JSON, else shown as safely as it can be with the reason stated, size-capped with the cap
stated; arrival, rate and recency in simulation time; every role holding read or write on
a matching filter with its access, computed by `match.ts` against the artefact's roles —
which is SC-003's exactness claim; and the governing master from the artefact's row (a
covered-but-unrowed topic inherits the covering branch's master, stated as inherited).
Unobserved facts are stated as not yet observed, never zero-filled.

### Structural read-only (SC-005)

The panel's transport narrows the existing `BrokerClient` interface, which has no publish
member, and `readonly.test.ts` walks the `topictree` source files asserting no publish
call appears — the same checkable form the existing transport's promise takes, held by a
test rather than a sentence. The role's write refusals are asserted at a running broker
in `tests/integration/test_topic_isolation.py`.

## Verification

FR-011 fixes the proof at the state layer, and the spec records the unchosen
alternatives; this plan honours both.

- **Unit (vitest, the chosen proof)**: skeleton construction from the real artefact;
  filter matching including `+`, `#`, and the non-matching cases; activity accumulation,
  decay and the derived crossover; the three-tier classification; the honesty states;
  the detail view's role exactness against `contracts/topology.json` itself (SC-003);
  the no-publish structural test (SC-005). Every test is watched failing on the fault it
  describes before it is trusted, and the commit message says so.
- **Unit (pytest)**: the scanner's configured expansion — seen deriving the concrete
  topics from a fixture tree, seen failing on disagreeing destinations, and seen through
  the drift gate: the gate watched failing against the pre-regeneration artefact and
  passing after.
- **Integration**: `test_topic_isolation.py` asserts at a running broker that
  `drogna_observer` receives on `obs/#` and `ctl/#` and that its publishes are refused
  everywhere.
- **Live**: the local stack cycles (PR #33), so P1's independent test is run for real —
  stack up, panel open, one observation topic watched: leaf pulse, ancestor ripple,
  matching roles lit, non-matching roles unmoved — and the glance capture confirms the
  panel renders beside the existing surfaces without disturbing them.

## Complexity Tracking

No constitution violations to record. The two entries a reader might expect are not
violations: the render path's host-time use rides the two existing exemptions without
widening either (the markers and the gate are unchanged), and the observation namespace
reaching the browser is a boundary decision carried by ADR-0025 under Principle X's
process, not an exception to it.
