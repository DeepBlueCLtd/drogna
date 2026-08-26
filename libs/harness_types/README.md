# harness_types — generated, not written

Everything under `src/harness_types/` is generated output. It is committed so that a
checkout builds without running a generator, and it is regenerated — never edited — by:

```bash
scripts/generate_types.sh
```

`scripts/check_types_drift.sh` regenerates into a scratch directory and diffs. A hand
edit here fails that check, in CI, naming the file. If a model is wrong, the fix belongs
in the master under `contracts/schemas/`, in the generator options in
`contracts/openapi/generators.toml`, or in the normalisation step in
`scripts/generate_types.py`.

Layout follows the masters:

- `messages/` — one module per non-configuration master, the broker payloads and the
  manifest documents.
- `config/` — one module per `config.<component>.schema.json`, so that no component
  hand-writes the shape of its own configuration file (NFR-04).

A shape referenced by more than one master is defined once and imported: the modules
under `config/` import from `config/common.py` rather than restating the common sections.

Ruff neither lints nor formats this directory — `extend-exclude` in the root
`pyproject.toml` — because the formatting is the generator's, and a formatter arguing
with a generator is a drift check that fails for no reason anyone can act on.
