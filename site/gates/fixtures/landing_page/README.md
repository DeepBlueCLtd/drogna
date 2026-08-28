# A deliberate control for the landing-page gate

`statement_late/` is a miniature built site that is **wrong on purpose**, and it is wrong in
the one way the mechanism this gate replaced could not see.

Before `check_landing_page.py`, FR-003 was held by a step in `.github/workflows/pages.yml`
that grepped the built `index.html` for "learning harness", "synthetic" and "fake". The page
here contains all three, so **that grep passes on it**. The statement sits below a heading
and two paragraphs of ordinary prose, which is exactly what FR-01's "so no viewer mistakes
it for a candidate system" is about: a viewer forms their impression from what they read
first, and a disclaimer further down is not the thing the requirement asked for.

Run the gate over it and it reports `statement-not-first`, once per required phrase, naming
the element the statement did land in.

This README is outside `statement_late/` deliberately, so that the description of the
violation is not itself part of the page under test.

## What the fixture must keep

- **All three phrases present.** If a phrase were removed the gate would report
  `statement-absent` instead, and the control would stop being a control for *ordering* —
  which is the only property that was ever in danger.
- **A heading first.** The gate permits a page's own `<h1>` before the statement, because
  every page on the site has one. The fixture keeps that shape so the permission is
  exercised rather than assumed.
