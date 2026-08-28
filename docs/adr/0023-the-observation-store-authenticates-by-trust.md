# ADR-0023: The observation store authenticates by trust, and models no database threat

**Status:** Accepted
**Date:** 28 August 2026
**Requirements:** SRD FR-18, NFR-05..NFR-07; Constitution IV, VI
**Raised by:** the open question left by ADR-0016's database half — three roles created with `LOGIN` and no password, and a DSN rewriter that could not fill them in

## Context

`deploy/lib/render_credentials.py` existed to solve one problem: the tracked configuration
carries a role and never a secret, so something has to put the secret in before a component
connects. That is unarguable for the broker. `deploy/broker/mosquitto.conf` sets
`allow_anonymous false`; a client with no password is refused; the credential path ADR-0016
built is what makes the stack work at all.

The database half was built by analogy, and the analogy was never checked.

When the `features` one-shot first reached Postgres it stopped on `fe_sendauth: no password
supplied`. The response (DECISIONS, 2026-08-28T08:50) was `_with_database_secret`, the
sibling of `_with_secret` beside it, rewriting a DSN wherever it named the owner. That
worked for the owner and could not work for the three run-time roles:
`stores/observations/roles.sql` creates `drogna_ingest`, `drogna_read` and
`drogna_telemetry` with `LOGIN` and nothing else, so injecting a password would have
produced a credential the database had never been told about. The session recorded the gap
rather than papering over it, which is why this decision had something to decide.

Closing it by extension meant: three more generated secrets, three more names in
`deploy/env.template`, three more in `SECRET_NAMES`, and an `ALTER ROLE` per role in
`deploy/seed.d/010-observations.sh` to tell the database the same values the renderer had
put into the DSNs — two halves of three credentials, generated in one place and applied in
two, kept in step for ever after. That work was done, and it is what this record retires.

**What was never asked is what the password was defending.** The store's port is published
to `127.0.0.1` at both destinations — `config/local/deployment.json` and
`config/droplet/deployment.json`, `network.publish.observations.bind`. The only entry in
either file bound to `0.0.0.0` is the droplet's proxy, which is the boundary the harness
does model and which feature 013 and ADR-0001 are about. A connection reaching Postgres has
therefore already had to be on the compose network or on the host's own loopback. Anything
in that position can read `deploy/.env`, which is where the password was kept.

The harness is a demonstration of an oceanographic forecast loop. It models a
release boundary. It has never modelled a database threat, and the SRD asks it to model one
nowhere.

## Decision

**Postgres authenticates by trust for connections from the compose network. Every DSN names
a role and carries no password. The machinery that generated, stored, injected and
reconciled database passwords is removed rather than extended.**

Concretely:

- `stores/observations/pg_hba.conf` is tracked and carries two rules: `local … trust` for
  the container's own socket, and `host all all samenet trust` for the compose network.
  There is no unrestricted line, and its absence is the boundary — an address off that
  network is refused because no rule admits it.
- `deploy/compose.yaml` starts the server with `-c hba_file=…` naming that file inside the
  existing read-only stores mount, and sets `POSTGRES_HOST_AUTH_METHOD: trust` so the
  image's entrypoint accepts the absence of `POSTGRES_PASSWORD`.
- `HARNESS_DATABASE_PASSWORD` and the three `HARNESS_DATABASE_SECRET_*` are gone from
  `deploy/env.template`, from `ensure_secrets` in `deploy/lib/common.sh`, and from
  `SECRET_NAMES` in both renderers. `_with_database_secret`, and the walk that found every
  `dsn` at any depth to apply it, are gone from `deploy/lib/render_credentials.py`. The
  `ALTER ROLE` block is gone from `deploy/seed.d/010-observations.sh`.

**`hba_file` rather than `POSTGRES_HOST_AUTH_METHOD` alone, and the difference is
convergence.** The environment variable is read only by the entrypoint's *first-time
initialisation*. Against a volume already initialised under scram — every existing
installation — flipping it changes nothing, and every passwordless DSN would go on meeting
`fe_sendauth: no password supplied` with the configuration apparently saying otherwise.
`hba_file` is read by the server at every start. `scripts/up.sh` is required to converge, so
the second bring-up is part of the behaviour, and this is the form that has it.

**The broker's credential path is unchanged and out of scope.** ADR-0016 stands in full.
That boundary is real: the broker refuses anonymous clients, the access control lists in
`deploy/broker/` distinguish what a role may publish from what it may subscribe to, and the
control namespace's clearance argument (ADR-0001, ADR-0020) rests on it. Nothing here
touches `ROLE_SECRETS`, `write_password_file`, or `write_proxy_credentials`.

## What is deliberately not given up

**Authorisation.** Trust decides who you may claim to be. The grants decide what that gets
you, and they are untouched: `roles.sql` still grants `INSERT` to `drogna_ingest` alone,
still grants `UPDATE` and `DELETE` to nobody, and still ends in an assertion block that
fails the provisioning run if either has drifted. FR-18's claim — that exactly one role can
put a row into this schema, enforced by the database refusing everybody else — rested on the
grants before this change and rests on them after it.

`tests/integration/test_observations_trust_auth.py` asserts both halves against a running
store, because they pull in opposite directions and a change that got one right could get
the other wrong: every runtime role connects with no password, and `drogna_read` is still
refused a real `INSERT` with `InsufficientPrivilege`.

## Consequences

**009 T059 dissolves.** There is no credential-ordering constraint between the seeding step
and a service's first connection, because there is no credential to order. What remains of
that task is the unseeded-schema case — a service starting before seeding meets missing
tables, not a refused login — and that is lane A's, unchanged by this.

**A destination that did publish the store beyond loopback would be wrong under this
decision, not merely riskier.** The trust rule is scoped to `samenet`, so such a
destination would break rather than quietly widen; but `network.publish.observations.bind`
is now load-bearing for a security claim, which it was not before. That is the cost, and it
is recorded here rather than discovered later.

**Reversing this is small.** The rules are one tracked file. Restoring passwords means
restoring the four names and the `ALTER ROLE` block — which is why the history is described
above in enough detail to do it, rather than merely deleted.

## Alternatives rejected

**Extend `_with_database_secret` to the three run-time roles.** The option the previous
session left open, and the one the delivery plan explicitly chose against. It works: three
secrets, three names, an `ALTER ROLE` per role. It also permanently doubles the number of
credentials the deployment keeps in step, adds a second failure mode to every seeding run,
and defends a port bound to `127.0.0.1` against a caller who can already read the file the
password is in. Cost with no matching threat.

**Leave it as it was.** The state ADR-0016's session recorded: the owner's DSN rewritten,
the three run-time roles' DSNs passwordless against a database asking for a password. Every
component naming one of those roles fails on first connection. Not a resting place.

**Peer authentication, or a `.pgpass` file.** Both keep the shape of a credential while
removing the secret from configuration. Neither removes the machinery — something still has
to render, place and permission a file — and `.pgpass` in particular has the ownership and
mode hazards that cost this repository three CI rounds on the broker's password file.
Trust removes the question rather than relocating it.

**`POSTGRES_HOST_AUTH_METHOD: trust` on its own.** Simpler, and wrong on the second run for
the reason given above. It is kept alongside `hba_file` only to satisfy the entrypoint's own
refusal to initialise without a password; the file is what decides.
