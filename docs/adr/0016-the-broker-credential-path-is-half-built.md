# ADR-0016: The broker credential path is half built, and the tracked half is the role

**Status:** Accepted
**Date:** 27 August 2026
**Requirements:** SRD FR-14, NFR-04; Constitution IV
**Raised by:** wiring every component to a real broker, and finding none of them could have authenticated to the deployed one

## Context

`deploy/broker/mosquitto.conf` sets `allow_anonymous false` and names a `password_file`, so
a client presenting no identity is refused. `deploy/broker/README.md` states the contract
that follows:

> Components receive their credentials in the broker URL their configuration carries —
> `mqtt://<role>:<secret>@<host>:<port>`. The tracked configuration files carry the role and
> no secret; the render supplies the secret.

`libs/harness_core/broker.py` implements the reading half exactly as described, parsing the
username and password out of the URL. The database side of the tree obeys the same shape
already: `config/<destination>/ingest.json` carries
`postgresql://drogna_ingest@observations:5432/drogna` — role present, password absent.

Every one of the twenty-eight tracked broker URLs read `mqtt://broker:1883`. No role, no
secret. A stack brought up from the tree as tracked would have had every component refused
at the broker, and nothing in the repository said so.

Two separate things are missing, and conflating them is what let this sit.

**The role was never written down.** That is a transcription of a decision already made:
`deploy/broker/acl` defines four roles and names which components hold each. It is not a
judgement call and there was no reason for it to be absent.

**The secret has no producer.** `deploy/broker/README.md` says so plainly, under a heading
reading "Two things this feature does not own and has therefore not done":

> Producing `passwd` at deploy time needs a generated secret per role there, exactly as
> `HARNESS_DATABASE_PASSWORD` already is, and `deploy/broker/passwd` needs an entry in
> `.gitignore`. Both are one-line additions in another feature's files and are reported
> rather than made.

Feature 007 reported it against feature 005's files. Feature 005 never did it. The report
was correct, was in the right place, and was read by nobody — which is the same failure as
the component printing "nothing lights up" on every run for months.

## Why nothing caught it

The tests that would have are `tests/integration/test_observation_path.py` and
`test_topic_isolation.py`, which are container-backed and skip wherever there is no
container runtime. `tests/support/local_broker.py` and the equivalent container fixture
generate their own password file with their own secrets, so the tests exercise a *correctly
credentialled* broker and never the tracked configuration's ability to reach one.

That is the CLAUDE.md trap in its purest form: the thing that skips locally was never
testing the property anyway, and the property it did test was the one that already worked.

A URL naming no role is also a well-formed URL. It parses, it validates against the schema,
it names a host and a port. There was nothing malformed to notice.

## Decision

**The role goes into the tracked configuration now, because it is a fact already decided.**
Twenty-two of the twenty-eight URLs now name the role their component authenticates as,
taken from `deploy/broker/acl`: `drogna_sensor` for the sensors, `drogna_ingest` for the
ingest client, and `drogna_control` for the clock, the environment generator, the model
runner, the monitor, the offload packager, the planner, the publisher, the scheduler and
the telemetry service.

**Three are deliberately left, because assigning them a role is a decision about the access
control list rather than a transcription of one.** `common.json` holds shared defaults read
by every component, so any role in it would be the wrong role for all but one. The feature
store and the query layer are named in no role block: the ACL lists the control components
as C-01 and C-11 to C-17, and a store and a read-only query surface are neither. Giving the
query layer `drogna_control` would hand a read surface write access to the entire control
namespace, which is exactly the cross-contamination C-03 owns as its failure mode. That
those two carry a broker section at all is evidence the question is open, not that it is
answered.

**The secret producer is not built here, and this record is where that is now written down
rather than left in a README's closing paragraph.** What it needs, precisely: four entries
in `deploy/env.template` and in `SECRET_NAMES` in `deploy/lib/render_env.py`, alongside
`HARNESS_DATABASE_PASSWORD`; a step producing `deploy/broker/passwd` with
`mosquitto_passwd` from those four values; an entry for that file in `.gitignore`; and the
render substituting each secret into the URL its component reads. It is not done here
because it cannot be tested here — this container has no container runtime, and a
deployment path changed without being watched working is the thing that produced this
record.

## The alternative rejected

**Writing the whole credential path now, untested.** It is four small edits and it would
have looked finished. But the only way to know whether a rendered secret reaches a running
component is to bring the stack up, and nothing here can. A credential path that has never
been watched authenticating is indistinguishable from this one: it parses, it validates, and
it fails the first time anybody runs it. Shipping that under a record saying "done" would be
worse than the gap, because the gap is now visible and a plausible-looking implementation
would not be.

## What holds the decision

`tests/unit/test_broker_role_in_configuration.py`, a ratchet in the shape
`tests/unit/test_mount_coherence.py` used before it. Four properties:

- every tracked broker URL names a role, or appears in a list with a reason
- no URL names a role `deploy/broker/acl` does not define — a wrong role is worse than none,
  because it looks settled
- no tracked URL carries a password, ever
- the outstanding list only shrinks, and an entry that has been settled must be removed

Each was watched failing on a planted violation and reported the file and the role by name.
It becomes a gate on the day the list is empty.
