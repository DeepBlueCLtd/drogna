# Feature Specification: The operator's controls

**Feature Branch**: `claude/operator-tab-interactivity-n6w5ks`

**Created**: 30 August 2026

**Status**: Built

**Input**: "i was hoping for more interactivity from the 'Operator' tab. I wanted to
control demanded platform state, trigger events, and maybe tune thresholds. Please make
it more interactive. Remember to update the walkthrough"

## Context

Feature 113 redrew the Operator tab as the flow chart the SRD has always said the
architecture is, and it drew the machinery well: twenty bespoke faces, wires derived
from the topology, consequence visible where a cause was applied. What it did not do
was let a reader apply many causes. Stop, start, restart and a one-tick clock step were
the whole of it — plus a demand control which existed, in the platform's drawer, and
which the request implies was never found.

That is worth recording rather than glossing: **the demanded-platform-state control the
request asks for was already built.** It sat behind a node click, unmarked, below the
wires. A control nobody can find is a control that does not exist, and the fix for it is
part of this feature rather than a note in a changelog.

## What this delivers, visibly

The Operator tab becomes a control plane you can drive. Every node whose component takes
a control carries a **▸** on its face; open it and the controls are directly under that
component's own instrument:

- **The platform** — course, speed and depth sliders bounded by the limits the platform
  itself reported, with the number entry kept beside each for keyboard and typed values,
  and four presets (reverse course, all stop, full ahead, surface) each demanding *only*
  what it names.
- **The monitor** — the drift threshold and the persistence count, moved while the run
  is going, with the value in force read from the monitor's own heartbeat.
- **The scheduler** — the minimum interval and the cadence floor, and a button that asks
  it to consider a forecast run now. Its answer, accepted or declined, is drawn in the
  same drawer from the decision it published.
- **The shore advisory source** — a button that asks it to author the next advisory now.
- **The clock**, at the top of the tab — one tick, or a burst of as many as the operator
  surface says it will accept in one command.

## The load-bearing choices

- **The prompt goes to the component, not around it.** A forecast run could have been
  requested from the operator surface directly; the topic exists and the broker's rules
  could have carried it. That would have put a second implementation of the scheduler's
  policy in the control plane, able to start a run the scheduler would have refused. So
  a prompt is published *to the scheduler*, weighed under exactly the policy a divergence
  is weighed under, and declined inside the minimum interval — with the decline published
  as an ordinary decision. **A button that can be declined is the feature, not a
  shortcoming of it.**
- **The surface states what it offers; the panel draws that and nothing else.** The
  tunables, their bounds, the promptable events, the step bound and the demand's target
  are declared in the operator's configuration, enforced there, and served as a controls
  statement (`operator-controls.schema.json`). The panel holds no list and no bound of
  its own, so a control a reader can see is one the surface would accept, and adding a
  tunable to the configuration puts a slider on the right node without a line changing
  in the panel.
- **Three numbers, and only one of them is a fact.** What a slider holds is an *ask*.
  What the statement carries is a *bound*. What the component reports in its heartbeat is
  the value **in force**, and that is the only one drawn as true. This is why there is a
  send button rather than a slider that posts as it moves: dragging asks for nothing, and
  the reported figure moves when the component says so.
- **Everything that scores against a tunable setting reads it from one place.** The
  monitor's streak rule, the threshold on every residual sample it publishes, the
  threshold in the divergence it raises: one accessor. A tuning that reached the rule but
  not the report would have the monitor disagreeing with itself about what it is doing —
  and a display drawing the streak filling against a threshold nobody is using.
- **A tuning is ephemeral, on the rule commands already carried.** A restarted component
  is rebuilt from its configuration document by the same factory that built the first
  one, so it comes back reporting the configured value. Stated in the panel, in the
  surface's response, and held by a test rather than left to be discovered.
- **One command topic, addressed to a target.** Tuning and prompts cross the broker as
  `operator-command.schema.json` on `ctl/operator/command`. A topic per command would
  have drawn the operator's reach as a fan of near-identical wires; one topic draws three
  new edges — operator to monitor, to scheduler, to the advisory source — and those edges
  are the control plane appearing in the picture for the first time.
- **Controls live at the node they act on.** The tab's rule from 113 is that consequence
  is visible where the cause was applied; a console off to one side would have broken it
  for every control at once. Lower the threshold in the monitor's drawer and the streak
  directly above it starts filling against the new one.

## Acceptance evidence

Every check below was watched failing against a planted defect before it was believed
(CLAUDE.md, lesson 2). Eleven plants, eleven catches:

- The surface ignoring its declared bound; the statement offering a control on a
  component that does not hold it.
- The monitor scoring against its configured threshold rather than the one in force; a
  tuning surviving a restart.
- The scheduler acting on a prompt without weighing it; the scheduler ignoring a tuned
  minimum interval.
- A burst stepping one tick and claiming the rest; the advisory source ignoring a prompt.
- The panel marking every node as taking controls; the panel drawing the ask as the value
  in force; a preset demanding all three quantities instead of the one it names.

The assertions are about what components did — heartbeat figures, published requests,
published decisions, stored advisories, the clock's own tick — never about what the
surface said it dispatched. A test that read the surface's answer as evidence would pass
against a surface wired to nothing.

## The second round, and what an interview changed

The first round landed, and the request that opened it — "control demanded platform
state, trigger events, and maybe tune thresholds" — was answered narrowly: two events,
four tunables. Asked what to build next, the author took nearly all of it. What follows
is the same rules applied to five more components, and it is worth recording that the
interview changed the shape rather than the size: two of the four questions had a
correct answer that only the tree could give, and asking produced better work than
guessing would have.

**Three more prompted events.** The environment generator authors its next now-cast on
demand — superseding the one before it, since there is one now-cast at a time. The
planner recomputes on demand, and says `no-field` rather than publishing a hollow plan
when it has nothing to plan from. The packager stages a window on demand over the
release it last heard, and is declined by the rules it already had: nothing released
yet, at the staging bound, or no measurements in the interval.

**A correction that mattered.** The recommendation put to the author said a prompted
now-cast would "make the residual answer and the loop turn". It does not: the sensors
read the ocean through the world-sampler port, which is an analytic function of
simulation time, and the monitor scores against the *forecast* holding rather than the
generator's now-cast. What a prompted now-cast moves is when a snapshot is published.
The correction went back before the work was done, and the event's own description says
what it does.

**Two more tunables, and a trap the tests found.** The sensors' sampling cadence is the
loop's master dial — and it is two rules at once, because a heard position is fresh for
exactly one sampling interval. Shortening the cadence below the platform's reporting
interval therefore *starves* the sensors rather than speeding them up: they go quiet,
say why, and count the skipped ticks. A test asserting "six times the cadence is six
times the samples" failed, which is how the coupling was found. The answer was not to
hide it: the platform's reporting interval became the seventh tunable, the two
descriptions name each other, and the walkthrough says so. The planner's usable-doubt
threshold is the sixth, and the plan it publishes carries the threshold in force rather
than the configured one.

**Fault injection, from the component that would really fail (FR-67).** The author's
ruling was the narrow one, and it is the right one: the sensors publish one deliberately
malformed sample and the platform reports one impossible depth, each on the ordinary
topic, each answered by the ordinary seam — a refusal against the committed master, and
a flag against the platform's *own* declared limits, which the ingest reads rather than
copying. The alternative on the table was publishing the bad message from the operator
surface, which is three lines shorter and makes the control plane a second sensor
publishing into a namespace it does not own. What a reader then sees refuse it would
have been a different, weaker fact. Each component counts what it was asked to produce
and reports the count, so a fault a reader ordered never reads as a component that has
started lying by itself — and the platform's own state is untouched, because an
instrument misreporting a depth is not a vehicle at that depth.

## What the running page found that the tests had not

Three defects, all pre-existing, all found by driving the built page rather than by any
test:

- **The first deliberately malformed sample took the whole flow chart down.** The panel
  drew from raw broker traffic without validating it: a string where a result belonged,
  `toFixed` on a string, and every node vanished. The Messages tab has validated every
  crossing against its master since feature 104's E4; this panel never did. It does now,
  and it states how many messages it refused rather than discarding them silently — a
  picture of the machinery that cannot survive the machinery being wrong is not much of
  a picture.
- **The coverage store's stack had never drawn a bar.** It read a byte length off the
  holdings announcement, which has never carried one — the announcement is light by
  design and the size lives in the inventory the store serves — and optional chaining
  turned the mistake into silence while the caption promised "length is bytes on the
  wire". Found because a prompted now-cast published a holding and the face did not
  move. The sizes now come from the inventory, still the store's own figures.
- **The packager's declines were published nowhere.** They accumulated in memory, so a
  reader who asked it to stage and was refused saw nothing change and had no way to
  learn why. The most recent decline is now in its heartbeat detail, on FR-32's rule
  that a component doing nothing says why.

Three redundant lines were also deleted rather than kept: a cadence-restart in the
generator that `publishNowcast` already did, an empty-instant guard in the planner that
`replan` already enforced, and an assertion in a test that an exception would have
satisfied. Each was found by planting against it and watching nothing fail — which is
the same discipline pointed at code rather than at checks.

## Deliberately not in this feature

- **A prompted offload.** The packager stages on a published run, and "stage the current
  holding again, now" is a different act from the one it performs on cadence. Offering it
  as though it were the same would have been the display claiming an equivalence the
  component does not hold.
- **Tuning anything the planner scores against.** Its usable-doubt threshold is a
  candidate and the mechanism now costs one entry in a configuration array — but nobody
  asked, and a control exists to be used rather than to demonstrate that controls can be
  added.
- **Persisting a tuning across a restart, or across a visit.** V2 persists nothing between
  visits, and a tuning that outlived the component it was given to would be a second,
  quieter configuration document.
- **A tour that operates these controls.** Feature 110's reason stands: a tour that
  stepped the clock or tuned a threshold would leave the harness changed by having been
  explained. The walkthrough now *says what each control does and what the component will
  do about it* — including declining — and the reader operates.
