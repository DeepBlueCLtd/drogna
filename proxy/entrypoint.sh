#!/usr/bin/env sh
#
# Render, validate, serve. The three steps are in this order for a reason: nginx is asked
# to check the file before it is asked to serve it, so a configuration this repository
# would not have written is a container that fails to start rather than a boundary that is
# open in a way nobody looked at.
#
# There is no path, host or port in this script. The renderer reads HARNESS_CONFIG like
# every other component, validates that file against the packaged schema before any other
# I/O, and writes the served configuration where the configuration says. Everything below
# either comes from there or is a program name.
#
# `nginx -t` reads the whole configuration, this file included, and reports the first
# error with its line number. A failure here is loud and fatal: a proxy that started
# anyway would be serving the configuration nginx last accepted, which is the previous
# policy, which is the one thing worse than no proxy.

set -eu

rendered="$(python -m proxy.render_config)"

echo "proxy: rendered ${rendered}" >&2

if ! nginx -t; then
    echo "proxy: nginx refused ${rendered}. Nothing is served: a boundary that starts" >&2
    echo "proxy: from a configuration nginx would not accept is a boundary nobody has" >&2
    echo "proxy: read. Fix the destination configuration and start again." >&2
    exit 1
fi

exec nginx -g 'daemon off;'
