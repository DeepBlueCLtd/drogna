# site/

Source for the published site: the landing page, the architecture and component
reference, the standards primers and algorithm derivations, the glossary, the blog, and
the Version 1 archive. The built output lives on the `gh-pages` branch and is written
only by `.github/workflows/site.yml`. Nothing on that branch is hand-edited; anything
that is will be overwritten by the next publication.

## Build it

```sh
pnpm install
pnpm site:build            # → site/build/, which .gitignore already covers
pnpm site:build <dir>      # → anywhere else
```

No Python, no virtual environment, no second toolchain: the generator is
`scripts/site/`, TypeScript like everything else (SRD-v2 NFR-01, NFR-05). Serve the
output with any static file server; every URL it emits is relative, so it works from
any base path and straight off the filesystem.

The build exits nonzero and writes nothing if any internal link, anchor or asset
reference does not resolve.

## What checks it

The publication disciplines are three of the gates in `scripts/gates.registry`, so they
run in `pnpm gates`, in `pnpm check` and in CI — not only in the publishing workflow.
That is deliberate: V1's equivalents lived in the workflow, and when the workflow was
deleted they stopped running without anything going red.

| Gate | What it checks |
|---|---|
| `check-site-links` | Every internal link, anchor and asset resolves; none is absolute |
| `check-site-resources` | No sub-resource is fetched from another origin |
| `check-site-publication` | The FR-01 statement above the landing page's first heading; `noindex` on every page; `robots.txt`; `.nojekyll`; no page declaring itself a stub |
| `check-site-disclosure` | No email address and no home-directory path reaches a published page |

Each was watched failing on a planted violation before it was trusted —
`scripts/gates/tests/fixtures/site-broken/`, `site-external/` and `site-disclosed/` are
those violations,
and `scripts/tests/gates.test.ts` is where they are caught. `scripts/tests/site.test.ts`
covers the build and the estate's tenancy.

## Layout

```text
site/
├── authoring/          the blog entry template and authoring note; not published
└── docs/
    ├── index.md        landing page — carries the FR-01 statement
    ├── robots.txt      declines indexing
    ├── demo/           the running harness, and where the review instances live
    ├── architecture/   the seam, and what it buys
    ├── components/     the component reference; its tables are generated
    ├── standards/      primers: SensorThings, EDR, CF, CoverageJSON
    ├── algorithms/     derivations: ensemble spread, advection, path planning
    ├── glossary.md
    ├── blog/           the V2 blog: index, posts/
    ├── decisions/      index; the records are published from docs/adr/ at build time
    └── archive/        the V1 record: its blog, its subsystem reference, its overview
```

## What is generated, and why

Nothing generated is committed. A committed copy of something the repository already
holds is a second copy, and the second copy is the one that goes stale on the public
site. Each marker below is replaced at build time; nothing is written back into `docs/`.

| Marker | Source |
|---|---|
| `<!-- generated: component table -->` | `contracts/topology.json` |
| `<!-- generated: topic table -->` | `contracts/topology.json` |
| `<!-- generated: decision index -->` | `docs/adr/` — the status is read out of each record |
| `<!-- generated: entry list -->` | the entries under the page's own `posts/` |
| `<!-- generated: blog coverage 1nn -->` / `0nn` | feature directories under `specs/`, against each entry's `feature` front matter |

Two more things are properties of where a page sits rather than of what is written in
it, so they cannot be forgotten:

- **Navigation** is derived from the directory tree and each page's `order:`, so a page
  cannot be missing from it. An `index.md` with `collapse: true` keeps its children out
  of the sidebar and is the section's own contents page instead.
- **The Version 1 banner** is added to every page under `archive/`. Move a page in and
  it gains the banner; move it out and it loses it. V1 maintained such notices by hand
  and they went on saying "no code exists" long after code existed.

## The estate

`gh-pages` has two tenants and the boundary is the design:

- **the site** owns the root, published by `site.yml` running `pnpm site:publish`, which
  removes only the paths its own last publication recorded;
- **`instances/`** is owned by `instances.yml`, one subtree per branch, retained after
  the pull request completes (SRD-v2 NFR-04), with an index regenerated from whatever
  the estate actually holds.

Neither may write into the other's ground, and `scripts/publish-site.ts` refuses to even
if a manifest tells it to.

## Writing a blog entry

`authoring/blog-entry-template.md` is the template and `authoring/README.md` the
authoring note. They sit outside `docs/` deliberately: anything under `docs/blog/posts/`
is published as an entry, and a template published as an entry is an entry about
nothing.

An entry takes the fixed shape D19 sets — the background, the requirement, the options
considered, the demo — and embeds the running thing, either an instance of the shell
opened at the relevant view or a small page that reads a headless component through the
seam.

## Conventions

- **Screenshots** go in the blog's `assets/`, named `<feature-number>-<slug>.png`,
  committed, and produced only by the capture mechanism. Uncommitted capture output
  never reaches the site.
- **No external requests.** No CDN fonts, no third-party scripts, no analytics, no
  diagram renderer. Outbound hyperlinks to standards documents are fine; anything the
  page *fetches* is not.
- **British spelling**, and no customer, project or bid material anywhere — the
  repository is public.
