#!/usr/bin/env bash
#
# One command: package a fixture run, transfer it to the deployed stub archive, verify the
# receipt, and report the ledger. (014 T046.)
#
#   scripts/offload_demo.sh [destination]
#
# The destination this transfers to is the container `deploy/compose.yaml` declares as
# `archive` — the one 014 T045 added, because until it existed the packager's configuration
# named a host that answered nothing. This script starts it, and the clock beside it, because
# a receipt carries a simulation instant and the stub holds no clock of its own.
#
# Three profiles are named, and the reason is the one `deploy/seed.d/020-features.sh` records:
# Compose refuses a service whose dependency sits outside the selected profiles. `archive` is
# in `offload`, the `offload` service it exists for depends on the broker, and the clock it
# reads is in `foundation`.
#
# What it does not do: leave anything behind. The staging area, ledger and released directory
# are a scratch tree the Python driver removes when it is done, none of the deployment's
# volumes is touched, and the archive is stopped again on the way out.
#
# Stopping it is not tidiness. `archive` is in the `offload` profile, which the local
# destination does not activate, so an archive left running makes
# `test_compose_bringup.py::test_the_active_profile_starts_exactly_its_services_and_no_other`
# fail — the running set would hold a service the selected profiles do not name. That test is
# right, and a demonstration that quietly broke the next test run would be a poor trade for
# saving one `docker compose up`.

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

destination="$(destination_argument "${1:-}")"

require_python
require_docker

step "Bringing up the stub destination for '${destination}'"
render_environment "${destination}"

# Started rather than assumed. `up -d` converges: an archive that is already up is the
# normal case and not an error, which is the property `scripts/up.sh` is held to as well.
docker compose \
  --file "${DROGNA_COMPOSE_FILE}" \
  --env-file "${DROGNA_ENV_FILE}" \
  --profile offload --profile broker --profile foundation \
  up --detach --wait archive clock ||
  fail "the stub destination did not come up; nothing was packaged"

# Registered before the packaging runs, so the archive is stopped whether the demonstration
# succeeds, fails or is interrupted.
stop_archive() {
  docker compose \
    --file "${DROGNA_COMPOSE_FILE}" \
    --env-file "${DROGNA_ENV_FILE}" \
    --profile offload --profile broker --profile foundation \
    rm --force --stop archive >/dev/null 2>&1 || true
}
trap stop_archive EXIT

step "Packaging a fixture run and transferring it"
# uv, because the driver imports harness_offload and the workspace is where that lives. The
# exit status is propagated deliberately: a wrapper that ran a command and reported its own
# success is the fault `scripts/run_local.sh` was found to have, and this one composes two
# commands in exactly the same shape.
uv run python "${DROGNA_ROOT}/scripts/offload_demo.py" "${destination}" ||
  fail "the offload demonstration failed; see above"

step "Offload demonstration complete after $(elapsed)"
