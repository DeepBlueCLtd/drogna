#!/usr/bin/env bash
#
# Prepare a freshly provisioned droplet to run drogna.
#
#   deploy/droplet/provision.sh
#
# Idempotent: run it as many times as you like. It installs a container runtime if one is
# absent, installs the systemd unit that brings the stack up at boot, and reports what it
# changed and what it left alone. It does not deploy — scripts/run_droplet.sh does that —
# so that provisioning a host and deploying to it stay separate concerns.
#
# Assumes a current Ubuntu LTS, which is what the droplet runs. Nothing here has been run
# against a real droplet from this checkout; the steps are the documented Docker
# installation for Ubuntu and a conventional systemd unit, and deploy/README.md says
# plainly that they are unverified.

set -euo pipefail

DROGNA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_NAME="harness.service"
UNIT_SOURCE="${DROGNA_ROOT}/deploy/droplet/systemd/${UNIT_NAME}"
SYSTEMD_UNIT_DIR="/etc/systemd/system" # harness:host-os-path systemd's own unit directory

changed=()
unchanged=()

require_root() {
  [ "$(id -u)" -eq 0 ] || {
    printf 'error: provisioning changes the host and must run as root\n' >&2
    exit 1
  }
}

install_container_runtime() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    unchanged+=("container runtime: docker with compose v2 is already installed")
    return
  fi
  printf 'installing the container runtime from the distribution repositories\n'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq docker.io docker-compose-v2
  systemctl enable --now docker
  changed+=("container runtime: installed docker.io and docker-compose-v2")
}

install_unit() {
  local target="${SYSTEMD_UNIT_DIR}/${UNIT_NAME}"
  local rendered
  rendered="$(sed "s|@@DEPLOYMENT_ROOT@@|${DROGNA_ROOT}|g" "${UNIT_SOURCE}")"
  if [ -f "${target}" ] && [ "$(cat "${target}")" = "${rendered}" ]; then
    unchanged+=("systemd unit: ${UNIT_NAME} is already installed and current")
  else
    printf '%s\n' "${rendered}" >"${target}"
    systemctl daemon-reload
    changed+=("systemd unit: wrote ${UNIT_NAME} pointing at ${DROGNA_ROOT}")
  fi
  if systemctl is-enabled --quiet "${UNIT_NAME}"; then
    unchanged+=("systemd unit: ${UNIT_NAME} is already enabled at boot")
  else
    systemctl enable "${UNIT_NAME}"
    changed+=("systemd unit: enabled ${UNIT_NAME} at boot")
  fi
}

require_root
install_container_runtime
install_unit

printf '\nprovisioning complete for the checkout at %s\n' "${DROGNA_ROOT}"
printf 'changed:\n'
if [ "${#changed[@]}" -eq 0 ]; then
  printf '  nothing; the host was already prepared\n'
else
  printf '  %s\n' "${changed[@]}"
fi
printf 'left alone:\n'
if [ "${#unchanged[@]}" -eq 0 ]; then
  printf '  nothing\n'
else
  printf '  %s\n' "${unchanged[@]}"
fi
printf '\nnext: scripts/run_droplet.sh\n'
