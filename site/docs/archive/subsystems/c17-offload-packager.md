---
title: C-17 Offload packager
---

# C-17 Offload packager

!!! success "Status: built"

    - **Code:** `services/offload/` — `bundle.py` and `writer.py` for the package,
      `verify.py` and `ledger.py` for the integrity guarantee and the record of what has
      been confirmed, and `evict.py`, which will not delete anything the ledger does not
      show as received
    - **Delivered by:** `specs/014-offload-export`
    - **Covered by:** `services/offload/tests/`,
      `tests/integration/test_offload_crash_recovery.py`,
      `tests/integration/test_offload_receipt_paths.py` and
      `tests/integration/test_offload_provenance_scan.py`; the CF conformance of what it
      writes is a build gate, `scripts/check_cf_conformance.py`
    - **Not present:** the bundle's copy of the run manifest does not yet carry the
      measurement geometry block, which is the ground truth the second leakage check on
      the [reverse proxy](c10-reverse-proxy.md) page scores against. The shape is
      declared and the reader refuses loudly without it; the producer would need a
      source of measurement positions this component does not have

**Responsibility:** export with an integrity guarantee.
**Owns the failure mode of:** premature eviction.

## What it does

It packages data for transfer off the system as NetCDF following the
[CF conventions](../../standards/cf-conventions.md), with an integrity guarantee
attached, so that the receiving end can establish that what arrived is what was
sent.

## Premature eviction

The failure mode it owns is deleting the local copy before the transfer is
confirmed. This sounds like a trivial ordering bug and is in fact the central
design constraint: an offload packager that reports success on write rather than
on confirmed receipt will, on the day the link drops mid-transfer, lose data
that cannot be regenerated.

The integrity guarantee is what makes confirmation possible. Without it,
"confirmed" means "the bytes stopped arriving", which is indistinguishable from
a truncated transfer.

## Why the format matters here

An export is the point at which data leaves the system's own conventions and has
to stand on its own. A CF-conforming NetCDF file carries its own units, its own
coordinate definitions and its own description of what each variable means. A
file whose meaning depends on documentation held elsewhere is a file that will
be misread.

This is also one of the two tested leakage paths: NetCDF global attributes are
a natural home for provenance — paths, usernames, software versions — and
reviewing them by eye is not a control.

**Requirements:** FR-43, FR-44. **Feature:** 014.
