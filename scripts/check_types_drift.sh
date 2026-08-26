#!/usr/bin/env bash
#
# Quality gate 5: the committed generated types still match their masters.
#
#   scripts/check_types_drift.sh
#
# Regenerates into a scratch directory, compares it with what is committed, prints a
# readable diff and exits non-zero on any difference. It writes nothing to the working
# tree whether it passes or fails, needs no running service, and reaches no network — it
# reads the documents in the repository and nothing else.
#
# It fails on all three of: a schema edited without regenerating, a generated file edited
# by hand, and a vendored specification refreshed without regenerating. That is the whole
# point: committed generated code is only trustworthy if something proves it is current.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec uv run --project "${root}" python "${root}/scripts/generate_types.py" --check "$@"
