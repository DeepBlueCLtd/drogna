#!/usr/bin/env bash
#
# Spike code — throwaway. The one command.
#
#   ./run.sh
#
# Brings drogna up inside a Claude Code development cloud container and takes one headless
# Chromium capture of the running client. Needs no arguments and no editing: everything it
# needs about this machine it reads from the machine.
#
# It is safe to run again. `scripts/up.sh` converges rather than failing, and a second
# glance writes a second numbered image beside the first.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
results="${here}/results"
mkdir -p "${results}"

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nrun.sh: %s\n' "$1" >&2; exit 1; }

step "A Docker daemon"
# The container ships the client and dockerd but starts neither. This is the one step that
# is about the cloud rather than about drogna, and it is why this spike exists: every
# container test in the repository skips where there is no daemon, and what skips here has
# never been run at all until CI runs it.
if docker info >/dev/null 2>&1; then
  echo "   already running"
else
  nohup dockerd > "${results}/dockerd.log" 2>&1 &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || fail "dockerd did not come up; see ${results}/dockerd.log"
  echo "   started; log in ${results}/dockerd.log"
fi

step "The egress proxy's certificate authority"
# Every connection a build container makes is TLS-terminated by the session's egress proxy,
# whose authority no base image knows. `HARNESS_PROXY_CA_FILE` is the seam the deployment
# already ships for exactly this (deploy/README.md, "Building behind a TLS-terminating
# proxy"); SSL_CERT_FILE is where this environment keeps the bundle, and it is a complete
# one — public roots included — so nothing is lost by trusting it.
: "${HARNESS_PROXY_CA_FILE:=${SSL_CERT_FILE:-}}"
[ -n "${HARNESS_PROXY_CA_FILE}" ] ||
  fail "neither HARNESS_PROXY_CA_FILE nor SSL_CERT_FILE is set, and behind this proxy no image can fetch a package"
[ -s "${HARNESS_PROXY_CA_FILE}" ] ||
  fail "HARNESS_PROXY_CA_FILE names ${HARNESS_PROXY_CA_FILE}, which is empty or missing"
export HARNESS_PROXY_CA_FILE
echo "   ${HARNESS_PROXY_CA_FILE}"

step "Bring the stack up, and seed it"
# The repository's own one command, unmodified. A first build here is some minutes; the
# images are four, and none of them is cached in a fresh container.
(cd "${root}" && ./scripts/run_local.sh) 2>&1 | tee "${results}/with-ca.txt"
[ "${PIPESTATUS[0]}" -eq 0 ] || fail "the stack did not come up; see ${results}/with-ca.txt"

(cd "${root}" && docker ps --format '   {{.Names}}  {{.Status}}') | tee "${results}/containers.txt"

step "Client dependencies, for the browser mechanism"
# Nothing is downloaded for the browser itself: the container already carries the Chromium
# build the pinned Playwright asks for. `playwright install` is neither needed nor wanted.
(cd "${root}/client" && pnpm install --frozen-lockfile) > "${results}/pnpm-install.txt" 2>&1 ||
  fail "client dependencies would not install; see ${results}/pnpm-install.txt"
echo "   installed"

step "One headless Chromium capture of the running client"
# The glance is the repository's own mechanism for this and it is the right one: it starts
# no server, pins no clock and changes nothing, and it prints the rate in force beside the
# image so that a picture of a stopped system is never handed over as a live one.
export HARNESS_CONFIG="config/local/capture.json"
(cd "${root}" && node scripts/capture/glance/run.mjs) 2>&1 | tee "${results}/glance.txt"
[ "${PIPESTATUS[0]}" -eq 0 ] || fail "no image was produced; see ${results}/glance.txt"

step "Done"
cat <<'NOTE'
   The stack is up and stays up. The client is at http://127.0.0.1:8080.
   Take another look at any time with:

     HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs

   Take it down with `scripts/down.sh local`. Note that running the Python test
   suite takes it down too — tests/integration/test_compose_bringup.py drives the
   real scripts against the real project name.
NOTE
