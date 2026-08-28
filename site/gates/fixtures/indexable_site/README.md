# A deliberate control for the indexing gate

`built/` is a miniature built site that is **wrong on purpose**, and it is wrong in the way
the mechanism this gate replaced could not see.

Before `check_indexing.py`, FR-008 was held by two greps in `.github/workflows/pages.yml`:
one for a `robots` meta tag in the built `index.html`, and one for `Disallow: /` in
`robots.txt`. Both pass against this fixture. Its landing page carries a correct meta tag
and its `robots.txt` declines indexing properly.

The other two pages do not. `deep/orphan.html` carries no `robots` meta tag at all, and
`weak.html` carries one saying `nofollow` — which looks like compliance and permits
indexing. That is the shape of the real hazard: the meta tag reaches every page through a
single theme override, so the way it fails is by stopping applying *somewhere* rather than
everywhere, and a check that reads only the landing page is blind to exactly that.

Run the gate over `built/` and it reports two `page-indexable` findings, naming each page.

This README is outside `built/` deliberately, so that it is not itself scanned as a page.
