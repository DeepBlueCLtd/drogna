> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0014: Quality flagging is the ingestion seam, not a field on an observation

**Status:** Accepted
**Date:** 27 August 2026
**Requirements:** SRD §2.2, §5.6; FR-16, FR-17, FR-22, FR-24, FR-37, FR-38; Constitution III, VI
**Raised by:** three subsystem pages claiming a quality flag that has never been in the tree

## Context

The pages for the simulated sensors, the ingest client and the observation store each said
that an observation carries a quality flag. None does.
`contracts/schemas/observation.schema.json` declares no such property,
`stores/observations/migrations/0001_observations.sql` has no such column, and
`specs/007-observation-path/` never asks for one. The claim was struck from the pages and
the question left standing; this record settles it.

The SRD uses the phrase "quality flagging" exactly once, in §2.2, in a sentence listing what
sits inside the boundary: "residual and divergence rules, scheduling policy, sound speed
computation, quality flagging, the uncertainty and planning mathematics, and the data
dictionary made executable". That sentence classifies logic as bespoke rather than plumbing.
It is the sentence feature 012 renders as a legend — its FR-016 and FR-017 quote the list
verbatim — and it commissions nothing. §5.6 is headed "Telemetry and quality", but the two
requirements beneath it are residual statistics (FR-37) and forecast skill against a
persistence reference (FR-38): that is the quality of a forecast, not of a reading. No
numbered requirement anywhere in the document uses the words quality, flag or QC of an
observation, and §11 records nothing in the SRD as open.

What the SRD does require about whether a reading is acceptable is FR-16 and FR-17, and both
are built. The sensors validate against the model generated from the observation master
before publishing, so a malformed message fails where it was caused. The ingest client
validates every message against that same generated model: a failure is never written, is
counted without bound, and is kept with the reason it was refused up to a configured
retention whose overflow is itself counted. Those three numbers travel on `ctl/telemetry` as
`rejections.count`, `.retained` and `.discarded`. The range checks live in the master — three
observed properties and no fourth, latitude, longitude and depth bounded, no additional
property admitted at any level. And a well-formed but doubtful reading cannot move the
control loop on its own, because FR-24 requires sustained spatial or temporal persistence and
says in terms that a single spike shall never trigger a run.

## Decision

**§2.2's "quality flagging" is already implemented, and it is not a field on an
observation.** The judgement of whether a *reading* is acceptable is made at the ingestion
seam (FR-16, FR-17) and is binary: accepted and stored, or refused, counted and kept outside
the store with its payload and the reason. The judgement of whether a *forecast* is any good
is telemetry's (FR-37, FR-38), which is the reading the browser client's own classification
already attributes to C-16.

No `quality` property is added to the observation master, and no column to the observation
store.

The alternative rejected is the one the pages described: a `quality` enumeration on the
observation and a column beside `result`, so that a doubtful value could be stored and
marked. It is a perfectly respectable design and it is the wrong one here, for the three
reasons below.

## Consequences

- **A flag inverts where the refused data lives.** A flag stores the doubtful value and
  marks it; the seam stores nothing doubtful and keeps the refusal, its payload and its
  reason where somebody can inspect them. Only one of those can be true at a time, and the
  difference is which place a reader goes to ask what was thrown away.
- **Nothing would read it.** The monitor subscribes to `obs/#` and never queries the store
  during normal operation (FR-22); the model runner reads no observations at all (FR-28);
  the query layer's `Observations` entity projects `phenomenon_time` and `result` and
  nothing else, and the conformance statement claims no `resultQuality`; telemetry consumes
  residuals the monitor has already computed. A field nobody reads cannot be caught being
  wrong, which is not the same as being right.
- **The value it would carry is knowable in advance.** Each instrument's error is a seeded
  draw whose distribution and standard deviation the harness itself declares in
  `context.sensor.metadata`. A flag scored against that would restate the configuration, and
  §1.1 is explicit that these numerics are fake. The place where a stored value is genuinely
  scored against truth is AT-03, which compares recovery to the ground-truth manifest, and
  that is a measurement rather than a mark on a row.
- **The documentation claimed more than the code delivers, which is the failure Constitution
  VI names.** Two further places in the tree carry the same over-reading and need correcting
  against this record: the glossary's CTD entry, which says the sensors publish readings
  "with instrument noise and quality flags added", and the subsystems index, which reports
  the §2.2 item as having no code behind it.
- **What would bring the field back.** A numbered requirement saying what a flag means, and a
  named consumer that reads it. Then, in this order and not before: the property added to the
  master under `contracts/schemas/`, `./scripts/generate_types.sh` run, the shape registered
  in `tests/unit/test_generated_models.py`, a migration adding the column, and a line in the
  query layer's conformance statement saying `resultQuality` is now served. A boundary shape
  is generated and never hand-written (Constitution III), so the master is the first edit and
  not the last.
