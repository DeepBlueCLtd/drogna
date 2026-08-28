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
# Both routes are exercised now that feature 008 serves something. Both were also wrong,
# in the way a route nobody has run is wrong, and each was wrong about a *different* file:
#
#   The offline route handed `pygeoapi openapi generate` the value of
#   HARNESS_CONFIG_PATH_QUERY, which is `config/<destination>/query.json` — drogna's own
#   configuration document, not a pygeoapi one. pygeoapi cannot read it. The document it
#   needs is the *rendered* one, which `query/render_config.py` writes and which exists
#   only inside the container: `deploy/images/query-layer-entrypoint.sh` renders it, then
#   generates against it, then serves. This route now does the same two steps in that
#   order, which is what makes what is captured a description of what is served.
#
#   The served route fetched `${public_url}/openapi?f=json`. The destination's public URL
#   is the client's address, and the client answers every path it does not recognise with
#   the single-page application. So `curl --fail` succeeded, returned HTML, and the
#   canonicaliser refused it — which was the only reason this did not vendor a web page.
#   It now asks the query service directly over the compose network, where the query layer
#   is regardless of what any boundary in front of it publishes.
#
# Neither writes a plausible document on failure: a specification nobody served is exactly
# the hand-written approximation NFR-01 exists to remove, and it would be worse for looking
# captured. The canonicaliser refuses anything without an `openapi` key, which is the last
# guard and the one that caught the web page.
#
# After a refresh, run scripts/generate_types.sh. Until you do, the drift check fails,
# which is the intended order of events.

# shellcheck source=../deploy/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

VENDORED="${DROGNA_ROOT}/contracts/openapi/query-layer.openapi.json"

# How the query layer's image is asked for its own specification, and where the running
# service answers with the same document. Both belong to feature 008; they are named here,
# in one place, because this script has to ask for them somehow and a reader correcting
# them should have to look in one spot.
#
# The offline command is the entrypoint's first two steps and nothing else: render the
# pygeoapi configuration from the destination's, then describe it. A rendered document is
# not on any volume, so it is made where it is used and thrown away with the container.
# `--format json` because the vendored copy is JSON and the canonicaliser reads JSON.
EMIT_COMMAND='r=$(mktemp -d) && python3 ./query/render_config.py "$r/pygeoapi-config.yml" \
  && pygeoapi openapi generate --format json "$r/pygeoapi-config.yml"'
SERVED_HOST="query:8080"
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
if compose run --rm --no-deps --entrypoint sh query -c "${EMIT_COMMAND}" \
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

# Asked of the service on the compose network rather than of the destination's public URL.
# The public URL is the client's address — a single-page application that answers every
# path it does not recognise with its own index, so fetching a specification from it
# succeeds and returns HTML. The query layer is at SERVED_HOST whatever any boundary in
# front of it publishes, and the image carries python3, which is how this asks without
# needing curl in a container or a port on the host.
if ! compose run --rm --no-deps --entrypoint python3 query -c \
  "import sys,urllib.request; sys.stdout.write(
     urllib.request.urlopen('http://${SERVED_HOST}/${SERVED_PATH}').read().decode())" \
  >"${captured}" 2>/dev/null || [ ! -s "${captured}" ]; then
  [ "${started_here}" = true ] && compose stop query >/dev/null 2>&1
  fail "the query layer served no specification at http://${SERVED_HOST}/${SERVED_PATH}.
Neither route reached a document: the image would not describe its own configuration, and
the running service did not answer. A hand-written stand-in is not the fallback — it would
be the approximation NFR-01 exists to remove."
fi

canonicalise "${captured}" "${VENDORED}"
[ "${started_here}" = true ] && compose stop query >/dev/null 2>&1
log "Now run scripts/generate_types.sh, and read the diff of the vendored document."
