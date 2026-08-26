# syntax=docker/dockerfile:1.7
#
# One image definition for every drogna Python service. The service is chosen by the
# HARNESS_SERVICE build argument, which names its workspace package; nothing else differs
# between them, so a new service is a Compose entry and a package, not a new Dockerfile.
#
# Base images are pinned by digest, not by tag. A replay that rests on a floating base
# image is not a replay (Constitution II). `deploy/README.md` says how to refresh a digest
# deliberately.
#
# No literal path, host or port appears below. Container paths arrive as build arguments
# from the destination configuration; the two absolute paths on the `COPY --from` lines are
# locations inside another image, not choices this deployment makes.

FROM ghcr.io/astral-sh/uv:0.8.17@sha256:e4644cb5bd56fdc2c5ea3ee0525d9d21eed1603bccd6a21f887a938be7e85be1 AS uv

FROM python:3.11-slim-bookworm@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b

ARG HARNESS_APP_ROOT
ARG HARNESS_SERVICE

COPY --from=uv /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR ${HARNESS_APP_ROOT}

# Dependencies first, from the workspace lock, so that a source change does not re-resolve
# them. `--frozen` fails rather than updating the lock: an image that quietly re-resolved
# its dependencies would not be the image the lock describes.
#
# Any service that parses trajectory geometry needs Shapely 2.1 or later built against GEOS
# 3.12 or later, for the reason set out at the pin in
# deploy/images/query-layer.requirements.txt. The workspace lock, owned by
# 001-deterministic-foundations, must satisfy that bound; this image inherits whatever the
# lock resolved.
COPY pyproject.toml uv.lock ./
COPY libs ./libs
COPY services ./services

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --package "${HARNESS_SERVICE}"

# Console scripts from the synchronised environment, including `drogna-healthcheck`, which
# every image is expected to provide and which the Compose health checks invoke.
ENV PATH="${HARNESS_APP_ROOT}/.venv/bin:${PATH}" \
    HARNESS_SERVICE_MODULE="${HARNESS_SERVICE}"

# HARNESS_CONFIG is the only environment variable carrying operational meaning, and the
# Compose file is what supplies it. Nothing is baked in here, so the same image runs at
# either destination.
ENTRYPOINT ["sh", "-c", "exec python -m \"${HARNESS_SERVICE_MODULE}\" \"$@\"", "--"]
