# The neutral masters

Every shape that crosses a language boundary is written here, once, in JSON Schema. The
Python models under `libs/harness_types/` and the TypeScript types under
`client/src/generated/` are generated from these files and from nothing else, and CI
proves it on every change (Constitution III).

Ownership: this directory's conventions, and the chain that reads it, belong to feature
006. Each schema file belongs to the feature that first needed the shape.

## Adding a shape: two steps

1. Write `contracts/schemas/<topic-noun>.schema.json`.
2. Run `scripts/generate_types.sh` and commit what it writes.

There is no third step. No list to add the file to, no generator to configure: a name
beginning `config.` becomes a configuration model under `config/`, and anything else
becomes a payload model under `messages/`, in both languages.

## The conventions, and what enforces them

`scripts/check_schema_conventions.py` runs over this directory with no arguments and
reports every violation rather than the first.

| Convention | Why |
| --- | --- |
| JSON Schema 2020-12 (`$schema`) | It is also OpenAPI 3.1's dialect, which is what lets an OpenAPI document reference these files instead of transcribing them into a second one. |
| Named `<topic-noun>.schema.json`, lower case | The name becomes a module name in two languages. |
| `$id` is `https://schemas.harness.invalid/<file name>` | An identifier is a name, not an address. The `.invalid` domain is reserved by RFC 2606 and is never fetched; generation reaches no network at all. |
| A `title` and a `description` on the document | The title becomes the generated type's name in both languages, and the description becomes its documentation. Neither is decoration. |
| Every object with `properties` declares `additionalProperties` | Left open, a typo in a key is accepted in silence — the failure a schema exists to catch. Message schemas forbid unknown properties outright. |
| Every declared example validates against its own schema | An example that has drifted is worse than none: it is a lie that reads as documentation. |
| Every `$ref` resolves to a document in this directory | Generation must not reach the network, so nothing may reference a document that is not here. |
| Time is a simulation-clock instant | Constitution I. No `format: date-time`, no host-clock field names, and an `_at` field carries `sim_time`. A schema that invites a consumer to fill a field from the host clock has undone the principle before any code is written. |

An example is required by convention on a message schema and is not yet enforced as
present, because no master declares one today and adding examples to schemas this feature
does not own is not this feature's change to make. What is enforced is the half that can
go wrong silently: an example that is there and no longer validates.

## References between schemas

A shape shared by two masters is defined in one and referenced from the other, by
identifier:

```json
{ "$ref": "https://schemas.harness.invalid/config.common.schema.json#/$defs/broker" }
```

The generated code follows: `harness_types.config.env_generator` imports `Component` from
`harness_types.config.common` rather than declaring a second one, and the TypeScript
modules import across files the same way. Restating a shape instead of referencing it is
caught by `scripts/check_handwritten_types.py`.

## Generated output is never edited

Both generated directories carry a "DO NOT EDIT" banner on every file naming the master it
came from. `scripts/check_types_drift.sh` regenerates into a scratch directory, diffs, and
fails on any difference — a schema edited without regenerating, a generated file edited by
hand, or a file in the generated tree that no master accounts for. It writes nothing to the
working tree whether it passes or fails, needs no running service, and reaches no network.

It runs in **about 1.2 seconds** on a developer machine and in the default CI job, against
a budget of sixty. Nobody should ever have cause to move it somewhere it runs less often.
