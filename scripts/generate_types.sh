#!/usr/bin/env bash
#
# Regenerate every type that crosses a language boundary, from the masters under
# contracts/ (Constitution III).
#
#   scripts/generate_types.sh
#
# One command, no arguments, no network. It rewrites libs/harness_types/ and
# client/src/generated/, and refreshes the schema documents that travel inside component
# packages. Run it after editing anything under contracts/, and commit what it writes:
# the generated trees are committed so a checkout builds without a generator, and
# scripts/check_types_drift.sh proves in CI that they still match their sources.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec uv run --project "${root}" python "${root}/scripts/generate_types.py" "$@"
