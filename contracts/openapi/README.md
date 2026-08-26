# OpenAPI documents

Two kinds of document live here, and they are never merged.

**`harness.openapi.yaml`** is hand-written and authoritative: the HTTP surfaces the harness
itself provides. It targets OpenAPI 3.1, whose schema dialect is JSON Schema 2020-12, which
is what makes it possible to `$ref` a message schema by file instead of transcribing it.

Its `paths` are empty today because no component in the harness serves HTTP yet. The clock
service's small control interface is decided (ADR-0009) and not built; the feature that
builds it adds its paths here, in the same commit as the code that answers them.

**`query-layer.openapi.json`** will be a vendored snapshot of the specification the query
layer emits about itself — refreshed by script, never hand-edited. It is absent until
feature 008 exists to emit it, and the drift check does not care: it reads what is in the
repository, so a document that is not here generates nothing and fails nothing.

`generators.toml` is the generator manifest: which tool, at which version, turns which
master into which artefact, with the argument for each choice beside it. It is read by
`scripts/generate_types.sh`, and the versions it pins are checked against what is installed
before a byte is written.

## The rule for `components/schemas`

Every entry is a reference to a master under `contracts/schemas/`:

```yaml
components:
  schemas:
    DrognaSimulationTimeSample:
      $ref: ../schemas/clock.schema.json
```

Two things follow, and both are enforced by `scripts/generate_types.sh` rather than by
review. A shape written out here instead of referenced fails generation by name — that
second definition is what NFR-02 exists to prevent, and it is easiest to add here, where it
looks like documentation. And the key must be spelled as the generators spell the type, so
that one shape has one name wherever it appears.

What is generated from a document is therefore an alias, not a model:
`harness_types.http.harness` re-exports `DrognaSimulationTimeSample` from
`harness_types.messages.clock`, and the TypeScript module does the same. The count of
definitions per language stays at one however many documents mention the shape.

Operation-level types — parameters, request bodies, response envelopes — are not generated
yet, because no document here describes an operation. The feature that adds the first path
extends the chain, and `generators.toml` records the two generators to reach for if the
emitter in `scripts/schema_to_typescript.py` is not enough.

## Refreshing the query layer's specification

```bash
scripts/refresh_query_layer_spec.sh
```

It prefers the query layer's own offline emission command and falls back to bringing the
local destination up, capturing, and tearing it down. What it writes is canonicalised —
sorted keys, two-space indent, one trailing newline — so that the diff of a refresh shows
what the interface did between versions and nothing else. Read that diff as an interface
change log: a removed path or a narrowed type is a client change waiting to happen.

After a refresh, run `scripts/generate_types.sh`. Until you do, the drift check fails,
which is the intended order of events: the vendored document and the generated types move
together or the build says so.
