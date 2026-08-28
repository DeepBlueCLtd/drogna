# A deliberate control for the external-resource gate

Everything under `built/` is **wrong on purpose**. It is a miniature built site carrying
one external sub-resource of each kind the gate claims to catch, so that a run reporting
nothing has first been shown to be capable of reporting something.

`site/tools/check_no_external_resources.py` had no test and no control for the whole of its
life. It reported zero findings over the real site every time it ran, and that was read as
the property holding — but a gate that has never been watched failing is worth nothing, and
this one could have been returning zero because its patterns had stopped matching. This
directory is what makes the zero mean something.

This README sits outside `built/` deliberately, so that the gate does not scan the
description of the violations along with the violations.

## The seven controls

| Where | What is wrong | Which pattern should catch it |
|---|---|---|
| `built/index.html` | `<script src>` at another origin | fetching attribute |
| `built/index.html` | `<img src>` at another origin | fetching attribute |
| `built/index.html` | `<img srcset>` at another origin | fetching attribute |
| `built/index.html` | `<link href>` stylesheet at another origin | `<link href>` |
| `built/index.html` | a protocol-relative `<script src>` | fetching attribute |
| `built/assets/theme.css` | `url()` at another origin | css url() |
| `built/assets/theme.css` | `@import` at another origin | css @import |

## The two things that must NOT be reported

Both are in `built/index.html`, and they are the reason the gate is syntactic rather than
a search for the string `https`:

- **An outbound hyperlink.** `<a href="https://...">` is a destination a reader chooses to
  follow, not something the page fetches. A gate that flagged it would forbid citing a
  standards document, which is the one external reference the site is supposed to carry.
- **A same-origin sub-resource.** `<script src="/assets/local.js">` and
  `url(../assets/local.woff2)` are fetches, and they are fine, because they are served from
  this origin.

A change that makes the gate flag either of those is a regression even though it leaves the
run red rather than green.
