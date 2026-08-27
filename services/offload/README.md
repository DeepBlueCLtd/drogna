# C-17 — the offload packager

Packages a run's profiles as a CF-conforming NetCDF bundle, transfers each bundle to a
destination that independently computes a digest, and evicts a local file only when a
receipt has matched a digest recomputed from that file on disk.

**Owns the failure mode of premature eviction.** It is the one failure in this component
that no re-run can undo, because the bytes it destroys were the only copy.

## Reading order

The interesting engineering is not the file format. It is the ordering of side effects, and
it lives in three modules:

- `ledger.py` — the write-ahead durable state machine. A record for a state is on disk
  before that state's side effect is attempted, so the next record is also the evidence
  that the previous side effect completed.
- `verify.py` — the comparison. The digest a receipt is compared against is recomputed from
  the file on disk at verification time, never the digest the transfer request declared.
- `evict.py` — the only place a file is deleted, and the only thing allowed to ask is the
  retention policy. A receipt permits an eviction; it does not cause one.

`main.py` orders the four steps and nothing else calls anything else. `transfer`, `verify`
and `evict` never call one another, which is what lets the crash-injection tests replace one
step at a time.

## The two ports, and the one thing that is not one

The **coverage output is a genuine port** under Constitution VI: NetCDF today, plausibly
Zarr later, and this component is one of its consumers alongside the environment generator
and the model runner. The encoder itself is `harness_core.netcdf.encode_netcdf` — one
implementation, three consumers, no second copy.

The **clock is a genuine port**, with three implementations already.

The **destination transport is not a port and must not be dressed as one.** There is one
implementation, `HttpDestination`, reached over HTTP at an address that comes from
configuration. The `Destination` protocol exists so the tests can present a destination that
misbehaves in one specific way; a stub that misbehaves is not a second implementation of
anything. **A second real destination — an object store, say — needs an ADR.** Adding an
interface over the transport without one is the exact move Constitution VI forbids.

## Loose ends, recorded rather than hidden

- **The classic-format reader is still in a service.** `encode_netcdf` moved to
  `harness_core` when this package became its third consumer. The corresponding reader,
  `harness_monitor.netcdf.read_netcdf`, did not move, so this package depends on
  `harness-monitor` to read back the file it has just written. There are three readers of
  this format in the repository — the monitor's, the query layer's and, transitively, this
  one — where there is now exactly one writer. Moving the reader beside the encoder is the
  obvious next step and belongs to whichever feature next touches the monitor.
- **The CF conformance check is written here rather than taken off the shelf.** The
  standard checkers read through a NetCDF library, which is the dependency the writer
  exists to avoid, and resolve the standard-name table over the network, which FR-016
  forbids. `conformance.py` checks every rule the primer says the file follows, and a test
  asserts the primer and the check agree. See the module docstring for the argument.
- **The Compose service mounts the coverage store read-only** and does not yet mount a
  staging area or a ledger directory. `deploy/` belongs to feature 005; the two volumes this
  component needs are a task for whoever next touches it.

## The primer

`site/docs/standards/cf-conventions.md` is owned by this feature and published by feature
015. It records what the export emits and — the half that matters — what it deliberately
does not, with the reason for each omission. Its worked example is executed by
`tests/test_primer.py` against a bundle the packager wrote, so the page cannot drift from
the file.
