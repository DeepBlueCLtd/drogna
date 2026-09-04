# Outstanding work in drogna, in the order it should be done

*Triaged against `main` @ `3ad5212` and open pull request #107, on 2 September 2026.
The count was retaken from the tree at feature 125, on 4 September 2026, and only the count:
the prose below still argues from the triage.*

Seventy unticked task lines sat across the V2 feature specs when this triage began. Read
against the tree rather than the record, most were not work: over half belonged to a feature
that was complete on an open pull request, and twenty were declined on purpose and should
stay declined. **#107 has since merged**, so feature 123's lines are gone and feature 124's
are in the tree; the count is now 59 and the table below is where it is broken down.

**This file is a dated snapshot, and the task lines are the authority.** Where the two
disagree, the lines win and this file is wrong. It carries no gate — no check in
`scripts/gates.registry` reads `docs/v2/` — so it will drift, and it did: this paragraph used
to say the counts would be false the moment #107 merged, and then #107 merged and they were,
for a day, until feature 125 retook them. P0 died with that merge. Regenerate the counts with
`grep -hcE '^- \[ \] ' specs/1*/tasks.md | paste -sd+ | bc` rather than trusting the table —
`grep -c` over several files reports per file and never prints the total.

## What the unticked lines actually are

| | |
|---:|---|
| **59** | Unticked lines in `specs/1NN-*/tasks.md`, retaken at feature 125 |
| 28 | `specs/124-forecast-illustration/tasks.md` |
| 6 | `specs/113-operator-flowchart/tasks.md` |
| 4 | `specs/125-forecast-eras/tasks.md` |
| 3 | `specs/101-foundations-shell/tasks.md` |
| 3 | `specs/111-background-tab/tasks.md` |
| 3 | `specs/122-operator-actions/tasks.md` |
| 2 | `specs/106-uncertainty-planning/tasks.md` |
| 2 | `specs/110-walkthrough/tasks.md` |
| 2 | `specs/120-start-conditions/tasks.md` |
| 1 | `specs/102-synthetic-ocean/tasks.md` |
| 1 | `specs/103-sensing/tasks.md` |
| 1 | `specs/104-query-seam/tasks.md` |
| 1 | `specs/105-forecast-loop/tasks.md` |
| 1 | `specs/108-advisories/tasks.md` |
| 1 | `specs/114-operator-controls/tasks.md` |

**Retaken from the tree rather than patched.** The previous table derived a bolded total from
figures measured at `3ad5212` — 70 unticked, less 5 discharged, less 37 for feature 123, less
20 declined — and feature 125 first edited one row of it and changed the total, which left a
number that reproduced from nothing while a paragraph beside it explained that the number was
wrong. The document's own recipe gives 59, and the rows above are what it gives, per file.
What is *not* retaken is the split between work and declined: that is a judgement about 59
lines and it is the part a reader actually wants, so it is left undone and said to be undone
rather than carried forward from a count that no longer holds. Feature 123's rows are gone
because #107 merged; feature 124's 28 are the bulk of
what is left.

The V1 specs (`specs/0NN-*`) carry a further 11 unticked lines; that directory is the
archived record and is not live work.

Feature 124 is merged and partly done: 36 task lines, 8 ticked, 28 unticked. Those 28 are the
bulk of what the retaken count holds and are the first place to look for real work. This
paragraph used to say the feature was unstarted at 35 lines and not in the count; all three
were true before #107 merged and none is now.

---

## P0 — Land what is already built — **closed**

#107 merged on 3 September 2026, which is what this row was waiting for, and the row is kept
as a heading rather than deleted so that the argument above it — that most of the seventy
unticked lines were not work — still has the thing it was arguing about. Its body said the
committed artefacts held only `archive` and `nowcast`, so no model-runner change could move
them and **the forecast kernel had no snapshot regression cover at all**. Feature 125 closed
that too: every condition declares all four eras, so the analyst's and the model runner's own
bytes are in the artefacts and under `check-snapshot-drift`. Re-planted rather than assumed —
the same 5 °C shift, in the configured kernel this time, fails the gate on all four conditions.

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

**And it now runs.** The proof had been wrong since the 101–109 close-out and nothing noticed,
because nothing ran it: it was in no workflow, no gate and not in `pnpm check`. The sweep is
split out as `check-replay-markers`, appended to `scripts/gates.registry` — so the cheap half,
that every determinism-shaped test says whether it is in the proof, fires on every change at no
test-time cost, with its own planted-violation tests. (Beside 18 of the other 21, not all:
`check-schema-masters` and `check-snapshot-drift` have no planted-violation test, which is
worth knowing in a document whose closing section is about exactly that.) The half that runs the
tests is a CI step of its own, about two minutes, paid deliberately.

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
36 task lines, 8 of them ticked — this row was written when the feature was unstarted on #107
and outside the count; #107 has merged, `#/view/forecast` is on `main`, and the remaining 28
lines are the bulk of the 59.

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

### The forecast eras in the artefacts — **done, feature 125**

Taken after a reader reported ~20 s on `arriving` against the 5.3 s ADR-0041 measured for it:
the same harness on a slower machine, which is the case the byte-for-seconds trade had never
been run against. Headless Chromium, click to console, `arriving`, over three runs of each:
3.8–4.0 s → 2.2–2.5 s. Artefacts 1.73 MB → 27.7 MB.

**The blocker this row recorded was wrong about its own cause**, and the refusing test had
never been seen to fail — the second lesson in `CLAUDE.md`, at work. `holdingBack` does not
stop the scheduler, so the run sequence never reset. What was actually there: holding the
analyst back meant the scheduler's request reached nobody, the outstanding-run guard latched,
and the run opened onto a loop that never turned again. The same fault was reachable from the
Operator tab with no artefact in sight — an FR-31 violation in `main`, found by doing the work
rather than by looking for it. ADR-0041 carries the amendment; the scheduler carries a watchdog
and tick-derived run identifiers.

The forecast kernel now has the snapshot regression cover P0 said it lacked.

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
selection. `check-snapshot-drift` covered no forecast-kernel output, which a planted 5 °C shift
confirmed by passing clean. Neither was found by reading; both were found by trying to break
them.

That second one is closed by feature 125, and re-planting the same 5 °C shift is what closed
it: the gate now fails on all four conditions. Worth recording how the re-plant went, because
it nearly produced a false all-clear of its own. The first attempt patched
`kernel.ts:132` — which is inside `shift-advect-v1`, the second implementation ADR-0042 keeps
registered and that `run.json` does not select — and the gate reported **ok**, exactly as it
had before. A planted violation in code the run never reaches proves the same nothing as no
plant at all. The configured kernel is `shallow-two-layer-v1`; check which one you are in
before believing either result.

**And check the checker.** Two rounds of adversarial review produced four findings that did
not survive verification, two of them here: that `ClockStrip.tsx` arrived with feature 105
rather than 101 — an artefact of a shallow clone, where `4dd407c` is a graft boundary and
`git log --diff-filter=A` misattributes every file it touches — and that this document had
declared issue #61 discharged, which it never did. A finding is a claim about the tree too.
