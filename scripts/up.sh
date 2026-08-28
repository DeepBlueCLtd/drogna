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

# Building and waiting are separated because they are bounded by different things, and
# conflating them made runtime.wait_timeout_seconds mean whichever of the two happened to
# take longer. `compose up --build --wait --wait-timeout` spends the timeout on the build
# as well as on the health checks, so a first bring-up on a machine with no layer cache —
# four images here — exhausted it before a single container existed and then reported that
# not every service had become healthy. Nothing had become anything; there was nothing to
# be healthy yet.
#
# The timeout is a statement about how long a component may take to come up, which is a
# property of the component. How long an image takes to build is a property of the machine
# and its cache, and belongs under no deadline this file sets.
step "Building images where they are missing, which can take some minutes"
if ! compose build; then
  printf '\nerror: an image could not be built; nothing was started.\n' >&2
  exit 1
fi

# Waited on: every active service that is not declared a one-shot. `--wait` asks each named
# service to be running or healthy, and a one-shot is neither by the time it is asked — it
# writes what it owes and exits 0, which is success and was being reported as failure.
#
# The one-shots are still started, and still waited for: whatever depends on them says
# `condition: service_completed_successfully`, so Compose blocks on their exit status before
# starting the dependent. Naming the long-lived services here changes what `--wait` is asked
# about, not what runs.
waited="$(long_lived_services)"
[ -n "${waited}" ] ||
  fail "the active profile selects no long-lived service; there would be nothing to wait for"

step "Starting, and waiting up to ${wait_timeout}s for every service to report healthy"
# shellcheck disable=SC2086
if ! compose up --detach --wait --wait-timeout "${wait_timeout}" ${waited}; then
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
