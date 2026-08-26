#!/usr/bin/env bash
#
# Bring drogna up at one destination, and converge on the same state when it is already up.
#
#   scripts/up.sh [destination]
#
# The destination defaults to 'local'. Everything the stack needs comes from
# config/<destination>/; this script generates no value of its own except the deployment
# secrets, which are generated once and reused.

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

destination="$(destination_argument "${1:-}")"

require_python
require_docker

step "Checking the configuration for destination '${destination}'"
check_destination "${destination}"
render_environment "${destination}"

services="$(active_services)"
[ -n "${services}" ] ||
  fail "the active profile selects no service; see profiles.active in config/${destination}/deployment.json"

step "Active profile selects: $(echo "${services}" | tr '\n' ' ')"

# Only ports for services that are not already up: a second bring-up finds its own ports
# occupied, and converging is the required behaviour, not a failure.
already_running="$(running_services || true)"
starting="$(comm -23 <(echo "${services}") <(echo "${already_running}") || true)"
if [ -n "${starting}" ]; then
  # shellcheck disable=SC2086
  py preflight.py "${destination}" ${starting} ||
    fail "a port this destination needs is not available; nothing was started"
fi

wait_timeout="$(
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["runtime"]["wait_timeout_seconds"])' \
    "${DROGNA_ROOT}/config/${destination}/deployment.json"
)"

step "Starting; images are built where they are missing, which can take some minutes"
if ! compose up --detach --build --wait --wait-timeout "${wait_timeout}"; then
  printf '\nerror: not every service became healthy within %ss. What the stack reports:\n' \
    "${wait_timeout}" >&2
  report_unhealthy
  printf '\nLogs for one service: docker compose --file %s --env-file %s logs <service>\n' \
    "${DROGNA_COMPOSE_FILE}" "${DROGNA_ENV_FILE}" >&2
  exit 1
fi

step "Up after $(elapsed)"
compose ps
printf '\nThis destination advertises %s\n' "$(public_url)"
