# Feature 113 — tasks

Dependency-ordered. Nothing below the design group is built yet; the design and record
tasks are. Tick as you go, and write the reason at the moment a task is declined — the
reason is the part that cannot be reconstructed later (CLAUDE.md, lesson 1).

Features 101 to 109 are hard prerequisites: the shell, the seam, the broker, the
composition root (ADR-0030), the operator surface and the map all come from them.

## Design

- [x] T001 Design the flow chart and every component's face. `mockup.html`, committed
      here because it leads implementation rather than records it: the whole graph at
      both densities, all twenty faces at full size with their figures annotated by kind,
      the platform in detail, the detail drawer, the list view, the map's track, and the
      six states a node can be in.
- [x] T002 Settle what the first pass left open. Three things changed. **The demand
      inlet became a socket, not a ghost node** — a greyed `adaptive-sampling` row reads
      exactly like a component that has stopped, and the System tab's own footnote says
      the display cannot tell those apart, which would have made that footnote false.
      **The planner's edge now terminates visibly** at its recommendation topic with the
      Constitution VIII note, because a reader who knows the architecture looks for a
      planner→platform arrow and its absence has to be an answer rather than an
      oversight. **Figures gained a third kind**: the first pass had *declared* and
      *reported*, and broker throughput fits neither — the shell counts it from traffic
      it heard itself, and calling that "reported" would have been the display asserting
      something nothing published.
- [ ] T003 Settle the density question against a real screen. The expanded faces are
      designed at 240×168 and twenty of them do not fit a laptop viewport beside the
      drawer; the compact face is designed but the switch between them is currently
      manual. Decide whether compact is automatic below a width threshold (as 111's rail
      is) or stays a control, and record which.

## Record — owed before the code

- [x] T004 ADR-0034, *ownship state is measured, not declared*: the observed-property
      enumeration grows by the ownship quantities; why that does not reopen ADR-0005's
      closure (the closure's argument is about *derived* values having a second source of
      truth, and the motion simulator's state is primary); why position stays the
      `location` every observation already carries rather than becoming a scalar result;
      and why `HistoricalLocations` stays refused. Owed before the master is amended,
      because a closed enumeration reopened without a record is how the next reader
      learns the wrong lesson.
- [x] T005 ADR-0035, *the operator tab is a flow chart*: edges derived from the topology
      master rather than authored; the two suppressed namespaces and why; the three kinds
      of figure and the rule that a figure may not change kind. The alternatives and the
      rejections are in `plan.md`.
- [ ] T006 Amend `srd.md`: new §5.11 with FR-52 to FR-60; FR-22, FR-35, FR-36 and FR-40
      amended in place; §4's component table gains V2-C21 Platform. *(Drafted with this
      spec — tick when the amendment is on `main`.)*
- [ ] T007 Note feature 113 in `docs/v2/plan.md` §5, beside the note 111 left, so the
      numbering is reconciled openly. *(Drafted with this spec.)*

## The platform

- [x] T010 `config.platform.schema.json`: identity, seed stream, topics (clock, demand,
      observation prefix), heartbeat, initial state, limits (maximum speed, maximum
      depth, turn rate, acceleration, dive rate), instrument noise models, and the
      SensorThings Thing/Datastream context the observations carry.
- [x] T011 `platform-demand.schema.json` and `platform-state.schema.json`. State carries
      demanded and current side by side, the binding limit by name, and the shortfall
      against an unreachable demand — so FR-021's "never silently clipped" is a property
      of the message and not of the display.
- [x] T012 `motion.ts`, pure: `(state, demand, limits, dt) -> state`. Turn takes the short
      way round and wraps at 360°; speed and depth move at their declared rates; the
      binding limit is returned, not inferred. No client, no clock, no RNG.
- [x] T013 `motion.test.ts`: each limit binding in turn; the short way round across 350°
      to 010°; a demand inside the limits reached exactly and then held; an unreachable
      demand producing a stated shortfall. **Watch failing** with the turn-rate clamp
      removed and with the wrap taken the long way round.
- [x] T014 The platform component: subscribes clock and demand, integrates once per tick,
      publishes its state and its observations, heartbeats with the binding limit in the
      detail line. Joins the composition root and the control registry, scheduled before
      the sensors (plan.md §5).
- [x] T015 Amend `observation.schema.json` (FR-026, FR-027) and regenerate. The amendment
      carries its own reason in the master's description, as the existing enum note does.
- [x] T016 Ingest quality rules for the ownship properties (FR-030), with the ranges from
      the platform's declared limits rather than numbers typed into the ingest.
- [x] T017 Sensors take position from the last ownship observation heard; `positionAt`
      and the `platform.loiter` configuration block retire together. Publishing nothing
      before a position is heard is a stated behaviour with a sentence, not a silent skip.
- [x] T018 Exclude the ownship datastreams by name in the planner's observation-age
      field (FR-029), watched failing with the name removed. **The monitor's exclusion
      was written, planted against, and removed:** the suite stayed green, because
      `pairs` already names the thing and the two datastreams it scores — an allowlist,
      and stronger than a denylist beside it. A check that cannot fail is worth nothing,
      so it is gone, and `config.monitor.schema.json` no longer admits the field. The
      spec's FR-029 is amended to match the tree.
- [x] T019 Regenerate `contracts/topology.json` and check the drift gate: the platform
      role, the operator's demand publish rule, the sensors' new subscription.
- [x] T020 Replay: a scenario with the platform in the loop and a demand issued at a
      recorded tick, byte-identical; `pnpm replay-proof` extended to cover it, and the
      new delivery-order dependency stated in the claim's boundary (plan.md §5).
      `platform/replay.test.ts`, three tests, picked up by the proof without a change to
      it because it runs every test named `replay`. The boundary is now stated in the
      three places the claim is made — the proof's own preamble, the Intro panel, and
      SRD §5.7 — and says two things: a demand is an operator command and therefore
      outside the claim, while the platform's motion and the sensors' sampling
      positions are inside it. Each test was watched failing: entropy planted in the
      platform's noise broke the first two, and a platform that ignored demands broke
      the last two.

## The map

- [x] T030 `map-data.ts`: the ownship track from served observations, ordered by
      phenomenon time, gaps preserved. Pure, tested at the boundaries — one observation,
      none, and a gap.
- [x] T031 The track layer and the demanded-course ray in `MapPanel.tsx`, visually
      distinct from the planner's route; the "no ownship observations served" statement
      where the query answered empty (FR-034).

## The flow chart

- [x] T040 `graph.ts`, pure: declared components plus the topology master to nodes and
      edges, with the two suppressions applied by name and reported as applied. One
      function; the panel, the list view and the gate all read it.
- [x] T041 `check-flow-completeness.ts` and the line appended to `scripts/gates.registry`.
      **Watch failing** twice: a component added to the configuration and not to the
      graph, and a topology publish rule whose edge is neither drawn nor suppressed.
- [x] T042 `series.ts`: bounded rolling windows indexed by simulation time, the bound
      from configuration. An empty series is empty, not zero; a gap is a gap (FR-010).
- [x] T043 The graph surface: nodes, edges, lit and dark from heartbeats alone, dead and
      carrying edges, pan and zoom, the two densities, `prefers-reduced-motion`, and
      greyscale legibility by shape and weight as well as hue.
- [x] T044 **All twenty bespoke faces**, to the table in `spec.md`. The first cut
      shipped two of them and twenty near-identical cards in bands with no wires drawn
      at all — the table with rounded corners — and was sent back. What unblocked the
      rest was not more panel code but the missing half of the pattern: `heartbeat`
      grew an optional `figures` array, every component now reports its own counts as
      numbers, and each face draws those. Parsing the detail sentence would have been
      the display inventing figures nobody published; reporting them is the same move
      the monitor's breach state made.
- [x] T045 The detail drawer: last heartbeat verbatim, declared configuration, the face at
      full size, the controls, the last refusal.
- [x] T046 The list view (FR-015): today's table, kept and fed from `graph.ts`, with its
      existing tests kept. The panel test asserts one shared source rather than two lists.
- [x] T047 The platform's demand control, in both views, with the shortfall and the
      refusal surfaced at the node that produced them.
- [x] T048 Panel tests against the live backend: the kind of every figure (FR-008,
      SC-006); a stopped component's reported figures not surviving as though current;
      the consequence chain of SC-001 asserted end to end.
- [ ] T049 Watched turns, captured (Constitution IX): SC-001 stopping the platform, and
      SC-002 turning it.
- [x] T050 `pulse.ts`: the wires light as traffic crosses them, which `graph.ts` has
      promised since T040 — *"a topic edge carries traffic and can pulse; a port edge
      never can"* — and nothing did. A light per message, fading over the declared
      `flow.pulse.fade_ms`; above `flow.pulse.hold_above_rate` it is held on while
      traffic continues, because at sixty times real time a light restarted per message
      is a flicker that says less than a steady one. It goes out on the sweep that
      already darkens a lapsed node, so nothing here keeps time of its own. Written to
      the DOM rather than to React state: a light is half a second of one attribute, and
      re-rendering twenty faces for it would have the display competing for the machine
      with the system it draws. **Watched failing** five ways: the fade that never
      restarts, the accelerated clock ignored, the sweep that clears a light nobody saw,
      a port allowed to light, and the panel hearing traffic and lighting nothing.
      What the lights cannot say is said on screen instead — the seam hands a subscriber
      a topic and never a sender, so a topic with two publishers lights both their wires,
      and the panel names those topics from the edge set rather than from a phrase.

## Not doing, and why

- [ ] T060 A manual "request a forecast run" command — *deliberately not done. It would
      let the operator manufacture the loop's cause, and the demo's claim is that the
      loop turns because the world diverged. The scheduler's decision ledger already
      shows the policy that would refuse one.*
- [ ] T061 The adaptive sampling component — *deliberately not done. FR-022 builds the
      socket and puts one genuine publisher in it. Turning recommendations into demands
      is a component with its own spec and its own argument against Constitution VIII,
      and it must not arrive as a panel change.*
- [ ] T062 SensorThings `HistoricalLocations` — *deliberately not done. The track is
      served as Observations carrying locations; a second entity set representing the
      same fact is two answers that can disagree. It stays refused by name, and the
      reason is recorded beside the refusal in `docs/architecture/query-subsets.md`.*
- [ ] T063 Graph auto-layout — *deliberately not done. Ranks and lanes are declared. A
      layout that moves between renders is unlearnable and untestable.*
