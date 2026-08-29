> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0010: Tooling for the published site

**Status:** Accepted
**Date:** 26 August 2026, amended 27 August 2026 (mathematics rendering settled)
**Feature:** 015 — published site
**Requirements:** SRD PR-06, PR-07, PR-09

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
  a renderer can consume — with the renderer itself deferred. That deferral was
  settled on 27 August 2026 and the renderer is *not* served; see
  **Mathematics rendering** below. No page may use notation while that stands.
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

## Mathematics rendering: settled, and settled by not doing it

*Resolved 27 August 2026, by feature 015 while writing the three algorithm
derivations — the first point at which the question could be tested against real
notation rather than anticipated.*

The open point recorded here asked which renderer — MathJax or KaTeX — should be
vendored into the repository and served from this origin. The answer is **neither,
for now**. No renderer is vendored, no page uses mathematical notation, and
`pymdownx.arithmatex` stays enabled in generic mode emitting nothing, because no
page gives it anything to emit.

The reason is that the derivations were written first and the notation turned out
not to be needed. Three pages were expected to require it:

- **Ensemble spread** needed a mean, a standard deviation and a table of measured
  numbers. All three are clearer in prose and fenced blocks.
- **Advection** needed five lines of displacement arithmetic, which are exactly
  the five lines of the source and are more useful shown as such.
- **Informative path planning** needed two expressions — the uncertainty regrowth
  law and the sensing kernel — and both appear as fenced blocks in the form the
  source docstrings state them, so that a reader can find the same expression in
  `collapse.py` and `sensing.py` by searching for it.

Three arguments settled it beyond convenience.

1. **The audience.** PR-07 fixes the reader as a general technical reader who has
   not read the requirements document. Set notation is not obviously kinder to
   that reader than a named expression in a code fence, and it is markedly less
   kind to anyone reading with a screen reader, which vendored MathJax handles
   variably and KaTeX not at all without further configuration.
2. **A fenced expression is greppable and a rendered one is not.** Every formula
   on the site can be pasted into a search over the repository and will find the
   source that implements it. That property is worth more here than typographic
   quality, because the standing risk on this site is a page drifting away from
   the code it describes.
3. **Vendoring costs more than it looks.** MathJax and KaTeX are each several
   hundred kilobytes of script plus web fonts, all of which would have to be
   committed, kept in step with the extension that feeds them, and scanned by the
   external-resources gate for a font URL that reaches back to a CDN. That is a
   standing maintenance obligation, incurred for three pages that do not need it.

**The decision is reversible and cheaply so.** The extension is already
configured, so serving a renderer later is an addition rather than a migration.
The trigger to revisit it is a derivation that genuinely cannot be written without
notation — a matrix, a summation over indices, an integral. None of the three
existing derivations is that, and the fourth will announce itself.

**What this rules out.** No page may use `$...$` or `\(...\)` notation while no
renderer is served, because arithmatex would emit markup that nothing renders and
the reader would see raw delimiters on a public page. The three derivations each
carry a short closing note saying the site has no renderer, so the absence is
stated rather than looking like an oversight.

## What follows for images, in both forms

Neither of these is an open question, and both were carried under a heading that
said they were for longer than was true. They are consequences of the
no-other-origin rule above, and each one already binds:

- **Diagrams are committed SVG.** Mermaid renders from a third-party script and is
  therefore excluded, which leaves SVG committed to the repository as the only
  form a diagram may take. SVG carrying text is subject to the same vocabulary
  scanning as page text, and `site/gates/check_vocabulary.py` reads it in the
  `asset` zone. No page uses a diagram yet; the rule is what a page must obey when
  one does.
- **Screenshots come only from the curated capture mechanism.** They live under
  `site/docs/blog/assets/`, named `<feature-number>-<slug>.png`, committed
  alongside the `.provenance.json` sidecar that records the seed, the simulated
  instant, the viewport and the browser build. Uncommitted capture output never
  reaches the site. This was recorded as a target for feature 016 to write into;
  016 has since written into it, `site/gates/check_blog.py` enforces the sidecar,
  and the vocabulary gate reads the text inside every published image.

The heading these sat under mattered. FR-022 asks that no published page carry a
standing open-questions list, on the reasoning that a question is answered into a
requirement or a record rather than kept as a note — and `check_adr.py` reported
this record on its first run against the built site, which is how the mislabelling
was found.
