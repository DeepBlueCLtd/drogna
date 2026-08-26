#!/usr/bin/env bash
#
# The same stack, on the droplet.
#
#   scripts/run_droplet.sh
#
# The Compose file, the images and the scripts are the ones the local destination uses. The
# only difference is config/droplet/. Safe to run again over an already-deployed droplet.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../deploy/lib/common.sh
source "$(cd "${here}/../deploy/lib" && pwd)/common.sh"

destination="droplet"

require_python
require_docker

step "Deploying to the droplet"
log "A cold deployment builds images on a two-core host. Expect up to fifteen minutes the"
log "first time and a small fraction of that afterwards, since layers are cached. Progress"
log "is printed as each stage completes; a long silence during a build stage is expected."

"${here}/up.sh" "${destination}"
"${here}/seed.sh" "${destination}"

# Repeated deployments leave the images they replaced behind, and a small droplet's disk
# fills quietly. Only this project's own dangling artefacts are removed; nothing belonging
# to another project on the host is touched.
step "Pruning the artefacts this deployment replaced"
project_name="$(sed -n 's/^HARNESS_PROJECT_NAME=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1)"
docker image prune --force --filter "label=com.docker.compose.project=${project_name}" || true
docker builder prune --force --keep-storage 2g >/dev/null 2>&1 || true

step "Droplet deployment complete after $(elapsed)"
printf 'The droplet advertises %s\n' "$(public_url)"
