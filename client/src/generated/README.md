# client/src/generated — generated, not written

Everything beside this file is generated from the neutral masters under `contracts/` by:

```bash
scripts/generate_types.sh
```

It is committed so that `pnpm install && pnpm build` needs no Python, and it is verified
by `scripts/check_types_drift.sh` in CI. A hand edit fails that check.

- `messages/` — one module per non-configuration master under `contracts/schemas/`.
- `config/` — one module per `config.<component>.schema.json`.
- `http/` — types generated from the OpenAPI documents under `contracts/openapi/`. Empty
  until a document there describes a served surface; see `contracts/openapi/README.md`.

These are types only: no runtime values, no validators, nothing to import at run time.
Validation against the schemas themselves stays where it is, in `src/contracts/`, because
a generated type is a compile-time claim and a message off the broker is a run-time fact.

ESLint ignores this directory (`eslint.config.js`), for the reason ruff ignores its
Python counterpart. `tsc --noEmit` does not ignore it: generated types that do not
compile are a defect in the generator, and the compiler is how it is found.
