# ADR 0031 — The site is built in TypeScript, and the estate has two tenants

**Status:** Accepted, 29 August 2026. Supersedes ADR-0010 (V1 site tooling).
**Date:** 29 August 2026
**Requirements:** SRD-v2 PR-04, PR-04a, NFR-04, NFR-05, PR-01; plan D16, D18, D19

## Context

The published site was V1's, in three senses. Its tooling was MkDocs with
mkdocs-material, pinned in `site/requirements.txt` — a second language runtime, which
NFR-01 and NFR-05 now forbid outright. Its content described twelve containers and
eighteen components, none of which run any more; its landing page said "Nothing yet,
other than this site." And its publication gates — five Python scripts checking links,
external resources, the FR-01 statement, indexing and the documentation manifest — ran
only inside `.github/workflows/pages.yml`, which the V2 retirement commit deleted. They
had therefore been checking nothing for the whole of V2's implementation, and a tree
where nothing checks the site looks exactly like a tree where the site is fine.

Meanwhile the estate on `gh-pages` had gained a second tenant. `instances.yml` publishes
a per-branch build of the app under `instances/<slug>/`, retained after its pull request
completes (NFR-04), so that a review comment can deep-link a specific build at a specific
view (D16, FR-15). Nothing listed them: the addresses existed and were discoverable only
by already knowing them. And nothing had yet reconciled that tenant with the V1 site
sitting at the estate root, which a V2 publication would have to replace without
touching it.

## Decision

**One.** The site generator is TypeScript, under `scripts/site/`, run by
`pnpm site:build`. Markdown is rendered by `markdown-it`, a build-time dependency in the
same category MkDocs occupied — it never ships to a reader, and what reaches the estate
is HTML with no script and no fetched sub-resource. The corpus was surveyed before the
renderer was written (no footnotes, no mathematics, no definition lists, admonitions of
exactly two kinds), so what is implemented is what the content uses. `site/mkdocs.yml`,
`site/requirements.txt`, `site/overrides/`, `site/hooks/`, `site/tools/` and
`site/gates/` are deleted. No Python remains under `site/`.

**Two.** The publication disciplines become four gates in `scripts/gates.registry` —
`check-site-links`, `check-site-resources`, `check-site-publication`,
`check-site-disclosure` — so they run in `pnpm gates`, in `pnpm check` and in CI, not
only in a publishing workflow. Each builds the site into memory and inspects it, so no
build step has to have run first. Each was watched failing on a planted violation before
it was trusted.

**Three.** Two faults are removed rather than detected. Navigation is derived from the
directory tree, so a page cannot be missing from it (V1 kept the navigation in
`mkdocs.yml` and had `--strict` fail the build when a page was left out). The Version 1
banner is a property of sitting under `archive/`, so it cannot be forgotten on a page and
cannot be left on one that moves out.

**Four.** What carried, what was archived, what was retired:

| | |
|---|---|
| **Carried** | The glossary and the component reference as first-class pages (D18); the standards primers and algorithm derivations, which are true of V2 unchanged; the decision records, published from `docs/adr/` with each status read out of the record; the no-external-request, noindex and FR-01-statement disciplines. |
| **Archived** | The seventeen V1 blog entries; the eighteen-component subsystem reference; the V1 architecture overview. All published, all bannered, all reached only from `archive/`. |
| **Retired** | The MkDocs toolchain and the Python gates; `site/docs/decisions/site-tooling.md`, which was a pointer to ADR-0010; `docs/manifest.yaml`; the OCR pass over published images. |

**Five.** The component reference is generated from `contracts/topology.json` — the same
master the app is built against and the topology-drift gate rebuilds — rather than
written. V1's eighteen hand-written pages went stale twice, first claiming no code
existed long after it did, then describing retired software. The generated reference
cannot be wrong about which component may publish what; it can still be incomplete about
what a component is *for*, and that is what the prose beside the tables is.

**Six.** The estate has two tenants and the boundary is enforced in code. The site owns
the root; `instances/` is owned by `instances.yml`. `scripts/publish-site.ts` records a
manifest of what it published and, next time, removes only those paths — and refuses to
write or reap under another tenant's path even when handed a manifest that claims one.
`scripts/estate-index.ts` regenerates `instances/index.html` from what the estate
actually holds, so retained instances of completed branches stay listed. Each deployment
writes an `instance.json` beside its build recording ref, commit and date; instances
published before that file existed are listed saying their provenance is not recorded,
rather than dropped or given a plausible blank.

## Consequences

The site is buildable, checkable and previewable by anyone who has run `pnpm install`,
with no second toolchain, and the disciplines that guard it are now part of the same
check every other rule runs under. A gate can no longer be orphaned by deleting a
workflow.

`docs/manifest.yaml` is retired rather than ported. Every gate that read it is deleted;
its page list names V1 pages that are now archived, its component list names C-01 to
C-21, and its one load-bearing entry — `adrs.published` — is now unconditional and
covered by a test asserting that every record under `docs/adr/` is published. What is
lost is the word-count floor machinery, which measured stubs by length; the part of it
that did the work, that a page declaring itself a stub is a stub whatever its length,
is kept as an assertion in `check-site-publication`. Should stubs reappear in quantity,
the floors are worth rebuilding in TypeScript, and the reasoning that derived them from
what was on disk is in this repository's history.

One check is genuinely lost rather than ported. V1's site gate ran **OCR over every
published image**, hunting an address bar or a host path burnt into a screenshot — the
one place text reaches a reader that no source scan can see. An OCR engine is a second
language runtime, which NFR-01 forbids outright, so it goes. What replaces it is not
another check but a discipline that was already there: every screenshot comes from the
capture mechanism under `scripts/capture/`, capture output is committed deliberately
rather than swept in, and the entries that matter embed a running instance instead of a
picture of one. The text half of that gate is carried as `check-site-disclosure`, which
reads the published pages for an email address or a home-directory path.

Its tracked-entity noun scan is deliberately not carried, and that is an inheritance
rather than an omission: V1 ruled that documentation must be able to discuss a
prohibition in order to state it, excluded the site from that scan, and recorded the
reason. Seven lines of this site would match today and all seven are sentences about the
rule. `check-vocabulary` still scans everything that is not documentation.

The V1 site's URLs change. `/subsystems/c13-model-runner/` is now
`/archive/subsystems/c13-model-runner/`, and the V1 entries move under `/archive/blog/`.
The alternative was leaving the V1 tree in place beneath the V2 one, which would have
published two contradictory sites at overlapping addresses; the content is kept, the
addresses are not. The first publication finds no manifest — V1's estate was written by
a tool that kept none — and that case is treated as the migration it is: everything at
the root that is not another tenant is replaced.

Only the default branch publishes the site. A branch's *app* is reviewable as its own
instance, which is what review needs; a branch's *site* is reviewable by building it.

## Alternatives rejected

**Keep MkDocs.** It works, the theme is good, and the corpus is written for it. It is
also Python, and NFR-01's whole claim is that no step of building, testing, gating or
demonstrating the system needs a second language runtime. A site build is a step. The
cost of the rewrite is a renderer that supports what this corpus uses rather than
everything Python-Markdown does; the cost of keeping it is that the claim becomes
false, with an asterisk.

**Port the Python gates one for one.** Two of them — the manifest gate and the subsystem
coverage gate — check a document structure that V2 does not have. Porting them would
have meant keeping `docs/manifest.yaml` alive to give them something to read.

**Leave the V1 site published beside the V2 one, at its own addresses.** Attractive,
because D18 says the estate grows rather than being rebuilt. Rejected because the site is
one tenant, not two: two sites at overlapping roots would disagree, and the reader has no
way to tell which is current. D18's concern is that a *review instance* not wait for a
merge, and that instances stay addressable; both hold, and are enforced.

**Hand-write the V2 component reference.** It reads better. It is also the thing that
went stale twice, and the second time it went stale it was describing software that had
been deleted.
