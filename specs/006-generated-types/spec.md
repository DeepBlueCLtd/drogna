# Feature Specification: Neutral Masters and the Generator Chain

**Feature Branch**: `006-generated-types`

**Created**: 2026-08-26

**Status**: Draft

**Input**: Broker message payloads defined once in JSON Schema; HTTP interface types derived from OpenAPI, taking the query layer's own emitted specification as source where possible; the two cross-referenced where shapes coincide; Python and TypeScript types generated from those masters, committed, and checked in CI for drift. (SRD NFR-01, NFR-02, NFR-03; delivery priority 6, and required before any message has a second consumer.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shape is written once and arrives in both languages (Priority: P1)

Someone adding a new broker message writes one JSON Schema file under `contracts/schemas/`,
runs one script, and gets a Python model in `libs/harness_types/` and a TypeScript type in
`client/src/generated/`. They write no type by hand in either language. Running the script
again with nothing changed produces no diff.

**Why this priority**: This is the whole point of the feature and the content of
Constitution III. Every later story is a gate protecting this one. SRD §10 places it sixth
overall but adds the condition that matters more than the rank: it must exist before any
message has a second consumer, because the moment a shape is hand-written in two places the
divergence has already happened and is merely not yet noticed.

**Independent Test**: Add a schema for a message that does not yet exist, run
`scripts/generate_types.sh`, and confirm both generated artefacts appear, import cleanly,
and validate an example payload. Run the script twice and confirm the second run changes
nothing.

**Acceptance Scenarios**:

1. **Given** a new file `contracts/schemas/<name>.schema.json`, **When** `scripts/generate_types.sh` runs, **Then** a Python model and a TypeScript type for that shape appear under the two generated directories, each carrying a "DO NOT EDIT" banner naming its source file.
2. **Given** an unchanged set of sources, **When** the generation script runs twice in succession, **Then** the second run produces a byte-identical tree.
3. **Given** a generated Python model and an example payload embedded in its source schema, **When** the example is parsed by the model, **Then** it validates, and a payload violating the schema is rejected.
4. **Given** a schema field renamed in the master, **When** generation runs, **Then** both languages carry the new name and no artefact retains the old one.

---

### User Story 2 - Drift cannot survive CI (Priority: P2)

Someone edits a schema and forgets to regenerate, or edits a generated file by hand. CI
fails, naming the file and the difference. The repository never carries generated output
that disagrees with its source.

**Why this priority**: Committed generated code is only trustworthy if something proves it
is current. Without the gate, the generated directories become a second hand-maintained
copy — exactly the failure Constitution III forbids — while looking as though they are not.

**Independent Test**: Modify a schema without regenerating and confirm
`scripts/check_types_drift.sh` fails with a readable diff; hand-edit a generated file and
confirm the same; regenerate and confirm it passes.

**Acceptance Scenarios**:

1. **Given** a schema changed without regeneration, **When** `scripts/check_types_drift.sh` runs, **Then** it exits non-zero and shows the difference between committed and regenerated output.
2. **Given** a hand-edited generated file, **When** the drift check runs, **Then** it fails and names the edited file.
3. **Given** sources and generated output in agreement, **When** the drift check runs, **Then** it exits zero and leaves the working tree unmodified.
4. **Given** a machine with a different operating system or locale from the one that generated the committed output, **When** the drift check runs, **Then** it still passes, because generator versions are pinned and output ordering is stable.

---

### User Story 3 - HTTP types come from the query layer's own specification (Priority: P3)

The query layer emits its own OpenAPI document. That document, not a hand-written
approximation of it, is the source of the client's HTTP types. Refreshing the vendored copy
is a script, and the refresh shows exactly what the query layer's interface did between
versions.

**Why this priority**: SRD NFR-01 requires it, and it removes a whole category of client bug
where the hand-written idea of an endpoint and the served endpoint quietly differ. It sits
below the first two because the broker payloads have more consumers earlier, and because
this story cannot be completed until the query layer exists in some form.

**Independent Test**: Run the refresh script against a running or locally invoked query
layer, confirm the vendored document under `contracts/openapi/` updates, regenerate, and
confirm the client's HTTP types change accordingly and the diff is reviewable.

**Acceptance Scenarios**:

1. **Given** a query layer configuration, **When** the refresh script runs, **Then** the emitted specification is written to `contracts/openapi/query-layer.openapi.json` in a canonical form with stable key ordering.
2. **Given** a refreshed specification, **When** `scripts/generate_types.sh` runs, **Then** the client's HTTP request and response types are regenerated from it and no HTTP shape remains hand-written in the client.
3. **Given** a query layer version change altering an endpoint, **When** the refresh runs, **Then** the diff of the vendored document shows the change, and the drift check fails until the generated types are updated with it.
4. **Given** no running query layer, **When** the drift check runs, **Then** it uses the vendored document and passes, because the check never depends on a live service.

---

### User Story 4 - Shapes shared between transport and HTTP are declared once (Priority: P4)

Where the same shape appears both in a broker message and in an HTTP response, it is defined
once in JSON Schema and referenced from the OpenAPI document. Changing it changes both, and
neither language's generated output can disagree with the other about what it is.

**Why this priority**: SRD NFR-02's stated rationale — one vocabulary and one generator chain
rather than a second specification language. It is fourth because it only bites once a shape
genuinely appears in both places, which happens after the first messages and the first
endpoints exist.

**Independent Test**: Take a shape used both on the broker and in an HTTP response, define it
once, reference it from the OpenAPI document, regenerate, and confirm the Python and
TypeScript outputs each carry exactly one definition of it.

**Acceptance Scenarios**:

1. **Given** a shape defined in `contracts/schemas/`, **When** the OpenAPI document references it, **Then** generation resolves the reference and emits one definition per language, not two.
2. **Given** a change to the referenced schema, **When** generation runs, **Then** both the broker-derived and the HTTP-derived artefacts reflect it.
3. **Given** the schema convention lint, **When** it runs over `contracts/`, **Then** every schema has an identifier of the documented form, every message schema forbids unknown properties, and every declared example validates against its own schema.

---

### Edge Cases

- A schema is syntactically valid but violates the naming or identifier convention. The convention lint fails before generation, rather than producing a type nobody can find later.
- Two schemas define the same type name. Generation fails on the collision rather than silently letting one win.
- A generator emits non-deterministic output — hash-ordered members, an embedded timestamp, a version banner that changes on every run. The drift check would then fail spuriously; the generation step must normalise or the generator must be replaced, and either way the failure is a defect in this feature, not in the caller's change.
- The query layer emits a specification at an OpenAPI version older than the hand-written document uses. The two documents are kept separate and generated separately; they are never merged.
- An external reference cannot be resolved offline. Generation must not reach the network for a reference; every referenced document is present in the repository.
- A schema change is source-compatible in one language and breaking in the other. The drift check catches the change; judging the break is a review matter, and the generated diff is what review reads.
- Someone adds a hand-written interface type in a service or in the client. Nothing in the generator chain notices. A separate lint is required, and its absence would leave Constitution III unenforced in the direction that matters most.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Broker message payloads MUST be defined once, in JSON Schema, under `contracts/schemas/`, named `<topic-noun>.schema.json` with an identifier of the form `https://schemas.harness.invalid/<name>.schema.json`. (SRD NFR-02; repo-layout naming)
- **FR-002**: HTTP interface types MUST derive from OpenAPI documents under `contracts/openapi/`, taking the query layer's own emitted specification as the source wherever it emits one. (SRD NFR-01)
- **FR-003**: Where the same shape appears in both a broker message and an HTTP interface, the OpenAPI document MUST reference the JSON Schema file rather than restating the shape. (SRD NFR-02)
- **FR-004**: Python types MUST be generated into `libs/harness_types/` and TypeScript types into `client/src/generated/`, from those sources alone. (SRD NFR-03)
- **FR-005**: Generated output MUST be committed to the repository, so that a checkout builds without running a generator. (Constitution III)
- **FR-006**: Every generated file MUST carry a "DO NOT EDIT" banner naming the source file and the generation script. (Constitution III)
- **FR-007**: `scripts/generate_types.sh` MUST regenerate every generated artefact from every master in one invocation, and MUST be idempotent: a second run with unchanged sources changes nothing.
- **FR-008**: `scripts/check_types_drift.sh` MUST regenerate into a scratch location, compare against the committed output, exit non-zero on any difference with a readable diff, and leave the working tree unmodified. (Constitution III, Quality gate 5)
- **FR-009**: The drift check MUST NOT require a running service, a network fetch, or credentials. It operates on documents present in the repository.
- **FR-010**: Generator versions MUST be pinned, and generation MUST produce identical output across machines and operating systems.
- **FR-011**: A convention lint MUST run over `contracts/` asserting: identifier form, file naming, that message schemas forbid unknown properties, that every schema carries a title and a description, and that every declared example validates against its own schema.
- **FR-012**: A separate lint MUST detect hand-written declarations of shapes that cross the language boundary — a Python model or TypeScript interface for a message payload or an HTTP body defined outside the generated directories — and fail. (Constitution III)
- **FR-013**: Configuration file schemas under `contracts/schemas/config.<component>.schema.json` MUST be part of the same chain, so configuration models are generated rather than hand-written. (SRD NFR-04)
- **FR-014**: A refresh script MUST capture the query layer's emitted specification into `contracts/openapi/query-layer.openapi.json` in canonical form with stable ordering, so that a refresh diff shows genuine interface change and nothing else. (SRD NFR-01)
- **FR-015**: The hand-written harness OpenAPI document and the vendored query-layer document MUST remain separate documents, generated separately. Neither may be edited to make the other's generator happy. (SRD NFR-01)
- **FR-016**: Generation MUST NOT reach the network. Every referenced document MUST be resolvable from the repository.
- **FR-017**: Both `scripts/generate_types.sh` and `scripts/check_types_drift.sh` MUST be runnable locally with a single command, and the drift check MUST run in CI on every change. (Constitution, Quality gates)
- **FR-018**: Where a generator cannot resolve a reference to an external file, the chain MUST bundle references into a single document as a generation step, keeping the unbundled documents authoritative and the bundle a build artefact. (SRD NFR-02)
- **FR-019**: Schemas MUST NOT introduce vocabulary for tracked entities, contacts, detections or tracks; the forbidden-vocabulary gate applies to `contracts/` as it does everywhere else. (Constitution V)
- **FR-020**: Message schemas MUST express time as a simulation-clock instant, documented as such, so no generated model invites a consumer to fill a timestamp from the host clock. (Constitution I)

### Key Entities

- **Message schema**: A JSON Schema file describing one broker payload. Authoritative, hand-written, named for the topic noun, with an identifier of the documented form. The unit that Constitution III protects.
- **Configuration schema**: A JSON Schema file describing one component's configuration file, sharing the common sections by reference. Part of the same chain, so that configuration models are generated too.
- **Harness OpenAPI document**: The hand-written specification for HTTP surfaces the harness itself provides, referencing message schemas where shapes coincide.
- **Query-layer specification snapshot**: A vendored, canonicalised copy of the specification the query layer emits. Refreshed by script, never hand-edited, and diffed to see what the interface did.
- **Generated Python package**: The contents of `libs/harness_types/`. Committed, banner-marked, never edited.
- **Generated TypeScript module set**: The contents of `client/src/generated/`. Same rules.
- **Generator manifest**: The pinned record of which generator at which version produces which artefact from which source. What makes the drift check reproducible across machines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The number of types crossing the language boundary that are hand-written in more than one place is zero, and a lint proves it rather than review claiming it.
- **SC-002**: Adding a new broker message requires editing exactly one authoritative file and running exactly one script.
- **SC-003**: Two consecutive generation runs over unchanged sources produce a byte-identical tree, on any supported machine.
- **SC-004**: The drift check fails on every one of: an edited schema without regeneration, a hand-edited generated file, and a refreshed query-layer specification without regeneration.
- **SC-005**: The drift check completes fast enough to sit in the default CI job without anyone wanting to move it elsewhere — under sixty seconds on the project's CI runner.
- **SC-006**: Every file under the two generated directories carries a "DO NOT EDIT" banner naming its source; the count without one is zero.
- **SC-007**: Generation performs no network access; the check passes with networking disabled.
- **SC-008**: Every schema in `contracts/schemas/` passes the convention lint, and every declared example validates against its own schema.
- **SC-009**: The count of shapes defined in both a JSON Schema and an OpenAPI document independently is zero; coinciding shapes are referenced.

## Assumptions

- Generators are chosen as follows, and the choice is recorded here because the SRD fixes the
  sources and the languages but not the tools: `datamodel-code-generator` for JSON Schema and
  OpenAPI to Python (Pydantic v2 models), `json-schema-to-typescript` for JSON Schema to
  TypeScript, and `openapi-typescript` for OpenAPI to TypeScript. Each is pinned by exact
  version in the generator manifest. Substituting a generator later is a change to that
  manifest and a regeneration, and the drift check will show the whole effect at once.
- The hand-written harness OpenAPI document targets OpenAPI 3.1, whose schema dialect is JSON
  Schema 2020-12, because that is what makes referencing the message schemas directly possible
  rather than transcribing them. The vendored query-layer specification stays at whatever
  version the query layer emits; the two are not merged, and if the query layer emits 3.0 the
  only consequence is that the TypeScript generator is invoked twice with different options.
- Message schemas are authored against JSON Schema 2020-12.
- Reference bundling before generation is assumed to be necessary, because support for
  references to external files is uneven across generators. The bundle is a build artefact
  and is not committed; the unbundled documents remain authoritative.
- The query layer emits its specification via its own offline command rather than only from a
  running server. If only the running server can emit it, the refresh script brings the query
  layer up in the local destination, captures, and tears it down, and the drift check still
  never needs it.
- Individual schema files are contributed by whichever feature first needs the shape, per the
  repository layout's ownership rule. This feature owns the chain, the conventions, the lint
  and the two scripts. The one exception already claimed elsewhere is
  `contracts/schemas/observation.schema.json`, which belongs to the observation path feature.
- Generated Python models are Pydantic v2. Services are free to depend on them directly; no
  hand-written wrapper layer is introduced, since that would recreate the second definition
  this feature exists to prevent.
