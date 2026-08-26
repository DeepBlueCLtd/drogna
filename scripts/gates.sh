#!/usr/bin/env bash
#
# Every constitution gate, in one command (FR-036).
#
#   scripts/gates.sh [--fail-fast] [--no-inventory] [--registry PATH]
#
# Runs each gate registered in scripts/gates.registry, prints the exemption inventory
# once at the end, and exits non-zero if any gate found a violation.
#
# Two decisions worth stating.
#
# **Every gate runs, even after one fails.** A runner that stopped at the first failure
# would report one violation per run, and a contributor would fix it, run again, and find
# another. The exit code aggregates; the output is the whole picture. Use --fail-fast when
# you want the opposite.
#
# **The inventory is printed once, not per gate.** FR-034 asks for a single list of every
# exemption marker in the repository. Each gate can print its own with --inventory, which
# is useful when working on that gate alone; here the list is printed once, after the
# findings, by the shared machinery that owns it.
#
# The runner names no individual gate. Gates come from the registry, so a later feature
# appends a line there and this file stays as it is. --registry points it at a different
# list, which is how its own tests give it a gate that is known to fail: a runner that has
# never been seen to report a failure is worth no more than no runner at all.

set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
registry="${root}/scripts/gates.registry"

fail_fast=0
quiet_inventory=0
expecting_registry=0
for argument in "$@"; do
  if (( expecting_registry )); then
    registry="${argument}"
    expecting_registry=0
    continue
  fi
  case "${argument}" in
    --fail-fast) fail_fast=1 ;;
    --no-inventory) quiet_inventory=1 ;;
    --registry) expecting_registry=1 ;;
    --registry=*) registry="${argument#--registry=}" ;;
    -h|--help)
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//'
      exit 0
      ;;
    *)
      echo "gates: unknown option: ${argument}" >&2
      echo "gates: try --help" >&2
      exit 2
      ;;
  esac
done

if (( expecting_registry )); then
  echo "gates: --registry needs a path." >&2
  exit 2
fi

if [[ ! -f "${registry}" ]]; then
  echo "gates: no registry at ${registry}. Without it this runner has no gates to run," >&2
  echo "gates: and an empty run is indistinguishable from a clean one." >&2
  exit 2
fi

cd "${root}"

declare -a failed=()
declare -a ran=()

while IFS='|' read -r label command; do
  [[ -z "${label// }" ]] && continue
  [[ "${label}" == \#* ]] && continue
  if [[ -z "${command// }" ]]; then
    echo "gates: registry line for '${label}' names no command." >&2
    exit 2
  fi

  echo "── ${label}"
  # Word splitting is intended: the registry holds a command line, not a filename.
  # shellcheck disable=SC2086
  if eval "${command}"; then
    ran+=("${label}")
  else
    ran+=("${label}")
    failed+=("${label}")
    if (( fail_fast )); then
      break
    fi
  fi
  echo
done < "${registry}"

if (( ${#ran[@]} == 0 )); then
  echo "gates: the registry is present but registers nothing. Nothing was checked." >&2
  exit 2
fi

if (( ! quiet_inventory )); then
  uv run python scripts/_gate_lib.py
  echo
fi

if (( ${#failed[@]} )); then
  echo "gates: ${#failed[@]} of ${#ran[@]} failed:"
  printf '  %s\n' "${failed[@]}"
  exit 1
fi

echo "gates: all ${#ran[@]} clean."
