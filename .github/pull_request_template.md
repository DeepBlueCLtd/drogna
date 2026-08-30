<!--
Short on purpose. A template nobody fills in is worse than no template, so this asks only
for what cannot be reconstructed from the diff: where the change can be seen running, what
was watched happening, and what was decided not to do.

Delete any section that does not apply. An empty section is a claim too.

The title is terse engineering language: scope prefix, then the change — `map: defer canvas
init until panel is mounted`, not a sentence about what it means for the reader. CLAUDE.md,
"Titles and work packages", has the rule and the examples.
-->

## What this changes, and why

<!-- One paragraph. The diff says what; this says why, and what was rejected. -->

## The instance, opened at the change

<!--
CI has already built one: https://deepbluecltd.github.io/drogna/instances/<branch-with-slashes-as-hyphens>/
and the Instances run writes the exact URL into its job summary.

Link it opened at the view the change is in — `#/view/map`, `#/view/messages` — not at
the shell's front door, which asks the reviewer to go and find the change. Views are
addressable so that this link can exist.

If there is nothing visible in this change, say "nothing visible". A screenshot is the
fallback for something no URL reaches, not the deliverable.
-->

## The blog entry

<!--
A significant component — a new face in the shell, or a piece of backend simulation
worth watching work — arrives with its entry, in this pull request. Not one per feature.
Copy site/authoring/blog-entry-template.md to site/docs/blog/posts/<slug>.md; the shape
and the audience are in site/authoring/README.md.

Link the entry here as a full URL on this branch:
https://github.com/DeepBlueCLtd/drogna/blob/<this-branch>/site/docs/blog/posts/<slug>.md

A repository-relative path — `site/docs/blog/posts/<slug>.md` — is NOT resolved to the
file by GitHub in a pull request body. The browser resolves it against whichever page
the body is being read on, so it lands under /compare/ or /pull/ and returns 404. The
entry itself is not published until this branch merges (site.yml publishes from main
only), so the branch blob URL is the link that works while the pull request is open;
https://deepbluecltd.github.io/drogna/blog/posts/<slug>/ is the one that works after.

Or say why this change does not earn an entry. "Plumbing, no entry yet" is a decision;
silence is an oversight, and the coverage table on the blog index publishes the gap
either way.
-->

## What was watched failing

<!--
Constitution-adjacent, and the habit this repository is built on: a check that has never
been seen to fail is worth nothing. If this pull request adds or changes a gate, a test or
a validator, plant the violation, watch it caught, revert it, and say so here.

If nothing here adds a check, say "no new checks".
-->

## Backend changes: what was brought up, and what was seen

<!--
Only for a change under services/, libs/, deploy/, config/ or proxy/. `main` is the first
place a backend change runs, so this is the evidence that it ran somewhere first.

- Which destination and which profiles (`profiles.active`, or the profiles passed by hand)
- What `scripts/run_local.sh` reported, and anything that had to be done twice
- Anything that skipped for want of a container runtime, and so is untested until CI says
  otherwise

"Not a backend change" is a fine answer.
-->

## Left undone, and why

<!--
The reason is the part that cannot be reconstructed later. An unticked task with an
explanation is a decision; without one it is an oversight, and this repository has already
paid for the difference.
-->
