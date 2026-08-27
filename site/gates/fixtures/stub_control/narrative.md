---
title: Control — a narrative stub
---

# Control — a narrative stub

!!! warning "Stub — this derivation is not written"
    This page is a control. It is not published, it is not in the navigation, and
    nothing links to it. It exists so that a threshold has something on disk to be
    measured against for as long as the repository lasts.

## Why this file is committed

On 27 August 2026 five pages on this site opened with a warning admonition saying they
were stubs, and then listed what the page would one day cover. They ran from three
hundred and thirty-one words to four hundred and ninety. The shortest page the project
accepted as finished, on the same day, was two hundred and forty-nine words. The stubs
were longer than the finished work.

That is the measurement the `narrative` floor in `docs/manifest.yaml` was set from: a
floor of five hundred words, chosen to sit above the longest page the project had
produced while calling it unwritten, and far below the shortest narrative page it had
produced while calling it written.

Within a day of the floor being set, every one of those five stubs was written. The
evidence the floor was derived from stopped existing, which is the ordinary and desirable
outcome and also a problem: a bound derived from something on disk becomes a bound
derived from nothing when the disk changes. A test that re-derived the floor from the
live corpus would have found no stub left to clear, would have had nothing to compare
against, and would have passed whatever number the manifest carried. That is precisely
the shape of failure this repository has been bitten by before — a check that looks
exactly like a clean run because it examined nothing at all.

So the evidence is kept. This page is the longest stub the project actually produced,
preserved at the length it had, carrying the marker it carried. The floor must clear it.
Lowering the floor to make a run green means lowering it past this file, and the test in
`site/gates/tests/test_manifest.py` reads this file and refuses.

## What would change it

Three things, and each of them deliberately requires a person to act.

If a new page appears carrying the stub marker and is longer than this control, the test
fails and says so. The control must then be grown to match, or the floor raised, because
the project has produced a longer unwritten page than the one recorded here and the
record has stopped being the worst case.

If somebody removes the marker from this page, the test fails, because a control that no
longer demonstrates the thing it controls for demonstrates nothing.

If somebody deletes this file, the test fails, for the same reason.

None of those is a failure to work around, and none can be made to go away by editing a
number. Each is the mechanism reporting, correctly, that the ground has moved.
