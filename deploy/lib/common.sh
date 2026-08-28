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

# How much of a failing service's log travels with the bring-up's failure report. Short
# enough to read, long enough to carry a stack trace's last frame.
DROGNA_LOG_TAIL="${DROGNA_LOG_TAIL:-25}"

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

# DROGNA_PROFILES overrides the destination's profiles.active for one invocation. It exists
# for the capture workflow, which needs the clock, the broker and the client running in order
# to photograph a shell with anything lit, and which is not a destination and should not have
# to become one to say so.
#
# It is deliberately an override and not a second source of truth: unset, every command here
# runs exactly what profiles.active names, and nothing reads this variable except the line
# below. `deploy/README.md` says what a profile means and what it does not, and none of that
# changes — a profile still describes what runs, and illumination is still driven by
# heartbeats and by nothing else.
compose() {
  if [ -n "${DROGNA_PROFILES:-}" ]; then
    COMPOSE_PROFILES="${DROGNA_PROFILES}" \
      docker compose --file "${DROGNA_COMPOSE_FILE}" --env-file "${DROGNA_ENV_FILE}" "$@"
  else
    docker compose --file "${DROGNA_COMPOSE_FILE}" --env-file "${DROGNA_ENV_FILE}" "$@"
  fi
}

# Every secret this deployment needs, generated once and then reused.
#
# The database's four used to be generated here — the owner's password and one per run-time
# role — and ADR-0023 retired them. The observation store authenticates by trust for the
# compose network, so there is no database password to generate, to keep in step with a
# store initialised from an earlier one, or to reconcile with a DSN.
ensure_secrets() {
  # One secret per broker role, on the same terms and for the same reason: the broker's
  # password file is written from these values, and presenting new ones to a broker whose
  # file was written from the old ones refuses every component. Reset regenerates them,
  # because reset removes the password file too.
  # The role list comes from render_credentials.ROLE_SECRETS, which is derived from the
  # access control list's blocks. Repeating it here is how a role gets added to the broker
  # and silently never given a secret, so it is read rather than typed.
  local names
  names="$(python3 "${DROGNA_LIB_DIR}/render_credentials.py" --secret-names)" ||
    fail "could not read the broker role list from render_credentials.py"
  for name in ${names}; do
    if [ -f "${DROGNA_ENV_FILE}" ] && [ -z "$(eval "printf '%s' \"\${${name}:-}\"")" ]; then
      eval "${name}=\"$(sed -n "s/^${name}=\\(.*\\)$/\\1/p" "${DROGNA_ENV_FILE}" | tail -n 1)\""
    fi
    if [ -z "$(eval "printf '%s' \"\${${name}:-}\"")" ]; then
      eval "${name}=\"$(python3 -c 'import secrets; print(secrets.token_hex(24))')\""
      log "generated ${name} into the untracked environment file"
    fi
    eval "export ${name}"
  done
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
  # The deploy-time hostname, exported for the credential render below. render_env.py has
  # just resolved it — the environment first, then the previous environment file — and
  # persisted the answer, so reading it back here is what makes a second bring-up render
  # the same address without the variable being exported again. Empty is a value: the
  # tracked placeholder stands, which is what the local destination always wants.
  if [ -z "${HARNESS_PUBLIC_HOSTNAME:-}" ] && [ -f "${DROGNA_ENV_FILE}" ]; then
    HARNESS_PUBLIC_HOSTNAME="$(
      sed -n 's/^HARNESS_PUBLIC_HOSTNAME=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1
    )"
  fi
  export HARNESS_PUBLIC_HOSTNAME
  # The configuration a container actually reads, and the broker's password file. Both are
  # written from the secrets above so that the two halves of a credential cannot disagree,
  # and both are untracked. Until this existed the tracked broker URLs named no role, no
  # secret reached any component, and nothing could authenticate (ADR-0016).
  py render_credentials.py "${destination}" >/dev/null ||
    fail "could not render the configuration or the broker password file for ${destination}"
}

active_services() {
  compose config --services 2>/dev/null | sort
}

# The active services that are expected to still be there once the stack is up.
#
# A one-shot says so in the Compose file, with `harness.lifecycle: one-shot`, and the label
# is read from the rendered configuration rather than from a list here — a list would be a
# second place to forget. `features` and `env-generator` carry it: both write what they owe
# and exit 0, which is success, and asking `--wait` about them reports it as failure.
long_lived_services() {
  local one_shots
  one_shots="$(
    compose config --format json 2>/dev/null |
      python3 -c '
import json, sys

document = json.load(sys.stdin)
for name, service in sorted(document.get("services", {}).items()):
    labels = service.get("labels") or {}
    if isinstance(labels, list):
        labels = dict(item.split("=", 1) for item in labels if "=" in item)
    if labels.get("harness.lifecycle") == "one-shot":
        print(name)
'
  )" || return 1
  comm -23 <(active_services) <(printf '%s' "${one_shots}" | sort)
}

running_services() {
  compose ps --services --status running 2>/dev/null | sort
}

public_url() {
  sed -n 's/^HARNESS_PUBLIC_URL=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1
}

# --all is what makes an exited container visible: `compose ps` without it lists only what
# is still up, so a container that crashed reads exactly like one that was never created.
# The judgement itself lives in deploy/lib/service_states.py, where it can be tested without
# a container runtime — see its docstring for the three false lines that put it there.
report_unhealthy() {
  local states service
  states="$(compose ps --all --format json 2>/dev/null)"
  printf '%s' "${states}" |
    python3 "${DROGNA_LIB_DIR}/service_states.py" $(active_services) >&2

  # And what each of them said on its way down. Pointing at `docker compose logs` was
  # reasonable advice for someone at a terminal and no use at all in CI, where the stack is
  # gone by the time a person reads the failure — so the reason travels with the report
  # rather than being available on request. The tail is short because the useful line is
  # nearly always the last one: a refused credential, a configuration nginx would not
  # accept, a port already taken.
  for service in $(printf '%s' "${states}" |
    python3 "${DROGNA_LIB_DIR}/service_states.py" --names-only $(active_services)); do
    printf '\n--- %s, last %s lines ---\n' "${service}" "${DROGNA_LOG_TAIL}" >&2
    compose logs --no-color --tail "${DROGNA_LOG_TAIL}" "${service}" 2>&1 |
      sed 's/^/  /' >&2 || printf '  (no logs; the container may never have started)\n' >&2
  done
}
