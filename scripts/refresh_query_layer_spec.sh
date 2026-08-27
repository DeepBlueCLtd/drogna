#!/usr/bin/env bash
#
# Capture the specification the query layer emits about itself, into
# contracts/openapi/query-layer.openapi.json.
#
#   scripts/refresh_query_layer_spec.sh [destination]
#   scripts/refresh_query_layer_spec.sh --from <file>
#
# The client's HTTP types derive from what the query layer actually serves, not from a
# hand-written idea of it (NFR-01). This script is how the vendored copy is refreshed, and
# it is the only way it is ever written: the document is never hand-edited, because a
# hand-edit is a claim about somebody else's interface.
#
# Two routes, tried in order. The offline one asks the query layer's own image to emit its
# specification without serving anything, which is preferable because it needs no port and
# no waiting. The fallback brings the local destination up, fetches the document it
# advertises, and tears down what it started. Either way the result is canonicalised —
# sorted keys, two-space indent, one trailing newline — so that the diff of a refresh shows
# what the interface did between versions and nothing else.
#
# `--from <file>` skips the capture and canonicalises a document you already have. It is
# there for the case where the specification arrives by some other route entirely, and it
# is what the canonicalisation is tested through.
#
# The capture half cannot be exercised until feature 008 gives the query layer something to
# emit. Until then this script fails, by design, with a message saying so. It does not
# write a plausible document: a specification nobody served is exactly the hand-written
# approximation NFR-01 exists to remove, and it would be worse for looking captured.
#
# After a refresh, run scripts/generate_types.sh. Until you do, the drift check fails,
# which is the intended order of events.

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

VENDORED="${DROGNA_ROOT}/contracts/openapi/query-layer.openapi.json"

# The command the query layer's image answers with its own specification, and the path it
# serves the same document on. Both belong to feature 008; they are named here, in one
# place, because this script has to ask for them somehow and a reader correcting them
# should have to look in one spot.
EMIT_COMMAND=(pygeoapi openapi generate)
SERVED_PATH="openapi?f=json"

canonicalise() {
  python3 "${DROGNA_ROOT}/scripts/canonicalise_openapi.py" "$1" "$2" ||
    fail "the captured document is not an OpenAPI specification"
}

if [ "${1:-}" = "--from" ]; then
  [ -n "${2:-}" ] || fail "--from needs a file"
  require_python
  canonicalise "$2" "${VENDORED}"
  log "Now run scripts/generate_types.sh, and read the diff of the vendored document."
  exit 0
fi

destination="$(destination_argument "${1:-}")"
require_python
require_docker

captured="$(mktemp)"
trap 'rm -f "${captured}"' EXIT

step "Asking the query layer to emit its specification (offline)"
config="$(sed -n 's/^HARNESS_CONFIG_PATH_QUERY=\(.*\)$/\1/p' "${DROGNA_ENV_FILE}" | tail -n 1)"
if [ -n "${config}" ] && compose run --rm --no-deps query "${EMIT_COMMAND[@]}" "${config}" \
  >"${captured}" 2>/dev/null && [ -s "${captured}" ]; then
  canonicalise "${captured}" "${VENDORED}"
  log "Now run scripts/generate_types.sh, and read the diff of the vendored document."
  exit 0
fi

step "Offline emission unavailable; bringing '${destination}' up to capture what it serves"
started_here=false
if ! compose ps --services --status running 2>/dev/null | grep -qx query; then
  compose up --detach --build --wait query || fail "the query layer did not become healthy"
  started_here=true
fi

url="$(public_url)"
[ -n "${url}" ] || fail "this destination advertises no public URL; nothing to capture from"
if ! curl --fail --silent --show-error "${url%/}/${SERVED_PATH}" >"${captured}"; then
  [ "${started_here}" = true ] && compose stop query >/dev/null 2>&1
  fail "the query layer served no specification at ${SERVED_PATH}.
This is expected until feature 008 lands: there is nothing to vendor yet, and a
hand-written stand-in would be the approximation NFR-01 exists to remove."
fi

canonicalise "${captured}" "${VENDORED}"
[ "${started_here}" = true ] && compose stop query >/dev/null 2>&1
log "Now run scripts/generate_types.sh, and read the diff of the vendored document."
