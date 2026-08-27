#!/usr/bin/env bash
#
# Start a static server over `served/`, drive it with Playwright, and report.
#
# This is spike code. It copies the candidate worker into the served tree for the length
# of one run and removes it afterwards, including when it fails part way through, so the
# committed tree never carries a worker that nothing asked for.
#
# The one thing it cannot do is prove GitHub Pages. It proves the platform rules that hold
# identically wherever the files are served from — worker scope, the claim race, what a
# blocked worker does — over `http://127.0.0.1`, which is a secure context by definition
# and therefore needs no certificate. FINDING.md says which is which.
#
# Everything it learns lands in `results/`.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
client="${root}/client"
results="${here}/results"
worker="${here}/served/drogna/pr/17/sw.js"
# The specs are grafted under client/e2e/ rather than run where they sit. Three reasons,
# and the third is the one that matters: `@playwright/test` resolves from client/, the
# package type there settles how the config is loaded, and `client/e2e` is a directory
# `scripts/check_no_fixed_sleep.py` actually scans. `spikes/` is in the gates' shared
# exclusion list by design, so a gate pointed at this directory reports clean because it
# reads nothing — which is exactly the shape of a check that has never been seen to fail.
graft="${client}/e2e/spike"
server_pid=""
fifo=""

say() { printf '%s\n' "$*"; }

cleanup() {
  [ -n "${server_pid}" ] && kill "${server_pid}" 2>/dev/null
  rm -f "${worker}" "${here}/served/drogna/pr/18/sw.js" "${fifo:-}"
  rm -rf "${graft}" "${results}/runner"   # Playwright runner scratch; the record is the .txt files
}
trap cleanup EXIT

if [ -e "${worker}" ]; then
  say "refusing: ${worker} already exists; this spike would overwrite it"
  exit 2
fi
if [ -e "${graft}" ]; then
  say "refusing: ${graft} already exists; this spike would overwrite it"
  exit 2
fi

mkdir -p "${results}"

# --- the served tree ------------------------------------------------------------------
# Copied rather than committed in place, so that the worker under test is unambiguously
# the one in candidate/ and a stale copy cannot be what got proved.
cp "${here}/candidate/sw.js" "${worker}"

# --- the graft --------------------------------------------------------------------------
say "grafting the specs into client/e2e/spike"
mkdir -p "${graft}"
cp "${here}/proof/worker.spec.ts" "${here}/proof/playwright.config.ts" "${graft}/"
export SPIKE_RESULTS="${results}"

# --- the server -----------------------------------------------------------------------
say "starting the static server"
# The port is read from the server's own first line of output through a pipe, so the wait
# is on the server having bound rather than on a duration. A polling loop here would be
# the same fixed delay FR-019 forbids in a capture path, written in a language the gate
# does not read; the ceiling below is a bound on a wait, not a wait.
fifo="$(mktemp -u)"
mkfifo "${fifo}"
node "${here}/proof/server.mjs" > "${fifo}" &
server_pid=$!

port=""
read -r -t 30 port < "${fifo}"
rm -f "${fifo}"
if [ -z "${port}" ]; then
  say "the server never reported a port"
  exit 3
fi
export SPIKE_BASE_URL="http://127.0.0.1:${port}"
say "serving ${SPIKE_BASE_URL}"

# --- the proof ------------------------------------------------------------------------
say "driving it with Playwright"
( cd "${client}" && pnpm exec playwright test --config "${graft}/playwright.config.ts" ) \
  > "${results}/playwright.txt" 2>&1
proof=$?

say "type-checking the specs as part of the client's capture tree"
( cd "${client}" && pnpm exec tsc --noEmit -p e2e/tsconfig.json ) > "${results}/typecheck.txt" 2>&1
types=$?

# --- watch the gate fail ---------------------------------------------------------------
# FR-019 forbids a fixed delay in a capture path, and these specs are one. A check that has
# never been seen to fail is worth nothing, so plant one and watch it caught.
say "running the fixed-sleep gate over its own directories, the graft included"
( cd "${root}" && uv run python scripts/check_no_fixed_sleep.py ) > "${results}/gate-clean.txt" 2>&1
gate=$?

say "planting a fixed delay the gate must catch"
printf '\n// await page.%s(500);\n' "waitForTimeout" >> "${graft}/worker.spec.ts"
( cd "${root}" && uv run python scripts/check_no_fixed_sleep.py ) \
  > "${results}/gate-caught-violation.txt" 2>&1
caught=$?
cp "${here}/proof/worker.spec.ts" "${graft}/worker.spec.ts"

say "confirming the gate is green again once the delay is removed"
( cd "${root}" && uv run python scripts/check_no_fixed_sleep.py ) > "${results}/gate-green-again.txt" 2>&1
green=$?

# --- the record -------------------------------------------------------------------------
for file in "${results}"/*.txt; do
  [ -e "${file}" ] || continue
  sed -i "s|${root}/||g; s|${root}|.|g; s|127.0.0.1:[0-9]*|127.0.0.1:PORT|g" "${file}"
done

{
  echo "worker specs (scope, race, wire, blocked):  $([ ${proof} -eq 0 ] && echo PASS || echo FAIL)"
  echo "specs typecheck:                            $([ ${types} -eq 0 ] && echo PASS || echo FAIL)"
  echo "fixed-sleep gate over the specs:            $([ ${gate} -eq 0 ] && echo PASS || echo FAIL)"
  echo "fixed-sleep gate, delay planted:            $([ ${caught} -ne 0 ] && echo "CAUGHT (correct)" || echo "MISSED (the gate is worthless)")"
  echo "fixed-sleep gate, delay removed:            $([ ${green} -eq 0 ] && echo PASS || echo FAIL)"
} | tee "${results}/summary.txt"

[ ${proof} -eq 0 ] && [ ${types} -eq 0 ] && [ ${gate} -eq 0 ] && [ ${caught} -ne 0 ] && [ ${green} -eq 0 ]
