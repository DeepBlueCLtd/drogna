> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0022: The type chain's generators, and why the TypeScript half is ours

**Status:** Accepted
**Date:** 28 August 2026
**Requirement:** SRD NFR-01, NFR-02, NFR-03; FR-009, FR-015, FR-016; SC-007
**Related:** feature 006; `contracts/openapi/generators.toml`, which carries these choices
as values; `docs/architecture/generated-types.md`, which describes the chain they sit in

## Context

Constitution III makes the generated trees part of the build: `libs/harness_types/` and
`client/src/generated/` are derived from `contracts/`, committed, and proved current by
`scripts/check_types_drift.sh` on every change. The check compares bytes. That has a
consequence which is the whole reason this record exists: **the generators are part of the
contract.** A generator at a different version, or a formatter with a different opinion,
produces a diff nobody's change caused, and a diff nobody's change caused is a check
everybody learns to ignore.

Replacing a generator later is therefore not a dependency bump. It is a whole-tree
regeneration and a review of a diff nobody can read, on files nobody may hand-edit. That
is the definition of hard to reverse, so the choices are recorded here rather than left in
a lockfile.

Feature 006's specification recorded the generator choice as an assumption and guessed at
three tools. Two of those guesses were kept and one was not.

## The choices, and what was rejected

### JSON Schema to Python: `datamodel-code-generator`

Kept, as the specification assumed. Considered against writing an emitter, as was done for
TypeScript, and against `quicktype`.

It is the only widely used JSON Schema to Python generator that keeps constraints —
`minimum`, `pattern`, `enum` — and descriptions **in the model** rather than dropping them
at the door. That matters more here than it sounds: a generated model that has lost its
constraints validates less than the schema it came from, so a payload the schema refuses is
accepted by the code, and the two halves of one contract disagree silently. `quicktype`
produces shapes, not validation.

It is also the reason the chain generates from a *bundle* rather than from
`contracts/schemas/` directly. In directory mode it emits one module per master with real
cross-module imports, so a shape shared by two masters is defined once and imported. That
is NFR-02 mechanically enforced, and a per-file invocation cannot give it.

It is installed **without** its `[http]` extra, and that is load-bearing rather than
frugal. An unresolvable reference then fails with "install the http extra" instead of
quietly fetching a document over the network — which FR-016 forbids and which would make
the drift check depend on the internet.

`black` and `isort` are pinned alongside it, because formatting is part of the bytes being
compared and a formatter is therefore a generator. They are used in preference to the ruff
formatter because `datamodel-code-generator` shells out to whichever `ruff` is on PATH,
which is not necessarily the workspace's; black and isort are its own pinned dependencies,
resolved by `uv.lock`. The builtin formatter is dependency-free but wraps annotations in
parentheses and leaves 300-character lines, which makes a review diff unreadable.

### JSON Schema to TypeScript: an emitter in this repository

**This is where the specification's assumption was overruled.** It named
`json-schema-to-typescript` and `openapi-typescript`. Both are good tools. Both are Node
packages, and that is the problem.

FR-009 says the drift check needs no network fetch and no service; SC-007 says it passes
with networking disabled. A Node generator makes the gate depend on `pnpm install` — a
network fetch — inside the Python job that runs every other gate, or else on a second job
with half the chain in it. Neither is a gate anyone would trust, and a gate nobody trusts
is the failure mode this repository has already met twice: a check that has never been
seen to fail is worth nothing, and a check that is *expected* to be flaky is worse, because
its failures get waved through.

So the TypeScript half is `scripts/schema_to_typescript.py`, a small emitter over the JSON
Schema subset the masters actually use. It fails loudly on any construct it does not
understand rather than emitting something plausible. That property is the point: **an
emitter that guesses is worse than no emitter, because the wrong type compiles.**

This is a trade and it is worth naming both sides. What is given up is a generator with
more users than us — one that has met constructs we have not, and that somebody else
maintains. What is bought is a check that runs anywhere Python runs, with nothing to
install and nothing to reach, in about 1.2 seconds.

The condition for revisiting it is stated rather than left to taste. If the OpenAPI half
ever needs more than this emitter can do, the honest move is `openapi-typescript` invoked
from the client's own toolchain, with the drift check **split in two and both halves run
in CI** — not a Python-only gate that quietly stops examining the TypeScript. A gate that
covers half of what it appears to cover is the worst of the three options.

### The vendored OpenAPI document: no schema generator at all

The query layer's specification is captured from pygeoapi, not written here. Running
either generator over its `components/schemas` was considered and rejected on its own
merits, not on tooling grounds: all four shapes pygeoapi emits there describe endpoints
this query layer does not serve, and one of them references a document on
`schemas.opengis.net` which the chain may not fetch. What is generated from that document
is its surface — paths, methods, operation identifiers — which is what a client of a
service contract actually needs.

## Decision

The chain uses `datamodel-code-generator` (with `black` and `isort`) for Python and this
repository's own emitter for TypeScript. Every version is pinned in
`contracts/openapi/generators.toml` and checked against what is installed **before a byte
is written**, so a tool that changed behind our backs stops the run naming both versions
rather than rewriting the tree in a dialect the committed output was not written in.

Per-document generator options for the OpenAPI half live in the same manifest, as
`[[document]]` entries with `kind` and `schemas`. Documents are never merged and never
generated under one policy: the authored document is 3.1 and must alias masters, the
vendored one is 3.0.2 and generates no models.

## Consequences

- **Changing a generator or a formatter version is a whole-tree regeneration**, and it
  belongs in its own commit with nothing else in it. The pin and the regenerated tree
  travel together or the drift check says so.
- **The TypeScript emitter is ours to maintain**, including its `EMITTER_VERSION`, which is
  pinned in the manifest exactly as a third-party version is and must be bumped in the same
  commit as a change to the emitter. A construct a master starts using that the emitter
  does not understand is a build failure and a small piece of work, not a silent wrong
  type — which is the trade taken deliberately above.
- **The gates stay in one job, need no network, and need no service.** That is what the
  Node tools were given up to buy, and it is the thing to weigh against any future proposal
  to bring one back.
- **`generators.toml` is append-only and is the single place these choices live.** The
  reason a generated file looks the way it does — every option, with its argument — is in
  that file rather than spread between a script and a review comment.
- A future OpenAPI document that states its own parameters inline extends the surface
  emitter rather than reaching for a new generator. If that stops being true, this record
  is where the reason to change belongs.
