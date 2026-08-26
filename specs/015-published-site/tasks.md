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

- [ ] T001 Create `site/` with `mkdocs.yml`, `theme/`, `blog/` and `gates/`, and add MkDocs, the Material theme and its blog plugin to the `uv` workspace as a development group.
- [ ] T002 Configure MkDocs Material in `site/mkdocs.yml`: navigation, the documentation root pointed at `docs/`, the blog plugin over `site/blog/`, and the site name `drogna` set once in a single key (FR-020).
- [ ] T003 [P] Vendor every theme asset — fonts, stylesheets, scripts, diagram renderer — into `site/theme/` so that nothing is fetched from another origin at page load (FR-007).
- [ ] T004 [P] Write `docs/manifest.yaml` listing the pages PR-09 requires, each with a minimum length that distinguishes a page from a stub, and an explicit entry recording whether ADRs are published (FR-011, FR-021).

**Checkpoint**: The generator runs and produces an empty but complete shell.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The build command and the gate runner, which every story depends on.

- [ ] T005 Write the single documented build command as a workspace script, taking the base URL as a parameter with no default hostname, and confirm the same invocation works locally and in CI (FR-002, SC-001).
- [ ] T006 Implement `site/gates/run_gates.py` as the single entry point: discover gates, run them all, report every failure rather than stopping at the first, exit non-zero on any (FR-004).
- [ ] T007 [P] Write `site/gates/tests/test_run_gates.py` asserting that a failing gate produces a non-zero exit and that all gates run even when one fails.

**Checkpoint**: A build, and a place for gates to live.

---

## Phase 3: User Story 1 - The site exists, is published by machine, and says what it is (Priority: P1) 🎯 MVP

**Goal**: A published site with the FR-01 statement, built by workflow, hand-edited by
nobody.

**Independent Test**: Build from a clean checkout, serve locally, read the landing page;
then run the workflow on a branch and confirm the same output is pushed.

### Tests for User Story 1

- [ ] T008 [P] [US1] Write `site/gates/tests/test_landing_page.py` asserting the built landing page carries the learning-harness, synthetic-data, fake-numerics statement before any other content (FR-003).
- [ ] T009 [P] [US1] Write `site/gates/check_external_refs.py` and its test: parse built HTML, CSS and JavaScript for any sub-resource reference to another origin, and fail on any hit while permitting outbound hyperlinks (FR-007, SC-004).

### Implementation for User Story 1

- [ ] T010 [US1] Write `docs/index.md`: the FR-01 statement first, then what the harness is, what it is not, and where to start reading (FR-003).
- [ ] T011 [US1] Write `.github/workflows/pages.yml`: trigger on merge to `develop`, build, run the gate entry point, and push the built output to `gh-pages` only if every gate passed (FR-001, FR-004).
- [ ] T012 [US1] Restrict the workflow so a pull request from a fork cannot reach the publishing job, and record the restriction in the workflow itself as a comment naming PR-01 (FR-009).
- [ ] T013 [US1] Add `robots.txt` generation declining indexing, and a test asserting it is present in the built output (FR-008).
- [ ] T014 [US1] Document in `docs/index.md` and in the workflow that `gh-pages` is machine-written and that hand edits are overwritten by the next publication (FR-001).
- [ ] T015 [US1] Run the workflow on a throwaway branch publishing to a throwaway target, confirm the output matches a local build byte-for-byte, and record the check in the workflow's notes.

**Checkpoint**: A published site that states what it is, produced only by machine.

---

## Phase 4: User Story 2 - Nothing publishable carries what PR-01 forbids (Priority: P2)

**Goal**: A gate over the built artefact, including text inside images, that is proven to
catch a known violation.

**Independent Test**: Build and gate the real site for zero findings; build and gate the
seeded fixture and confirm it fails and names the file.

### Tests for User Story 2

- [ ] T016 [P] [US2] Create `site/gates/fixtures/seeded_violation/` containing a page with a forbidden term and an image with the same term rendered into it. Document in a README that the fixture is a deliberate control (FR-006).
- [ ] T017 [P] [US2] Write `site/gates/tests/test_vocabulary.py` asserting zero findings on the real built site and a named failure on the seeded fixture, for both the text path and the image path (FR-005, FR-006, SC-003).
- [ ] T018 [P] [US2] Add a test asserting that a screenshot showing an address bar, a filesystem path or an email address fails the gate (spec edge cases).

### Implementation for User Story 2

- [ ] T019 [US2] Implement `site/gates/check_vocabulary.py`: walk built HTML, CSS, JavaScript and assets, invoke the repository's existing forbidden-vocabulary rule set rather than restating the rules, and report file and term on any hit (FR-005).
- [ ] T020 [US2] Add image text extraction to the vocabulary gate, applying the same rules to text found inside published images (FR-005).
- [ ] T021 [US2] Add the droplet-URL rule: any deployment hostname in built output is a finding that must be acknowledged explicitly in the manifest rather than passing silently (spec edge cases).
- [ ] T022 [US2] Wire the vocabulary gate into `run_gates.py` ahead of the publish step and confirm on a deliberately failed run that nothing is pushed (FR-004, SC-009).

**Checkpoint**: Nothing can reach the public branch carrying what PR-01 forbids.

---

## Phase 5: User Story 3 - The documentation area covers what a reader needs, and a gap is visible (Priority: P3)

**Goal**: Subsystem reference, derivations, standards primers and glossary, with missing
pages failing the build.

**Independent Test**: Remove a required page and confirm the build names it; check every
component identifier is accounted for.

### Tests for User Story 3

- [ ] T023 [P] [US3] Write `site/gates/check_manifest.py` and its test: every page named in `docs/manifest.yaml` exists and exceeds its minimum length; a missing or stub page fails, named (FR-011, SC-002).
- [ ] T024 [P] [US3] Write `site/gates/check_links.py` and its test: zero broken internal links, and a link to a repository file that is not published counts as broken (FR-019, SC-005).
- [ ] T025 [P] [US3] Write `site/gates/check_glossary.py` and its test: every term in the glossary source list has a definition, every first use on a page links to it, and both directions are reported (FR-013, SC-007).
- [ ] T026 [P] [US3] Add a subsystem coverage test asserting every component identifier from C-01 to C-18 has a page or an explicit not-yet-built entry (FR-012, SC-006).

### Implementation for User Story 3

- [ ] T027 [US3] Write `docs/glossary.md`, seeded from the oceanographic and standards vocabulary in the SRD: sound speed, thermocline, front, mesoscale eddy, decorrelation timescale, ensemble spread, persistence reference, advection, coverage, trajectory, profile, discrete sampling geometry, orienteering, H3.
- [ ] T028 [US3] Write `docs/architecture/overview.md`: the control loop as a flow with a loop in it, command-query separation, and the port accounting from SRD §2.1 reproduced honestly, including the boundaries that are not ports (FR-010, Constitution VI).
- [ ] T029 [US3] [P] Write the subsystem pages for the components that exist, one per identifier, each stating what it does, why it exists and what failure mode it owns; write explicit not-yet-built entries for the rest (FR-010, FR-012).
- [ ] T030 [US3] [P] Write `docs/algorithms/ensemble-spread.md`: what the spread is, how it is computed from perturbed members, and why it is the whole uncertainty story during cold arrival (SRD FR-07, FR-29).
- [ ] T031 [US3] [P] Write `docs/algorithms/advection.md`: the analytic advection of the seeded features, what noise is added, and what the model deliberately does not do (SRD FR-28).
- [ ] T032 [US3] [P] Write `docs/algorithms/informative-path-planning.md`: uncertainty collapse along a candidate route, diminishing returns, and why the problem is treated as prize-collecting under a budget rather than as a tour (SRD FR-32, FR-35).
- [ ] T033 [US3] [P] Write `docs/standards/sensorthings.md` and `docs/standards/api-edr.md`: what each standard is for, the parts used here, and the parts deliberately not used (SRD FR-16, FR-19, FR-20).
- [ ] T034 [US3] [P] Write `docs/standards/coveragejson.md`: what a coverage is before how it is encoded, and how a trajectory response with per-vertex timestamps appears in it (SRD FR-19, FR-20).
- [ ] T035 [US3] Add `docs/standards/cf-conventions.md` to the navigation and the manifest, consuming the page feature 014 authors rather than writing it here.
- [ ] T036 [US3] Publish `docs/adr/` under the documentation area per the manifest's recorded decision, with an index listing each record's status, and assert no published page carries a standing open-questions list (FR-021, FR-022, SC-010).

**Checkpoint**: A reader can understand the system from the site alone, and a gap in it
is a build failure.

---

## Phase 6: User Story 4 - One blog entry per feature, written after the feature works (Priority: P4)

**Goal**: A blog a general technical reader can follow, one entry per working feature,
with screenshots, and an honest coverage table.

**Independent Test**: Publish an entry for a completed feature; confirm it appears with
its screenshots, its front matter validates, and the coverage table's totals are right.

### Tests for User Story 4

- [ ] T037 [P] [US4] Write `site/gates/check_blog.py` and its test: front matter names an existing feature directory, carries a date, and the entry references at least one committed screenshot; an entry naming a nonexistent feature fails the build (FR-014, FR-015, SC-008).
- [ ] T038 [P] [US4] Add a coverage table test asserting the published totals match the counted sets of features and entries (FR-016).
- [ ] T039 [P] [US4] Add a glossary-linking test for blog entries, on the same terms as documentation pages, since the blog's reader is assumed to know less (FR-017, FR-013).

### Implementation for User Story 4

- [ ] T040 [US4] Define the published screenshot location and naming convention at `site/blog/posts/images/NNN-slug/`, document that images are committed, and record the contract feature 016's curated mechanism writes against (FR-018).
- [ ] T041 [US4] Write the entry template and an authoring note stating the audience: a general technical reader who has not read the SRD, problem before solution, learning stated plainly including what did not work (FR-017).
- [ ] T042 [US4] Write `site/blog/index.md` and generate the coverage table of features against entries at build time (FR-016).
- [ ] T043 [US4] Write the first entry for a feature that works, exercising the whole path end to end including committed screenshots from feature 016 (FR-014, FR-015).

---

## Phase 7: Polish and Cross-Cutting Concerns

- [ ] T044 [P] Add a build-time size budget for published images and fail the build when an image exceeds it, so the repository does not accumulate screenshots.
- [ ] T045 [P] Add the whole gate suite to the pull-request workflow in report-only mode, so a contributor sees a failure before merge rather than at publication.
- [ ] T046 Record in `site/README.md` that `docs/` is source and `site/` is presentation, who owns which page, and that `gh-pages` is machine-written.

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
