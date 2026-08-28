# OpenAPI documents

Two kinds of document live here, and they are never merged.

**`harness.openapi.yaml`** is hand-written and authoritative: the HTTP surfaces the harness
itself provides. It targets OpenAPI 3.1, whose schema dialect is JSON Schema 2020-12, which
is what makes it possible to `$ref` a message schema by file instead of transcribing it.

Its `paths` carry the clock service's control interface (ADR-0009), added in the same
commit as the code that answers them, which is the rule for every path added here. This
paragraph used to say the `paths` were empty because no component served HTTP yet; that
stopped being true when the clock landed, and it was noticed only when the chain began
generating from paths and found two.

**`query-layer.openapi.json`** is a vendored snapshot of the specification the query layer
emits about itself — refreshed by `scripts/refresh_query_layer_spec.sh`, never hand-edited.
It is OpenAPI 3.0.2, because that is what pygeoapi emits, and that difference from the
document above is why the two are never read under one policy.

**These two are not the same kind of thing, and the manifest says so per document.** A
`[[document]]` entry in `generators.toml` carries each one's `kind` and its `schemas`
policy, with the argument beside the value; the chain refuses a value it does not know, and
refuses a policy naming a document that is not there. `docs/architecture/generated-types.md`
has the comparison as a table.

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

That rule is the `schemas = "alias-masters"` policy, and it applies to a document written
here. It cannot apply to a vendored one: pygeoapi's shapes are pygeoapi's, they cannot
reference our masters, and making them do so would mean editing somebody else's account of
their own interface. `query-layer.openapi.json` therefore carries
`schemas = "not-generated"`, with the reason in the manifest — all four shapes it declares
describe endpoints this query layer does not serve, and one references a document on
`schemas.opengis.net` the chain may not fetch.

## What is generated from a document's paths

The **surface**: every path, and for each its methods and their `operationId`s. In Python a
`Literal` and a frozen mapping; in TypeScript a union type and an `as const` object. Both
documents get this, whatever their kind. A caller cannot then mistype a path, and a path
the interface stops serving becomes a compile error rather than a 404 somebody meets in a
browser. An operation with no `operationId` stops the chain by name: it cannot be given a
name in either language, so the document has to supply one.

Parameters, request bodies and response envelopes are **not** generated, and the reason is
not that nobody has got to it. In the vendored document most parameters are `$ref`s into
OGC's published documents — `.../parameters/bbox.yaml`, `z.yaml`, `instanceId.yaml`. FR-009
and SC-007 forbid the chain a network fetch, and the last segment of such a URL looks like
the parameter's name and very nearly is one, which is the plausible-but-unverified guess
this whole feature exists to remove. A parameter list is generated when a document states
its parameters inline, and not before.

## Refreshing the query layer's specification

```bash
scripts/refresh_query_layer_spec.sh
```

It prefers the query layer's own offline emission — the entrypoint's own first two steps,
rendering the pygeoapi configuration in a one-shot container and asking pygeoapi to
describe it, which is what makes the capture a description of what is served — and falls
back to asking the running query service directly over the compose network. Both routes
were wrong when first written, each about a different file, and the script's header records
what each got wrong; both are exercised now and produce the same document byte for byte.
What it writes is canonicalised —
sorted keys, two-space indent, one trailing newline — so that the diff of a refresh shows
what the interface did between versions and nothing else. Read that diff as an interface
change log: a removed path or a narrowed type is a client change waiting to happen.

After a refresh, run `scripts/generate_types.sh`. Until you do, the drift check fails,
which is the intended order of events: the vendored document and the generated types move
together or the build says so.

One property to know before reading a refresh diff. The document is captured from a
destination, so it carries that destination's advertised URL in `servers` and `info`.
Nothing generated reads those keys — the generated tree and the drift check are
destination-independent — but a refresh run against a different destination produces a
diff for that reason alone. Refresh from `local` unless you mean otherwise.
