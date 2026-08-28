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
and the model runner. The encoder itself is `harness_core.netcdf.encode_netcdf` and the
reader beside it is `harness_core.netcdf.read_netcdf` — one implementation of each, several
consumers, and no second copy inside this package.

The **clock is a genuine port**, with three implementations already.

The **destination transport is not a port and must not be dressed as one.** There is one
implementation, `HttpDestination`, reached over HTTP at an address that comes from
configuration. The `Destination` protocol exists so the tests can present a destination that
misbehaves in one specific way; a stub that misbehaves is not a second implementation of
anything. **A second real destination — an object store, say — needs an ADR.** Adding an
interface over the transport without one is the exact move Constitution VI forbids.

## Loose ends, recorded rather than hidden

- **The query layer still has its own reader.** `encode_netcdf` moved to `harness_core`
  when this package became its third consumer, and `read_netcdf` followed it out of the
  divergence monitor once this package's conformance check and the planner's spread reader
  were both importing it across a service boundary. This package now reads and writes the
  format through `harness_core.netcdf` and depends on no service to do it, which is what
  `scripts/check_service_dependencies.py` enforces from here on. What remains is
  `query/plugins/netcdf_reader.py`: a second parser, kept deliberately, because the query
  layer's image installs pygeoapi and cannot carry the workspace packages. That is a
  dependency argument rather than an oversight, and it is recorded in that module's
  docstring — but it does mean two parsers can still disagree about a file the writer
  produces, and the primer example in `site/docs/standards/cf-conventions.md` is run in CI
  partly to keep them honest.
- **The CF conformance check is written here rather than taken off the shelf.** The
  standard checkers read through a NetCDF library, which is the dependency the writer
  exists to avoid, and resolve the standard-name table over the network, which FR-016
  forbids. `conformance.py` checks every rule the primer says the file follows, and a test
  asserts the primer and the check agree. See the module docstring for the argument.
- **The recorded run this packages has no writer yet.** The source directory is the run
  store: the clock writes `run-manifest.json` into it and this component reads that plus an
  observation stream beside it, one JSON document per line. Nothing writes that stream
  today, so the packager reads a manifest and finds no observations. The gap is real and is
  recorded here rather than papered over with a fixture; what is now true is that when
  something does write it, the two components are looking at the same directory on the same
  volume. The Compose service mounts the run store read-only, its own staging and ledger
  volume writable, and the released surface read-only — the last so that FR-42 is enforced
  by the platform and not only by the startup check in `config.py`. It no longer mounts the
  coverage store: this component names no directory inside it, and the read-only mount it
  carried was a guess that nothing was comparing against the configuration.
- **The destination it transfers to is a stub, and it is now actually there.** Until 014
  T045 landed, `config/*/offload.json` named `archive` and `deploy/compose.yaml` declared no
  such service: this component could stage a bundle and could never transfer one, and no
  test could see it, because every test that exercises the transfer path presents its own
  destination in-process. `deploy/archive/stub.py` is what answers. It is deploy-time
  apparatus rather than a component — no spec, no image of its own, twenty lines of stdlib
  mounted into the upstream Python image — and it is a stub in the sense the whole harness
  is. The one thing it does not fake is the digest: it computes its own over the bytes that
  arrived, because a destination that echoed back what it was sent would make
  `verify.py` agree with a sender whose bytes never arrived. `scripts/offload_demo.sh` runs
  the whole cycle against it in one command.

## The primer

`site/docs/standards/cf-conventions.md` is owned by this feature and published by feature
015. It records what the export emits and — the half that matters — what it deliberately
does not, with the reason for each omission. Its worked example is executed by
`tests/test_primer.py` against a bundle the packager wrote, so the page cannot drift from
the file.
