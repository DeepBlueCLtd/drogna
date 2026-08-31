# Feature Specification: Something to press at every node, and it comes first

**Feature Branch**: `claude/operator-tab-mobile-ux-g1ais1`

**Created**: 31 August 2026

**Status**: Built

**Input**: "I'd like to improve the mobile experience for the Operator tab at the same
time I'd also like to simplify the Operator Panels. So, let's reduce the content of the
operator tabs, but let's also make the action buttons more prominent. For operator panels
that don't have any/many interactions, it would be useful if we could introduce some new
actions, particularly if it triggers message sending or some other visible change.
Discuss suggested actions with me before you implement them."

## Context

Feature 113 drew the Operator tab as a flow chart, 114 put the controls in each node's
drawer, and 117 opened that drawer inside the node itself. All three landed. What none of
them measured is what a reader on a phone actually meets.

Two things were wrong, and the tree said both plainly before a line was changed.

**The controls were correct and last.** An open account stacked its state line, its
detail sentence, the component's instrument, the controls, the telemetry block with a
six-column region table, the full wire list, and — at the very bottom — stop, start and
restart. The prompts sat under the instrument. On a 390-pixel screen the thing a reader
came to press was several screens below the fold, at the browser's default button height
of about 24 pixels: reachable with a cursor, a coin toss with a thumb.

**Ten of the twenty-two components offered nothing at all.** The operator surface
declares controls for eight (`platform`, `monitor`, `scheduler`, `sensors`, `planner`,
`env-generator`, `advisory-source`, `offload`), and twelve components are stoppable.
`clock`, `broker`, `boundary`, `coverage-store`, `observation-store`, `feature-store`,
`query`, `telemetry`, `advisory-store` and `operator` were protected *and* uncontrolled:
opening one gave a face, a wire list and no button.

And `app/src/panels/operator/operator.css` carried no narrow rule whatsoever. Feature 112
put one breakpoint in the estate and `NARROW_METRICS` changed the node geometry; nothing
changed what was inside the node.

**Feature number.** 121. Like 111 to 120 it sits outside the arc — with one exception,
recorded below: five components gained a prompt, which is behaviour under the seam rather
than presentation over it.

## What had to become true

1. Every node the chart draws offers a reader something to do, or says why it cannot and
   where to go instead.
2. What a reader can do is the first thing in an open account, above the account, at a
   touch target of 44 CSS pixels.
3. What is left is reference, and reference is one labelled gesture away rather than on
   screen at all times.
4. Nothing is removed. The union of what is open and what is disclosed is what the panel
   showed before (feature 112's SC-007, inherited).
5. Nothing manufactures data on request. A prompt asks a component to do now what its own
   cadence would have brought round; a component that has nothing to do says so.

## What was built

### Five prompts, on the mechanism feature 114 already had

| Component | Event | What happens |
|---|---|---|
| `sensors` | `sample-now` | One sample from every instrument, through the ordinary sampling path, at the position the platform last reported. Declined where that position is stale. |
| `platform` | `report-now` | The ordinary position report, out of interval. The other half of the sample prompt: starved instruments are waiting on exactly this message. |
| `coverage-store` | `announce-holdings` | The current era pointers announced again, over bytes that already exist. Publishes no holding and changes none. |
| `telemetry` | `skill-now` | The forecast-skill statement published now rather than on cadence, including the named absence. |
| `telemetry` | `statistics-now` | The residual statistics, on the same terms. |

Each counts what it was asked for as its own heartbeat figure, absent until one has been
asked for, so a button press is never mistaken for a cadence that quickened.

### Six probes, declared in `app/src/panels/operator/probes.ts`

A probe is not a prompt: it is the shell making a genuine request across the seam, at the
node that answers it. The clock's three commands (hold, step one tick, step the declared
burst — the last two moved out of the panel header), an EDR collections read at `query`,
the controls document at `operator`, and two that exist in order to be refused: a path the
release gate is configured not to serve, and a publish on a topic the shell's role may
never write.

### Three deferrals

`observation-store`, `feature-store` and `advisory-store` answer nothing themselves. Each
drawer states why and carries a button that opens the node that answers for it.

### The shape of an account

Actions first, then the instrument, then the forms, then the wires. Every action's
description is kept and is one gesture away in a disclosure rather than in a paragraph
under the button. The wires, the region table, the tuning sliders, and the legend with the
two footnote paragraphs below the chart are disclosed **at every width** — a decision
about the content, not about the viewport. The list view drops to four columns at a
phone's width.

## What is deliberately not done, and why

- **No prompt for the analyst.** The analyst only ever analyses *for a run request*.
  Prompting it directly would mean the panel synthesising a run request, which is a second
  implementation of the scheduler's policy in the control plane — precisely what
  `operator.ts` says the prompt mechanism exists to prevent. `platform`'s `report-now`
  took its place in the same bundle.
- **No announcement from the advisory store.** It carries no write rule in
  `contracts/topology.json` at all: it ingests what the shore source publishes and serves
  it. Announcing anything from it would need a new topic and a new master for a message
  nothing consumes. It got a deferral instead, and `telemetry` got a second prompt.
- **No universal "beat now".** Only the twelve registered components are reachable through
  the control registry, which is exactly the set that already has buttons; it would have
  added nothing where something was needed.
- **No probes at the three deferred stores.** A request answered by `query` while claiming
  to be answered by the observation store is a display lying about which component served
  it.
- **The list view drops content at a phone's width rather than disclosing it.** The one
  place in this feature that does. It is allowed because nothing becomes unreachable: the
  beat, the liveness window, the component's own sentence and the lifecycle buttons are
  all in the account the component's name opens, which is one tap away and where the
  sentence is legible anyway.

## Acceptance

- **AC-01** No node the chart draws is without a control, a probe or a deferral. Counted
  in `operator-panel.test.tsx` from the surface's controls, the probe table and the plane's
  own report of what is stoppable — never from a figure typed into the test.
- **AC-02** In an open account, every prompt and every lifecycle button precedes the
  instrument in document order.
- **AC-03** Every wire the graph carries for a component is in that component's disclosed
  wire list, and every action's description is the surface's own words.
- **AC-04** At 390×844, opening each of the twenty-two accounts leaves nothing scrolling
  sideways outside a declared container, and the shortest control in an open account is at
  least 44 pixels. Proved by capture (`scripts/capture/mobile.ts`), because geometry is not
  something an assertion over markup can see.
- **AC-05** The declared probe path sits under the api prefix and outside every one of the
  release gate's cleared prefixes, so widening `allow_prefixes` cannot quietly turn the
  refusal demonstration into a request that succeeded.
