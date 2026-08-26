#!/usr/bin/env bash
#
# Take drogna down at one destination.
#
#   scripts/down.sh [destination] [--volumes]
#
# Without --volumes the derived data survives, so that down followed by up is a restart.
# With --volumes nothing survives, which is what makes an instance disposable: seeding
# reproduces every volume, so removing them loses nothing that a script cannot make again.

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

remove_volumes="no"
positional=()
for argument in "$@"; do
  case "${argument}" in
    --volumes) remove_volumes="yes" ;;
    -*) fail "unknown option: ${argument}" ;;
    *) positional+=("${argument}") ;;
  esac
done

destination="$(destination_argument "${positional[0]:-}")"

require_python
require_docker
render_environment "${destination}"

if [ "${remove_volumes}" = "yes" ]; then
  step "Stopping, and removing every volume this project created"
  compose down --volumes --remove-orphans
  runtime_dir="$(sed -n 's/^HARNESS_RUNTIME_HOST_DIR=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1)"
  if [ -n "${runtime_dir}" ] && [ -d "${runtime_dir}" ]; then
    rm -rf "${runtime_dir}"
    log "removed the runtime directory, including the seeding record"
  fi
else
  step "Stopping; volumes are kept"
  compose down --remove-orphans
fi

step "Down after $(elapsed)"
