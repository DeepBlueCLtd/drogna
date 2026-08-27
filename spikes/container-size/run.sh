#!/usr/bin/env bash
#
# Spike code — throwaway. The one command.
#
# Needs `uv` and outbound access to Docker Hub, ghcr.io and PyPI. It needs no Docker
# daemon: image sizes come from the registry, and layers are streamed through gzip and
# counted rather than pulled.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
results="${here}/results"
mkdir -p "${results}"

step() { printf '\n== %s\n' "$1"; }

step "Image sizes, from the registry"
(cd "${root}" && uv run python "${here}/measure_images.py") \
  > "${results}/images.txt" 2> "${results}/images.json"
cat "${results}/images.txt"

step "Dependency closures on disk"
"${here}/measure_closures.sh" > /dev/null
cat "${results}/closures.txt"

step "What each component costs to load"
(cd "${root}" && uv run python "${here}/measure_footprint.py") \
  > "${results}/footprint-services.txt" 2> "${results}/footprint-services.json"
cat "${results}/footprint-services.txt"

step "What a second stack duplicates"
{
  (cd "${root}" && uv run python "${here}/stack_arithmetic.py" droplet)
  (cd "${root}" && uv run python "${here}/stack_arithmetic.py" local)
} > "${results}/stack-arithmetic.txt" 2>&1
cat "${results}/stack-arithmetic.txt"

step "The trim probe"
# Two environments that differ only in the two packages, so the probe has something to
# tell apart. A probe that passes against both would prove nothing about either.
work="$(mktemp -d)"
uv venv --python 3.11 "${work}/full" > /dev/null 2>&1
VIRTUAL_ENV="${work}/full" uv pip install --no-cache \
  -r "${root}/deploy/images/query-layer.requirements.txt" > /dev/null 2>&1
VIRTUAL_ENV="${work}/full" uv pip install --no-cache "${root}/libs/harness_core" > /dev/null 2>&1
cp -r "${work}/full" "${work}/trimmed"
VIRTUAL_ENV="${work}/trimmed" uv pip uninstall rasterio sqlalchemy > /dev/null 2>&1

{
  echo "# trim_probe.py, against the TRIMMED query closure"
  echo
  PYTHONPATH="${root}/query" "${work}/trimmed/bin/python" "${here}/trim_probe.py"
  echo
  echo "# The same probe against the UNTRIMMED closure, which is otherwise identical."
  echo "# It must refuse to pass here: a probe that cannot tell the two apart proves"
  echo "# nothing about either."
  echo
  PYTHONPATH="${root}/query" "${work}/full/bin/python" "${here}/trim_probe.py"
} > "${results}/trim-probe.txt" 2>&1

PYTHONPATH="${root}/query" "${work}/full/bin/python" "${here}/trim_probe.py" > /dev/null 2>&1
printf '\n# exit status of that second run: %s (expected 1)\n' "$?" >> "${results}/trim-probe.txt"
rm -rf "${work}"
cat "${results}/trim-probe.txt"

step "Query layer footprint"
work_query="$(mktemp -d)"
uv venv --python 3.11 "${work_query}/venv" > /dev/null 2>&1
VIRTUAL_ENV="${work_query}/venv" uv pip install --no-cache \
  -r "${root}/deploy/images/query-layer.requirements.txt" > /dev/null 2>&1
(cd "${root}" && uv run python "${here}/measure_footprint.py" \
  --query --interpreter "${work_query}/venv/bin/python") \
  > "${results}/footprint-query.txt" 2> "${results}/footprint-query.json"
rm -rf "${work_query}"
cat "${results}/footprint-query.txt"

printf '\nEverything above is in %s\n' "${results}"
