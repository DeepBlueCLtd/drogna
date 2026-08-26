# syntax=docker/dockerfile:1.7
#
# The query layer image (C-09): pygeoapi, its dependencies, and the bespoke EDR trajectory
# provider plugin that feature 008 owns. This file fixes the image; the pygeoapi
# configuration and the plugin itself live under `query/` and are not this feature's.
#
# The Shapely and GEOS bound is a silent-failure guard. Its reason is written beside the
# pin in query-layer.requirements.txt rather than in a distant document, because a pin
# whose reason is not visible at the pin gets tidied away by someone who cannot see why it
# is there.

FROM python:3.11-slim-bookworm@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b

ARG HARNESS_APP_ROOT

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR ${HARNESS_APP_ROOT}

COPY deploy/images/query-layer.requirements.txt ./requirements.txt

RUN pip install --no-cache-dir --requirement ./requirements.txt

# The provider plugin and the pygeoapi configuration, owned by 008-query-layer. Present as
# an empty directory until that feature lands, which is why the build tolerates it being
# sparse rather than failing here.
COPY query ./query

ENTRYPOINT ["pygeoapi", "serve"]
