# Data model: The Topic Tree (022)

The state layer the unit tests prove (FR-011). Everything here is client-side, session
only, and pure: reducers fold events, views are functions of state and an instant. The
one boundary shape is the topology document, already mastered and generated (FR-009);
nothing below crosses a boundary.

## Source documents (inputs, never mutated)

- **DrognaBrokerTopology** — `contracts/topology.json`, imported at build time, typed by
  `client/src/generated/messages/topology.ts`. Supplies roles (with filter rules),
  components (with the role each authenticates as), and topic rows — after the scanner
  extension, including the configured concrete observation topics.
- **RuntimeConfig** — the served configuration document, validated as today. Supplies
  the broker URL and client id. No new fields.
- **ClockSample** — as `transport/clock.ts` already folds it: `simTime`, `rate` (the
  acceleration factor in force), `mode`.

## Entities

### TopicNode (skeleton.ts)

One segment path in the tree.

| Field | Type | Notes |
|---|---|---|
| `path` | `string` | full topic path, e.g. `obs/platform-a/ds-temperature` |
| `segment` | `string` | the last segment, what the tree draws |
| `tier` | `"declared" \| "observed-under-declaration" \| "undeclared"` | FR-006's three states; declared nodes come from artefact rows, the others are grafted at arrival time |
| `schema` | `string \| null` | the governing master from the row, or inherited from the covering branch (stated as inherited) |
| `coveredBy` | `readonly string[]` | the declared wildcard filters covering this path (via `match`) |
| `children` | `readonly TopicNode[]` | ordered by segment |

Validation: built only from the artefact (declared) or from a received arrival (grafted);
there is no other constructor path — that structural fact is Constitution VII's guard.

### DeclaredFilter (skeleton.ts)

A role's access statement, straight from the artefact: `{ role, access, filter }`.
The join between the tree and the column; matching is `match.ts` and nothing else.

### ConsumerRole (skeleton.ts / RoleColumn)

| Field | Type | Notes |
|---|---|---|
| `role` | `string` | ACL user name |
| `filters` | `readonly DeclaredFilter[]` | in ACL order |
| `components` | `readonly string[]` | who authenticates as it, from the artefact |

### ArrivalEvent (activity.ts input)

| Field | Type | Notes |
|---|---|---|
| `topic` | `string` | as received |
| `payload` | `string` | opaque; only a `sim_time` string property is ever read from it |
| `receivedAt` | `number` | host instant (display clock; ADR-0006-shaped use) |
| `simTime` | `string \| null` | payload's own `sim_time`, else latest clock sample's, else null ("before the clock was heard") |

### ActivityState (activity.ts)

Per-topic map, session only (FR-008).

| Field | Type | Notes |
|---|---|---|
| `arrivals` | ring of `{ receivedAt, simTime }` | bounded depth; the window both rates read |
| `count` | `number` | total this session |
| `last` | `ArrivalEvent \| null` | carries the opaque payload for the detail view |

Derived at view time (pure functions of state + frame instant, never stored):

- `decayPhase(node, now)` — 0..1 from `now - last.receivedAt` against the decay duration.
- `aggregate(node, now)` — a parent's activity is the aggregate of descendants' (the
  ripple, and the collapsed-subtree summary).
- `wallRate` / `meanInterArrival` — from `receivedAt` ring (crossover input only).
- `simRate` — arrivals per simulation second from `simTime` ring (the stated figure,
  always rendered beside the factor in force).
- `reading(node, now)` — `"pulse" | "sustained"`: sustained iff `meanInterArrival <=
  decayDuration` (R5; the bound is read from the module, not typed into a test).

### PanelState (state.ts)

| Field | Type | Notes |
|---|---|---|
| `connection` | `ConnectionState` | the shell's existing vocabulary |
| `clock` | `ClockSample \| null` | latest sample; `rate`/`mode` drive the paused statement |
| `sessionStartedAt` | `number` | host instant; the "young, no history" statement |
| `activity` | `ActivityState` map | above |
| `grafted` | topic → tier | observed-under-declaration / undeclared placements |
| `selected` | `string \| null` | selected topic path |
| `collapsed` | `Set<string>` | collapsed subtree roots |

Honesty states (FR-007), each a distinct derivation, never conflated:
`disconnected` (connection ≠ receiving/connected-silent), `paused` (clock says so),
`young` (session-only statement), `absent` (no validated configuration → disabled with a
statement). Silence on the wire and silence in the feed never render alike.

### SelectionDetail (detail.ts)

Computed for the selected node: last payload pretty-printed where it parses, else shown
safely with the reason and cap stated; arrival/rate/recency in simulation time with the
factor shown; `matchingRoles: { role, access, filter }[]` — every role whose declared
filter matches under broker wildcard semantics, none omitted (SC-003); governing schema
(own or inherited, stated which); unobserved facts stated as unobserved.

## Scanner-side addition (Python, scripts/scan_topology.py)

`configured_observation_topics(root) -> list[str]`: platform id and datastream ids from
the sensors configuration of every destination (located by shape), destinations required
to agree, emitted as ordinary `TopicEntry` rows. No shape change to the master.

## State transitions

```
(cold skeleton) --arrival on declared topic--> activity[topic] grows; ancestors aggregate
(cold skeleton) --arrival on covered, unrowed topic--> graft(observed-under-declaration)
(cold skeleton) --arrival on uncovered topic--> graft(undeclared, marked)
connected --close/offline/error--> disconnected (stated; activity retained, decays only)
any --clock sample rate=0--> paused (stated; in-flight decays complete in wall time)
refresh --> fresh PanelState (young; no history claimed)
```
