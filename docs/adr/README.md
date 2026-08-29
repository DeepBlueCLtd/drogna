# Architecture Decision Records

An ADR is required for any decision that is hard to reverse, was genuinely contested,
or where a plausible alternative was rejected (SRD PR-03). Routine choices do not earn
one.

Each record carries Status, Context, Decision and Consequences, is numbered
sequentially, and is dated. Superseded records are kept and marked, never deleted.

The files in this directory are the record. **There is no index here**, because there was
one and it drifted twice: it silently stopped at 0013 until a session found it in August
2026, and having been repaired it silently stopped again at 0026. A hand-kept list of the
files, sitting beside the files, is a second copy of something nobody has to copy.

The published site carries an index instead, generated at build time, with each record's
status read out of the record rather than retyped — `site/docs/decisions/index.md` and
`scripts/site/generated.ts`. Adding a record is adding a file here; nothing else has to
change. To read the set from a terminal, `ls` is the honest answer.

There is no ADR-0017. The number was never used — no file by that number appears anywhere
in the history — and renumbering the records that exist would break references already in
commit messages, so the gap stays. The numbering continues across the V1/V2 boundary for
the same reason: a record's number is a fixed address for the life of the project.
