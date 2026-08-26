# Tests

| Directory | Scope |
|---|---|
| `tests/integration/` | Cross-component behaviour that no single package can assert alone. |
| `tests/acceptance/` | AT-01 to AT-04 from SRD §9, one module per identifier. |
| `tests/leakage/` | FR-42's two explicit leakage paths: provenance metadata in exported files, and the shape of the freshly updated region. |

Unit tests live beside the code they test, inside each package.
