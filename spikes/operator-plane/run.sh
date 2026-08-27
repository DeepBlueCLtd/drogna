#!/usr/bin/env bash
#
# Graft the candidate into the library and the client, prove the round trip from both
# ends, watch the gates fail on planted violations, and put everything back.
#
# This is spike code. It writes into `libs/` and `client/` for the length of one run and
# restores them from git afterwards, including when it fails part way through. It refuses
# to start if any of the files it would touch already exist.
#
# Everything it learns lands in `results/`.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
client="${root}/client"
results="${here}/results"

grafted=(
  "libs/harness_core/src/harness_core/fault.py"
  "libs/harness_core/tests/test_fault_roundtrip.py"
  "client/tests/faultDisplay.test.ts"
)

say() { printf '%s\n' "$*"; }

cleanup() {
  for file in "${grafted[@]}"; do
    rm -f "${root}/${file}"
  done
}
trap cleanup EXIT

for file in "${grafted[@]}"; do
  if [ -e "${root}/${file}" ]; then
    say "refusing: ${file} already exists; this spike would overwrite it"
    exit 2
  fi
done

mkdir -p "${results}"

# --- graft ---------------------------------------------------------------------------
say "grafting the candidate into libs/harness_core and client/tests"
cp "${here}/candidate/fault.py" "${root}/libs/harness_core/src/harness_core/fault.py"
cp "${here}/proof/test_fault_roundtrip.py" "${root}/libs/harness_core/tests/test_fault_roundtrip.py"
cp "${here}/proof/faultDisplay.test.ts" "${client}/tests/faultDisplay.test.ts"

# --- the proof, both ends -------------------------------------------------------------
say "the component end: a requested impairment reaches a real, validated heartbeat"
( cd "${root}" && uv run pytest libs/harness_core/tests/test_fault_roundtrip.py -q ) \
  > "${results}/python-roundtrip.txt" 2>&1
python_end=$?

say "the display end: four provocations, four distinguishable things on the page"
( cd "${client}" && pnpm exec vitest run tests/faultDisplay.test.ts ) \
  > "${results}/display.txt" 2>&1
display_end=$?

say "the rest of the suites, to show the graft breaks nothing"
( cd "${root}" && uv run pytest libs/harness_core -q ) > "${results}/library-suite.txt" 2>&1
library=$?
( cd "${client}" && pnpm exec vitest run ) > "${results}/client-suite.txt" 2>&1
client_suite=$?

say "lint, format and the constitution gates over the grafted tree"
( cd "${root}" && uv run ruff check . && uv run ruff format --check . ) \
  > "${results}/ruff.txt" 2>&1
ruff=$?
( cd "${root}" && ./scripts/gates.sh ) > "${results}/gates.txt" 2>&1
gates=$?

# --- watch two gates fail ---------------------------------------------------------------
# A check that has never been seen to fail is worth nothing. Two are exercised, because
# this candidate is the first thing in the repository that could plausibly break either.

say "planting a host-clock read in the fault state, which Constitution I must catch"
cp "${root}/libs/harness_core/src/harness_core/fault.py" "${results}/.fault.backup"
printf '\n\ndef _expires_in_real_seconds() -> float:\n    import time\n\n    return time.time() + 60\n' \
  >> "${root}/libs/harness_core/src/harness_core/fault.py"
( cd "${root}" && uv run python scripts/check_no_wallclock.py ) \
  > "${results}/gate-caught-wallclock.txt" 2>&1
caught_wallclock=$?
cp "${results}/.fault.backup" "${root}/libs/harness_core/src/harness_core/fault.py"

say "planting a console that lights the page, which the no-mocked-traffic test must catch"
cp "${client}/tests/faultDisplay.test.ts" "${results}/.display.backup"
mkdir -p "${client}/src/console"
cat > "${client}/src/console/faultConsole.ts" <<'PLANTED'
// A console that composes a heartbeat and hands it to the reducer would light a node
// without one having arrived. Planted so the test that forbids it can be seen refusing.
export function pretendDegraded(): Record<string, unknown> {
  return { component: "planner", status: "degraded" };
}
export const DEMO_MODE = true;
PLANTED
( cd "${client}" && pnpm exec vitest run tests/no-mock.test.ts ) \
  > "${results}/gate-caught-console.txt" 2>&1
caught_console=$?
rm -rf "${client}/src/console"
cp "${results}/.display.backup" "${client}/tests/faultDisplay.test.ts"
rm -f "${results}/.fault.backup" "${results}/.display.backup"

say "confirming both are green again once the plants are removed"
( cd "${root}" && uv run python scripts/check_no_wallclock.py ) > "${results}/gate-green-again.txt" 2>&1
green_wallclock=$?
( cd "${client}" && pnpm exec vitest run tests/no-mock.test.ts ) >> "${results}/gate-green-again.txt" 2>&1
green_console=$?

# --- the record --------------------------------------------------------------------------
for file in "${results}"/*.txt; do
  [ -e "${file}" ] || continue
  sed -i "s|${root}/||g; s|${root}|.|g" "${file}"
done

{
  echo "component end, impairment reaches a validated heartbeat:  $([ ${python_end} -eq 0 ] && echo PASS || echo FAIL)"
  echo "display end, four provocations distinguishable:           $([ ${display_end} -eq 0 ] && echo PASS || echo FAIL)"
  echo "harness_core suite with the candidate present:            $([ ${library} -eq 0 ] && echo PASS || echo FAIL)"
  echo "client suite with the candidate present:                  $([ ${client_suite} -eq 0 ] && echo PASS || echo FAIL)"
  echo "ruff check and format:                                    $([ ${ruff} -eq 0 ] && echo PASS || echo FAIL)"
  echo "all constitution gates:                                   $([ ${gates} -eq 0 ] && echo PASS || echo FAIL)"
  echo "Constitution I, host clock planted:                       $([ ${caught_wallclock} -ne 0 ] && echo "CAUGHT (correct)" || echo "MISSED (the gate is worthless)")"
  echo "no-mocked-traffic, console planted:                       $([ ${caught_console} -ne 0 ] && echo "CAUGHT (correct)" || echo "MISSED (the test is worthless)")"
  echo "both green again once the plants are removed:             $([ ${green_wallclock} -eq 0 ] && [ ${green_console} -eq 0 ] && echo PASS || echo FAIL)"
} | tee "${results}/summary.txt"

[ ${python_end} -eq 0 ] && [ ${display_end} -eq 0 ] && [ ${library} -eq 0 ] \
  && [ ${client_suite} -eq 0 ] && [ ${ruff} -eq 0 ] && [ ${gates} -eq 0 ] \
  && [ ${caught_wallclock} -ne 0 ] && [ ${caught_console} -ne 0 ] \
  && [ ${green_wallclock} -eq 0 ] && [ ${green_console} -eq 0 ]
