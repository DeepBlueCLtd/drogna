#!/usr/bin/env bash
# The whole spike, from a clean checkout, in one command.
#
# SPIKE CODE. Throwaway. Literal paths, ports and image tags on purpose; this script is
# not part of drogna's deployment and never runs on the droplet.
#
#   ./run.sh
#
# Needs Docker with Compose v2 and outbound access to Docker Hub and PyPI. Takes a few
# minutes the first time (two image builds), well under a minute afterwards. Everything
# it learns lands in results/.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f compose.spike.yml"

# A build behind a TLS-terminating egress proxy needs that proxy's CA to reach PyPI.
# Without one, an empty secret is passed and the certificate store is left alone.
if [[ -z "${DROGNA_SPIKE_CA_FILE:-}" ]]; then
  for candidate in /root/.ccr/ca-bundle.crt "${SSL_CERT_FILE:-}" "${REQUESTS_CA_BUNDLE:-}"; do
    if [[ -n "${candidate}" && -s "${candidate}" ]]; then
      DROGNA_SPIKE_CA_FILE="${candidate}"
      break
    fi
  done
fi
export DROGNA_SPIKE_CA_FILE="${DROGNA_SPIKE_CA_FILE:-/dev/null}"
echo "proxy CA for builds: ${DROGNA_SPIKE_CA_FILE}"

mkdir -p results fixture

step() { echo; echo "=== $* ==="; }

step "building the two images"
${COMPOSE} build --quiet pygeoapi probe-below-pin

step "generating the fixture from its seed"
${COMPOSE} run --rm tools make_fixture.py | tee results/fixture-generation.txt

step "self-check: can the fixture tell the two answers apart?"
${COMPOSE} run --rm tools selfcheck.py | tee results/selfcheck.txt

step "version probe AT the FR-51 pin (shapely >= 2.1, GEOS >= 3.12)"
${COMPOSE} run --rm tools version_probe.py | tee results/version-probe-at-pin.txt
${COMPOSE} run --rm tools version_probe.py --json > results/version-probe-at-pin.json

step "version probe BELOW the pin: the published pygeoapi image as it ships"
${COMPOSE} run --rm --entrypoint python3 pygeoapi-below-pin /spike/version_probe.py \
  | tee results/version-probe-below-pin-pygeoapi-image.txt || true
${COMPOSE} run --rm --entrypoint python3 pygeoapi-below-pin /spike/version_probe.py --json \
  > results/version-probe-below-pin-pygeoapi-image.json

step "version probe BELOW the pin: shapely 2.0.7 on GEOS 3.11"
${COMPOSE} run --rm probe-below-pin version_probe.py \
  | tee results/version-probe-below-pin-geos311.txt || true
${COMPOSE} run --rm probe-below-pin version_probe.py --json \
  > results/version-probe-below-pin-geos311.json

step "bringing up both pygeoapi instances"
${COMPOSE} up -d pygeoapi pygeoapi-below-pin
for port in 5001 5002; do
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${port}/collections?f=json" >/dev/null 2>&1; then
      echo "  port ${port} answering"
      break
    fi
    sleep 2
  done
done

step "recording what each instance is running"
# pygeoapi's own __init__ imports jsonschema, which the published image does not
# carry, so the version is read from the source file rather than imported.
${COMPOSE} run --rm tools -c "
import json, re, pathlib, shapely
source = pathlib.Path('/pygeoapi/pygeoapi/__init__.py').read_text()
version = re.search(r\"__version__ = '([^']+)'\", source).group(1)
print(json.dumps({
    'pygeoapi_version': version,
    'shapely_version': shapely.__version__,
    'geos_version': '.'.join(str(p) for p in shapely.geos_version),
}, indent=2))
" > results/versions-at-pin.json || true
docker image inspect geopython/pygeoapi:latest \
  --format '{{index .RepoDigests 0}}' > results/base-image-digest.txt 2>/dev/null || true
cat results/versions-at-pin.json 2>/dev/null || true

step "issuing the trajectory queries"
${COMPOSE} run --rm tools query.py | tee results/query.txt

step "shutting down"
${COMPOSE} down --remove-orphans

echo
echo "Done. Evidence is in results/. Start with results/query.txt and FINDING.md."
