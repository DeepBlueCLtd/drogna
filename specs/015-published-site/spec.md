> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Feature Specification: Published Site — Blog and System Documentation

**Feature Branch**: `015-published-site`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD PR-06 to PR-09, bound hard by PR-01 (public but unadvertised; no customer name, project name or bid-specific material anywhere, including the blog), and FR-01 (the landing page states plainly what this is).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The site exists, is published by machine, and says what it is (Priority: P1)

The `gh-pages` branch carries a built site. Nobody hand-edits that branch; a workflow
builds it from the documentation and blog sources on `develop` and pushes the result.
The first thing a visitor reads is a plain statement that this is a learning harness
with synthetic data and fake numerics, so nobody arriving from a stray link mistakes it
for a candidate system.

**Why this priority**: Publishing is the mechanism everything else in this feature
travels on, and the statement in FR-01 is the one piece of content that must be present
from the first publication rather than added once there is something to be misread.

**Independent Test**: Run the build from a clean checkout, serve the output locally,
and confirm the landing page carries the statement and the navigation resolves. Then
run the workflow on a branch and confirm it produces the same output and pushes it.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** the documented single build command runs,
   **Then** a complete site is produced with no manual step and no network fetch of
   content.
2. **Given** a merge to `develop`, **When** the publishing workflow runs, **Then** it
   builds the site, runs the publication gates, and pushes the built output to
   `gh-pages`; if any gate fails, nothing is pushed.
3. **Given** the published site, **When** the landing page is loaded, **Then** it states
   in plain words that this is a learning harness, that its data is synthetic and its
   numerics deliberately fake, before any other content.
4. **Given** the published site, **When** any page is loaded, **Then** it issues no
   request to a host outside its own origin.
5. **Given** someone with write access, **When** they attempt to commit directly to
   `gh-pages`, **Then** the workflow's next publication overwrites it, and the branch is
   documented as machine-owned so hand edits are known to be temporary.

---

### User Story 2 - Nothing publishable carries what PR-01 forbids (Priority: P2)

Before anything reaches `gh-pages`, the built output is scanned: the HTML, the assets,
and the text visible inside screenshots. A customer name, a project name, a bid
reference, a personal identifier or a host path in any of them stops the publication.
The gate is exercised against a deliberately seeded violation on every run, so a gate
that has stopped working is visible rather than quietly green.

**Why this priority**: A publication is public the moment it happens and stays in the
branch's history afterwards. Every other story in this feature adds content that this
gate has to cover, so the gate must precede the content rather than follow it.

**Independent Test**: Build the site, run the gate, and confirm zero findings. Inject a
fixture page carrying a seeded violation and confirm the gate stops the publication and
names the file.

**Acceptance Scenarios**:

1. **Given** a built site, **When** the vocabulary gate runs over built HTML, built CSS
   and JavaScript, and all published assets, **Then** it reports zero findings.
2. **Given** a fixture page carrying a seeded forbidden term, **When** the gate runs,
   **Then** it fails, names the file and the term, and the workflow pushes nothing.
3. **Given** a published screenshot whose image contains readable text, **When** the
   gate runs, **Then** the text extracted from the image is scanned on the same terms as
   page text, and a screenshot showing a host path, a URL bar or an address fails.
4. **Given** the built output, **When** it is inspected for sub-resource references,
   **Then** no stylesheet, font, script, image or analytics endpoint is loaded from
   another origin.
5. **Given** the published site, **When** a crawler requests it, **Then** it finds a
   directive declining indexing, because unadvertised means not indexed as well as not
   promoted.

---

### User Story 3 - The documentation area covers what a reader needs, and a gap is visible (Priority: P3)

A reader who wants to understand the system finds a subsystem reference explaining what
each component does and why, derivations for the mathematics that is not obvious
(ensemble spread, advection, informative path planning), primers on the four standards
the system leans on, and a glossary, because half the vocabulary is oceanographic and
the reader is not assumed to have it. A page that has been promised but not written
shows as missing rather than as absent.

**Why this priority**: This is the bulk of the reading matter and it accrues as features
land, so it needs a structure that tolerates being incomplete and says so, rather than a
structure that silently omits what has not been written yet.

**Independent Test**: Build the site with one required page removed and confirm the
build reports it as missing; check that every component identifier in the SRD's
component table has a subsystem page or an explicit "not yet built" entry.

**Acceptance Scenarios**:

1. **Given** the documentation manifest listing the pages PR-09 requires, **When** the
   site builds, **Then** a page named in the manifest that is missing or is a stub below
   the declared length fails the build and is named.
2. **Given** the subsystem reference, **When** it is read against the SRD's component
   table, **Then** every component identifier from C-01 to C-18 is accounted for, either
   with a page or with an explicit statement that it is not yet built.
3. **Given** any documentation page, **When** it uses an oceanographic or
   standards-specific term for the first time, **Then** that term is in the glossary and
   the page links to it.
4. **Given** the standards area, **When** it is read, **Then** it carries primers on
   SensorThings, API-EDR, CF conventions and CoverageJSON, the last of which explains
   what a coverage is before explaining how it is encoded.
5. **Given** the algorithms area, **When** it is read, **Then** ensemble spread,
   advection and informative path planning each carry a derivation a reader can follow
   without the code beside them.
6. **Given** the whole site, **When** the link checker runs, **Then** it reports zero
   broken internal links.

---

### User Story 4 - One blog entry per feature, written after the feature works (Priority: P4)

Each feature that works gets one entry, written for a general technical reader who does
not know this system: what the problem was, what was built, what it looks like running,
and what was learnt, with screenshots. The entries are readable by someone the author
would be content to have as an audience, which means they explain rather than gesture,
and they do not assume the reader has read the SRD.

**Why this priority**: The blog is the part of this feature the SRD places below the
line in delivery priority. It also depends on features existing and working, so it
cannot lead. It is the reason the rest of the feature exists, but it is the last part
that can be built.

**Independent Test**: Publish an entry for a completed feature and confirm it appears in
the index with its screenshots, that its front matter names the feature, and that the
coverage table shows which features have entries and which do not.

**Acceptance Scenarios**:

1. **Given** an entry, **When** it is built, **Then** it carries front matter naming the
   feature directory it describes, a publication date in the site's own terms, and at
   least one screenshot.
2. **Given** an entry naming a feature directory that does not exist, **When** the site
   builds, **Then** the build fails.
3. **Given** the set of feature directories and the set of entries, **When** the site
   builds, **Then** it publishes a coverage table showing which features have entries,
   so the gap is stated rather than hidden.
4. **Given** an entry, **When** it is read by someone unfamiliar with the system,
   **Then** every oceanographic or standards term it uses on first appearance links to
   the glossary.
5. **Given** an entry's screenshots, **When** their origin is checked, **Then** each came
   from the curated capture mechanism defined by feature 016 and sits in the location
   this feature defines for it.

---

### Edge Cases

- A page that uses the description "environmental data architecture harness" where the
  name `drogna` belongs, or the reverse: the name asserted as though it meant something.
- A screenshot that shows a browser address bar, a terminal path, a window title, an
  editor tab or an email address.
- The droplet's URL appearing in a page. It is not customer material, but it is an
  access surface; whether it may be published is a judgement the gate should force
  rather than assume.
- A bad publication: `gh-pages` keeps history, so a reverted mistake is still in the
  branch. The remedy is a history rewrite, and the gate exists so it is not needed.
- A build run from a fork or an untrusted pull request, which must never be able to
  publish.
- Architecture Decision Records live in `develop` and are documentation; whether they are
  published is a decision this feature must make rather than leave to the build's
  default file globbing.
- A documentation page linking to a file that exists in the repository but is not
  published, producing a link that resolves locally and breaks on the site.
- A glossary term used in a page but absent from the glossary, and a glossary term
  nothing uses.
- A diagram that renders from a third-party script, which would breach the no-external-
  requests rule while looking like plain markdown.
- A blog entry written before the feature works, which PR-08 forbids and which nothing
  in the build can detect from the text alone.
- Two features landing on the same day, so entry ordering cannot rely on date alone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `gh-pages` branch MUST carry the built site, comprising the blog and
  the system documentation, and MUST be written only by the publishing workflow.
  (SRD PR-06, PR-02)
- **FR-002**: The site MUST be buildable from a clean checkout with one documented
  command, producing the same output as the workflow produces. (SRD §10 demonstrability;
  Constitution, Development Workflow)
- **FR-003**: The landing page MUST state, before any other content, that this is a
  learning harness with synthetic data and deliberately fake numerics. (SRD FR-01)
- **FR-004**: The publication gates MUST run before any push to `gh-pages`, and a failing
  gate MUST prevent the push entirely rather than publishing a partial site.
  (SRD PR-01, PR-06)
- **FR-005**: The vocabulary gate MUST scan built HTML, built CSS and JavaScript, every
  published asset, and text extracted from published images, for customer names, project
  names, bid-specific material, personal identifiers and host paths. (SRD PR-01;
  Constitution V)
- **FR-006**: The vocabulary gate MUST be exercised against a seeded violation fixture on
  every run and MUST fail if the fixture is not caught. (SRD PR-01)
- **FR-007**: The published site MUST load no sub-resource from another origin, and MUST
  carry no analytics or tracking of any kind. Outbound hyperlinks to standards documents
  are permitted. (SRD PR-01)
- **FR-008**: The published site MUST declare that it does not wish to be indexed.
  (SRD PR-01)
- **FR-009**: A pull request from a fork MUST NOT be able to trigger publication.
  (SRD PR-01)
- **FR-010**: The documentation area MUST cover a subsystem reference explaining what
  each component does and why, algorithm derivations for ensemble spread, advection and
  informative path planning, standards primers for SensorThings, API-EDR, CF conventions
  and CoverageJSON, and a glossary. (SRD PR-09)
- **FR-011**: The set of required documentation pages MUST be declared in a manifest, and
  the build MUST fail when a page named there is missing or is a stub below the declared
  length. A gap MUST be visible, not silent. (SRD PR-09)
- **FR-012**: The subsystem reference MUST account for every component identifier in the
  SRD's component table, either with a page or with an explicit statement that the
  component is not yet built. (SRD PR-09; Constitution VII in spirit: the documentation
  does not claim what does not exist.)
- **FR-013**: Every oceanographic or standards-specific term MUST appear in the glossary,
  and its first use on a page MUST link there. The build MUST report a term used but not
  defined. (SRD PR-09)
- **FR-014**: The site MUST publish **at least one** blog entry for every feature that
  works, and an entry MUST NOT be published for a feature that does not exist. (SRD PR-08)

  **Amended 27 August 2026.** This read "exactly one" until the coverage table was
  generated and reported that `001-deterministic-foundations` has two entries —
  `a-runner-with-no-list` and `the-gate-that-examined-nothing`. Both name that feature in
  their front matter and both describe work done inside it, so neither is the "occasional
  entry about the process itself" that `site/docs/blog/index.md` separately licenses.

  Going back to the source settled it rather than the count did. SRD PR-08 reads "One blog
  entry per feature, written after the feature works, including screenshots" — a statement
  of cadence, that each feature earns an entry. "Exactly" was this document's tightening
  and the SRD does not support it. Read as a cap it forbids writing down the second thing a
  feature taught, which is the opposite of what a blog kept as a learning record is for:
  feature 001 produced both a runner that names no gate and a gate that examined nothing,
  and there is no version of "pick one" that leaves the record honest.

  The two halves that carry the requirement's weight are unchanged. Coverage is the point,
  and FR-016's generated table is what makes a feature with no entry visible; publication
  for a feature that does not exist is refused by `site/gates/check_blog.py`, which
  resolves the front matter against `specs/`. Neither property depended on the cap, which
  is why nothing enforced it.
- **FR-015**: Every blog entry MUST carry front matter naming the feature directory it
  describes and MUST include at least one screenshot. (SRD PR-08)
- **FR-016**: The site MUST publish a coverage table of features against entries, so the
  set of features without an entry is stated. (SRD PR-08)
- **FR-017**: Blog entries MUST be written for a general technical reader: they MUST
  explain the problem before the solution and MUST NOT assume the reader has read the
  SRD or the specifications. (SRD PR-07)
- **FR-018**: This feature MUST define the committed location and naming convention for
  published screenshots, which feature 016's curated capture mechanism writes into.
  (SRD PR-08, PR-10)
- **FR-019**: The internal link checker MUST pass with zero broken links, and MUST treat
  a link to a repository file that is not published as broken. (SRD PR-06)
- **FR-020**: The site MUST be named `drogna`, and that name MUST appear in exactly one
  place in the site configuration so it is set once rather than repeated across pages.
  "Environmental data architecture harness" is a description of the system, not a name
  for it, and MUST be used only as such. (SRD §1.2, PR-01)
- **FR-021**: Whether Architecture Decision Records are published MUST be an explicit
  decision recorded in the documentation manifest, not a consequence of which files the
  build happens to glob. (SRD PR-03, PR-06)
- **FR-022**: The documentation area MUST NOT maintain a standing list of open questions.
  The SRD raises a question in its §11 table as it arises and strikes it when it is
  answered, the answer landing in a requirement rather than staying in the table; the
  site follows the same discipline, so a resolved question is found as a requirement or
  an ADR and never as a stale note. (SRD §11, PR-03, PR-09)

### Key Entities

- **Documentation page**: authored markdown under the documentation area, owned by the
  feature whose subject it describes, published by this feature.
- **Documentation manifest**: the declared list of pages the site must carry, with the
  minimum length that distinguishes a page from a stub. The mechanism by which a gap is
  visible.
- **Blog entry**: one article about one feature, with front matter naming the feature
  directory, a publication date and at least one screenshot.
- **Coverage table**: features against entries, published on the site.
- **Glossary term**: a word with a definition and the pages that use it.
- **Publication gates**: the checks that must pass before anything is pushed —
  vocabulary, external sub-resources, link integrity, manifest completeness, glossary
  completeness, blog front matter.
- **Built site**: the output of the build, the only thing that reaches `gh-pages`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One command builds the site from a clean checkout, and the workflow runs
  that same command; no step exists in one and not the other.
- **SC-002**: The build fails, naming the file, when any page in the documentation
  manifest is missing or below the declared stub length.
- **SC-003**: The vocabulary gate reports zero findings on the real site and catches the
  seeded violation fixture, on every run, including the text extracted from images.
- **SC-004**: Zero external sub-resource references appear in the built output.
- **SC-005**: The link checker reports zero broken internal links across the whole site.
- **SC-006**: Every component identifier from C-01 to C-18 is accounted for in the
  subsystem reference.
- **SC-007**: Every term in the glossary source list has a definition, and every first
  use of such a term on a page links to it; the build reports both directions.
- **SC-008**: Every published blog entry names an existing feature directory and carries
  at least one screenshot; the coverage table's totals match the counted sets.
- **SC-009**: No publication reaches `gh-pages` without every gate passing, demonstrated
  by a workflow run in which a gate is deliberately failed and nothing is pushed.
- **SC-010**: No published page carries a list of open questions; every question the
  project has answered is findable as a requirement or an ADR.

## Assumptions

- The site is built with MkDocs, the Material theme and Material's blog plugin, and is
  deployed to `gh-pages` by `.github/workflows/pages.yml`. This keeps the site build in
  the Python toolchain the services already use and the documentation source as plain
  markdown reviewable in `develop`. The SRD fixes the technology for the services and
  the client but not for the site build; this is the choice the project has made.
- The site build is build-time tooling rather than a runtime component, so the
  configuration contract in Constitution IV does not bind it. It still carries no
  deployment hostname: the base URL comes from the workflow.
- "Unadvertised" is taken to mean not indexed as well as not promoted, so the site
  declines indexing and carries no analytics. The SRD says unadvertised, not
  un-indexed; this is the plainest available mechanism.
- Architecture Decision Records are published as part of the system documentation. They
  contain no customer material and they are the record PR-03 requires; publishing them
  is recorded in the documentation manifest so the decision is explicit.
- The documentation area's individual pages are authored by the feature that owns the
  subject matter, under the repository's earlier-feature-owns rule.
  `docs/standards/cf-conventions.md` is owned by feature 014. This feature owns the
  area's structure, its manifest, its glossary, its gates and its publication, and
  authors the pages no other feature has claimed.
- Blog entries live under `site/`, separately from the system documentation under
  `docs/`, because they are presentation rather than reference material and are not
  subject to the manifest's completeness rule.
- Published screenshots are committed to the repository under the location this feature
  defines, and are produced by feature 016's curated mechanism. Uncommitted capture
  output never reaches the site.
- PR-08's "written after the feature works" cannot be verified from the text. It is
  enforced by the entry naming a feature directory that exists and by the author's
  review, not by a build check that would only be theatre.
- The client's own landing page (SRD FR-01 in the running system) belongs to the client
  feature. This feature carries the same statement on the site's landing page.
- The name `drogna` is settled by SRD §1.2 and carries no meaning and no connection to
  the domain, the customer or the bid, which is what makes it compatible with PR-01. The
  site uses it as a bare name and does not gloss it as an acronym or expand it.
- The standards primers are written against SRD v0.3, which scopes the EDR trajectory
  work to a bespoke provider plugin (FR-50) and a version pin protecting the per-vertex
  M ordinate (FR-51). The API-EDR and CoverageJSON primers explain that shape rather
  than describing trajectory support as though a supplied provider offered it.
