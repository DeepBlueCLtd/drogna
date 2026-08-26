#!/usr/bin/env bash
#
# The one command. From a clean checkout to a healthy, seeded local stack.
#
#   scripts/run_local.sh
#
# No prompt, no manual step, no editing of a file the repository did not ship. Safe to run
# again over a stack that is already up: it converges rather than failing.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${here}/up.sh" local
"${here}/seed.sh" local
