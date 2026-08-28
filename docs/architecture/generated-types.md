# The generated types, end to end

Every shape that crosses a language boundary in drogna is written once, in JSON Schema,
and the Python and TypeScript that speak it are generated from that file and from nothing
else. This note is the whole chain in one place: what is authoritative, what is derived,
what runs, and what catches the derived tree falling behind.

It is a summary of material that is normative elsewhere. `contracts/schemas/README.md`
owns the conventions for a master, `contracts/openapi/README.md` owns the two OpenAPI
documents, and `contracts/openapi/generators.toml` owns the generator choices with the
argument for each beside the value. Where this note and one of those disagree, they are
right and this is stale — say so rather than editing around it.

## Why generated at all

Constitution III: a shape declared twice is a shape that will disagree with itself, and
the disagreement will be found by a consumer rather than by a build. NFR-01 to NFR-03 ask
for one definition per shape, per language, derived rather than transcribed. A hand-written
TypeScript interface beside a Python dataclass is not two views of one contract; it is two
contracts that happen to match today.

The failure this prevents is specific and has happened here: two hand-written
`Measurement` dataclasses survived in the tree until somebody finally wrote the schema
that described them. A shape nobody declared is invisible to the gate that forbids
undeclared shapes.

## The five steps

```
contracts/schemas/*.schema.json          the masters, authoritative
contracts/openapi/*.openapi.{yaml,json}  the HTTP documents
        │
        │  scripts/generate_types.sh  →  scripts/generate_types.py
        ▼
   1. discover      masters classified config/ or messages/ by file name
   2. bundle        copied to scratch, external $refs rewritten bundle-relative
   3. generate      datamodel-codegen → Python;  schema_to_typescript.py → TypeScript
   4. normalise     generator header stripped, DO NOT EDIT banner applied
   5. copy          schema documents that travel inside component packages
        │
        ▼
libs/harness_types/src/harness_types/    Pydantic v2 models
client/src/generated/                    TypeScript types
services/*/src/*/schemas/*.json          the copies a container validates against
```

Nothing in this reaches the network. FR-016 forbids it and SC-007 requires the drift check
to pass with networking disabled, which is why every `$ref` must land on a document in
this repository and why the TypeScript half is an emitter in this repository rather than a
Node package (see the ADR below).

### 1. Masters

`contracts/schemas/<topic-noun>.schema.json`, JSON Schema 2020-12. A name beginning
`config.` becomes a configuration model under `config/`; anything else becomes a payload
model under `messages/`. There is no list to add a file to.
`scripts/check_schema_conventions.py` enforces the conventions — `$id`, `title`,
`description`, `additionalProperties`, examples that validate, simulation time rather than
host time — over the whole directory, reporting every violation rather than the first.

### 2. Bundling

The masters are copied to a scratch directory with their references rewritten to
bundle-relative form and the `config`/`messages` split imposed. The bundle is a build
artefact and is never committed. It exists because `datamodel-code-generator` in directory
mode is what gives cross-module imports — a shape shared by two masters defined once and
imported, which is what NFR-02 asks for and what a per-file invocation cannot give.

### 3. The two generators

| Half | Tool | Where the choice is argued |
|---|---|---|
| JSON Schema → Python | `datamodel-code-generator`, pinned, with `black` and `isort` | `generators.toml`, `[[tool]]` |
| JSON Schema → TypeScript | `scripts/schema_to_typescript.py`, this repository's own emitter | `generators.toml`, and ADR-0022 |

Every version is checked against what is installed before a byte is written. A mismatch
stops the run naming both versions, rather than rewriting the tree in a dialect the
committed output was not written in.

### 4. Banners and normalisation

Every generated file opens with a banner naming the master it came from and the script
that wrote it. The generator's own header is stripped first: it names the bundled
intermediate, which is a scratch file nobody can open, where the banner has to name
something a reader can. Normalisation also refuses output carrying the scratch path — a
generator that leaked the machine it ran on would produce a tree that differed per machine
and a drift check nobody could keep green.

### 5. Copies

A component in a container validates its configuration before any other I/O and has no
`contracts/` directory to hand, so the schema documents it needs travel inside its
package. Those copies are an output of this chain, listed as `[[copy]]` in the manifest.
The tests asserting each copy is byte-identical to its master still exist, and now cannot
fail without the drift check failing first.

## The HTTP documents

Two OpenAPI documents live in `contracts/openapi/`, and they are never merged. Which
policy each gets is a `[[document]]` entry in the manifest — the per-document options
006 T031 asks for — and the chain refuses a `kind` or a `schemas` value it does not know,
and refuses a policy naming a document that is not there.

| | `harness.openapi.yaml` | `query-layer.openapi.json` |
|---|---|---|
| Kind | authored here, authoritative | vendored: pygeoapi's account of itself |
| OpenAPI | 3.1 — dialect is JSON Schema 2020-12 | 3.0.2 — its own bounded variant |
| Written by | hand, in the same commit as the code that answers the paths | `scripts/refresh_query_layer_spec.sh`, never by hand |
| `components/schemas` | must `$ref` a master; generation emits an **alias** | the emitter's own; **no model is generated** |
| `paths` | surface generated | surface generated |

**Why the vendored document's schemas are not generated.** All four pygeoapi emits —
`queryable`, `queryables`, `tilematrixsetlink`, `tiles` — describe endpoints this query
layer does not serve: there is no `/tiles` and no `/queryables` among its nineteen paths.
One of them references a document on `schemas.opengis.net`, which the chain may not fetch.
Generating a model nothing serves, from a reference nobody may follow, would be three
kinds of approximation at once.

**What "surface" means.** For each path, its methods and their `operationId`s, emitted as
a `Literal` and a frozen mapping in Python and a union type and an `as const` object in
TypeScript. So a caller cannot mistype a path, and a path the interface stops serving
becomes a compile error rather than a 404 somebody meets in a browser. An operation
without an `operationId` stops the chain by name: an operation with no identifier cannot
be named in either language.

**Parameters are deliberately not generated.** In the vendored document most are `$ref`s
into OGC's published documents — `.../parameters/bbox.yaml`, `z.yaml`, `instanceId.yaml`.
The chain may not fetch them, and the last segment of such a URL *looks* like the
parameter's name and very nearly is one, which is exactly the plausible-but-unverified
guess this whole feature exists to remove. A parameter list is generated when a document
states its parameters inline, and not before.

### Refreshing the vendored document

```bash
scripts/refresh_query_layer_spec.sh        # then scripts/generate_types.sh
```

Two routes. The offline one renders the pygeoapi configuration inside a one-shot container
and asks pygeoapi to describe it — the entrypoint's own first two steps, which is what
makes the capture a description of what is served. The fallback asks the running query
service directly over the compose network. Both were wrong when first written, each about
a different file, in the way a route nobody has run is wrong; the script's own header
records what each got wrong, because that is the part a reader correcting it needs.

What is written is canonicalised — sorted keys, two-space indent, one trailing newline —
and otherwise untouched. **Read the diff of a refresh as an interface change log**: a
removed path or a narrowed type is a client change waiting to happen. The document is
never hand-edited, not even to make a generator happier: a hand-edit makes it an
approximation of somebody else's interface again, which is what NFR-01 exists to remove.

One consequence worth stating. The document is captured from a destination, so it carries
that destination's advertised URL in `servers` and `info`. Nothing generated reads those
keys, so the generated tree is destination-independent and the drift check is too — but a
refresh run against a different destination produces a noisy diff for that reason alone.
Refresh from `local` unless you mean otherwise.

## Adding a shape

1. Write `contracts/schemas/<topic-noun>.schema.json`.
2. Run `scripts/generate_types.sh`.
3. Register it in `tests/unit/test_generated_models.py`.

Step 3 is not bookkeeping. The gate that forbids hand-written boundary types can only see
shapes somebody declared; registering the model is how a new shape joins the set that is
actually checked against its schema, in both directions, on every run.

An OpenAPI document is the same shape of change: add the document, add its `[[document]]`
policy to the manifest, regenerate, register.

## What catches this falling behind

| Check | What it refuses |
|---|---|
| `scripts/check_types_drift.sh` | any difference between the committed tree and a fresh generation: a schema edited without regenerating, a generated file edited by hand, or a file in the generated tree no master accounts for |
| `scripts/check_schema_conventions.py` | a master that breaks the conventions above |
| `scripts/check_handwritten_types.py` | a boundary shape restated in code instead of referenced |
| version checks in the chain | generating with a tool other than the one the committed tree was written by |
| normalisation | output carrying the scratch path it was generated in |

The drift check writes nothing to the working tree whether it passes or fails, needs no
running service, reaches no network, and runs in about 1.2 seconds against a budget of
sixty. Nobody should ever have cause to move it somewhere it runs less often.

Every one of those has been watched failing on the thing it describes. That is the bar
`CLAUDE.md` sets and it is not ceremony: two of the original four gates in this repository
were reporting a file of deliberate violations as clean, and the tests proving the gates
could fail were themselves not being collected.
