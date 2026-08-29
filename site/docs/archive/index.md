---
title: The Version 1 archive
description: The Version 1 record, kept and labelled: seventeen blog entries, an eighteen-component reference, and the architecture overview of a system that no longer runs.
order: 90
collapse: true
---

# The Version 1 archive

Version 1 was twelve services across Python, SQL, nginx configuration and Compose,
deployed to a server. It delivered seventeen features and all four of its acceptance
criteria, and it was retired — not because it failed, but because reviewing a change to
it meant reasoning across containers, and that was the cost that mattered.
[ADR-0027](../decisions/adr/0027-version-2-client-side-rewrite.md) is the record of
that decision.

Nothing here has been deleted, and nothing here has been quietly updated to describe
Version 2 instead. These pages are accurate about software that no longer runs, which
is a useful thing for a page to be and a dangerous thing for a page to be silent about.
Each one is reached only from this section.

## What is kept

- [**The Version 1 blog**](blog/index.md) — seventeen entries, one per feature, written
  as each feature came to work. Several are about faults found in drogna's own checks
  rather than in drogna, and those are the ones that aged best: a gate that reported a
  file of deliberate violations as clean, a test that isolated nothing, a threshold
  nothing could reach.
- [**The eighteen-component reference**](subsystems/index.md) — one page per component:
  what it did, why it existed as a separate thing, and which failure mode it owned. The
  failure-mode column is the part worth reading. The Version 2
  [component reference](../components/index.md) is generated rather than written, and
  is a different kind of document.
- [**The Version 1 architecture overview**](architecture/overview.md) — the container
  layout, the port accounting, and the reverse proxy that fronted it.

## What is not kept

The Version 1 decision records are not here, because they were never site content: they
live in the repository at `docs/adr/` and are published with everything else in
[the decision records](../decisions/index.md), each marked as a Version 1 record. The
numbering runs straight through the version boundary, so ADR-0009 is still ADR-0009.

The site's own Version 1 tooling — a Python static-site generator and the publication
gates written against it — is retired rather than archived. It was build machinery, not
a record, and Version 2 admits no second language runtime.

The droplet the Version 1 site and demo were served from is decommissioned. Both the
site and the demo are static now, so nothing drogna runs needs a server.
