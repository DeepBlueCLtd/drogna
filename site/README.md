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
├── tools/              publication gates that are not part of mkdocs
└── docs/
    ├── index.md        landing page — carries the FR-01 statement
    ├── robots.txt      declines indexing
    ├── blog/           blog index, posts/, assets/
    ├── subsystems/     one page per component, C-01 to C-18
    ├── algorithms/     derivations (stubs)
    ├── standards/      primers (stubs)
    ├── glossary.md
    └── decisions/      ADR drafts awaiting promotion to docs/adr/
```

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
