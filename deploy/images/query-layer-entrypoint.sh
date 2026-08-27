#!/usr/bin/env sh
#
# Render, generate, serve. The same three-step shape as `proxy/entrypoint.sh`, and for the
# same reason: pygeoapi is a third-party server, so it is told where its configuration is
# through its own published interface rather than through this repository's.
#
# `query/render_config.py` turns `config/<destination>/query.json` into the document
# pygeoapi reads. It existed from the day the query layer landed and nothing ever ran it:
# the image's entrypoint was `pygeoapi serve`, which reads PYGEOAPI_CONFIG, which nothing
# set. The container therefore died on its first line every time it was started, with
# `RuntimeError: PYGEOAPI_CONFIG environment variable not set`, and nobody saw it because
# no destination had the `query` profile active until the profiles were promoted.
#
# There is no path, host or port here. The renderer reads HARNESS_CONFIG like every other
# component and takes every value from the destination configuration; the two files below
# are named, not located, and live in a directory the system hands out.

set -eu

runtime="$(mktemp -d)"
rendered="${runtime}/pygeoapi-config.yml"
described="${runtime}/pygeoapi-openapi.yml"

python3 ./query/render_config.py "${rendered}"
echo "query: rendered ${rendered}" >&2

# pygeoapi serves its OpenAPI description from a document generated ahead of time rather
# than on demand, and refuses to start without one. Generating it here means the served
# description is of the configuration actually being served, which a document committed
# beside the template could not promise.
if ! pygeoapi openapi generate "${rendered}" --output-file "${described}"; then
    echo "query: pygeoapi would not describe ${rendered}. Nothing is served: a query" >&2
    echo "query: layer that starts without a description nobody could generate is one" >&2
    echo "query: whose collections have not been read. Fix the destination configuration" >&2
    echo "query: and start again." >&2
    exit 1
fi

PYGEOAPI_CONFIG="${rendered}"
PYGEOAPI_OPENAPI="${described}"
export PYGEOAPI_CONFIG PYGEOAPI_OPENAPI

exec pygeoapi serve
