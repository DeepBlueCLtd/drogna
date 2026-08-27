# site/

Source for the published site: the blog and the system documentation. The built
output lives on the `gh-pages` branch and is written only by
`.github/workflows/pages.yml`. Nothing on that branch is hand-edited; anything
that is will be overwritten by the next publication.

## Build it

From a clean checkout:

```sh
python -m venv .venv && . .venv/bin/activate
pip install -r site/requirements.txt
mkdocs build --strict --config-file site/mkdocs.yml
```

The output lands in `site/build/`, which the repository's ignore rules already
cover. `--strict` fails the build on a broken internal link, a dangling anchor,
a page missing from the navigation, or a link written as absolute. The workflow
runs exactly this command.

To preview with live reload:

```sh
mkdocs serve --config-file site/mkdocs.yml
```

## Publication gates

Run in the workflow after the build, before anything is pushed:

| Gate | What it checks |
|---|---|
| `mkdocs build --strict` | Link integrity, anchors, navigation completeness |
| `tools/check_no_external_resources.py` | No sub-resource is fetched from another origin |
| landing-page grep | The FR-01 statement is present in the built `index.html` |
| indexing grep | `noindex` meta tag and `robots.txt` are both present |
| `.nojekyll` | Present in the built tree, and verified in the published branch |

Run the external-resource gate locally with:

```sh
python site/tools/check_no_external_resources.py site/build
```

## Layout

```text
site/
├── mkdocs.yml          site configuration, theme, navigation
├── requirements.txt    fully pinned build environment
├── overrides/          theme overrides (the noindex meta tag)
├── hooks/              build-time page generation (see below)
├── authoring/          the blog entry template and authoring note; not published
├── gates/              publication gates run over the built site
├── tools/              publication gates that are not part of mkdocs
└── docs/
    ├── index.md        landing page — carries the FR-01 statement
    ├── robots.txt      declines indexing
    ├── blog/           blog index, posts/, assets/
    ├── subsystems/     one page per component, C-01 to C-18
    ├── algorithms/     derivations (stubs)
    ├── standards/      primers (stubs)
    ├── glossary.md
    └── decisions/      pages about decisions; the records in docs/adr/ are
                        published beneath this path at build time
```

## Pages that are generated at build time

Two pages are not written by hand. Both are produced by MkDocs hooks named in
`mkdocs.yml`, which need no plugin and therefore no addition to the pinned
`requirements.txt`, and neither writes anything back into `docs/`: the generated
pages exist only in the built output, so there is no file anyone could mistake
for a source and no second copy to drift.

- **The decision records**, by `hooks/publish_adrs.py`. The records live in
  `docs/adr/`; the direction of travel is *out of* the repository record and
  into the site, never the other way. Each record is published at
  `decisions/adr/<number>-<slug>/`, and the index at `decisions/adr/` lists every
  record with the status read out of the record itself rather than retyped.
  Whether they are published at all is the entry `adrs.published` in
  `docs/manifest.yaml` — a recorded decision (FR-021), which the hook reads and
  `gates/check_adr.py` checks the build against in both directions.
- **The blog's coverage table**, by `hooks/blog_coverage.py`, which replaces a
  marker in `docs/blog/index.md` with a table of every feature directory against
  the entries whose front matter names it. Features with no entry get a row
  saying so, because the gap is what the table is for.

Adding a decision record, or an entry, or a feature, changes both pages with no
edit to either.

## Writing a blog entry

`authoring/blog-entry-template.md` is the template and `authoring/README.md` is
the authoring note. They sit outside `docs/` deliberately: anything under
`docs/blog/posts/` is published as an entry, and a template published as an entry
is an entry about nothing.

## Conventions

- **Screenshots** go in `docs/blog/assets/`, named `<feature-number>-<slug>.png`,
  committed to the repository, and produced only by the curated capture
  mechanism that feature 016 owns. Uncommitted capture output never reaches the
  site.
- **No external requests.** No CDN fonts, no third-party scripts, no analytics,
  no mermaid. Outbound hyperlinks to standards documents are fine; anything the
  page *fetches* is not.
- **British spelling**, and no customer, project or bid material anywhere — the
  repository is public.
