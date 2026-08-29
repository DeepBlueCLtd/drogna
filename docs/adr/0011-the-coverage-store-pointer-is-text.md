> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0011: The current-run pointer is a text file, not a symlink

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-21, FR-30, FR-31; C-08, C-09, C-14
**Raised by:** features 008 and 009 disagreeing, having been built in parallel

## Context

`docs/architecture/delivery-plan.md` put the query layer (008) and the control loop
(009) in the same wave, on the reasoning that they are genuinely independent in code:
the loop writes the coverage store and the query layer reads it. It named the one thing
they share — "the coverage store layout convention, which 008 owns and 009 consumes" —
and listed the risk of the two disagreeing, with the mitigation that 008 owns it.

They were built simultaneously and they disagreed about nearly everything: the store
root, whether runs sit under a `runs/` subdirectory, the run-manifest filename, the
run-directory prefix, and the form of the pointer naming the current run. Feature 009's
publisher wrote `current` as a **symlink** to the run directory. Feature 008's catalogue
read `current` as **text**.

Every test on both sides passed. Reading a symlink-to-a-directory as a text file does not
return a name, it raises — so **nothing the control loop published could ever have been
visible to the read path**, in either direction, however the other four names were spelt.

A fifth divergence was found while reconciling, and it is the one that shows why the
first four were not the real problem. The publisher moved the model runner's staging
descriptor into the store unchanged, and its keys are not the manifest's keys: `status`,
`member_count`, `digests` against `schema_version`, `root_seed`, `run_sequence`,
`generator_version`, `sim_time`, `ensemble`. Correcting all four names would have left
the catalogue refusing every run for a different reason.

## Decision

**The pointer is a text file holding one run identifier on one line**, and the publisher
conforms to `stores/coverage/layout.md` in every other respect: `runs/` subdirectory,
`run-manifest.json`, the layout's run-identifier rule, and a translation step that writes
the manifest the layout describes rather than the descriptor the runner produced.

The symlink is rejected despite two genuine advantages — a reader opens the current field
at a fixed path in one step, and two consumers already assumed it.

## Consequences

- **A symlink cannot represent the failure the layout asks a reader to detect.** The
  layout requires that "two runs claim to be current" be a reportable state. A symlink
  points at one thing or nothing; the conflict is inexpressible, so a reader cannot report
  it and a writer cannot leave evidence of it. A text file can hold two lines, and the
  catalogue refuses and names both identifiers. The atomicity argument is unaffected:
  `os.replace` of a pending file is as atomic as `os.replace` of a pending symlink, and
  feature 009's proof that a reader never sees a partial state survived the change intact.
- **Readers now do a two-step read** — resolve the pointer, then open the run — and pay an
  extra stat for it. That is the cost of the conflict being representable.
- **The monitor still reads the pointer as a symlink** and returns nothing silently, so
  AT-02 fails today. It was left failing rather than worked around: a green test that
  reads a store nobody writes is worth less than a red one that says the loop does not
  close. The repair is recorded as a task, not as a comment.
- The delivery plan's mitigation was correct in substance and insufficient in practice.
  Naming an owner settles an argument between people; it does not make two programs agree.
  **What was missing was a test that exercised both ends**, and there is now one: it
  publishes through the publisher's own code path, resolves through the catalogue's, takes
  both configurations from the destination files themselves, and was verified to fail on
  each of the five divergences reintroduced in turn.
- The general lesson for the remaining waves: where two features in one wave share a
  contract, the wave is not finished when both pass their own tests. It is finished when
  something exercises the contract from both sides. A shared convention with no shared
  test is a shared assumption.
