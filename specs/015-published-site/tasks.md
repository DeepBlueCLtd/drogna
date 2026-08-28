---

description: "Task list for 015-published-site"
---

# Tasks: Published Site — Blog and System Documentation

**Input**: Design documents from `/specs/015-published-site/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested for this project. Each gate has tests, and each gate that can lose
its power has a seeded control fixture asserting it still catches a known violation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US4)
- Paths are exact and relative to the repository root

## Path Conventions

This feature owns `docs/` (excluding the individual records in `docs/adr/`), `site/`,
and `.github/workflows/pages.yml`. No task touches anything else.

---

## Phase 1: Setup

- [x] T001 Create `site/` with `mkdocs.yml`, `theme/`, `blog/` and `gates/`, and add MkDocs, the Material theme and its blog plugin to the `uv` workspace as a development group.
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). All four directories exist —
  `site/mkdocs.yml`, `site/overrides/` for the theme override, `site/docs/blog/` for the blog,
  and `site/gates/` with eight gates, `run_gates.py`, ten tests and three fixture trees. The
  previous note's "there is no `site/gates/`" was the stale half and is now false. The `uv`
  workspace half is done by being decided against: ADR-0010 keeps the site build outside the
  workspace, pinned transitively in `site/requirements.txt` and installed with pip, because
  build-time tooling is not bound by the workspace's configuration contract.
- [x] T002 Configure MkDocs Material in `site/mkdocs.yml`: navigation, the documentation root pointed at `docs/`, the blog plugin over `site/blog/`, and the site name `drogna` set once in a single key (FR-020).
- [x] T003 [P] Vendor every theme asset — fonts, stylesheets, scripts, diagram renderer — into `site/theme/` so that nothing is fetched from another origin at page load (FR-007).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). The property is held and, since
  2026-08-28, is held by a gate that has been watched failing: `theme.font: false` stops
  Material's Google Fonts fetch, Material's own stylesheets and scripts are emitted into the
  build, and mermaid, social cards and analytics are all excluded (ADR-0010);
  `site/tools/check_no_external_resources.py` reports zero findings over the built tree, and
  `site/gates/fixtures/external_reference/` now proves that zero means something (T009).
  Nothing is vendored into a `site/theme/` because the two assets that would go there are not
  present at all, and both absences are now *recorded decisions* rather than open points —
  which is the change since the previous note. There is no third-party diagram renderer by
  ADR-0010's PR-01 argument, and the mathematics renderer was settled on 27 August 2026 by
  deciding not to serve one: `pymdownx.arithmatex` stays configured in generic mode, no page
  may use notation while that stands, and serving a renderer later is an addition rather than
  a migration.
- [x] T004 [P] Write `docs/manifest.yaml` listing the pages PR-09 requires, each with a minimum length that distinguishes a page from a stub, and an explicit entry recording whether ADRs are published (FR-011, FR-021).
  **Done**, reconciled 2026-08-27 (long-run-01). `docs/manifest.yaml` exists at the repository root; the note this replaces looked for it under `site/docs/` and concluded there was none. `site/gates/check_manifest.py` reads it by that default and reports 0 findings over the built site; `kinds`, `stub_marker` and an `adrs` block are all present.

**Checkpoint**: The generator runs and produces an empty but complete shell.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The build command and the gate runner, which every story depends on.

- [~] T005 Write the single documented build command as a workspace script, taking the base URL as a parameter with no default hostname, and confirm the same invocation works locally and in CI (FR-002, SC-001).
  **Partial, and confirmed still partial 2026-08-28** (lane E). One build command is
  documented, in `site/README.md`, and both workflows run exactly it:
  `mkdocs build --strict --config-file site/mkdocs.yml`. It is not a workspace script and it
  takes no base URL parameter. The no-default-hostname half is met another way —
  `site/mkdocs.yml` sets no `site_url` and the site is built with relative URLs, so it serves
  correctly from any base path.
  **What genuinely remains, and the tension in it.** A `uv` workspace script would put the
  build inside the workspace, which is what ADR-0010 decided against; so "workspace script"
  and the accepted tooling decision pull in opposite directions, and closing this task as
  written would reopen an ADR. The base-URL parameter is the half with no such objection and
  no present need: nothing has yet wanted to serve the site from a base path that relative
  URLs do not already handle. Left open rather than dissolved — the requirement it serves
  (SC-001, one invocation, locally and in CI) is met, and the *mechanism* the task names is
  not.
- [x] T006 Implement `site/gates/run_gates.py` as the single entry point: discover gates, run them all, report every failure rather than stopping at the first, exit non-zero on any (FR-004).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/run_gates.py` is 215 lines and discovers `check_*.py` beside it, naming none. Run over `site/build` it executed all seven gates, continued past the one that failed, and distinguished three outcomes: clean, findings, and could-not-run — the last with its own exit code, which is what made the missing OCR engine visible rather than silent.
- [x] T007 [P] Write `site/gates/tests/test_run_gates.py` asserting that a failing gate produces a non-zero exit and that all gates run even when one fails.
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/tests/test_run_gates.py`, 244 lines, with `site/gates/fixtures/failing_gate/` supplying four gates for it to run. The whole of `site/gates/tests/` — 160 tests — passes.

**Checkpoint**: A build, and a place for gates to live.

---

## Phase 3: User Story 1 - The site exists, is published by machine, and says what it is (Priority: P1) 🎯 MVP

**Goal**: A published site with the FR-01 statement, built by workflow, hand-edited by
nobody.

**Independent Test**: Build from a clean checkout, serve locally, read the landing page;
then run the workflow on a branch and confirm the same output is pushed.

### Tests for User Story 1

- [x] T008 [P] [US1] Write `site/gates/tests/test_landing_page.py` asserting the built landing page carries the learning-harness, synthetic-data, fake-numerics statement before any other content (FR-003).
  **Done** 2026-08-28 (lane E, second pass). Written as the shape the earlier note proposed:
  `site/gates/check_landing_page.py` (discovered by `run_gates.py` with no wiring, like every
  other gate), `site/gates/fixtures/landing_page/statement_late/` as the control, and
  `site/gates/tests/test_landing_page.py` — fifteen tests, all passing.
  **The ordering is what the gate adds, and the control is what proves it.** The rule is
  stated once in the gate's docstring: in the built landing page's `<article>`, the first
  element after the page heading must carry every required phrase. The heading may come first,
  because every page on the site has one; and it is one element rather than a character budget,
  because a budget would be a number typed into a gate when the document's own structure
  already answers the question.
  **Watched failing, twice.** Moving the statement below "What it is" in `site/docs/index.md`
  and rebuilding gave three `statement-not-first` findings naming the element the statement
  landed in (`<h2>`); reverted clean. And the committed control makes the point permanent:
  `test_the_grep_this_gate_replaced_passes_the_control` asserts the old workflow grep finds
  all three phrases in the fixture, in the same file as the gate's finding on it, because
  either fact alone is not the argument.
  **The gate is a reading of FR-01, not a second opinion about it.** `REQUIRED` is checked
  against FR-01's own text in `harness-srd.md` on every run, so a reworded requirement is
  reported as `requirement-drift` rather than silently enforced in its old form — watched, with
  a probe requirements document saying "teaching rig with invented data".
  **The workflow grep is gone**, from `.github/workflows/pages.yml`, with the reason recorded
  there: two authorities over one property, and the weaker is the one somebody eventually
  satisfies. As a consequence the property is now also reported pre-merge in `ci.yml`, which
  the grep never was — `pages.yml` has no `pull_request` trigger by T012's design.
- [x] T009 [P] [US1] Write `site/gates/check_external_refs.py` and its test: parse built HTML, CSS and JavaScript for any sub-resource reference to another origin, and fail on any hit while permitting outbound hyperlinks (FR-007, SC-004).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). **The half that was missing was the
  one that mattered, and it is now closed.** The gate exists as
  `site/tools/check_no_external_resources.py` and does what the task describes — it reads built
  HTML, CSS, JavaScript, SVG and XML, looks only at the attributes and directives that cause a
  browser to fetch, permits outbound hyperlinks, and runs in both workflows before anything is
  pushed. It had no test and no control, so its zero had never been shown to mean anything.
  `site/gates/fixtures/external_reference/` is now the deliberate control: seven planted
  violations, one per pattern the gate claims to catch, plus an outbound hyperlink and two
  same-origin sub-resources that must *not* be reported.
  `site/gates/tests/test_external_resources.py` is fourteen tests over it, in pairs.
  **Watched failing, as the habit requires.** With `EXTERNAL` narrowed to a pattern that
  matches nothing, nine of the fourteen went red — including `test_the_seeded_control_fails`
  and every per-pattern assertion — and all fourteen went green again on revert. Two of the
  gate's four patterns (`css url()` and `css @import`) had never been executed against
  anything before this fixture existed. The path is `site/tools/`, not
  `site/gates/check_external_refs.py`: the file predates the gates directory, the workflow
  names it, and moving it would be a rename for the sake of the task's spelling.

### Implementation for User Story 1

- [x] T010 [US1] Write `docs/index.md`: the FR-01 statement first, then what the harness is, what it is not, and where to start reading (FR-003).
- [x] T011 [US1] Write `.github/workflows/pages.yml`: trigger on merge to `develop`, build, run the gate entry point, and push the built output to `gh-pages` only if every gate passed (FR-001, FR-004).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `.github/workflows/pages.yml` exists,
  builds, and pushes to `gh-pages` only after every gate step has passed. **The stale half was
  the gate entry point**: it exists now, and the workflow runs it — the step "Gate — the site's
  own publication gates" is `python site/gates/run_gates.py --site site/build`, placed before
  the `ghp-import` step so a finding stops the push, with the OCR engine installed just above
  it so the vocabulary gate reports rather than saying it could not run. The remaining
  difference from the task as written is the trigger: push to `main`, this repository having no
  `develop` branch — `git branch -r` lists `origin/main` and nothing else — which is the same
  branch under a different name.
- [x] T012 [US1] Restrict the workflow so a pull request from a fork cannot reach the publishing job, and record the restriction in the workflow itself as a comment naming PR-01 (FR-009).
- [x] T013 [US1] Add `robots.txt` generation declining indexing, and a test asserting it is present in the built output (FR-008).
  **Done** 2026-08-28 (lane E, second pass). Closed as the earlier note proposed:
  `site/gates/check_indexing.py`, `site/gates/fixtures/indexable_site/` as the control, and
  `site/gates/tests/test_indexing.py` — fourteen tests, all passing.
  **The gate reads every page, and that is the point.** The previous mechanism was two greps
  over `index.html` and `robots.txt`. The meta tag reaches pages through one theme override, so
  the way it fails is by ceasing to apply *somewhere* rather than everywhere — which a check of
  the landing page alone cannot see. The gate reads all 79 built pages and reports per page.
  **Watched failing three ways**, each by editing the real mechanism and rebuilding: weakening
  `site/overrides/main.html` to `content="nofollow"` gave 79 `page-indexable` findings quoting
  the directive; deleting its `extrahead` block gave 79 findings saying no tag at all; making
  `site/docs/robots.txt` say `Allow: /` gave one `robots-permissive` finding. Clean on every
  revert. The committed control is the harder case in miniature: a tree where both old greps
  pass and two of its three pages are indexable.
  **The generation half is deliberately not done, and this is the reason.** Replacing a
  committed two-line file with a hook that writes it is more machinery guarding less, and the
  file is the better artefact: it is readable in the tree, it is diffable, and mkdocs already
  copies it into the build. What the task was reaching for through "generation" was the
  assurance that the file arrives in the built output, and the gate now asserts exactly that,
  over the built tree, rather than over the source. Recorded here rather than left to be
  rediscovered as an omission.
  **Both workflow greps are gone** from `.github/workflows/pages.yml`, for the reason given
  against T008.
- [x] T014 [US1] Document in `docs/index.md` and in the workflow that `gh-pages` is machine-written and that hand edits are overwritten by the next publication (FR-001).
- [~] T015 [US1] Run the workflow on a throwaway branch publishing to a throwaway target, confirm the output matches a local build byte-for-byte, and record the check in the workflow's notes.
  **Partial, and confirmed still partial 2026-08-28** (lane E). The workflow's header comment
  records that feature branches published once, so the pipeline could be verified before a
  merge rather than after one, and what that first run replaced. It records no byte-for-byte
  comparison of the published output against a local build, which is the check this task asks
  for.
  **What is now true that weakens the need for it.** The deploy step is `ghp-import` over
  `site/build` — the directory the gates just read — with a comment saying why:
  `mkdocs gh-deploy` would rebuild first, which would mean the artefact that was checked is not
  the artefact that is published. Publishing the gated bytes rather than re-deriving them is a
  structural guarantee, and it is stronger than a comparison taken once on a throwaway branch
  and never again. The check the task names would still catch a `ghp-import` that transformed
  what it copied. Left open on those terms rather than dissolved: it needs a workflow run
  against a throwaway target, which is not something this lane can do from a checkout.

**Checkpoint**: A published site that states what it is, produced only by machine.

---

## Phase 4: User Story 2 - Nothing publishable carries what PR-01 forbids (Priority: P2)

**Goal**: A gate over the built artefact, including text inside images, that is proven to
catch a known violation.

**Independent Test**: Build and gate the real site for zero findings; build and gate the
seeded fixture and confirm it fails and names the file.

### Tests for User Story 2

- [x] T016 [P] [US2] Create `site/gates/fixtures/seeded_violation/` containing a page with a forbidden term and an image with the same term rendered into it. Document in a README that the fixture is a deliberate control (FR-006).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/fixtures/seeded_violation/` exists with the README the task asks for, and the README is deliberately outside `built/` so that it is not itself scanned. Seven controls are documented and committed, four of them images.
- [x] T017 [P] [US2] Write `site/gates/tests/test_vocabulary.py` asserting zero findings on the real built site and a named failure on the seeded fixture, for both the text path and the image path (FR-005, FR-006, SC-003).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/tests/test_vocabulary.py`, 316 lines. Both halves were exercised on this machine rather than taken on trust: the gate reports 0 findings over the real built site and 16 over the fixture, naming file and term on each.
- [x] T018 [P] [US2] Add a test asserting that a screenshot showing an address bar, a filesystem path or an email address fails the gate (spec edge cases).
  **Done**, reconciled 2026-08-27 (long-run-01). The four screenshot controls fired individually — `address-bar` on `https://drogna.invalid/console`, `host-path` on `/home/jdoe`, `personal-identifier` on an address in an image, and `tracked-entity` on two terms. This is the first run in which the image path has been executed here at all; the container had no OCR engine before one was installed for it.

### Implementation for User Story 2

- [x] T019 [US2] Implement `site/gates/check_vocabulary.py`: walk built HTML, CSS, JavaScript and assets, invoke the repository's existing forbidden-vocabulary rule set rather than restating the rules, and report file and term on any hit (FR-005).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/check_vocabulary.py`, 478 lines, walking built HTML, emitted script, CSS and assets, and reporting the zone alongside the term.
- [x] T020 [US2] Add image text extraction to the vocabulary gate, applying the same rules to text found inside published images (FR-005).
  **Done**, reconciled 2026-08-27 (long-run-01). Image text extraction is present and was watched working. It refuses rather than skips when no engine is on PATH — exit 2, naming `tesseract` — which is why its absence here was a loud failure and not a quiet pass.
- [x] T021 [US2] Add the droplet-URL rule: any deployment hostname in built output is a finding that must be acknowledged explicitly in the manifest rather than passing silently (spec edge cases).
  **Done**, reconciled 2026-08-27 (long-run-01). Split into `site/gates/check_deployment_hostnames.py` rather than folded into the vocabulary gate. It reads the hostname from `config/droplet/deployment.json` instead of restating it, and against the fixture reports both `declared-hostname` and `address-literal`, each pointing at `acknowledged_hostnames` in the manifest as the way to accept one deliberately.
- [x] T022 [US2] Wire the vocabulary gate into `run_gates.py` ahead of the publish step and confirm on a deliberately failed run that nothing is pushed (FR-004, SC-009).
  **Done**, reconciled 2026-08-27 (long-run-01). The gate is discovered by `run_gates.py` with no wiring, which is the runner's design. In `.github/workflows/pages.yml` the runner step precedes the `ghp-import` step, so a failure stops the push; and `ghp-import` publishes the directory that was gated rather than rebuilding, so what is checked is what is published.

**Checkpoint**: Nothing can reach the public branch carrying what PR-01 forbids.

---

## Phase 5: User Story 3 - The documentation area covers what a reader needs, and a gap is visible (Priority: P3)

**Goal**: Subsystem reference, derivations, standards primers and glossary, with missing
pages failing the build.

**Independent Test**: Remove a required page and confirm the build names it; check every
component identifier is accounted for.

### Tests for User Story 3

- [x] T023 [P] [US3] Write `site/gates/check_manifest.py` and its test: every page named in `docs/manifest.yaml` exists and exceeds its minimum length; a missing or stub page fails, named (FR-011, SC-002).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/check_manifest.py` (237 lines) and `site/gates/tests/test_manifest.py` (411 lines).
- [x] T024 [P] [US3] Write `site/gates/check_links.py` and its test: zero broken internal links, and a link to a repository file that is not published counts as broken (FR-019, SC-005).
  **Done** 2026-08-28 (lane E, second pass). **Closed deliberately as a control rather than
  as the gate the task names, and the difference is the substance.** There is still no
  `site/gates/check_links.py` and there should not be: a second link checker would be a second
  authority over one property, which is the argument `docs/manifest.yaml` already makes when it
  declines to restate the per-image cap. The property is held by `mkdocs build --strict` with
  `validation` raising `omitted_files`, `absolute_links`, `unrecognized_links` and `anchors`.
  What was missing was never coverage; it was evidence, and that is what has been added.
  `site/gates/fixtures/broken_link/` is a miniature site carrying **one fault per validation
  rule**, including the case this task singles out — a link to a repository file that is not
  published, written as a relative path out of the documentation tree, which resolves in an
  editor and not on the site. `site/gates/tests/test_link_validation.py` builds it and expects
  a refusal naming each fault, parametrised so a rule that stopped reporting is one named
  failure rather than a disappearance inside a single assertion about the whole log.
  **Three things keep it from proving less than it appears to.** It builds the same fixture
  *without* `--strict` and expects success, so the refusal is attributable to the flag under
  test rather than to a fixture that is simply unbuildable. It builds the fixture repaired and
  expects success, because a checker that refuses everything is no more use than one that
  refuses nothing. And it reads the `validation:` block out of both
  `site/gates/fixtures/broken_link/mkdocs.yml` and `site/mkdocs.yml` and fails if they differ —
  without which, relaxing the real site's validation would leave this control still green,
  proving that settings the site no longer uses would have caught the fault.
  **Watched failing in both directions.** Relaxing `unrecognized_links` to `ignore` in the real
  `site/mkdocs.yml` failed the drift guard. Relaxing the fixture's own block turned
  `--strict` quiet and failed the per-fault assertions for the absolute link, the dangling
  anchor and the omitted file. Green again on revert.
  **Where it runs.** mkdocs is outside the `uv` workspace (ADR-0010), so under
  `uv run pytest` nine of the eleven tests **skip loudly with the reason** and never quietly
  pass; the two that read configuration files run everywhere. `.github/workflows/ci.yml`'s
  `site` job — which installs the pinned tooling — gains a report-only step that runs them for
  real. Verified locally both ways: eleven passing under the site environment, nine skipping
  with the reason under `uv run pytest`.
- [x] T025 [P] [US3] Write `site/gates/check_glossary.py` and its test: every term in the glossary source list has a definition, every first use on a page links to it, and both directions are reported (FR-013, SC-007).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/check_glossary.py` (697 lines) and `site/gates/tests/test_glossary.py` (606 lines). It reports both directions, and prints two scope notes over the real site rather than silently excluding the pages they cover.
- [x] T026 [P] [US3] Add a subsystem coverage test asserting every component identifier from C-01 to C-18 has a page or an explicit not-yet-built entry (FR-012, SC-006).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/check_subsystem_coverage.py` and its test; 0 findings over the built site.

### Implementation for User Story 3

- [x] T027 [US3] Write `docs/glossary.md`, seeded from the oceanographic and standards vocabulary in the SRD: sound speed, thermocline, front, mesoscale eddy, decorrelation timescale, ensemble spread, persistence reference, advection, coverage, trajectory, profile, discrete sampling geometry, orienteering, H3.
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `site/docs/glossary.md` now carries
  twenty entries and covers **all fourteen** terms this task seeds it from. The four the
  previous note recorded as missing — **Trajectory**, **Profile**, **Orienteering** and
  **H3** — each have a section of their own, as does **Persistence forecast** for the SRD's
  "persistence reference". `site/gates/check_glossary.py` reports 0 findings over the built
  site, so the two pages that used *orienteering* and *H3* with nothing to link to now link to
  a definition. It prints two scope notes beside the clean result rather than excluding the
  pages silently: the generated ADR pages are out of scope for the first-use rule, and
  `blog/one-configuration-two-destinations` uses "profile" in the Compose sense from a named
  point onwards.
- [x] T028 [US3] Write `docs/architecture/overview.md`: the control loop as a flow with a loop in it, command-query separation, and the port accounting from SRD §2.1 reproduced honestly, including the boundaries that are not ports (FR-010, Constitution VI).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/docs/architecture/overview.md`, 236 lines. The note this replaces was written against `docs/architecture/`, which is not where the published tree keeps it.
- [x] T029 [US3] [P] Write the subsystem pages for the components that exist, one per identifier, each stating what it does, why it exists and what failure mode it owns; write explicit not-yet-built entries for the rest (FR-010, FR-012).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). **The previous note was itself the
  stalest thing in this feature, and it is the one the delivery plan flagged.** It said all
  eighteen pages open with `Status: not yet built`. They do not, and have not for some time:
  **sixteen open with `Status: built` and two with `Status: partly built`** (C-03 the broker
  and C-18 the browser client), each carrying the code path that delivers it, the feature that
  delivered it, what covers it, and — where the status is `partly built` — a named "Not
  present" list. Counted directly off the eighteen files on 2026-08-28. Every page is in the
  navigation and `site/gates/check_subsystem_coverage.py` reports 0 findings, so every
  identifier C-01 to C-18 is accounted for by a page rather than by an entry admitting it is
  not. The dependency note's condition — "each page states what exists rather than what is
  planned, and is revised as components land" — is what has been happening.
  One stale claim was found *inside* a page while re-reading them and is corrected in the same
  commit: C-03's "Not present" block said the broker's credential file is produced by a command
  in a README and not by the deployment's own render step, that no per-role secret exists in
  `deploy/env.template`, and that the tracked configurations carry a broker URL with no role in
  it. All three are false — `deploy/lib/render_credentials.py` writes both halves from one set
  of secrets, `deploy/env.template` declares `HARNESS_BROKER_SECRET_*` per role, and
  `config/local/ingest.json` carries `mqtt://drogna_ingest@broker:1883`. ADR-0016 records the
  path being finished. The page keeps `partly built`, because the remaining item in that block
  — no count of refused attempts reaching the telemetry topic — was checked and still holds.
- [x] T030 [US3] [P] Write `docs/algorithms/ensemble-spread.md`: what the spread is, how it is computed from perturbed members, and why it is the whole uncertainty story during cold arrival (SRD FR-07, FR-29).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `site/docs/algorithms/ensemble-spread.md`
  carries no stub marker and is 2,296 words, against the `narrative` floor of 500;
  `site/gates/check_manifest.py` reports 0 findings, and that gate fails any page matching
  `stub_marker` whatever its length, so "not a stub" is checked rather than eyeballed. The
  blocker the previous note named is gone by decision rather than by being cleared: ADR-0010
  was amended on 27 August 2026 to serve no mathematics renderer at all, and no page uses
  notation while that stands.
- [x] T031 [US3] [P] Write `docs/algorithms/advection.md`: the analytic advection of the seeded features, what noise is added, and what the model deliberately does not do (SRD FR-28).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `site/docs/algorithms/advection.md`
  carries no stub marker and is 1,790 words against the `narrative` floor of 500;
  `check_manifest.py` reports 0 findings.
- [x] T032 [US3] [P] Write `docs/algorithms/informative-path-planning.md`: uncertainty collapse along a candidate route, diminishing returns, and why the problem is treated as prize-collecting under a budget rather than as a tour (SRD FR-32, FR-35).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`).
  `site/docs/algorithms/informative-path-planning.md` carries no stub marker and is 3,029
  words against the `narrative` floor of 500; `check_manifest.py` reports 0 findings. The
  glossary entry it needed exists now, so `check_glossary.py` is clean on the page as well —
  see T027.
- [x] T033 [US3] [P] Write `docs/standards/sensorthings.md` and `docs/standards/api-edr.md`: what each standard is for, the parts used here, and the parts deliberately not used (SRD FR-16, FR-19, FR-20).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). Both are written.
  `site/docs/standards/ogc-api-edr.md` is 6,206 words — the closed list of query shapes and why
  a closed list stands in for a query language, what happens to a query once it is inside
  pygeoapi 0.20.0, and the parts of the standard deliberately not used — and
  `site/docs/standards/sensorthings.md` is 1,812 words with no stub marker.
  **The SensorThings primer is load-bearing beyond this feature.**
  `tests/integration/test_sensorthings_conformance.py` skipped for as long as it did not exist;
  it now names `site/docs/standards/sensorthings.md` in its own comment and runs, comparing
  every entity set, absent entity set, implemented option and excluded option in the served
  conformance statement against `query/conformance.md` so the two cannot disagree. Eleven tests
  pass, verified 2026-08-28. That closes the "not done" clause on `specs/008-query-layer` T058,
  which is corrected in the same commit.
- [x] T034 [US3] [P] Write `docs/standards/coveragejson.md`: what a coverage is before how it is encoded, and how a trajectory response with per-vertex timestamps appears in it (SRD FR-19, FR-20).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `site/docs/standards/coveragejson.md`
  carries no stub marker and is 1,593 words against the `narrative` floor of 500;
  `check_manifest.py` reports 0 findings.
- [x] T035 [US3] Add `docs/standards/cf-conventions.md` to the navigation and the manifest, consuming the page feature 014 authors rather than writing it here.
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `site/docs/standards/cf-conventions.md`
  was authored by feature 014 and consumed here rather than rewritten, which is what this task
  asks for; it is in the navigation, and — the half the previous note said was impossible — it
  **is** in the manifest, as `standards/cf-conventions.md: {kind: narrative}`. The manifest
  exists (T004), so the expected-and-absent mechanism the dependency note describes is no
  longer needed for this page: it is present, 1,814 words, and clears its floor.
- [x] T036 [US3] Publish `docs/adr/` under the documentation area per the manifest's recorded decision, with an index listing each record's status, and assert no published page carries a standing open-questions list (FR-021, FR-022, SC-010).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/hooks/publish_adrs.py` publishes the records and `site/gates/check_adr.py` gates them, reporting 0 findings. The manifest's `adrs` block records the decision that they are published, and `check_manifest.py` cross-checks that block against the source tree.

**Checkpoint**: A reader can understand the system from the site alone, and a gap in it
is a build failure.

---

## Phase 6: User Story 4 - One blog entry per feature, written after the feature works (Priority: P4)

**Goal**: A blog a general technical reader can follow, one entry per working feature,
with screenshots, and an honest coverage table.

**Independent Test**: Publish an entry for a completed feature; confirm it appears with
its screenshots, its front matter validates, and the coverage table's totals are right.

### Tests for User Story 4

- [x] T037 [P] [US4] Write `site/gates/check_blog.py` and its test: front matter names an existing feature directory, carries a date, and the entry references at least one committed screenshot; an entry naming a nonexistent feature fails the build (FR-014, FR-015, SC-008).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/gates/check_blog.py` (359 lines) and `site/gates/tests/test_blog.py` (239 lines).
- [x] T038 [P] [US4] Add a coverage table test asserting the published totals match the counted sets of features and entries (FR-016).
  **Done**, reconciled 2026-08-27 (long-run-01). `site/hooks/blog_coverage.py` generates the table and `test_blog.py` asserts against it in both directions — a feature left out of the table fails, under the rule name `coverage-table`.
- [x] T039 [P] [US4] Add a glossary-linking test for blog entries, on the same terms as documentation pages, since the blog's reader is assumed to know less (FR-017, FR-013).
  **Done**, reconciled 2026-08-27 (long-run-01). The glossary gate covers the blog on the same terms as documentation pages; `test_glossary.py` includes the blog cases, among them the repeated-excerpt case that would otherwise report a first use twice.

### Implementation for User Story 4

- [x] T040 [US4] Define the published screenshot location and naming convention at `site/blog/posts/images/NNN-slug/`, document that images are committed, and record the contract feature 016's curated mechanism writes against (FR-018).
- [x] T041 [US4] Write the entry template and an authoring note stating the audience: a general technical reader who has not read the SRD, problem before solution, learning stated plainly including what did not work (FR-017).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). Both artefacts the previous note
  recorded as absent now exist, at `site/authoring/blog-entry-template.md` and
  `site/authoring/README.md`, and they sit outside `site/docs/` on purpose so that a template
  is not itself published as an entry about nothing. The authoring note states the audience —
  a general technical reader who has not read the requirements document, arriving at one entry
  from somewhere else — and carries a section for each half of this task: "Problem before
  solution", with the `<!-- more -->` marker placed so the excerpt is the problem rather than
  the preamble, and "State the learning plainly, including what did not work", whose closing
  line is that an entry reporting only success is a press release. The front-matter contract is
  tabulated against the rules `check_blog.py` enforces.
- [x] T042 [US4] Write `site/blog/index.md` and generate the coverage table of features against entries at build time (FR-016).
  **Done**, re-reconciled 2026-08-28 (lane E, `claude/evidence-reconciliation`). `site/docs/blog/index.md` exists and
  now carries the table, generated at build time: `site/hooks/blog_coverage.py` replaces the
  `<!-- generated: feature coverage table -->` marker with a row per feature directory against
  the entries whose front matter names it, so adding a feature or an entry changes the page
  with no edit to it. Read out of the built `blog/index.html` on 2026-08-28, it lists twenty
  feature directories and says **"no entry yet"** in the rows that have none — which is the gap
  FR-016 exists to make visible, and it is now visible on the page rather than only in this
  file. `site/gates/tests/test_blog.py` asserts the table in both directions under the rule
  name `coverage-table`.
- [x] T043 [US4] Write the first entry for a feature that works, exercising the whole path end to end including committed screenshots from feature 016 (FR-014, FR-015).

---

## Phase 7: Polish and Cross-Cutting Concerns

- [x] T044 [P] Add a build-time size budget for published images and fail the build when an image exceeds it, so the repository does not accumulate screenshots.
  **Done** 2026-08-27 (long-run-01). `site/gates/check_image_budget.py`, discovered by the
  runner like every other gate. Two bounds, because the task's stated purpose — "does not
  accumulate" — is a property of the set and a per-image cap alone would be satisfied by
  fifty legal images. The per-image cap is *read* from `curated.maximum_bytes` in the
  destinations' `capture.json` rather than restated, since the curated mechanism is the only
  one that commits an image; the destinations disagreeing about it is itself a finding, and
  the gate refuses to run rather than defaulting if none declares it. The total is declared
  as `images.total_bytes` in `docs/manifest.yaml`, floor derived from the committed corpus
  and re-derived by `site/gates/tests/test_image_budget.py` so it cannot be lowered onto
  whatever is on disk. Watched failing on the real built site both ways: one 2.1 MB image
  reported `oversized`, nine 400 KB images — none individually illegal — reported
  `over-budget` at 4,385,653 against 4,000,000, and both went clean on revert.
- [x] T045 [P] Add the whole gate suite to the pull-request workflow in report-only mode, so a contributor sees a failure before merge rather than at publication.
  **Done** 2026-08-27 (long-run-01). A third job in `.github/workflows/ci.yml`, alongside
  `checks` and `client` and separate for the same reason: mkdocs is outside the uv workspace
  (ADR-0010) and a site failure should be told apart from a Python one at a glance. It
  installs the same pinned set `pages.yml` installs, and the OCR engine, so the vocabulary
  gate reports rather than saying it could not run.
  **Report-only is not `continue-on-error`, and finding that out cost a CI round.** The first
  shape used the flag; the gate ran, found the planted violation, exited 1 — and GitHub
  reported the step's *conclusion* as success, which is exactly what the flag is for. The
  checks list showed the job green with four findings in its log, which is worse than not
  running the gates: a check seen to pass while failing. Both steps now write their output
  to the job summary, emit `::warning::` annotations and exit 0 themselves. Watched on a real
  run: `##[warning]check_vocabulary: see the job summary for what it reported`, job green,
  workflow status unchanged. Annotations come from the runner's closing block rather than
  from finding-shaped lines in the body — several gates print scope notes beside a clean
  result, and grepping the body annotated thirteen things on a run with four findings.
- [x] T046 Record in `site/README.md` that `docs/` is source and `site/` is presentation, who owns which page, and that `gh-pages` is machine-written.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks all four stories.
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on US1, because it gates the artefact US1 publishes. In
  practice T016 to T019 can be written alongside US1 and wired in at T022.
- **US3 (Phase 5)**: depends on Foundational only; independent of US1 and US2 until
  publication.
- **US4 (Phase 6)**: depends on US3 for the glossary link check, and on feature 016 for
  the screenshots in T043.
- **Polish (Phase 7)**: depends on the stories being delivered.

### External Dependencies

- T035 consumes `docs/standards/cf-conventions.md` from feature 014. Until that page
  exists the manifest entry marks it as expected-and-absent, which the manifest gate
  reports as a gap rather than a failure.
- T040 defines the contract feature 016 writes against; T043 needs 016's curated
  mechanism to have produced at least one committed image.
- The subsystem pages in T029 describe components other features build. Each page states
  what exists rather than what is planned, and is revised as components land.

### Within Each User Story

- Gates and their tests before the content they gate.
- The manifest before the pages it names, so a page is written against a declared
  expectation.
- The glossary before the pages that link into it.

### Parallel Opportunities

- T003 and T004 in Setup.
- T008 and T009 in US1.
- T016 to T018 in US2.
- T023 to T026, and T029 to T034, in US3: separate files throughout, and the
  documentation pages are the largest parallel block in this feature.
- T037 to T039 in US4.

---

## Parallel Example: User Story 3

```bash
# The documentation pages are independent files and can be written concurrently:
Task: "Write docs/algorithms/ensemble-spread.md"
Task: "Write docs/algorithms/advection.md"
Task: "Write docs/algorithms/informative-path-planning.md"
Task: "Write docs/standards/sensorthings.md and docs/standards/api-edr.md"
Task: "Write docs/standards/coveragejson.md"
Task: "Write the subsystem pages for the components that exist"
```

---

## Implementation Strategy

### MVP first

1. Phases 1 and 2, then Phase 3: a published site carrying the FR-01 statement.
2. Immediately after, Phase 4: the gates, before the site accumulates content that has
   never been scanned.

### Incremental delivery

US1 publishes. US2 makes publishing safe. US3 fills the reference material. US4 adds the
blog. Each is demonstrable without the next, and the site is presentable at every step
because a missing page is declared rather than hidden.

### Notes

- The seeded violation fixture is a deliberate control and its README says so. A run in
  which it is not caught is a gate failure, not a pass.
- The site is named `drogna` (SRD §1.2) and the name is set in one key. It is a coined
  word with no meaning and no connection to the domain, which is what makes it
  compatible with PR-01; no page glosses it or expands it into anything.
- The site keeps no standing list of open questions (FR-022). The SRD's §11 is a work
  queue whose answers land in requirements, and the documentation follows that
  discipline: a resolved question is found as a requirement or an ADR.
- The blog's audience is stated in the authoring note, not implied. An entry that would
  need the SRD beside it to make sense has not met PR-07.

---

## Outcome

### Reconciled against the tree, 2026-08-27

**7 of 46 ticked, 19 partial, 20 not done.** This file claimed nothing had been done. The
site is real, is live, and is published only by machine — but this feature is the least
finished of the sixteen, and the previous record was closer to the truth here than anywhere
else. Every mark below was checked against a path or against the check that covers the
behaviour.

**Where the site stands.** US1 is delivered: `site/` builds with MkDocs Material,
`.github/workflows/pages.yml` publishes to `gh-pages` on a push to `main` and nowhere else,
the landing page carries the FR-01 statement first, indexing is declined twice over, and no
page fetches anything from another origin — `site/tools/check_no_external_resources.py`
reports zero findings over the built tree and runs before every push. US3's shape is there:
eighteen subsystem pages, four algorithm pages, five standards pages, a glossary and a blog
with nine entries and one committed screenshot.

**The two things a reader should know before trusting the published site.**

1. **Every subsystem page says the component does not exist.** All eighteen open with
   `Status: not yet built` — "No code for this component exists." That was true the day they
   were written and is false for all eighteen now. A reader arriving at the site is told the
   harness has not been built. This is T029, and it is the single most misleading thing in
   the repository.
2. **Four of the five derivation and primer pages are explicit stubs.** Ensemble spread,
   advection, informative path planning and SensorThings each say so in a warning admonition
   at the top and then list what the page will cover. Only `ogc-api-edr.md` and
   `cf-conventions.md` are written, and the second was authored by feature 014.

**US2 does not exist at all.** There is no `site/gates/` directory, no gate runner, no
vocabulary gate over the built artefact, no image text extraction, no droplet-URL rule, and
no seeded violation fixture. Nine tasks — T006, T007, T016 to T022 — have nothing behind
them. The source is covered by the repository's own
`scripts/check_forbidden_vocabulary.py`, which scans `site/docs/*.md` because `.md` is in
its suffix list; the built output, its assets and everything the theme emits are scanned by
nothing. The one gate that does exist has no test and no control, so it has never been
watched failing.

**The manifest is the keystone that was never laid.** `docs/manifest.yaml` does not exist
(T004), so there is no declaration of which pages are required, no minimum length that
separates a page from a stub, and no recorded decision on whether ADRs are published. Four
further tasks depend on it and are open for that reason. Had it existed, the stub pages above
would have failed the build the day a component landed, which is exactly what FR-011 and
SC-002 were for.

**`docs/adr/` is not published** (T036). Thirteen records, none of them on the site.
`site/README.md` describes `site/docs/decisions/` as "ADR drafts awaiting promotion to
`docs/adr/`", which is the opposite direction to the task.

**Paths that moved, where the tick or the reason is about the thing rather than the
spelling.** The documentation source is `site/docs/`, not the repository's `docs/`, which is
ADRs and architecture notes; the theme override is `site/overrides/`, not `site/theme/`; the
blog is `site/docs/blog/`, not `site/blog/`; the EDR primer is `standards/ogc-api-edr.md`,
not `api-edr.md`; and published screenshots are `site/docs/blog/assets/<feature>-<slug>.png`
rather than `site/blog/posts/images/NNN-slug/`. T040's convention is the one that matters,
because feature 016 writes against it: it is recorded in `site/README.md` and in ADR-0010's
open points, and `003-shell-all-dark.png` carries the `.provenance.json` sidecar that 016
established. That image predates the provenance convention and was re-taken under it, which
is why the sidecar exists beside a file older than the mechanism that now produces it.

**Blog entries written by other features.** Nine entries are published and only one of them
belongs to this feature — `taking-a-requirements-document-apart`, whose front matter names
`specs/015-published-site`. The rest were written by the features they describe, under the
convention T040 and T041 set. They are evidence that the convention works, not that this
feature's tasks were done; T037 to T039 gate none of them.

### Correction, 2026-08-28 — the block above is kept, and four of its claims are now false

**Appended, not rewritten.** The 27 August block stays exactly as it was written, because a
reconciliation that edits itself afterwards stops being evidence of what was believed at the
time. What follows is what the tree said when the same questions were asked again on
28 August 2026, by lane E of wave 6 (`claude/evidence-reconciliation`), with the site built
under `--strict` and all eight gates run over `site/build` before and after.

**The count. 46 of 46 accounted for: 41 ticked, 5 partial, none unticked.** Nineteen tasks
carried `[~]` on the morning of the 28th. Fourteen were re-checked against the built site and
found done; five are genuinely partial and each now records what specifically remains and why
it was not taken here. The per-task notes are the detail; this is the summary.

**Four claims in the block above are now false, and one was false when it was written.**

1. **"Every subsystem page says the component does not exist."** No. Sixteen of the eighteen
   open with `Status: built` and two with `Status: partly built`. This was the claim the
   delivery plan singled out as stale, and counting the files confirms it: the pages were
   revised as the components landed, which is what the feature's own dependency note asked
   for. T029 is ticked.
2. **"US2 does not exist at all."** It does, and it did on 27 August: `site/gates/` carries
   eight gates, `run_gates.py`, ten test files and three fixture trees. This is the claim
   that was **already contradicted by the per-task notes above it** on the day it was
   written — T016 to T022 were each marked done, with paths and line counts, in the same
   pass. Where a per-task note and this block disagreed, the per-task note was right.
   `docs/architecture/delivery-plan.md` records that instruction and it held.
3. **"The manifest is the keystone that was never laid."** `docs/manifest.yaml` exists at the
   repository root, and the block's own T004 note says so. Four gates read it. It declares the
   required pages, a stub marker, a per-kind word floor with the derivation each floor is
   bounded by, the acknowledged-hostname list, the blog's screenshot allowance and the image
   budget.
4. **"`docs/adr/` is not published."** It is, by `site/hooks/publish_adrs.py`, under
   `decisions/adr/`, with the index's statuses read out of the records rather than retyped.
   `site/gates/check_adr.py` reports 0 findings and checks the manifest's recorded decision
   against the build in both directions.

**"Four of the five derivation and primer pages are explicit stubs"** is the one claim that was
true and has since been made false by work rather than by re-reading. All five are written —
ensemble spread, advection, informative path planning, SensorThings and CoverageJSON — none
carries the stub marker, and each clears the `narrative` floor of 500 words with the shortest
at 1,593. The blocker recorded behind them is settled too, and settled by deciding not to do
it: ADR-0010 was amended on 27 August to serve no mathematics renderer, so no page uses
notation and the derivations are prose.

**What genuinely remains, in one place.** T005 (a workspace build script, which pulls against
ADR-0010, and a base-URL parameter nothing needs yet), T008 (nothing asserts the landing
statement comes *first*), T013 (`robots.txt` is committed rather than generated, and its
presence is a workflow grep rather than a test), T015 (no byte-for-byte comparison of the
published output against a local build), T024 (no `site/gates/check_links.py`; `--strict`
holds the property and has never been watched rejecting a broken link). T008, T013 and T024
are the same shape of gap — a property that holds, asserted somewhere weaker than a gate with
a control — and the shape of the fix is the same for all three.

**PR-08's gap is closed: every delivered feature now has an entry.** The coverage table was
showing ten entries against eight of the sixteen delivered features, and "no entry yet" in the
other eight rows. Seven entries were written for 006, 007, 008, 011, 012, 013 and 014 — the
delivered features that had none — and the regenerated table now shows an entry for every
feature from 001 to 016. The four rows still reading "no entry yet" are 009, which is not live
in the composed stack, and 017 to 020, which are specified and not built; each is a feature
with nothing yet to write an entry about, which is the state FR-016's table exists to show.
None of the seven carries an image and each has its own recorded reason in
`docs/manifest.yaml`: only two curated captures have ever been committed, both of the
component shell at moments belonging to features 001 and 003, and the curated mechanism is
gated on human review. Five of the seven name the condition that would end the allowance.

**What lane E changed while re-reconciling, rather than only recorded.**

- `site/gates/fixtures/external_reference/` and `site/gates/tests/test_external_resources.py`:
  the deliberate control and the fourteen tests that close T009. The external-resource gate is
  the oldest here and had never been watched failing; two of its four patterns had never been
  executed against anything. Neutering `EXTERNAL` turned nine of the fourteen red, including
  every per-pattern assertion, and revert turned all fourteen green.
- `site/docs/subsystems/c03-broker.md`: its "Not present" block claimed the broker's
  credential render step did not exist. It does — ADR-0016 — and the three specifics were each
  checked and found false. Corrected in place, with the one item in that block that still
  holds left standing, so the page keeps `partly built`.
- `site/docs/subsystems/c10-reverse-proxy.md` and `c03-broker.md`: the control upgrade's
  `auth_basic` exemption and the world-readable viewer credential are now described as the
  intended boundary, following ADR-0020 moving from proposed to accepted.

**How this was checked, so the next reconciliation can repeat it rather than trust it.**
`mkdocs build --strict --config-file site/mkdocs.yml`, then
`python site/gates/run_gates.py --site site/build` with `tesseract` installed so the
vocabulary gate reads the images rather than refusing — all eight gates clean, before any
change and again after. Word counts by `wc -w` over the sources; page statuses by reading the
admonition at the head of each of the eighteen subsystem files; the coverage table read out of
the built `blog/index.html` rather than the source; `tests/integration/test_sensorthings_conformance.py`
run to confirm it no longer skips.

### Second correction, 2026-08-28 — three of the five remaining partials are closed

**Appended, not rewritten**, on the same terms as the block above it.

The correction above grouped T008, T013 and T024 as "the same shape of gap in three places:
a property that genuinely holds, asserted somewhere weaker than a gate with a control", and
left them because that pass's remit was reconciliation rather than new gates. They are now
closed, and the grouping turned out to be right — all three wanted the same thing and none
of them wanted what its task text literally asked for.

**44 of 46 ticked, 2 partial, none unticked.** T005 and T015 remain, for the reasons each
records: T005's workspace script pulls against ADR-0010 and its base-URL parameter has no
present need; T015 needs a workflow run against a throwaway target, which a checkout cannot
do.

**What was added.** Two gates, two committed controls, three test files, 40 tests.

| Gate | Control | Tests | What it adds over the mechanism it replaces |
|---|---|---|---|
| `check_landing_page.py` | `fixtures/landing_page/statement_late/` | `test_landing_page.py`, 15 | the statement must be **first**, which a grep for three phrases anywhere could not see |
| `check_indexing.py` | `fixtures/indexable_site/` | `test_indexing.py`, 14 | **every** built page, not `index.html`; the override fails by ceasing to apply somewhere |
| — (`mkdocs --strict`) | `fixtures/broken_link/` | `test_link_validation.py`, 11 | evidence that `--strict` rejects, without a second link checker |

`site/gates/run_gates.py` discovers the two new gates with no wiring, which is the runner's
design: ten gates now run over `site/build`, all clean.

**Each control is built so that the mechanism it replaced passes it.** That is the property
that makes it a control rather than a fixture. `test_the_grep_this_gate_replaced_passes_the_control`
and `test_both_greps_this_gate_replaced_pass_the_control` assert exactly that, in the same
files as the gates' findings on the same trees, because either fact alone is not the
argument for the gate existing.

**T024 is closed as a control and not as the gate it names**, deliberately. Writing
`site/gates/check_links.py` would put a second authority over a property `mkdocs --strict`
already holds. The task's own text is the weaker artefact here, and the note against it now
says so rather than dissolving the disagreement: what was missing was never coverage, it was
that nobody had watched `--strict` reject anything, so a `validation:` block relaxed to
`ignore` would have left every build green with broken links published.

**Two workflow steps were deleted, and this is the part worth watching.** The landing-page
and indexing greps in `.github/workflows/pages.yml` are gone, because keeping them beside
the gates would be two authorities over one property and the weaker is the one somebody
eventually satisfies. A comment where they were records what replaced them. One consequence
is a gain rather than a trade: `pages.yml` has no `pull_request` trigger by T012's design,
so those two properties were never reported before a merge; they are now, through the
gate runner that `ci.yml` already ran.

**Everything above was watched failing before it was believed.** The landing statement moved
below a section of prose (3 findings, naming `<h2>`); the theme override weakened to
`nofollow` and then deleted (79 findings each); `robots.txt` made permissive (1 finding); the
real site's `validation:` block relaxed (drift guard red); the fixture's own block relaxed
(`--strict` quiet, per-fault assertions red). Every one reverted clean, and
`git diff --stat` confirmed each revert was complete rather than assumed.

