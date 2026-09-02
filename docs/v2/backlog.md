# Outstanding work in drogna, in the order it should be done

*Read against `main` @ `3ad5212` and open pull request #107, on 2 September 2026.
The five P1 lines this document identified are discharged on the branch that carries it;
the counts below are stated as of that branch.*

Seventy unticked task lines sat across the V2 feature specs when this triage began. Read
against the tree rather than the record, most were not work: over half belong to a feature
that is complete on an open pull request, and twenty were declined on purpose and should
stay declined. Five have since been discharged, leaving **sixty-five**.

**This file is a dated snapshot, and the task lines are the authority.** Where the two
disagree, the lines win and this file is wrong. It carries no gate — no check in
`scripts/gates.registry` reads `docs/v2/` — so it will drift, and the counts below are
already false the moment #107 merges: the 65, the −37, P0 in its entirety, and the note that
feature 124's file is not yet on `main` all die with that merge. (Feature 124 stays unstarted
— the merge ticks none of its 35 lines.) Regenerate the counts with
`grep -hcE '^- \[ \] ' specs/1*/tasks.md | paste -sd+ | bc` rather than trusting the table —
`grep -c` over several files reports per file and never prints the total.

## What the unticked lines actually are

| | |
|---:|---|
| 70 | Unticked lines in `specs/1NN-*/tasks.md` at `3ad5212`, where this triage began |
| −5 | **Discharged on this branch** — the whole of P1, below |
| **65** | Unticked now |
| −37 | Feature 123, the forward step — complete on PR #107 |
| −20 | Declined or deliberately not done, each carrying its reason in the line |
| **8** | **Work**, below — of which one is not a developer's to action |

The V1 specs (`specs/0NN-*`) carry a further 11 unticked lines; that directory is the
archived record and is not live work.

Feature 124 is specified on PR #107 and unstarted, at 35 task lines. It is not in the count
because its file is not on `main` yet.

---

## P0 — Land what is already built

### PR #107 — review and merge the forward-step implementation

Branch `claude/srd-model-forecast-specs-ws9x3d`: the two-layer kernel, run cost expressed in
simulation time, the scheduler's `held-for-cost` decision, and the left region and timeline
of `#/view/forecast` — plus the feature 124 specification. Feature 123's task lines are all
ticked on the branch (83 at the current tip; 11 of them are already ticked on `main`, from the
record-reconciliation phase that merged as `cd938b1`).

Only P2 below waits on this merge for its *specification*: within `specs/`, #107 touches
`123-forward-step` and `124-forecast-illustration` and nothing else, so P3's captures, P4's
gate and P6 can all proceed in parallel. (P1 already did, and is discharged.)

One row below is entangled with #107 in code even though it is not in `specs/`: P5's forecast
eras is discharged by changing run-identifier derivation in
`app/src/backend/scheduler/scheduler.ts`, and #107 adds 251 lines to that same file for the
cost-hold state machine. Take that row after the merge, not beside it.

**Do not expect a snapshot diff.** The committed artefacts hold only the `archive` and
`nowcast` eras, both authored by `env-generator` (`app/config/run.json:2305-2310`, and every
condition's `snapshot_eras`), so no model-runner output reaches them and no kernel change can
move them. This was checked rather than assumed: a planted kernel fault shifting every
forecast temperature by 5 °C and tripling its spread leaves `check-snapshot-drift` exiting 0,
while the kernel is confirmed to run 125 times during the pre-rolls and have its output
discarded by the era filter. **The forecast kernel has no snapshot regression cover at all**,
which is the deliberate consequence of the P5 item below, and is worth knowing before you
lean on the gate during review.

**Done when** #107 is merged and `pnpm check` is green on `main`.

---

## P1 — The replay proof, and the record *(done on this branch)*

All five lines are ticked. Kept here because the reasoning is the part that cannot be
reconstructed from a checkbox, and because one of the five was not the clerical job it looked
like.

### 101 T037 and 107 T607 — the replay proof was fixed before it was ticked

`scripts/replay-proof.ts` has existed since the arc's close-out, with `package.json:22` wiring
`pnpm replay-proof`. Its header claimed it "runs every byte-identity test in the suite — the
generator's, the whole loop's, and the advisories-and-bundles one". It selected them by name:

```ts
spawnSync('pnpm', ['exec', 'vitest', 'run', '-t', 'replay'], …)
```

The generator's byte-identity test is `AT-04 seed: two runs from one root seed are
byte-identical across every holding and every seam message`, inside `describe('the synthetic
ocean (feature 102)')`. Neither string contains "replay", so that selection ran 7 tests and
skipped 623 — the generator's among them. The proof named a test in its header and excluded it
by its selector, and the excluded one is the test `101 T037` was originally deferred *for*.
A name filter has no floor either: `vitest run -t <anything unmatched>` skips every test and
exits 0.

Selection is now derived from the tree, and the derivation is checked both ways. Each
byte-identity test carries an `AT-04: byte-identity` marker on the line above it; the script
reads the markers off disk, runs the files carrying them, and requires every marked test to
have run and passed — matched by file as well as by name, so a pass in one file cannot stand
in for a skip in another.

A marker alone would only have moved the hole: a byte-identity test written *without* one
would sit outside the proof exactly as the generator's did. So a second marker,
`AT-04: not byte-identity`, records a considered exclusion, and the script sweeps for tests
whose names read as a determinism claim and carry neither. That sweep immediately found two
tests outside the proof under both the old selector and the first marking — `runtime.test.ts`'s
*is deterministic: the same seed provisions the same manifest*, which is the very half
`101 T037`'s original deferral text named as already tested, and the planner's *recommends
deterministically: one seed, one plan, twice*. **Nine tests are marked**, two are excluded by
name with their reasons, and the boundary test the old selector caught incidentally — *the
manifest does not carry the demand…* — is neither.

**Watched failing five ways before the fix was trusted**, each reverted: no marker anywhere
(the floor — the script refuses rather than proving nothing); a marker not sitting above an
`it(`, named by file and line rather than guessed; a marked test skipped; a byte-identity test
whose marker was forgotten, which the sweep names; and a planted per-run drift in the
generator's draw path, which took six down with the generator's named among them. On the clean
tree it reports all nine ran and held.

### 113 T006 — the section number was wrong, and one amendment was missing

The line promised "new §5.11 with FR-52 to FR-60". Those requirements are on `main` at
`srd.md` under **§5.12**, with V2-C21 in §4's component table — §5.11 is feature 112, which
took that number while 113 was being written. `spec.md:58` already said §5.12; `tasks.md:48`
and `specs/113-operator-flowchart/plan.md:61` did not, and both now do. `docs/v2/plan.md` also
mentions §5.11, at line 178, and that mention is *correct* — it was left alone.

The line's second half was three-quarters done: FR-22, FR-36 and FR-40 carried their *Amended
by feature 113* markers and FR-35 did not, though `spec.md:312` maps it. FR-35 now carries the
same pointer to §5.12 for presentation. Check such markers by reading the requirements rather
than grepping for "feature 113": FR-35's and FR-36's both wrap across a line break after
"**Amended by feature", so that grep finds two of the four that are there.

### 110 T010 and 113 T007 — ticked

`srd.md` §5.13 carries FR-61 and FR-62; `docs/v2/plan.md` §5 discusses
feature 113 from line 188. Both were work already on disk.

### Issue #54 — still open, and deliberately

Six issues are open. **#54** (the Background tab) tracks feature 111, whose 41 done lines
leave three unticked, all declined — including `T070`, which the tree declines with a reason
deliberately rewritten once the content existed. It is not closed here: verifying and closing
somebody else's issue is a different decision from ticking a task line, and belongs to whoever
owns the issue. Close it against the tree, or say in it what is still owed.

**#61** is the one to be careful with: its title names three deferrals — per-region statistics,
**failure kinds**, latency — and `107 T608` discharges two. `run_failed` and
`publication_refused` stay unproduced, and `specs/107-operator-view/spec.md:59-64` records that
"issue #61 leaves this half open". The issue itself conditions those on a producer V2 does not
have. Leave it open, or close it with that residue written down. #55, #56, #57 and #62 map to
rows below and stay open.

---

## P2 — Feature 124, the illustration surface

The largest piece of real work, and the only one with a written specification waiting for it.
35 task lines, and the only row that needs #107 merged first.

SRD-v2 §5.20, *The forward step, its cost, and what made the field* (spanning
FR-106 to FR-140, of which roughly FR-120 onward is this feature's half) says plainly which
half of itself feature 123 built. Of the two it names — the forward step, and the surface
showing what a cell's value was made from — §5.20 reads: *"The second is the
deliverable. The first exists because a surface explaining a forecast needs a forecast to
explain."* Its tasks run in seven phases: the analyst's substrate, the volume and its grid,
the rays, the profile, the right region and its ghost, the constraints held rather than
asserted, and the record.

This is time-sensitive in a way the other rows are not. `#/view/forecast` does not exist on
`main` — it arrives with #107 — and when it does it discloses its own incompleteness to every
visitor, naming feature 124 as the thing that is not built
(`app/src/panels/forecast/FeatureTracks.tsx:351` on the branch). That was an accepted cost at
123, and it starts being paid at the merge, not now.

**Done when** the 35 lines are ticked as the work is taken, with reasons written at the moment
of each decision; the pull request links its own instance opened at `#/view/forecast`; and the
blog entry ships in the same pull request with a motion capture, inside the 300-word budget
`check-blog-length` enforces.

---

## P3 — The one unfulfilled constitutional obligation

### 113 T049 — capture the watched turns, SC-001 and SC-002

Principle IX requires a beat's acceptance to be watched happening in the shell across the full
path through the seam — generator to pixel — and captured, never inferred from green tests
alone. SC-001 is stopping the platform; SC-002 is turning it. Both are currently evidenced by
tests rather than by a capture. The capture tooling is already in the repository, so this is a
session at the shell, not new machinery.

**Done when** both turns are captured and the capture is linked from the record. It is the
cheapest of the owed items and the only one a principle names.

---

## P4 — The leakage-mask gate

### 108 T712 (issue #57) — leakage mask scoring as a gate

Not a kernel change, which is what the open question originally assumed. Measured against this
harness's own releases: the loiter scenario's measurements span 3.9 km inside a release
interval against a 60 km identification radius, so the buffer is a single blob that V1's FR-017
calls inconclusive whatever the kernel does; with per-cell noise suppressed two successive
releases are identical value for value, so there is no mask at all; with the noise on the mask
is the whole domain and scores at chance — a pass earned by noise rather than by mitigation.

The first two facts are held unconditionally by
`advisories.test.ts`'s *scores its own successive releases…*, the right holding action but not
not a gate. The third is weaker than it looks: its assertions sit inside
`if (noisyFirst && noisySecond)`, so if either holding lookup misses, the fact goes
unasserted and the test still passes. A gate needs a scoring configuration whose sampling spans more than the radius
it is released under, and whose successive releases differ.

**Done when** that scenario and its release terms exist, the gate is appended as one line to
`scripts/gates.registry`, and a planted violation has been seen to fail it before the fix goes
in.

*Feature 111's `T070` is not a companion to this and is not owed.* The tree declines it, with
the reason rewritten once the explainers existed: FR-005 confines a drogna-specific claim to
prose and a link, so the honest checks are weak ones, and two narrower checks were built
instead — one asserting no drawn URL is pasteable, one asserting every `liveView` names a view
the shell serves, watched failing on `expected 'mqtt/6 → no-such-view'`. The unmechanisable
part of Q1 stays open and is recorded as open.

---

## P5 — Feature 120's three deferrals

Ordered by cost, which is the reverse of how they appear in the record.

### A plan waiting on the Operator tab when the console opens

The planner is held back through every pre-roll and replans within 600 ticks of the shell
mounting. It recommends and changes nothing a start-condition card promises, so the whole cost
is a plan arriving a moment later — live, where a reader can watch it happen. Arguably that is
the better demo and the deferral should become a decline; make that call explicitly rather
than leaving it as an open line.

**Done when** the plan is present on open, or the line is closed as declined with that
argument written in it.

### The forecast eras in the artefacts

The other 10.9 MB and the other 2.1 seconds. Blocked on the scheduler's run identifiers, which
reset on restart: holding the loop back for a pre-roll means restarting it, and the first live
cycle would republish under the artefact's first cycle's holding identifiers and silently
replace them. `app/src/bootstrap/start-condition.test.ts:228` refuses the declaration in those
words, so the tempting one-line edit fails loudly instead of losing holdings a minute after the
console opens.

This is also what leaves the forecast kernel with no snapshot regression cover, as P0 notes.
Whoever takes this row should say in it whether that cover is a reason to do the work sooner.

**Done when** run identifiers survive a restart — or are namespaced by era — the refusing test
is retired with its reason, and the artefacts carry the eras. Read the `pnpm snapshots` diff
before committing it.

### NetCDF export

The feature's input names it, but SRD-v2 FR-39 holds offload to
announcement-only in V2, and feature 120 deliberately made that path *reachable* — `returning`
arrives with a package staged and its measurement geometry beside it — rather than widening
the requirement. `specs/120-start-conditions/spec.md:270-277` records the reasoning and assigns
the question to its own feature.

Neither disposition exists yet. No ADR amends FR-39 (`docs/adr/` runs to 0043 and none concerns
offload format), and issue #62 scopes real *transfer*, receipts and verified-receipt eviction —
not format — so folding this line into #62 means widening that issue, not merely closing this
one.

**Done when** one of the two is done: FR-39 amended by an ADR arguing the widening, or the line
closed and #62 widened to carry the format question. Do not implement it against the
requirement as it stands.

---

## P6 — A decision, and two things outside the code

### 113 T003 — settle the flow chart's density question against a real screen

Twenty expanded faces do not fit a laptop viewport beside the drawer. The compact face is
designed, but the switch between them is manual. Decide whether compact becomes automatic
below a width threshold, as feature 111's rail is, or stays a control — and record which,
with the reason.

**First, get the numbers off disk.** The task line says the expanded faces are designed at
240×168, and that figure appears nowhere in the tree: `app/src/panels/operator/layout.ts:73-86`
sets `NODE_WIDTH = 208`, `NODE_HEIGHT = 116`, and derives the expanded face as
`NODE_WIDTH * 2 + COLUMN_GAP` by `NODE_HEIGHT * 4` — **450×464**, nearly a viewport's height
for one card. Deciding density against 240×168 decides it against an area roughly four times
too small. CLAUDE.md's rule applies to the density threshold too: prefer a bound derived from
something on disk over a number typed into a record.

**Done when** the behaviour matches the decision, the decision is written down, and the task
line's stale dimensions are corrected or dropped.

### 101 T036 (issue #55) — site rebuild: V2 as the published demo, V1 as the archive section

Deferred until the arc lands. Review instances have served in the meantime and the V1 site
remains the published archive, so nothing is broken — but the blog obligations under PR-04a
attach to this workstream, and the coverage table on the blog index publishes the gap
meanwhile. Schedule it rather than carrying it as a task line under feature 101.

**Done when** the workstream exists with its own specification, and T036 points at it.

### 101 T003 (issue #56) — decommission the V1 droplet

An infrastructure action on the author's own account, not a repository change, and the one
item here no developer can pick up. Listed only so it stops reading as unfinished engineering.

**Done when** the author actions it and closes #56.

---

## Not backlog: declined, with the reason recorded

Twenty lines. Each was decided against at the moment it came up and carries its argument in
the line, which is the part that cannot be reconstructed later. **The line is the reason; the
column below is a gloss of it, and where they differ the line is right.** Do not re-open one
without new evidence; if you do, replace the reason rather than deleting it.

| Line | Not doing | Because |
|---|---|---|
| 101 T027 | Persist panel arrangement per viewer | Presentation-only convenience (FR-14); revisit only if reviewers ask |
| 102 T107 | Seasonal signal in the archive | Adds a parameter the demo does not read; revisit if the map or a post wants visible seasonality |
| 103 T208 | Message-rate ripple tuning | Smoothing constants are display-only. The line says "revisit at the operator's-view beat", and that beat has passed — but 107 delivered no rate control (the only one, `ClockStrip.tsx`, arrived with 101), so nothing it was waiting on appeared. The wording is stale; the decline is not |
| 104 T307 | `application/prs.coverage+json` content type | Waits on the first consumer that inspects the media type. 109's composer landed and does not: `ComposerPane.tsx:74` fetches with no `Accept` header and reads only status and body. Still a one-line switch when a consumer cares |
| 105 T407 | A dedicated Runs view | The System detail column and Messages carry the loop's story; the operator view is the natural home |
| 106 T506 | Optimality-gap measurement in TS | The V1 measurement stands for the same formulation and the harness's own claim is already tested. **Its own trigger: "worth doing when a blog post wants the figure"** — and 106 is *told only* on the blog coverage table, so whoever writes that entry should read the line, not this row |
| 106 T507 | Wrong-implementation companion test | The spread model grows with lead, so the naive figure published in every message *is* the visible gap. **Its own trigger: revisit if the spread model ever stops growing with lead** |
| 110 T008 | A tour for another tab | The mechanism repeats; a tour nobody asked for is copy without a reader |
| 110 T009 | A tour that operates the controls | It would have to undo what it did, or leave the harness changed by having been explained |
| 111 T070 | A gate over Background's drogna-specific claims | FR-005 confines such a claim to prose and a link, so the honest checks are weak. Two narrower ones were built and watched instead; the unmechanisable part of Q1 stays open |
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

## Two habits, and what this triage cost when it forgot them

**Tick as you go, and write the reason at the moment you decide not to do something.** Two
of the seventy lines were work already on disk, and a third was three-quarters of the way
there and named the wrong section. The reason for a decline is the only part
nobody can reconstruct afterwards — and it is load-bearing: an earlier draft of this file
listed `111 T070` as an unwritten gate, having read the checkbox and not the paragraph under
it that records two checks built and one watched failing.

**Plant the violation before you trust the check.** The P4 row is a gate that does not exist,
and both P0 and P1 exist because a check was trusted without being watched fail. `pnpm
replay-proof` names the generator's byte-identity test in its header and excludes it by its
selector — and would still print *held* over zero tests, because vitest exits 0 on an empty
selection. `check-snapshot-drift` covers no forecast-kernel output, which a planted 5 °C shift
confirmed by passing clean. Neither was found by reading; both were found by trying to break
them.

**And check the checker.** Two rounds of adversarial review produced four findings that did
not survive verification, two of them here: that `ClockStrip.tsx` arrived with feature 105
rather than 101 — an artefact of a shallow clone, where `4dd407c` is a graft boundary and
`git log --diff-filter=A` misattributes every file it touches — and that this document had
declared issue #61 discharged, which it never did. A finding is a claim about the tree too.
