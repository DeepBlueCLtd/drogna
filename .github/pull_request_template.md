<!--
Short on purpose. A template nobody fills in is worse than no template, so this asks for
the two things that cannot be reconstructed from the diff: what was watched happening, and
what was decided not to do.

Delete any section that does not apply. An empty section is a claim too.
-->

## What this changes, and why

<!-- One paragraph. The diff says what; this says why, and what was rejected. -->

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
