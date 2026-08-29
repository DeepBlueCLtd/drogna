# ADR-0030: components are scheduled modules on the main thread, wired by one composition root

**Status:** Accepted
**Date:** 29 August 2026
**Feature:** 101 (foundations & shell)

## Context

SRD-v2 §10 delegates to feature 101 whether the in-browser backend components run as
Web Workers or as scheduled modules. Separately, Constitution XI forbids any import
between front-end (`shell/`, `panels/`) and backend (`backend/`) — yet *something*
must construct both halves and hand each its configuration and its seam client.

## Decision

**Scheduled modules on the main thread.** Web Workers communicate by asynchronous
message passing whose interleaving the browser schedules; AT-04's byte-identical
lockstep replay would require rebuilding determinism on top of that with a per-worker
lockstep protocol — precisely the class of complexity V2 exists to shed
(`spikes/seam-interception/FINDING.md`). As scheduled modules, broker delivery is
synchronous in subscription order and reproducible by construction. The components
remain genuine programs — each has its own configuration document, seed stream,
heartbeat and lifecycle, and stops by ceasing to be scheduled, not by a flag. The
transport interface is the honest port: a worker pool, like a V3 network backend,
would replace the transport, never the components.

**One composition root**: `app/src/bootstrap/` is the only module allowed to import
from both sides of the seam. It reads the run configuration document, creates the run
manifest (the single point where entropy may enter, and is recorded), constructs the
backend runtime, installs the fetch shim (ADR-0029), and mounts the shell — handing
each half only configuration and seam interfaces. Nothing imports the bootstrap. The
import-boundary gate encodes exactly this: `shell|panels` ↔ `backend` imports are
violations anywhere, `bootstrap` may import both, and only `seam/` and `generated/`
are importable from everywhere.

## Alternatives rejected

- **Web Workers per component** — determinism cost above; also multiplies the
  build/test surface (a scope vitest cannot reach) for no demonstrated need.
- **Letting the shell construct the backend** — quietly turns the client into the
  monolith Principle XI names; the V3 swap would then be a refactor, not a
  configuration change.
