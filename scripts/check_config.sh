#!/usr/bin/env bash
#
# Validate a destination's configuration against its schemas, before anything starts.
#
#   scripts/check_config.sh [destination] [--strict]
#
# --strict treats a configuration file whose schema has not been written yet as a failure.
# Without it such a file is reported as a gap: components are still arriving, and a gap
# that is named is honest where a silent pass would not be.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

strict=()
positional=()
for argument in "$@"; do
  case "${argument}" in
    --strict) strict+=("--strict") ;;
    -*) fail "unknown option: ${argument}" ;;
    *) positional+=("${argument}") ;;
  esac
done

destination="$(destination_argument "${positional[0]:-}")"
require_python
py validate_config.py "${destination}" "${strict[@]}"
