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

compose=(
  docker compose
  --file "${DROGNA_COMPOSE_FILE}"
  --env-file "${DROGNA_ENV_FILE}"
  --profile provisioning --profile core
)

# Built first, as its own command, and the whole point is which stream the progress goes to.
#
# `docker compose run` builds a missing image itself — and writes BuildKit's progress to
# **stdout**, the same stream the one-shot returns its digest report on. So on a cold image
# the capture below got 76 lines of `#1 [internal] load local bake definitions` and then the
# JSON, and the parse guard underneath reported "the provisioning run wrote no digest
# report". First run fails, second run passes, because by then the image exists and `run`
# prints nothing.
#
# That is the trap CLAUDE.md records, in its mirror image: never clear the artefact before
# re-running, or you only ever test the case that works. Here nobody had run it *without*
# the artefact — the image — since the capture was written, so the failing case was the
# first one a fresh checkout would meet, and every re-run hid it. `scripts/reset.sh` removes
# no image, which is why the reset-then-reseed proof (005 T028) did not surface it either.
#
# Building explicitly sends that progress to stderr, where the rest of this step's narration
# already goes, and leaves `run` with nothing to say on stdout but the report.
"${compose[@]}" build features >&2 ||
  { echo "the provisioning image could not be built; nothing was run" >&2; exit 1; }

# --rm because this is a one-shot and a stopped container per seeding run is litter. The two
# profiles are named because `features` is in `provisioning` and the store it writes to is in
# `core`, and Compose refuses a service whose dependency is outside the selected profiles.
"${compose[@]}" run --rm --quiet-pull features > "${report}"

# A report that is not the digest document means the one-shot exited 0 having written
# something else, which is the one failure this step cannot see from the exit code alone.
python3 -c 'import json,sys; json.load(open(sys.argv[1]))["digests"]' "${report}" ||
  { echo "the provisioning run wrote no digest report; see above" >&2; exit 1; }

echo "    feature store provisioned; digests in ${DROGNA_ARTEFACT_DIR##*/}/features.json"
