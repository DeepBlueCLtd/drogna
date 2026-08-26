---
title: Site tooling
---

# ADR draft: tooling for the published site

!!! note "Draft, awaiting promotion"
    This is a draft Architecture Decision Record. It sits here rather than in
    `docs/adr/` because that directory belongs to another feature; it is written
    in ADR form so that it can be numbered and promoted without rewriting.

**Status:** Proposed
**Date:** 26 August 2026
**Feature:** 015 — published site

## Context

The requirements put the blog and the system documentation on the `gh-pages`
branch, built rather than hand-written, and place a hard constraint on what may
appear in the published output. Three properties follow from the requirements
and constrain the choice of tooling:

1. **Blog and documentation from one tool.** They are one site with one
   navigation and one search index. Two tools would mean two builds, two themes
   and two sets of link checking.
2. **No request to another origin.** The published site must load no stylesheet,
   font, script or image from anywhere but itself, and carry no analytics. That
   rules out any default that reaches for a CDN.
3. **Mathematics.** The algorithm derivations — ensemble spread, advection,
   informative path planning — will need real notation. A tool that cannot set
   mathematics forces the derivations into images, which are unsearchable,
   unselectable and a vocabulary-gate problem of their own.

A fourth consideration is not a requirement but matters in practice: the browser
client is a Node toolchain, and giving the site its own separate Node
dependency tree would put two lockfiles in the repository that have nothing to do
with each other and would be updated at different times.

## Decision

**MkDocs with the Material theme and its built-in blog plugin.** Versions are
pinned, including transitive dependencies, so that a local build and the
workflow build produce the same output.

Configuration decisions taken with it:

- `theme.font: false`. Material loads Google Fonts by default; disabling it is
  what makes the no-external-origin rule hold. System font stacks are used.
- No mermaid, no social cards, no analytics plugin. Each would reintroduce an
  external request or an external build-time fetch.
- `pymdownx.arithmatex` in generic mode, so that mathematics is emitted in a form
  a renderer can consume — with the renderer itself deferred; see the open point
  below.
- Every page carries `noindex, nofollow`, and a `robots.txt` says the same. The
  repository is public but unadvertised, and unadvertised is taken to mean not
  indexed as well as not promoted.
- Built output goes to `site/build/`, which the repository's existing ignore
  rules already cover, so the build never risks being committed beside its
  source.

## Alternatives considered

**Sphinx.** Python, mature, excellent at mathematics and cross-referencing, and
the standard choice for documentation in this ecosystem. Rejected on the blog:
it has no first-class blog, the available extensions are thin, and PR-07 asks
for a proper public blog rather than a documentation section with dates on it.
The authoring format is also reStructuredText by default, and the documentation
source is meant to stay plain markdown reviewable in the repository.

**Hugo.** Fast, excellent at blogs, single binary. Rejected on toolchain: it is
a Go binary to install and version-pin in CI alongside Python and Node, for a
site that is otherwise pure markdown. Its mathematics support is a theme concern
rather than a built-in, and its templating is the least pleasant of the
candidates to modify.

**Jekyll.** The default for GitHub Pages and already what the repository's
`gh-pages` branch was rendering. Rejected on the Ruby toolchain — a third
language runtime for one site — and because building it explicitly rather than
relying on Pages' own Jekyll is no easier than building MkDocs, while its
documentation-shaped navigation is weaker.

**Docusaurus / VitePress.** Both are good, both are Node. Rejected on the
toolchain point above: they would tangle with the client's Node dependencies, or
require a second isolated one, for no gain over MkDocs Material on a
markdown-only site.

**Hand-written HTML.** Rejected without much argument. It would work today and
would be unmaintainable by the fourth blog entry.

## Consequences

- The site build adds Python dependencies that are build-time only. It is not a
  runtime component, so the single-environment-variable configuration contract
  does not bind it. It still carries no deployment hostname: the site is built
  with relative URLs and works under any base path.
- The build fails on a broken internal link, an unrecognised link, a dangling
  anchor or a page missing from the navigation, because `--strict` is used with
  link validation raised to warning level. Those are exactly the faults that
  would otherwise be found by a reader.
- Material is a large dependency with a fast release cadence. The pin is
  therefore a full transitive pin rather than a floor, and updating it is a
  deliberate act.
- Jekyll processing on `gh-pages` would strip the directories Material emits
  whose names begin with an underscore. The published tree therefore carries a
  `.nojekyll` file at its root, and the workflow verifies it is present.

## Open points

- **Mathematics rendering is not yet served.** Arithmatex emits the notation but
  the renderer that consumes it — MathJax or KaTeX — must be vendored into the
  repository and served from this origin, not loaded from a CDN. That work is
  deferred to whichever feature writes the first derivation, which is the first
  point at which it can be tested against real notation. Until then no page uses
  mathematical notation, so nothing renders wrongly; it simply is not there yet.
- **Diagrams.** Mermaid renders from a third-party script and is therefore
  excluded. Diagrams will need to be committed SVG, and SVG carrying text is
  subject to the same vocabulary scanning as page text.
- **Screenshots.** Published screenshots belong under `site/docs/blog/assets/`,
  named `<feature-number>-<slug>.png`, committed to the repository, and produced
  only by the curated capture mechanism that feature 016 owns. Uncommitted
  capture output never reaches the site. This convention is recorded here so that
  016 has a fixed target to write into.
