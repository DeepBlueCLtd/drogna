#!/usr/bin/env bash
#
# The one command. From a clean checkout to a healthy, seeded local stack.
#
#   scripts/run_local.sh
#
# No prompt, no manual step, no editing of a file the repository did not ship. Safe to run
# again over a stack that is already up: it converges rather than failing.

# Neither step's failure was checked until a build failure was watched passing through
# here: `up.sh` printed "an image could not be built; nothing was started", exited 1, and
# this script ran the seeding anyway and exited 0. What that produced was a seeding record
# describing a stack in which nothing was running, and a command whose whole claim is "from
# a clean checkout to a healthy, seeded local stack" reporting that it had done so.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${here}/up.sh" local
"${here}/seed.sh" local
