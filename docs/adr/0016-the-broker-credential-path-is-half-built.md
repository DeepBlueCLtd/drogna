# ADR-0016: No component could authenticate, and the credential path is now whole

**Status:** Accepted, and amended the same day — see "What changed a few hours later"
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

**The secret producer is built, and the paragraph this replaces said it would not be.**
What it needed, precisely: four entries in `deploy/env.template` and in `SECRET_NAMES` in
`deploy/lib/render_env.py`, alongside `HARNESS_DATABASE_PASSWORD`; a step producing
`deploy/broker/passwd` with `mosquitto_passwd` from those four values; an entry for that
file in `.gitignore`; and the render substituting each secret into the URL its component
reads. All of it is done, in `deploy/lib/render_credentials.py` and `deploy/lib/common.sh`. The
`.gitignore` entry turned out to be there already, which is a small illustration of the
same theme: a piece of the path existed and nothing joined it to the rest.

## What changed a few hours later

This record originally stopped at the role and argued that the secret producer should not be
written, on the grounds that the only way to know whether a rendered secret reaches a running
component is to bring the whole stack up, and nothing here can.

That reasoning was wrong, and the mistake is worth keeping rather than editing out. It
confused *the deployment* with *the property*. The property is that the configuration a
component reads, and the password file the broker reads, are two representations of the same
secret and agree. Compose is one way to exercise it and not the only one: `mosquitto` is a
binary, the tracked `mosquitto.conf` and `acl` are the real files, and the renderer is the
real renderer. Put those together and the property is observable in about a second.

`tests/integration/test_broker_credentials.py` does exactly that, and reports:

    rendered credentials               -> Success
    same role, wrong secret            -> Not authorized
    no credentials at all              -> Not authorized

Every earlier test in this repository that touched a broker wrote its own password file,
which is precisely why the gap survived: a fixture that supplies both halves of a credential
can never fail the way the deployment failed. This test supplies neither and asks the
renderer for both.

Two things remain genuinely untested here and are not claimed: that Compose mounts the
rendered directory as intended, and that the file's ownership suits the broker's own user
inside the pinned image. Both are properties of the container runtime rather than of the
credential path.

## The alternative rejected

**Leaving the path unbuilt and recorded.** That was this record's original decision, and it
would have been defensible if the property really had needed Compose. It did not. The
general lesson is the one the repository already states about tests that skip: "cannot be
tested here" is a claim to check rather than assert, and the version of it that stands is
"cannot be tested here by the means I first thought of".

## A sibling gap, found the same way and not closed here

The proxy has the same shape of problem and it is recorded here rather than left to be
rediscovered. `config/<destination>/proxy.json` names `proxy.credentials.file`, the rendered
nginx emits `auth_basic_user_file` pointing at it, and **nothing in the repository produces
that file**. It is not generated by the render, not written by any script, and not listed in
`.gitignore` — which the broker's password file at least was.

It is not fixed here for one reason and one reason only: it is a different credential with a
different tool and a different consumer, and folding it into a record about the broker would
make both harder to find. It differs from the broker's case in when it bites — nginx does not
resolve `auth_basic_user_file` at configuration load, so the proxy starts and then answers
500 to anything behind that location, rather than refusing to start. That is a worse failure
mode than the broker's, not a better one: the service reports healthy.

`deploy/lib/render_credentials.py` is where it should go, alongside the broker's, and for the
same reason: two representations of one secret written from one set of values in one place.

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
