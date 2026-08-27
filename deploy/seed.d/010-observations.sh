#!/usr/bin/env bash
#
# Provision the observation store: the migrations, then the roles, in one transaction.
# (007-observation-path T009.)
#
# `stores/observations/apply.py` composes the SQL and connects to nothing — that shape is
# deliberate and its docstring says why: a connection there would be a second place holding
# a connection string, in a directory whose content is otherwise SQL. So the composing runs
# here on the host and the applying runs inside the database container, which is the one
# place that already has a way to reach itself.
#
# Idempotent because the SQL is. Every migration is `IF NOT EXISTS`, and each is followed by
# a digest guard that raises if the file has changed since it was applied — so a re-run
# converges, and a re-run after somebody edited an applied migration stops rather than
# leaving this instance and a fresh one quietly disagreeing.
#
# Runs before the feature store's step, and the numbering is what says so: the run-time
# roles are created by `stores/observations/roles.sql`, and `stores/features/roles.sql`
# grants to roles that must already exist.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"

# `docker compose exec` rather than a published port: the store is reachable on the compose
# network whether or not this destination publishes it, and a step that needed a published
# port would stop working at the destination that does not publish one.
compose=(docker compose --file "${DROGNA_COMPOSE_FILE}" --env-file "${DROGNA_ENV_FILE}")

# The database and the role it is provisioned as, from the destination's own declaration.
# Not typed here: Constitution IV, and a name typed into a seeding step is a name that can
# disagree with the one the container was created with.
deployment="${root}/config/${DROGNA_DESTINATION}/deployment.json"
database="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"]["name"])' "${deployment}")"
role="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"]["user"])' "${deployment}")"

sql="${DROGNA_ARTEFACT_DIR}/observations.sql"
python3 "${root}/stores/observations/apply.py" > "${sql}"

# ON_ERROR_STOP because psql's default is to carry on after a failed statement and exit 0,
# which would report a provisioned store that is not one. -q so that what reaches the log
# is what went wrong, and --no-psqlrc so a developer's own settings cannot change what runs.
"${compose[@]}" exec -T observations \
  psql --quiet --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "${role}" --dbname "${database}" < "${sql}"

echo "    observation store provisioned; SQL in ${DROGNA_ARTEFACT_DIR##*/}/observations.sql"
