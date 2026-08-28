# syntax=docker/dockerfile:1.7
#
# The query layer image (C-09): pygeoapi, its dependencies, and — once 008-query-layer
# lands — the bespoke EDR trajectory provider plugin that ADR-0003 decided on. This file
# fixes the image. The pygeoapi configuration and the plugin itself live under `query/`
# and are that feature's, not this one's.
#
# State today: this image builds, and the geometry stack it installs has been asserted
# correct by build. It has never been started, because it has no pygeoapi configuration to
# serve until `query/` exists. `deploy/README.md` says so in the images table rather than
# implying otherwise.
#
# The Shapely and GEOS bound is a silent-failure guard, and its reason is written beside
# the pin in query-layer.requirements.txt rather than in a distant document, because a pin
# whose reason is not visible at the pin gets tidied away by someone who cannot see why it
# is there. The pin has a second half — query-layer-pin-check.py, run below — because the
# GEOS version is a property of the built wheel and no requirements file can constrain it.
#
# No literal path, host or port appears here. The container path arrives as a build
# argument from the destination configuration (NFR-05).

FROM python:3.11-slim-bookworm@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b

ARG HARNESS_APP_ROOT

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR ${HARNESS_APP_ROOT}

COPY deploy/images/query-layer.requirements.txt ./requirements.txt

# The `proxy_ca` secret is optional and absent in an ordinary build, which then behaves as
# though this were a plain `pip install`. It exists because the deployment is expected to
# be built inside an ephemeral agent session (SRD NFR-06), and such a session reaches the
# index through a TLS-terminating proxy whose certificate authority the base image does not
# know. Passing it is `--secret id=proxy_ca,src=<the bundle>`; `deploy/README.md` says
# where the bundle is found. Nothing about the proxy is written into the image.
RUN --mount=type=secret,id=proxy_ca,target=/tmp/proxy-ca.crt,required=false \
    sh -c 'if [ -s /tmp/proxy-ca.crt ]; then \
             cat /tmp/proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt; \
             export PIP_CERT=/etc/ssl/certs/ca-certificates.crt; \
           fi; \
           pip install --no-cache-dir --requirement ./requirements.txt'

# The other half of the FR-51 pin. This parses a LINESTRING ZM and asserts that the M
# ordinates survive, so an image whose Shapely was built against a GEOS below 3.12 fails
# here rather than at run time, where the same fault is invisible. The check stays in the
# image so it can be re-run against a container after a base image moves.
COPY deploy/images/query-layer-pin-check.py ./query-layer-pin-check.py
RUN python3 ./query-layer-pin-check.py

# The provider plugins and the pygeoapi configuration, owned by 008-query-layer. These
# were commented out while `query/` did not exist, because a COPY of a missing directory
# fails the build. It exists now. The plugin is selected by dotted module path in the
# collection's provider `name`, so PYTHONPATH reaching this directory is the whole of the
# wiring.
COPY query ./query
ENV PYTHONPATH="${HARNESS_APP_ROOT}/query:${PYTHONPATH}"

# The providers import harness_core for the clock port and the heartbeat, so the library
# travels with them. Without it the image builds and then fails at the first request,
# which is the failure this deployment tries hardest to avoid: one that waits until it is
# being demonstrated.
COPY libs/harness_core ./libs/harness_core
# The second fetch in this image, and it takes the `proxy_ca` secret for the reason the
# first one does. Installing a local directory still reaches the index: pip resolves the
# build backend before it can build the package, so this step is as network-bound as the
# `requirements.txt` install above and fails behind a TLS-terminating proxy in the same
# way. It sat outside the seam because the seam was written at the fetch that looks like a
# fetch, and this one looks like a local copy.
RUN --mount=type=secret,id=proxy_ca,target=/tmp/proxy-ca.crt,required=false \
    sh -c 'if [ -s /tmp/proxy-ca.crt ]; then \
             cat /tmp/proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt; \
             export PIP_CERT=/etc/ssl/certs/ca-certificates.crt; \
           fi; \
           python3 -m pip install --no-cache-dir ./libs/harness_core'

# pygeoapi is told where its configuration is through its own published interface, the way
# every third-party image in this deployment is; the values still come from the destination
# configuration by way of the Compose file. See `deploy/README.md`, "The one meaningful
# environment variable, and its exceptions".
#
# That interface is PYGEOAPI_CONFIG and PYGEOAPI_OPENAPI, and something has to set them
# from a document rendered out of `HARNESS_CONFIG`. The entrypoint below is that something.
# `ENTRYPOINT ["pygeoapi", "serve"]` stood here instead and read an environment variable
# nothing set, so this container has never once reached its first request.
COPY deploy/images/query-layer-entrypoint.sh ./query-layer-entrypoint.sh
RUN chmod +x ./query-layer-entrypoint.sh
ENTRYPOINT ["./query-layer-entrypoint.sh"]
