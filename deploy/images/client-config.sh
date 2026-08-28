#!/bin/sh
#
# Serve the page the *rendered* configuration rather than the placeholder baked into the
# image. Run by the stock nginx entrypoint, which executes everything in
# /docker-entrypoint.d as root before the workers drop to the `nginx` user — which is the
# whole reason this is a copy and not an `alias`.
#
# `client/public/config.json` is a tracked file with no role and no secret in it, because
# it is tracked. It is what the bundle carries and what the browser was still being served:
# a broker URL naming nobody. The rendered document under deploy/.runtime/ names the viewer
# role and carries the secret the render injects, is mounted at HARNESS_CONFIG, and never
# reached the page at all. The client therefore upgraded successfully and was then refused
# by the broker's CONNECT, once every reconnect period, for as long as this was true.
#
# The mounted document is 0600 and owned by the deploying user, so an nginx `alias` onto it
# would be read by a worker running as `nginx` and answer 403 — on Linux. On a Docker
# Desktop bind mount it would appear to work, which is the divergence CLAUDE.md warns
# about. Copying it here, as root, at start-up, is the form that behaves the same on both.
#
# The copy is world-readable because a browser has to fetch it, and that is a real
# consequence worth naming rather than burying: the viewer credential is readable by anyone
# who can load the page. It is the credential the page authenticates to the broker with,
# and the broker's ACL makes it subscribe-only on the control namespace, but it is no
# longer behind the proxy's clearance. Recorded with the rest of the provisional control
# upgrade decision in docs/agent-sessions/long-run-01/DECISIONS.md and ADR-0020.

set -eu

: "${HARNESS_CONFIG:?the client image needs HARNESS_CONFIG to know which document to serve}"
: "${HARNESS_STATIC_ROOT:?the client image needs HARNESS_STATIC_ROOT to know where to put it}"

if [ ! -r "${HARNESS_CONFIG}" ]; then
    echo "client: ${HARNESS_CONFIG} is not readable, so the page would be served the" >&2
    echo "client: placeholder that names no broker role and authenticates to nothing." >&2
    echo "client: Refusing to start rather than serving a shell that cannot connect." >&2
    exit 1
fi

cp "${HARNESS_CONFIG}" "${HARNESS_STATIC_ROOT}/config.json"
chmod 0644 "${HARNESS_STATIC_ROOT}/config.json"
echo "client: serving the rendered configuration from ${HARNESS_CONFIG}" >&2
