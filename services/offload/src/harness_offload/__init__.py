"""C-17, the offload packager: a standard file out, and nothing deleted without proof.

Premature eviction is the failure this component owns (SRD §4), and it is the one failure
here that no re-run can undo, because the bytes it destroys were the only copy. The whole
of the answer is the ordering of side effects: the ledger records what is about to happen
before it happens, states move forward only, a receipt is compared against a digest
recomputed from the file on disk rather than against the digest that was sent, and the
eviction path re-reads the bytes it is about to delete. A receipt makes a bundle eligible
for eviction; the retention policy is the only thing that causes one.

The other half is the file. A run's profiles leave as a NetCDF declaring CF conventions
and the ``trajectoryProfile`` discrete sampling geometry, ragged because bathymetry
truncates profiles at different depths and a rectangular array would need fill values a
reader could mistake for data. What the file says about itself is limited to an
allow-list applied at write time: no host, no directory, no command line, no instrument,
and the run carried only as an opaque reference. That is the producer half of the
provenance leakage path FR-42 names, and ``docs/standards/cf-conventions.md`` records
both what is emitted and what is deliberately not.
"""

from harness_offload.version import FORMAT_VERSION, PACKAGER_NAME, PACKAGER_VERSION

__all__ = ["FORMAT_VERSION", "PACKAGER_NAME", "PACKAGER_VERSION"]
