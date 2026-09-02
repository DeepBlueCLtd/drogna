# Outstanding work in drogna, in the order it should be done

*Read against `main` @ `3ad5212` and open pull request #107, on 2 September 2026.*

Seventy unticked task lines sit across the V2 feature specs. Read against the tree rather
than the record, they resolve to nine genuinely owed items, one feature ready to start, and
a long tail that was declined on purpose and should stay declined. This document is the
triage; it is a claim about the tree at a moment, and where the two disagree the tree wins.

A published version of this page, laid out for reading, is at
<https://claude.ai/code/artifact/42d31978-962d-42fc-a303-e63b0b8ae86b>.

## What the seventy lines actually are

| | |
|---:|---|
| **70** | Unticked lines in `specs/1NN-*/tasks.md` on `main` |
| −37 | Feature 123, the forward step — complete on PR #107, where all 79 of its lines are ticked |
| −20 | Declined or deliberately not done, each carrying its reason in the line (CLAUDE.md lesson 1) |
| −4 | Done in the tree, unticked in the record — the record is a claim, and the tree disagrees with it |
| **9** | **Genuinely owed** |
| +35 | Feature 124, specified on PR #107, unstarted |

The V1 specs (`specs/0NN-*`) carry a further 11 unticked lines. That directory is the
archived record and is not live work; leave it alone.

---

## P0 — Land what is already built

One merge. Everything below either depends on it or is measured against it.

### PR #107 — review and merge the forward-step implementation

Branch `claude/srd-model-forecast-specs-ws9x3d`: the two-layer kernel, run cost expressed in
simulation time, the scheduler's `held-for-cost` decision, and the left region and timeline
of `#/view/forecast` — plus the feature 124 specification. All 79 of feature 123's task
lines are ticked on the branch and none on `main`, so the 37 that look outstanding are an
artefact of where you are standing.

**Done when** #107 is merged and `pnpm check` is green on `main`. Give the snapshot diff
from `pnpm snapshots` a real read during review — the kernel change moves the analytic form,
which is exactly the case ADR-0041's gate exists to catch.

---

## P1 — Reconcile the record with the tree

Four lines describe work that is on disk. Half a day, and it removes the largest source of
false backlog. One of the four must be corrected before it is ticked, not ticked as written.

### 101 T037 and 107 T607 — the AT-04 replay proof exists; tick both lines

Deferred from 105 to 102, then to 107, and built at the arc's close-out.
`scripts/replay-proof.ts` is on `main` — it states the claim's boundary, runs every
byte-identity test, and propagates exit status — and `package.json:22` wires
`pnpm replay-proof`. Two feature records still say it is owed.

**Done when** both lines are ticked, each naming the script and the beat it actually landed
at.

### 110 T010 — the walkthrough's SRD requirement is on `main`

The line says "tick when that amendment is on `main`". `srd.md` §5.13, *The walkthrough
(feature 110)*, carries FR-61 and FR-62 at lines 653 and 664.

**Done when** T010 is ticked.

### 113 T007 — feature 113 is noted in the plan, and the numbering is reconciled

`docs/v2/plan.md` §5 discusses 113 from line 188, including the renumber it settled and the
collision it met. The line is drafted-and-waiting; the draft landed.

**Done when** T007 is ticked.

### 113 T006 — correct the section number, then tick

The line promises "new §5.11 with FR-52 to FR-60". FR-52 to FR-60 are on `main` at `srd.md`
lines 583–641, and V2-C21 Platform is in §4's component table at line 173 — but they live
under **§5.12, *The platform, and the operator's flow (feature 113)***. §5.11 is feature 112,
the shell at a phone's width. The amendment landed; the task line names the wrong section.

**Done when** the line reads §5.12, the second half of its promise — FR-22, FR-35, FR-36 and
FR-40 amended in place — has been checked citation by citation rather than assumed, and it
is then ticked. If any of those four is unamended, that is the residue and it stays open with
the reason written in.

### Issues #54 and #61 — two open issues look discharged

Six issues are open. **#54** (the Background tab) tracks feature 111, whose 41 done lines
leave only three declined ones. **#61** (telemetry deferrals from 107) is cited by 107 T608,
which is ticked. Verify each against the tree and close it, or say in the issue what is still
owed. The other four — #55, #56, #57, #62 — map to rows below and stay open.

---

## P2 — Feature 124, the illustration surface

The largest piece of real work, and the only one with a written specification waiting for it.
35 tasks, and it needs #107 merged first.

SRD-v2 §5.20 (FR-120 to FR-140) says plainly which half of itself feature 123 built: *the
surface is the deliverable, and the forward step exists because a surface explaining a
forecast needs a forecast to explain.* The specification is written and its tasks run in
seven phases — the analyst's substrate, the volume and its grid, the rays, the profile, the
right region and its ghost, the constraints held rather than asserted, and the record.

This is time-sensitive in a way the other rows are not: the centre and right regions of
`#/view/forecast` currently render text stating they are not built and naming feature 124.
That was an accepted cost at 123, but it is a view announcing its own incompleteness to every
visitor until this lands.

**Done when** the 35 lines are ticked as the work is taken, with reasons written at the
moment of each decision; the pull request links its own instance opened at `#/view/forecast`;
and the blog entry ships in the same pull request with a motion capture, inside the 300-word
budget `check-blog-length` enforces.

---

## P3 — The one unfulfilled constitutional obligation

Principle IX requires a beat's acceptance to be watched happening in the shell and captured,
never inferred from green tests alone. Feature 113 owes two.

### 113 T049 — capture the watched turns, SC-001 and SC-002

SC-001 is stopping the platform; SC-002 is turning it. Both are scenarios the operator flow
chart exists to make visible, and both are currently evidenced by tests rather than by a
capture of the full path — generator to pixel — through the seam. The capture tooling is
already in the repository, so this is a session at the shell, not new machinery.

**Done when** both turns are captured and the capture is linked from the record. It is the
cheapest of the genuinely owed items and the only one a principle names, which is why it
sits above the two gates below despite them being worth more.

---

## P4 — Two gates that do not exist

CLAUDE.md's second lesson is that a check never seen to fail is worth nothing. These are the
inverse: checks nobody has written, where the failure mode is silence.

### 108 T712 (issue #57) — leakage mask scoring as a gate

Not a kernel change, which is what the open question originally assumed. Measured against
this harness's own releases: the loiter scenario's measurements span 3.9 km inside a release
interval against a 60 km identification radius, so the buffer is a single blob that V1's
FR-017 calls inconclusive whatever the kernel does; with per-cell noise suppressed two
successive releases are identical value for value, so there is no mask at all; with the noise
on the mask is the whole domain and scores at chance — a pass earned by noise rather than by
mitigation.

All three facts are held by a test that fails the day any stops being true, which is the
right holding action but is not a gate. A gate needs a scoring configuration whose sampling
spans more than the radius it is released under, and whose successive releases differ.

**Done when** that scenario and its release terms exist, the gate is appended as one line to
`scripts/gates.registry`, and a planted violation has been seen to fail it before the fix
goes in.

### 111 T070 — check Background's drogna-specific claims against the tree

The Background tab explains eight standards and makes claims about this harness while doing
it. Nothing checks those claims against the code, so the failure mode is prose drifting
quietly out of true — the same class of fault as the opening paragraph of CLAUDE.md, which
was wrong until somebody looked. Q1 in `specs/111-background-tab/spec.md` remains open and
the standing decline was rewritten once the content existed.

**Done when** either the gate exists and has been watched failing on a planted stale claim,
or Q1 is closed with the reason a gate is not the answer. Lower than 108's only because
Background is explanatory rather than load-bearing.

---

## P5 — Feature 120's three deferrals

Start conditions shipped with three things named and not done. Ordered here by cost, which is
the reverse of how they appear in the record.

### A plan waiting on the Operator tab when the console opens

The planner is held back through every pre-roll and replans within 600 ticks of the shell
mounting. It recommends and changes nothing a start-condition card promises, so the whole
cost is a plan arriving a moment later — live, where a reader can watch it happen. Arguably
that is the better demo and the deferral should become a decline; make that call explicitly
rather than leaving it as an open line.

**Done when** the plan is present on open, or the line is closed as declined with that
argument written in it.

### The forecast eras in the artefacts

The other 10.9 MB and the other 2.1 seconds. Blocked on the scheduler's run identifiers,
which reset on restart: holding the loop back for a pre-roll means restarting it, and the
first live cycle would republish under the artefact's first cycle's holding identifiers and
silently replace them. A test already refuses the declaration with that explanation, so the
tempting one-line edit fails loudly instead of losing holdings a minute after the console
opens.

**Done when** run identifiers survive a restart — or are namespaced by era — the refusing
test is retired with its reason, and the artefacts carry the eras. Read the `pnpm snapshots`
diff before committing it.

### NetCDF export

The feature's input names it, but SRD-v2 FR-39 holds offload to announcement-only in V2, and
feature 120 deliberately made that path *reachable* — `returning` arrives with a package
staged and its measurement geometry beside it — rather than widening the requirement. Issue
#62 already scopes real transfer, receipts and verified-receipt eviction to V3.

**Done when** a decision is recorded: either FR-39 is amended with an ADR arguing the
widening, or this line is closed as V3 work and folded into #62. Do not implement it against
the requirement as it stands.

---

## P6 — Outside the repository, or its own workstream

### 113 T003 — settle the flow chart's density question against a real screen

The expanded faces are designed at 240×168 and twenty of them do not fit a laptop viewport
beside the drawer. The compact face is designed, but the switch between them is manual.
Decide whether compact becomes automatic below a width threshold, as feature 111's rail is,
or stays a control — and record which, with the reason.

**Done when** the behaviour matches the decision and the decision is written down.

### 101 T036 (issue #55) — site rebuild: V2 as the published demo, V1 as the archive section

Deferred until the arc lands. Review instances have served in the meantime and the V1 site
remains the published archive, so nothing is broken — but the blog obligations under PR-04a
attach to this workstream, and the coverage table on the blog index publishes the gap
meanwhile. Schedule it rather than carrying it as a task line under feature 101.

**Done when** the workstream exists with its own specification, and T036 points at it.

### 101 T003 (issue #56) — decommission the V1 droplet

An infrastructure action on the author's own account, not a repository change. It has been
flagged in a pull request already and is tracked by issue #56. Nothing a developer can
action; it is listed here only so it stops reading as unfinished engineering.

**Done when** the author actions it and closes #56.

---

## Not backlog: declined, with the reason recorded

Twenty lines. Each was decided against at the moment it came up and carries its argument in
the line, which is the part that cannot be reconstructed later. Do not re-open one without
new evidence; if you do, replace the reason rather than deleting it.

| Line | Not doing | Because |
|---|---|---|
| 101 T027 | Persist panel arrangement per viewer | Presentation-only convenience (FR-14); revisit only if reviewers ask |
| 102 T107 | Seasonal signal in the archive | Adds a parameter the demo does not read; revisit if the map or a post wants visible seasonality |
| 103 T208 | Message-rate ripple tuning | Smoothing constants are display-only and best judged against 107's rate controls |
| 104 T307 | `application/prs.coverage+json` content type | The OpenAPI records the intended media type; a one-line switch, best made with the first consumer that cares |
| 105 T407 | A dedicated Runs view | The System detail column and Messages carry the loop's story; the operator view is the natural home |
| 106 T506 | Optimality-gap measurement in TS | The V1 measurement stands for the same formulation; the harness's own claim is already tested |
| 106 T507 | Wrong-implementation companion test | The spread model grows with lead, so the naive figure published in every message *is* the visible gap |
| 110 T008 | A tour for another tab | The mechanism repeats; a tour nobody asked for is copy without a reader |
| 110 T009 | A tour that operates the controls | It would have to undo what it did, or leave the harness changed by having been explained |
| 111 T071 | Remember a viewer's place in the course | FR-015 forbids it; addable later without changing what any component does |
| 111 T072 | Deep links into Background | Out of scope by the spec; the anchors exist, and who uses them is another feature's business |
| 113 T060 | A manual "request a forecast run" | It would let the operator manufacture the loop's cause; the demo's claim is that the loop turns because the world diverged |
| 113 T061 | The adaptive sampling component | Its own spec and its own argument against Constitution VIII; it must not arrive as a panel change |
| 113 T062 | SensorThings `HistoricalLocations` | A second entity set for the same fact is two answers that can disagree; refused by name in the query-subsets record |
| 113 T063 | Graph auto-layout | Ranks and lanes are declared; a layout that moves between renders is unlearnable and untestable |
| 114 T018 | A second publisher of platform demands | FR-53 reserves it for an adaptive-sampling component; Constitution VIII governs whether one may exist |
| 122 · i | A prompt for the analyst | It analyses for a run request; prompting it directly puts a second copy of the scheduler's policy in the control plane |
| 122 · ii | An announcement from the advisory store | No write rule in the topology; a new topic and master for a message nothing consumes |
| 122 · iii | A universal "beat now" | Reachable only for the twelve components that already have buttons |

---

## Two habits this list depends on

**Tick as you go, and write the reason at the moment you decide not to do something.** Four
of the seventy lines were work already on disk, and one of those four described it wrongly.
That is a small error rate for a record this size, but it is the error that makes a backlog
unreadable — and the reason for a decline is the only part nobody can reconstruct afterwards.

**Plant the violation before you trust the check.** Both P4 rows are gates that do not exist.
When you write one, see it fail on a deliberate breach, revert, and say so in the commit
message. Two of V1's original four gates reported a file of intentional violations as clean.
