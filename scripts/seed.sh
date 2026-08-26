#!/usr/bin/env bash
#
# Produce every piece of seed content this destination needs, and record what was produced.
#
#   scripts/seed.sh [destination]
#
# All content in a running drogna comes from here. Nothing accumulates: a store holds what
# a seeding step put in it and nothing else, which is what makes a fresh instance
# equivalent to one that has been running for a week (SRD NFR-07).
#
# A step is an executable file in deploy/seed.d/, run in lexical order. Each is handed the
# root seed, the destination and a directory to write its artefacts into; see the contract
# in deploy/seed.d/README.md. Steps must be idempotent: this script is expected to be run
# again after an interruption and to converge rather than to seed twice.

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

destination="$(destination_argument "${1:-}")"

require_python
check_destination "${destination}"
require_docker
render_environment "${destination}"

root_seed="$(py seed_record.py "${destination}" --print-root-seed)"
runtime_dir="$(sed -n 's/^HARNESS_RUNTIME_HOST_DIR=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1)"
artefact_dir="${runtime_dir}/artefacts"
mkdir -p "${artefact_dir}"

step "Seeding '${destination}' from root seed ${root_seed}"

steps_run=0
for script in "${DROGNA_DEPLOY_DIR}"/seed.d/*.sh; do
  [ -f "${script}" ] || continue
  name="$(basename "${script}" .sh)"
  log "  step ${name}"
  mkdir -p "${artefact_dir}/${name}"
  DROGNA_ROOT_SEED="${root_seed}" \
  DROGNA_DESTINATION="${destination}" \
  DROGNA_ARTEFACT_DIR="${artefact_dir}/${name}" \
  DROGNA_COMPOSE_FILE="${DROGNA_COMPOSE_FILE}" \
  DROGNA_ENV_FILE="${DROGNA_ENV_FILE}" \
    bash "${script}" || fail "seeding step ${name} failed; no seeding record was written"
  steps_run=$((steps_run + 1))
done

if [ "${steps_run}" -eq 0 ]; then
  log "  no seeding steps are installed yet; the record below is of a stack with nothing"
  log "  in it, which is the truth about the components built so far"
fi

# Written last, and written whole, so that an interrupted run leaves no record claiming
# success.
record="$(py seed_record.py "${destination}")"
step "Seeded after $(elapsed); record at ${record}"
