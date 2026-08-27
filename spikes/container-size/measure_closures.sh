#!/usr/bin/env bash
#
# Spike code — throwaway. Nothing here is imported by drogna or promoted into it.
#
# The on-disk size of the two Python dependency closures the deployment installs, and of
# each service's closure taken on its own.
#
# The per-service figure is the one that matters for the "one image or eleven" question.
# deploy/images/python-service.Dockerfile takes the service as a *build* argument and runs
# `uv sync --package "${HARNESS_SERVICE}"`, so each of the eleven Python components is a
# separate image whose layers are identical up to that one RUN. What eleven images cost
# over one is eleven of these closures instead of the whole workspace once.
#
# This rewrites the repository's own .venv, which is untracked and reproduced by `uv sync`.
# It leaves the full workspace synchronised, which is the state a checkout expects.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
results="${here}/results"
mkdir -p "${results}"
report="${results}/closures.txt"
: > "${report}"

size_mb() { du -sm "$1" | cut -f1; }

cd "${root}" || exit 1

{
  echo "Per-service closure — what one image of eleven installs"
  echo "  (site-packages of \`uv sync --frozen --no-dev --package <service>\`)"
  echo
} >> "${report}"

total=0
for package in harness-clock harness-env-generator harness-sensors harness-ingest \
               harness-model-runner harness-monitor harness-scheduler harness-publisher \
               harness-planner harness-telemetry harness-offload; do
  rm -rf "${root}/.venv"
  if uv sync --frozen --no-dev --package "${package}" >/dev/null 2>&1; then
    megabytes="$(size_mb "${root}/.venv/lib/python3.11/site-packages")"
    total=$((total + megabytes))
    printf '  %-26s %4s M\n' "${package}" "${megabytes}" >> "${report}"
  else
    printf '  %-26s %6s\n' "${package}" "FAILED" >> "${report}"
  fi
done

rm -rf "${root}/.venv"
uv sync --frozen --no-dev >/dev/null 2>&1
whole="$(size_mb "${root}/.venv/lib/python3.11/site-packages")"

{
  echo
  printf '  %-26s %4s M   <- eleven images, summed\n' "eleven closures" "${total}"
  printf '  %-26s %4s M   <- one image, whole workspace\n' "one closure" "${whole}"
  echo
  echo "Query layer closure — pygeoapi 0.20.0 and the FR-51 Shapely pin"
} >> "${report}"

query_venv="$(mktemp -d)"
uv venv --python 3.11 "${query_venv}/venv" >/dev/null 2>&1
VIRTUAL_ENV="${query_venv}/venv" uv pip install --no-cache \
  -r "${root}/deploy/images/query-layer.requirements.txt" >/dev/null 2>&1
VIRTUAL_ENV="${query_venv}/venv" uv pip install --no-cache \
  "${root}/libs/harness_core" >/dev/null 2>&1
site="${query_venv}/venv/lib/python3.11/site-packages"
printf '\n  %-26s %4s M\n\n' "as installed" "$(size_mb "${site}")" >> "${report}"
du -sm "${site}"/* 2>/dev/null | sort -rn | head -12 |
  while read -r megabytes path; do
    printf '    %-24s %4s M\n' "$(basename "${path}")" "${megabytes}"
  done >> "${report}"

# What is left once the two packages drogna never imports are removed. `trim_probe.py`
# is what says the removal is safe; this only says what it is worth.
VIRTUAL_ENV="${query_venv}/venv" uv pip uninstall rasterio sqlalchemy >/dev/null 2>&1
printf '\n  %-26s %4s M   <- rasterio and SQLAlchemy removed\n' \
  "trimmed" "$(size_mb "${site}")" >> "${report}"

rm -rf "${query_venv}"
cat "${report}"
