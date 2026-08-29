> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0018: `common.json` is a root seed, and the defaults mechanism it describes does not exist

**Status:** Accepted
**Date:** 27 August 2026
**Requirements:** SRD NFR-04; Constitution II, Constitution IV
**Raised by:** the last tracked broker URL that named no role

## Context

`config/<destination>/common.json` described itself:

> Values every component at this destination shares. A component's own file overrides what
> it needs to.

It carried a clock block, a seed block, a logging block and a broker block, and it was the
last configuration file in the tree whose broker URL named no role — the one entry left in
`tests/unit/test_broker_role_in_configuration.py`'s outstanding list after ADR-0016.

Deciding what role it should name meant asking which component authenticates with it. The
answer is none, and the reason is more interesting than the question.

**Nothing merges this file.** `deploy/lib/seed_record.py` reads it, for `seed.root`, and
nothing else in the repository reads it at all: no component receives it as `HARNESS_CONFIG`,
no variable in `deploy/env.template` or `deploy/compose.yaml` names it, and
`libs/harness_core/config.py` has no overlay step. Every component's own file already carries
its complete values, which is why all fourteen of them repeat the same clock endpoint and the
same broker location rather than inheriting them.

So the override semantics the file announced had never been built. The broker block in it
was a default that could not have applied to anything, and its role — had one been assigned —
would have been a credential nothing would ever present.

## Decision

**The broker block is removed, and the description is corrected to say what the file is.**
It is the destination's root seed, plus two blocks the schema requires and nobody reads. That
empties the outstanding list, so the ratchet ADR-0016 introduced is a gate now: every tracked
broker URL names a role defined in `deploy/broker/acl`, and nothing may join the exception
list without a reason.

**The shared-defaults mechanism is not built.** It is recorded as absent rather than
implemented, because implementing it would be a change to how every component reads its
configuration in service of removing a repetition that costs nothing today — fourteen files
that each state their own values completely, which is easy to read and impossible to get
subtly wrong. Constitution IV wants one place where a location is named *per component*, and
that is satisfied.

What would change the answer: a value that must be identical across components and is not
(a shared secret, a protocol version), where repetition would let two components disagree
silently. There is no such value today.

## The alternative rejected

**Giving `common.json` a role.** It was the obvious way to empty the list, and it would have
been wrong in a way that is worth naming: it would have produced a credential for an identity
that never connects, a password-file entry the broker would never match, and a line in the
access control list defending nothing. The exception list existed precisely so that the
answer could be "look first", and looking is what found that the file does something other
than what it said.

## Consequences

Two documents said something untrue about this file and now do not: the file's own
description, and — by implication — the assumption behind its broker block. The `seed.root`
field is unaffected and is still the one thing that makes a run reproducible, read from here
and generated nowhere (Constitution II).
