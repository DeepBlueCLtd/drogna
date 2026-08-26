# Shared shell for the deployment scripts. Sourced, never executed.
#
# Everything the scripts need to know about where things are is derived here, from the
# position of this file, so that no script carries a path to the repository.

set -euo pipefail

DROGNA_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DROGNA_DEPLOY_DIR="$(dirname "${DROGNA_LIB_DIR}")"
DROGNA_ROOT="$(dirname "${DROGNA_DEPLOY_DIR}")"
DROGNA_COMPOSE_FILE="${DROGNA_DEPLOY_DIR}/compose.yaml"
DROGNA_ENV_FILE="${DROGNA_DEPLOY_DIR}/.env"
DROGNA_DEFAULT_DESTINATION="local"

log() { printf '%s\n' "$*"; }

step() { printf '\n== %s\n' "$*"; }

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Elapsed seconds since the shell started. Not a clock reading: the constitution's bar is
# that no component takes operational time from the host, and a progress message is not
# operational. Bash's SECONDS is a duration, which is all a progress message needs.
elapsed() { printf '%ss' "${SECONDS}"; }

destination_argument() {
  local given="${1:-${DROGNA_DEFAULT_DESTINATION}}"
  [ -d "${DROGNA_ROOT}/config/${given}" ] ||
    fail "no such destination: ${given} (expected config/${given}/ to exist)"
  printf '%s' "${given}"
}

require_python() {
  command -v python3 >/dev/null 2>&1 ||
    fail "python3 is not on PATH; the configuration checks and the environment renderer need it"
}

require_docker() {
  command -v docker >/dev/null 2>&1 ||
    fail "docker is not on PATH; see deploy/README.md for what a destination needs installed"
  docker compose version >/dev/null 2>&1 ||
    fail "docker compose v2 is not available; 'docker compose version' failed"
  docker info >/dev/null 2>&1 ||
    fail "the docker daemon is not reachable from this shell"
}

py() { python3 "${DROGNA_LIB_DIR}/$1" "${@:2}"; }

compose() {
  docker compose --file "${DROGNA_COMPOSE_FILE}" --env-file "${DROGNA_ENV_FILE}" "$@"
}

# The database password is generated once and then reused, so that a second bring-up does
# not present a new password to a store initialised with the old one. Reset is what
# regenerates it, because reset removes the store as well.
ensure_secrets() {
  if [ -f "${DROGNA_ENV_FILE}" ]; then
    HARNESS_DATABASE_PASSWORD="$(
      sed -n 's/^HARNESS_DATABASE_PASSWORD=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1
    )"
  fi
  if [ -z "${HARNESS_DATABASE_PASSWORD:-}" ]; then
    HARNESS_DATABASE_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
    log "generated a database password into the untracked environment file"
  fi
  export HARNESS_DATABASE_PASSWORD
}

check_destination() {
  local destination="$1"
  py validate_config.py "${destination}" ||
    fail "the destination's configuration is not valid; nothing was started"
  py destination_parity.py ||
    fail "the destinations have drifted apart; nothing was started"
}

render_environment() {
  local destination="$1"
  ensure_secrets
  py render_env.py "${destination}" >/dev/null ||
    fail "could not render the environment file for ${destination}"
}

active_services() {
  compose config --services 2>/dev/null | sort
}

running_services() {
  compose ps --services --status running 2>/dev/null | sort
}

public_url() {
  sed -n 's/^HARNESS_PUBLIC_URL=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1
}

report_unhealthy() {
  local service
  for service in $(active_services); do
    local state
    state="$(compose ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null |
      awk -v want="${service}" '$1 == want { print $2" "$3 }')"
    case "${state}" in
      *healthy*|*running*|*exited*) ;;
      "") printf '  %s: no container was created\n' "${service}" >&2 ;;
      *) printf '  %s: %s\n' "${service}" "${state}" >&2 ;;
    esac
  done
}
