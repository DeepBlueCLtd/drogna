#!/usr/bin/env bash
#
# Graft the candidate into the client, run the client's own suite and its own gates
# against it, watch the no-mocked-traffic gate fail on a planted violation, and put
# everything back.
#
# This is spike code. It writes into `client/` for the length of one run and restores it
# from git afterwards, including when it fails part way through. It refuses to start if
# any of the files it would touch already differ from HEAD, because a spike that
# clobbered in-flight work would be a poor trade for the question it answers.
#
# Everything it learns lands in `results/`.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
client="${root}/client"
results="${here}/results"

grafted=(
  "client/src/transport/bus.ts"
  "client/twin/clockTwin.ts"
  "client/tests/busTransport.test.ts"
)
patched="client/src/transport/mqtt.ts"

say() { printf '%s\n' "$*"; }

restore() {
  say "restoring ${patched} and removing the graft"
  git -C "${root}" checkout -- "${patched}" 2>/dev/null || true
  for file in "${grafted[@]}"; do
    rm -f "${root}/${file}"
  done
  rmdir "${client}/twin" 2>/dev/null || true
}
trap restore EXIT

# --- refuse to start on a dirty tree -----------------------------------------------
for file in "${grafted[@]}" "${patched}"; do
  if [ -e "${root}/${file}" ] && ! git -C "${root}" diff --quiet -- "${file}"; then
    say "refusing: ${file} differs from HEAD; commit or stash it first"
    exit 2
  fi
done
for file in "${grafted[@]}"; do
  if [ -e "${root}/${file}" ]; then
    say "refusing: ${file} already exists; this spike would overwrite it"
    exit 2
  fi
done

mkdir -p "${results}" "${client}/twin"

# --- graft --------------------------------------------------------------------------
say "grafting the candidate into client/"
cp "${here}/candidate/bus.ts" "${client}/src/transport/bus.ts"
cp "${here}/candidate/clockTwin.ts" "${client}/twin/clockTwin.ts"
cp "${here}/proof/busTransport.test.ts" "${client}/tests/busTransport.test.ts"
git -C "${root}" apply "${here}/candidate/mqtt.patch" || { say "patch did not apply"; exit 3; }

# --- the proof ----------------------------------------------------------------------
say "running the client suite with the candidate present"
( cd "${client}" && pnpm exec vitest run ) > "${results}/client-suite.txt" 2>&1
suite=$?

say "type-checking the candidate as part of the client"
( cd "${client}" && pnpm exec tsc --noEmit ) > "${results}/typecheck.txt" 2>&1
types=$?

say "linting the candidate as part of the client"
( cd "${client}" && pnpm exec eslint . ) > "${results}/lint.txt" 2>&1
lint=$?

say "running the constitution gates that read client/src"
(
  cd "${root}"
  uv run python scripts/check_no_wallclock.py
  uv run python scripts/check_no_literal_paths.py
  uv run python scripts/check_forbidden_vocabulary.py
) > "${results}/gates.txt" 2>&1
gates=$?

# --- watch the gate fail -------------------------------------------------------------
# A check that has never been seen to fail is worth nothing. The word planted here is one
# the no-mocked-traffic test forbids outright; it is planted in a comment, which is
# exactly where a well-meaning later edit would put it.
say "planting a violation the no-mocked-traffic test must catch"
printf '\n// a %s of the clock, for the screenshot\n' "moc""k" >> "${client}/src/transport/bus.ts"
( cd "${client}" && pnpm exec vitest run tests/no-mock.test.ts ) > "${results}/gate-caught-violation.txt" 2>&1
caught=$?
git -C "${root}" checkout -- "${patched}" 2>/dev/null || true
cp "${here}/candidate/bus.ts" "${client}/src/transport/bus.ts"
git -C "${root}" apply "${here}/candidate/mqtt.patch"

say "confirming the gate is green again once the violation is removed"
( cd "${client}" && pnpm exec vitest run tests/no-mock.test.ts ) > "${results}/gate-green-again.txt" 2>&1
green=$?

# --- the record ----------------------------------------------------------------------
# The results are committed, so the host path they were produced under is stripped from
# them. FR-051 keeps filesystem paths out of anything published and a spike's evidence is
# no exception.
for file in "${results}"/*.txt; do
  [ -e "${file}" ] || continue
  sed -i "s|${root}/||g; s|${root}|.|g" "${file}"
done

{
  echo "client suite with candidate present:      $([ ${suite} -eq 0 ] && echo PASS || echo FAIL)"
  echo "typecheck:                                $([ ${types} -eq 0 ] && echo PASS || echo FAIL)"
  echo "lint:                                     $([ ${lint} -eq 0 ] && echo PASS || echo FAIL)"
  echo "constitution gates over client/src:       $([ ${gates} -eq 0 ] && echo PASS || echo FAIL)"
  echo "no-mocked-traffic test, violation planted: $([ ${caught} -ne 0 ] && echo "CAUGHT (correct)" || echo "MISSED (the gate is worthless)")"
  echo "no-mocked-traffic test, violation removed: $([ ${green} -eq 0 ] && echo PASS || echo FAIL)"
} | tee "${results}/summary.txt"

[ ${suite} -eq 0 ] && [ ${types} -eq 0 ] && [ ${lint} -eq 0 ] && [ ${gates} -eq 0 ] \
  && [ ${caught} -ne 0 ] && [ ${green} -eq 0 ]
