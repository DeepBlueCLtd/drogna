#!/usr/bin/env bash
#
# Provision the feature store: schema, this seed's content, then the grants.
# (007-observation-path T043.)
#
# Unlike the observation store's step beside it, this one does not run the provisioning on
# the host. It cannot: `stores/features/provision.py` needs `harness_core`, because its
# content is a seeded draw and its configuration is schema-validated, and `deploy/README.md`
# promises — with a test behind it — that a destination needs only a container runtime and a
# bare interpreter. So the workspace comes to the provisioning instead, in the one-shot C-07
# already declares in `deploy/compose.yaml`.
#
# The one-shot writes its digest report to standard output and everything else to standard
# error, so the capture below is the report and nothing else. That report is what
# `scripts/seed.sh` digests into the seeding record, which is how two instances provisioned
# from the same root seed can be compared.
#
# Idempotent, because the one-shot is: the migrations are `IF NOT EXISTS`, the content load
# deletes and re-inserts inside a transaction, and the provisioning digest row is an upsert.
# Two consecutive runs produce identical digests over 651 rows rather than 1,302.
#
# Runs after 010: `stores/features/roles.sql` grants to drogna_ingest, drogna_read and
# drogna_telemetry, which `stores/observations/roles.sql` creates.

set -euo pipefail

report="${DROGNA_ARTEFACT_DIR}/features.json"

# --rm because this is a one-shot and a stopped container per seeding run is litter. The two
# profiles are named because `features` is in `provisioning` and the store it writes to is in
# `core`, and Compose refuses a service whose dependency is outside the selected profiles.
docker compose \
  --file "${DROGNA_COMPOSE_FILE}" \
  --env-file "${DROGNA_ENV_FILE}" \
  --profile provisioning --profile core \
  run --rm --quiet-pull features > "${report}"

# A report that is not the digest document means the one-shot exited 0 having written
# something else, which is the one failure this step cannot see from the exit code alone.
python3 -c 'import json,sys; json.load(open(sys.argv[1]))["digests"]' "${report}" ||
  { echo "the provisioning run wrote no digest report; see above" >&2; exit 1; }

echo "    feature store provisioned; digests in ${DROGNA_ARTEFACT_DIR##*/}/features.json"
