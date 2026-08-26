# syntax=docker/dockerfile:1.7
#
# The browser client (C-18): a static bundle built with pnpm and served by nginx. The
# client's sources live under `client/` and belong to 003-component-shell-client; this file
# only says how they become an image.
#
# Untested as it stands: `client/` does not exist yet, so this image has never been built.
# `deploy/README.md` says so plainly rather than implying otherwise. It is left whole
# rather than commented out, because every line of it is determined by the two base images
# and by where 003-component-shell-client puts its sources; there is nothing here for that
# feature to design, only a build to run for the first time.

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

ARG HARNESS_APP_ROOT
WORKDIR ${HARNESS_APP_ROOT}

RUN corepack enable

COPY client ./

# The `proxy_ca` secret is optional and absent in an ordinary build, exactly as in the
# other two image definitions and for the same reason: a build inside an ephemeral agent
# session reaches the package registry through a TLS-terminating proxy. Node takes its
# extra authority from NODE_EXTRA_CA_CERTS rather than from the system store.
RUN --mount=type=secret,id=proxy_ca,target=/tmp/proxy-ca.crt,required=false \
    sh -c 'if [ -s /tmp/proxy-ca.crt ]; then \
             cat /tmp/proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt; \
             export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt; \
           fi; \
           pnpm install --frozen-lockfile'
RUN pnpm build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

ARG HARNESS_APP_ROOT
ARG HARNESS_STATIC_ROOT
ARG HARNESS_NGINX_TEMPLATE_DIR

COPY --from=build ${HARNESS_APP_ROOT}/dist ${HARNESS_STATIC_ROOT}
COPY deploy/images/client-nginx.conf.template ${HARNESS_NGINX_TEMPLATE_DIR}/client.conf.template

# The nginx image expands the templates above at start-up, substituting the environment the
# Compose file supplies. The listen port and the document root therefore reach the server
# from the destination configuration, and this image holds neither.
