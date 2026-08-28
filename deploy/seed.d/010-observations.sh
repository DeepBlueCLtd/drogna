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

# The run-time roles' passwords, which `roles.sql` deliberately does not carry: it is a
# tracked file, and a password in a tracked file is a password in the history for ever. So
# the roles are created there with LOGIN and nothing else, and told what their password is
# here, from the same generated values `render_credentials.py` puts into the DSNs. Both
# halves of each credential come from one set of values, so they cannot disagree.
#
# Until this existed every DSN naming one of these roles met `fe_sendauth: no password
# supplied` the moment anything connected, which is what stopped the ingest client from
# starting at all.
#
# Piped rather than passed as arguments, and never written to the artefact directory: the
# SQL above is kept for inspection and this deliberately is not, because it carries secrets.
# `ALTER ROLE` is idempotent, so a re-run simply reasserts the same password.
roles_sql=""
while IFS='=' read -r role_name variable; do
  secret="$(eval "printf '%s' \"\${${variable}:-}\"")"
  if [ -z "${secret}" ]; then
    echo "    no value for ${variable}; ${role_name} would be left unable to log in" >&2
    exit 1
  fi
  # Quoted by psql's own literal quoting rather than by string building here.
  roles_sql+="ALTER ROLE ${role_name} PASSWORD $(
    printf '%s' "${secret}" | python3 -c 'import sys; print("'"'"'" + sys.stdin.read().replace("'"'"'", "'"'"''"'"'") + "'"'"'")'
  );"$'\n'
done < <(python3 -c '
import sys
sys.path.insert(0, "'"${root}"'/deploy/lib")
import render_credentials
for role, variable in sorted(render_credentials.DATABASE_ROLE_SECRETS.items()):
    print(f"{role}={variable}")
')

printf '%s' "${roles_sql}" | "${compose[@]}" exec -T observations \
  psql --quiet --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "${role}" --dbname "${database}"

echo "    run-time roles given their passwords; the values are in neither the log nor the artefacts"
