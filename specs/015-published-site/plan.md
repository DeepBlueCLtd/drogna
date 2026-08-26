# Implementation Plan: Published Site — Blog and System Documentation

**Branch**: `015-published-site` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-published-site/spec.md`

## Summary

Build the blog and the system documentation into a static site, gate the built output
against everything PR-01 forbids, and publish it to `gh-pages` from a workflow that is
the only writer of that branch. The documentation source stays plain markdown under
`docs/`, reviewed on `develop` like any other change; the presentation layer, the blog
entries and the published screenshots live under `site/`.

The two mechanisms that carry the weight are the documentation manifest, which turns a
missing page into a build failure rather than an absence nobody notices, and the
publication gates, which run before the push so that a mistake never enters a public
branch's history.

## Technical Context

**Language/Version**: Python 3.11 under the existing `uv` workspace for the site build
and the gates, so the site uses the toolchain already present rather than adding a
second one. Markdown for all authored content.

**Primary Dependencies**: MkDocs with the Material theme and Material's blog plugin; a
link checker; an OCR library for extracting text from published images; the
repository's existing forbidden-vocabulary gate, invoked over built output as well as
over source.

**Storage**: None. The build reads the repository and writes a directory. `gh-pages`
holds the result.

**Testing**: `pytest` for the gates and the manifest checks; the build itself is
exercised by running it. A seeded violation fixture is committed and asserted to be
caught. The workflow is exercised on a branch before it is trusted with `develop`.

**Target Platform**: GitHub Pages serving the `gh-pages` branch, deployed by
`.github/workflows/pages.yml`; the build runs in GitHub Actions and identically on a
developer machine.

**Project Type**: A documentation site plus a publishing workflow. No runtime component,
no heartbeat, no configuration contract.

**Performance Goals**: The full build and all gates complete inside a single CI job
without a build cache. No page requires a network fetch to render.

**Constraints**: No sub-resource from another origin; no analytics; no customer,
project or bid material anywhere in the output; nothing pushed unless every gate passes;
the branch is machine-written.

**Scale/Scope**: Sixteen features, eighteen components, four standards primers, three
algorithm derivations, one glossary, and one blog entry per feature that works.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — The site is build-time tooling, not a component, and reads
  no operational time. Publication dates come from entry front matter, which is authored
  content, not a clock reading. Compliant.
- **II. Seeded Randomness and Deterministic Replay** — Nothing in the build is
  stochastic. The build is deterministic for a given source tree, which is what makes a
  gate result meaningful. Compliant.
- **III. Generated Types Only** — No type crosses a language boundary here. The
  documentation manifest and the blog front matter are data with a schema, validated at
  build time. Compliant, and not stretched: this feature generates no types.
- **VII. Liveness, Not Configuration** — Now non-negotiable and extended to forbid
  mocked traffic. It reaches this feature through the screenshots: every published image
  shows a genuinely live system, because there is no fixture mode that could produce
  anything else. The site must not describe a demo mode either, since none exists.
- **IV. No Literal Paths or Hosts** — This principle binds components reading
  `HARNESS_CONFIG`, and the site build is not one. The plan holds to the spirit of it
  anyway: no deployment hostname is written into any page or into the generator
  configuration, and the base URL comes from the workflow. Recorded here so the exemption
  is deliberate rather than assumed.
- **V. No Tracked Entities** — This feature is the principle's public surface. The
  vocabulary gate is extended from tracked files to built output and to text inside
  images, which is the one place forbidden vocabulary can hide from a text scan. The
  landing page carries the FR-01 statement. Compliant.
- **VI. Honest Ports** — The subsystem reference documents the port accounting from SRD
  §2.1 as written, including the boundaries that are not ports and the one that is
  marginal. The documentation claims exactly what the code delivers. Compliant.
- **VII, applied to documentation** — The subsystem
  reference states which components are not yet built rather than describing all eighteen
  as though they exist, and the blog coverage table states which features have no entry.
  Compliant in spirit, which is where it bites for a site.
- **IX. Ground Truth Is Scored, Not Assumed** — The algorithm derivations state what is
  measured against the generator's manifest and report the error figures rather than
  asserting recovery. Compliant.
- **PR-01 (Constitution V, second clause)** — The strongest constraint on this feature.
  Held by FR-004 to FR-009 and by the gate ordering: gates run before the push, and a
  fork cannot publish.

No violation requires justification. Complexity Tracking is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/015-published-site/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
docs/                                   authored source, owned by this feature
├── index.md                            the landing page, carrying the FR-01 statement
├── manifest.yaml                       required pages and their minimum lengths
├── glossary.md
├── architecture/
│   ├── repo-layout.md                  existing
│   ├── overview.md                     the loop, and the port accounting from SRD §2.1
│   └── subsystems/c-01.md .. c-18.md   one per component, or an explicit not-yet-built
├── algorithms/
│   ├── ensemble-spread.md
│   ├── advection.md
│   └── informative-path-planning.md
├── standards/
│   ├── sensorthings.md
│   ├── api-edr.md
│   ├── cf-conventions.md               owned by feature 014, consumed here
│   └── coveragejson.md
└── adr/                                owned by other features, published from here

site/                                   presentation layer, owned by this feature
├── mkdocs.yml                          MkDocs Material; the name `drogna` lives here
├── theme/                              overrides, all assets local
├── blog/
│   ├── index.md
│   └── posts/
│       ├── NNN-slug.md                 front matter names the feature directory
│       └── images/NNN-slug/            committed, written by feature 016's curated run
└── gates/
    ├── check_manifest.py
    ├── check_vocabulary.py             built output and image text
    ├── check_external_refs.py
    ├── check_links.py
    ├── check_glossary.py
    ├── check_blog.py
    ├── run_gates.py                    the single entry point the workflow calls
    ├── tests/                          each gate tested, including its seeded fixture
    └── fixtures/seeded_violation/      deliberate control, documented as such

.github/workflows/
└── pages.yml                           the only writer of gh-pages
```

**Structure Decision**: This feature owns `docs/` (excluding `docs/adr/`, whose
individual records are owned by the features that write them), `site/`, and
`.github/workflows/pages.yml`.

`site/mkdocs.yml` points its documentation root at the repository's `docs/` directory
and the blog source in `site/blog/` is staged into the build tree by the build command,
so that authored documentation stays where the repository layout puts it and the blog
stays out of the documentation manifest's completeness rule.

`site/` is a new top-level directory and the repository layout requires an argument for
one. The argument is separation of source from presentation: `docs/` holds authored
markdown that is reviewed on `develop`, is readable in the repository without a build,
and is written page by page by the features that own each subject; `site/` holds the
generator configuration, the theme, the blog and the gates, none of which is reference
material about the system. Folding the generator configuration and theme into `docs/`
would put build machinery inside the thing being built and make the ownership rule for
documentation pages ambiguous. Folding the blog into `docs/` would subject entries to
the documentation manifest's completeness rule, which is wrong: a missing subsystem page
is a defect, a feature without a blog entry yet is not.

Two ownership boundaries are stated explicitly because they cross features:

- `docs/standards/cf-conventions.md` is authored by feature 014, which owns C-17 and its
  export format. Under the repository's earlier-feature-owns rule, 014 owns the file and
  this feature consumes it, placing it in navigation and applying the publication gates
  to it. The same applies to any documentation page an earlier feature authors about its
  own subject; this feature authors the pages nobody else has claimed and owns the area's
  structure, manifest, glossary, gates and publication.
- `site/blog/posts/images/NNN-slug/` is defined here and written into by feature 016's
  curated capture mechanism. This feature defines the location, the naming convention and
  the requirement that published images are committed; feature 016 produces them.

The gates live under `site/gates/` rather than `scripts/` because they operate on built
site output rather than on the source tree, and `scripts/` carries the repository-wide
source gates. The one exception is the forbidden-vocabulary rule set, which is shared:
this feature's vocabulary gate invokes the repository's existing gate over the built
output and over extracted image text, rather than restating the rules.
