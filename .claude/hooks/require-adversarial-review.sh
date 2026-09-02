#!/usr/bin/env bash
# PreToolUse guard on pull request creation: a change does not become public until an
# adversarial review has run against the exact commit being published.
#
# The marker is the review's receipt: .git/adversarial-review/<head-sha>, written by the
# adversarial-review skill when it finishes. It is keyed to the commit, so a fixup push
# after the review re-arms the guard — the reviewed tree and the published tree are the
# same tree or the guard has not been satisfied.
#
# The marker lives under .git/ deliberately: it is a fact about this clone's history of
# review, not about the tree, and committing it would let a reviewed-once branch carry a
# permanent pass.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$root" ] || exit 0
cd "$root" || exit 0

head="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$head" ] || exit 0

gitdir="$(git rev-parse --git-dir)"
marker="$gitdir/adversarial-review/$head"

[ -f "$marker" ] && exit 0

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"

cat >&2 <<MSG
Pull request creation is held: no adversarial review has run against $head.

Run /adversarial-review on this branch ($branch) first. It hands the change to
subagents that have not seen this conversation, and writes the receipt this guard
reads. Then create the pull request, and post the saved review to it.

Do not brief those subagents on the change. Every sentence explaining what it was
meant to do re-imports the blind spot the review exists to route around.

The guard is keyed to the commit, so a push after the review re-arms it: review the
tree you are actually publishing.

Deliberate bypass, if the review is genuinely not wanted for this change:
  mkdir -p "$gitdir/adversarial-review" && echo "skipped: <reason>" > "$marker"
It names the commit and records the reason, which is the part that cannot be
reconstructed later.
MSG
exit 2
