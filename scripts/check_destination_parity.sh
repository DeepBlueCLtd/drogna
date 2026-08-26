#!/usr/bin/env bash
#
# Confirm that every destination carries the same files and the same keys.
#
#   scripts/check_destination_parity.sh [left right]
#
# With no arguments every destination is compared against the first alphabetically. This is
# the check that catches a key added to one destination and forgotten in the other, in CI
# rather than on the droplet.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib" && pwd)/common.sh"

require_python
py destination_parity.py "$@"
