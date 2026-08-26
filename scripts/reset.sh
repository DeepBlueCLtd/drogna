#!/usr/bin/env bash
#
# Return an instance to the state of a freshly created one.
#
#   scripts/reset.sh [destination]
#
# Every volume carrying derived data is removed and the stack is brought back up and
# reseeded with the same root seed. The seeding record afterwards equals the record of an
# instance created five minutes ago, and that equality is the claim reset exists to make
# good (SRD NFR-07, FR-011).

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

destination="$(destination_argument "${1:-}")"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step "Resetting destination '${destination}'"
"${here}/down.sh" "${destination}" --volumes
"${here}/up.sh" "${destination}"
"${here}/seed.sh" "${destination}"

step "Reset after $(elapsed)"
