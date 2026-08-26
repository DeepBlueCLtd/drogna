# Seeding steps

Every piece of content a running drogna holds is produced here. Nothing accumulates: a
store contains what a step put in it and nothing else, which is what makes a fresh instance
equivalent to one that has been running for a week (SRD NFR-07).

## The contract

A step is an executable `*.sh` file in this directory. `scripts/seed.sh` runs them in
lexical order, which is why they are numbered, and hands each one the following in its
environment:

| Variable | Meaning |
|---|---|
| `DROGNA_ROOT_SEED` | The run's root seed, taken from `config/<destination>/common.json`. A step derives every value it needs from this and from its own logical position, never from entropy. |
| `DROGNA_DESTINATION` | The destination being seeded. |
| `DROGNA_ARTEFACT_DIR` | A directory for this step alone. Every file written here is digested into the seeding record. |
| `DROGNA_COMPOSE_FILE`, `DROGNA_ENV_FILE` | For a step that needs to reach a running service: `docker compose --file "$DROGNA_COMPOSE_FILE" --env-file "$DROGNA_ENV_FILE" exec ...`. |

A step must:

- be idempotent, and converge when re-run after an interruption rather than seeding twice;
- take every value it writes from the root seed and from the destination configuration —
  never from the host clock (Constitution I) and never from an unseeded generator
  (Constitution II);
- write into `DROGNA_ARTEFACT_DIR` whatever a later run would need to compare against, so
  that the seeding record can say what it produced;
- exit non-zero on failure, which stops the run and prevents a seeding record being written
  at all.

## What is installed today

Nothing. No component whose store needs seeding has been built yet, so `scripts/seed.sh`
runs no steps and writes a record of a stack with nothing in it. That record is still
useful — it fixes the root seed, the active profiles and the digest of every configuration
file, so two instances can be compared from the day the deployment exists — and it will
grow a step per store as the components arrive.

Each feature adds its own step here as it lands: the feature store's provisioning script
(C-07), the environment generator's initial field (C-02), and so on. Adding a step is
adding one file; nothing else changes.
