#!/usr/bin/env bash
#
# Put the scenario's first forecast in the coverage store. (009-control-loop, wave 6 lane A.)
#
# Why the store needs seeding at all. Nothing can diverge from nothing: the monitor scores
# observations against the *published* field, and with no field it reports `warming` and
# raises nothing — which `specs/009-control-loop/spec.md` states as its cold-start edge case
# and which every one of the loop's own tests works around by publishing a first run before
# it starts. In a running stack nothing did, so the loop was wired end to end and still could
# not turn. The first field is content, and every piece of content in a running drogna comes
# from a step in this directory (NFR-07).
#
# It is produced by the model runner's own kernel and ensemble, through the ordinary image
# and the ordinary entry point, and left in staging for the running publisher to make visible
# by the ordinary rename. Nothing here writes a field, and no second thing in this repository
# can produce one.
#
# Idempotent, as the contract requires: if the store already names a current run this step
# does nothing at all. A second staging of the same run would be refused by the publisher —
# "a run identifier names one run" — which is correct behaviour and a confusing thing for a
# re-seed to produce.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../.." && pwd)"

compose=(docker compose --file "${DROGNA_COMPOSE_FILE}" --env-file "${DROGNA_ENV_FILE}")

# The control profile may not be active at a destination, and this step is not the place to
# have an opinion about that. Without a publisher there is nothing to make a run visible, and
# without the runner there is nothing to produce one.
running="$("${compose[@]}" ps --services --status running || true)"
for service in model-runner publisher; do
  if ! printf '%s\n' "${running}" | grep -qx "${service}"; then
    echo "    ${service} is not running at this destination; the coverage store is left empty"
    exit 0
  fi
done

# Where the store is, and what names the current run. From the destination's own query
# configuration, which is where the coverage store's layout is declared — not typed here,
# because a name typed into a seeding step is a name that can disagree with the one the
# containers were created with (Constitution IV).
query="${root}/config/${DROGNA_DESTINATION}/query.json"
read -r store_root pointer < <(
  python3 -c 'import json,sys; s=json.load(open(sys.argv[1]))["query"]["coverage_store"]; print(s["root"], s["current_pointer"])' \
    "${query}"
)

if "${compose[@]}" exec -T publisher test -s "${store_root}/${pointer}" 2>/dev/null; then
  current="$("${compose[@]}" exec -T publisher cat "${store_root}/${pointer}" | tr -d '\r\n')"
  echo "    the coverage store already names ${current} as current; nothing to seed"
  exit 0
fi

# --rm because this is a one-shot and a stopped container per seeding run is litter. It runs
# beside the model runner already serving the loop rather than instead of it, and takes no
# broker connection for that reason: MQTT identifies a client per role, so a second
# connection under the same name would have the broker close the incumbent without telling
# either party. The entry point says so where it decides it.
"${compose[@]}" run --rm --quiet-pull model-runner --initialise-store \
  > "${DROGNA_ARTEFACT_DIR}/initial-run.txt" 2>&1 ||
  { cat "${DROGNA_ARTEFACT_DIR}/initial-run.txt" >&2; exit 1; }
cat "${DROGNA_ARTEFACT_DIR}/initial-run.txt" | sed 's/^/    /'

# The publisher takes it on its next turn, which is bounded by its own heartbeat interval
# rather than by anything guessed here. This waits for the pointer to appear so that the
# seeding record describes a store that is genuinely servable, rather than one with a run
# sitting in staging that nothing has yet been seen to publish.
deadline=$((SECONDS + 120))
until "${compose[@]}" exec -T publisher test -s "${store_root}/${pointer}" 2>/dev/null; do
  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "the initial run was staged and the publisher did not make it current within 120s" >&2
    "${compose[@]}" logs --tail 40 publisher >&2 || true
    exit 1
  fi
  sleep 2
done

current="$("${compose[@]}" exec -T publisher cat "${store_root}/${pointer}" | tr -d '\r\n')"
printf '%s\n' "${current}" > "${DROGNA_ARTEFACT_DIR}/current-run.txt"
echo "    the coverage store now names ${current} as current; the loop has a field to diverge from"
