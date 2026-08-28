# syntax=docker/dockerfile:1.7
#
# The exposure boundary (C-14): nginx, plus the renderer that writes the configuration it
# serves. The policy itself lives in `proxy/` and belongs to 013-security-proxy; this file
# only says how it becomes an image.
#
# Why this image exists at all. The Compose entry used to name the stock nginx image, with
# no build, which meant `proxy/entrypoint.sh` never ran and neither did the renderer. nginx
# started, served its own default configuration, and answered nothing this repository had
# written. Every case in the request matrix then failed with "the proxy never answered",
# and it never answered because it had never been told what to say.
#
# Base image pinned by digest, not by tag, and it is the same digest the client image uses.
# A replay that rests on a floating base image is not a replay (Constitution II).
#
# No literal path, host or port appears below. Container paths arrive as build arguments
# from the destination configuration, and everything operational reaches the running
# container through HARNESS_CONFIG.

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

ARG HARNESS_APP_ROOT
ENV HARNESS_APP_ROOT=${HARNESS_APP_ROOT}

WORKDIR ${HARNESS_APP_ROOT}

# The renderer is Python and nginx is not, so the image carries both. It is a small
# addition: `harness_core` depends on `jsonschema` and nothing else, and the proxy package
# depends on `harness_core` and nothing else, so no compiler and no wheel-building is
# involved. Alpine's interpreter is externally managed, hence the virtual environment;
# py3-pip is what makes `python3 -m venv` able to bootstrap one.
#
# This fetch takes the `proxy_ca` secret for the same reason the `pip install` below does,
# and it is the earlier of the two: this image is the only one that reaches the network
# before it reaches its package manager, so a seam that began at the `pip install` left
# `apk` — the very first thing the build does — outside it. Behind a TLS-terminating proxy
# that is not a late failure in one layer; it is the image never building at all, which is
# what it did. `apk` reads the system store, so appending to it is the whole of what is
# needed here; the interpreter that `pip` later uses is what this step exists to install.
RUN --mount=type=secret,id=proxy_ca,target=/tmp/proxy-ca.crt,required=false \
    sh -c 'if [ -s /tmp/proxy-ca.crt ]; then \
             cat /tmp/proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt; \
           fi; \
           apk add --no-cache python3 py3-pip \
           && python3 -m venv "${HARNESS_APP_ROOT}/.venv"'

ENV PATH="${HARNESS_APP_ROOT}/.venv/bin:${PATH}" \
    PYTHONPATH="${HARNESS_APP_ROOT}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY libs/harness_core ./libs/harness_core
COPY proxy ./proxy

# The `proxy_ca` secret is optional and absent in an ordinary build, exactly as in the
# other image definitions and for the same reason: a build inside an ephemeral agent
# session reaches the package index through a TLS-terminating proxy whose certificate
# authority the base image does not know. Nothing about it is written into the image.
RUN --mount=type=secret,id=proxy_ca,target=/tmp/proxy-ca.crt,required=false \
    sh -c 'if [ -s /tmp/proxy-ca.crt ]; then \
             cat /tmp/proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt; \
             export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt; \
           fi; \
           pip install --no-cache-dir ./libs/harness_core'

# Render, validate, serve — in that order, so a configuration nginx would not accept is a
# container that fails to start rather than a boundary nobody has read. The reasoning is
# in the script.
ENTRYPOINT ["sh", "-c", "exec \"${HARNESS_APP_ROOT}/proxy/entrypoint.sh\""]
